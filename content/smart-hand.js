/* global Zotero, setInterval, clearInterval, exportReaderFunction */
"use strict";
var SmartHand = (() => {
  const ID = "smart-hand@aht02.github.io";
  const ATTR = "data-smart-hand-cursor";
  const CONTROLS = "a,button,input,textarea,select,[contenteditable='true'],.annotationLayer,.textAnnotation,[data-annotation-id]";
  function scrollbar(container, event) {
    try {
      for (let node = event.originalTarget || event.target, i = 0; node && i < 8; node = node.parentNode, i++) {
        if (["scrollbar", "scrollbarbutton", "slider", "thumb", "scrollcorner"].includes(node.localName)) return true;
        if (node === container) break;
      }
    } catch (_) { return true; }
    const r = container.getBoundingClientRect();
    const x = event.clientX, y = event.clientY;
    if (x < r.left || x >= r.right || y < r.top || y >= r.bottom) return false;
    const left = r.left + container.clientLeft, top = r.top + container.clientTop;
    return x < left || x >= left + container.clientWidth || y < top || y >= top + container.clientHeight;
  }
  const regionCache = new WeakMap();
  function textRegions(chars) {
    const cached = regionCache.get(chars);
    if (cached?.length === chars.length) return cached.regions;
    const lines = [];
    let line = null;
    const flush = () => { if (line) lines.push(line); line = null; };
    for (const char of chars) {
      // Ignore explicit whitespace so indentation and trailing spaces do not
      // extend a line. Ordinary word spaces are covered between visible glyphs.
      if (typeof char.c === "string" && !char.c.trim()) {
        if (char.lineBreakAfter) flush();
        continue;
      }
      const r = char.rect || char.inlineRect;
      if (!r || r.length !== 4 || !r.every(Number.isFinite)) { flush(); continue; }
      const box = [Math.min(r[0], r[2]), Math.min(r[1], r[3]), Math.max(r[0], r[2]), Math.max(r[1], r[3])];
      const height = box[3] - box[1];
      if (height <= 0) { if (char.lineBreakAfter) flush(); continue; }
      if (line) {
        const smallerHeight = Math.min(height, line[3] - line[1]);
        const overlap = Math.min(line[3], box[3]) - Math.max(line[1], box[1]);
        const gap = Math.max(box[0] - line[2], line[0] - box[2]);
        // Geometry also splits columns/figures when PDF line metadata is absent.
        if (overlap < smallerHeight * 0.5 || gap > smallerHeight * 1.5) flush();
      }
      if (!line) line = box;
      else line = [Math.min(line[0], box[0]), Math.min(line[1], box[1]), Math.max(line[2], box[2]), Math.max(line[3], box[3])];
      if (char.lineBreakAfter) flush();
    }
    flush();
    const regions = lines.slice();
    // Join only small vertical gaps, and only over the shared horizontal span.
    // Never extend a short/indented line to the width of its neighbour.
    for (const a of lines) {
      for (const b of lines) {
        const gap = b[1] - a[3];
        if (a === b || gap < 0 || gap > Math.min(a[3] - a[1], b[3] - b[1])) continue;
        const left = Math.max(a[0], b[0]), right = Math.min(a[2], b[2]);
        if (right > left) regions.push([left, a[3], right, b[1]]);
      }
    }
    regionCache.set(chars, { length: chars.length, regions });
    return regions;
  }
  function textHit(view, event, exitPadding = 0) {
    const p = view.pointerEventToPosition(event);
    const chars = p && view._pdfPages?.[p.pageIndex]?.chars;
    const scale = p && view._iframeWindow.PDFViewerApplication.pdfViewer._pages[p.pageIndex]?.viewport?.scale;
    if (!Array.isArray(chars) || !p.rects?.length || !(scale > 0)) return false;
    if (view._getSelectableOverlay?.(p) || view.getSelectableAnnotations?.(p)?.length) return false;
    const [x, y] = p.rects[0], pad = (2 + exitPadding) / scale;
    return textRegions(chars).some(r => x >= r[0] - pad && x <= r[2] + pad && y >= r[1] - pad && y <= r[3] + pad);
  }
  class Controller {
    constructor(view, report) {
      this.view = view; this.win = view._iframeWindow; this.doc = this.win.document;
      this.container = this.doc.getElementById("viewerContainer");
      this.removers = []; this.mode = null; this.pausedHand = null; this.last = null; this.textHover = false;
      this.originalAction = view.getActionAtPosition;
      this.ownAction = Object.getOwnPropertyDescriptor(view, "getActionAtPosition");
      const self = this;
      this.actionWrapper = exportReaderFunction(function(...args) {
        const event = args[1];
        // Zotero's window-capture mousedown handler predates our listeners.
        // Resolve the gesture here too, before the native action is selected.
        if (event?.type === "mousedown" && !self.mode) self.down(event);
        // Do not call the content realm's Function.prototype.apply with our
        // privileged args array: Firefox denies its access to args.length.
        if (self.mode !== "text" || !self.enabled()) return Reflect.apply(self.originalAction, this, args);
        // Only the synchronous action lookup sees pointer mode. Toolbar and
        // native cursor-tool state remain hand; no global tool switching.
        const tool = this._tool;
        try { this._tool = this._tools.pointer; return Reflect.apply(self.originalAction, this, args); }
        finally { this._tool = tool; }
      }, view);
      view.getActionAtPosition = this.actionWrapper;
      this.style = this.doc.createElement("style");
      this.style.textContent = ["text", "default", "grabbing"].map(cursor =>
        `html[${ATTR}="${cursor}"] #viewerContainer,html[${ATTR}="${cursor}"] #viewerContainer * {cursor:${cursor}!important}`).join("\n");
      this.doc.documentElement.appendChild(this.style);
      const listen = (target, type, fn, capture = true) => {
        const handler = e => { try { fn(e); } catch (error) { this.finish(); report(error); } };
        target.addEventListener(type, handler, capture);
        this.removers.push(() => target.removeEventListener(type, handler, capture));
      };
      listen(this.win, "pointerdown", e => this.down(e));
      // Native anonymous scrollbar widgets also need the privileged system
      // event group; ordinary content listeners can miss their wheel events.
      listen(this.win, "wheel", e => this.wheel(e), {
        capture: true, passive: false, mozSystemGroup: true
      });
      listen(this.win, "pointermove", e => {
        if (this.mode) {
          if (!e.buttons || !this.enabled()) this.finish();
          else return; // No hit testing, styles, or scroll writes during a drag.
        }
        this.hover(e);
      });
      // Bubble-phase mouseup: allow Zotero to finish its text selection first.
      listen(this.win, "mouseup", e => { this.finish(); this.hover(e); }, false);
      listen(this.win, "pointercancel", () => this.finish());
      listen(this.win, "blur", () => this.finish());
      listen(this.win, "keydown", e => { if (e.key === "Escape") this.finish(); });
      listen(this.doc, "visibilitychange", () => { if (this.doc.hidden) this.finish(); });
      listen(this.container, "pointerleave", () => { if (!this.mode) this.finish(); });
      listen(this.doc, "scroll", () => { if (!this.mode && this.last) this.hover(this.last); });
      this.bus = this.win.PDFViewerApplication.eventBus;
      this.toolChange = () => this.finish();
      this.bus?._on("cursortoolchanged", this.toolChange);
    }
    enabled() {
      return this.view._tool?.type === "hand" && !this.view._suspended
        && this.win.PDFViewerApplication.pdfCursorTools?.activeTool === 1;
    }
    wheel(e) {
      if (!this.enabled() || (this.mode && e.buttons) || e.defaultPrevented || !e.cancelable
        || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.buttons
        || !Number.isFinite(e.deltaY) || !e.deltaY || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      const c = this.container, r = c.getBoundingClientRect();
      const left = r.left + c.clientLeft, top = r.top + c.clientTop;
      const style = this.win.getComputedStyle(c);
      const borderLeft = parseFloat(style.borderLeftWidth) || 0;
      const borderRight = parseFloat(style.borderRightWidth) || 0;
      if (c.scrollHeight <= c.clientHeight || e.clientY < top || e.clientY >= top + c.clientHeight
        || e.clientX < r.left + borderLeft || e.clientX >= r.right - borderRight) return;
      let nativeVertical = false;
      try {
        for (let node = e.originalTarget || e.target, i = 0; node && i < 12; node = node.parentNode, i++) {
          if (node.localName === "scrollbar") {
            if (node.getAttribute("orient") === "horizontal") return;
            nativeVertical = true;
            break;
          }
          if (node === c) break;
        }
      } catch (_) { /* Geometry still handles inaccessible native widgets. */ }
      const gutterLeft = Math.max(0, c.clientLeft - borderLeft);
      const gutterRight = Math.max(0, r.right - borderRight - left - c.clientWidth);
      // Overlay scrollbars occupy zero layout width. Reserve a narrow column
      // on their side so they remain usable even while visually hidden.
      const onLeft = gutterLeft > 0 || (gutterRight === 0 && style.direction === "rtl");
      const inColumn = onLeft
        ? e.clientX < r.left + borderLeft + Math.max(gutterLeft, 16)
        : e.clientX >= r.right - borderRight - Math.max(gutterRight, 16);
      if (!nativeVertical && !inColumn) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      // Use immediate scrolling so rapid wheel notches add up predictably.
      c.scrollTop += Math.sign(e.deltaY) * c.clientHeight / 2;
    }
    classify(e) {
      if (!this.container.contains(e.target)) return null;
      if (scrollbar(this.container, e)) return "default";
      if (e.target.closest?.(CONTROLS)) return null;
      return textHit(this.view, e, this.textHover ? 3 : 0) ? "text" : null;
    }
    cursor(value) {
      const root = this.doc.documentElement;
      if (value === null) root.removeAttribute(ATTR);
      else if (root.getAttribute(ATTR) !== value) root.setAttribute(ATTR, value);
    }
    hover(e) {
      if (this.mode) return;
      this.last = e;
      if (!this.enabled() || e.buttons || (e.pointerType && e.pointerType !== "mouse")) { this.finish(); return; }
      const kind = this.classify(e);
      this.textHover = kind === "text";
      this.pauseHand(kind === "text" || kind === "default");
      this.cursor(kind);
    }
    pauseHand(paused) {
      if (paused) {
        if (this.pausedHand) return;
        this.pausedHand = this.win.PDFViewerApplication.pdfCursorTools._handTool;
        this.pausedHand.deactivate();
      } else {
        const hand = this.pausedHand;
        this.pausedHand = null;
        if (hand && this.win.PDFViewerApplication.pdfCursorTools.activeTool === 1) hand.activate();
      }
    }
    down(e) {
      if (!this.enabled() || (e.pointerType && e.pointerType !== "mouse") || e.button !== 0 || e.isPrimary === false || e.defaultPrevented) return;
      if (this.mode) this.finish();
      if (!this.container.contains(e.target)) { this.finish(); return; }
      const kind = this.classify(e);
      if (kind === "text" || kind === "default") {
        this.pauseHand(true);
        this.mode = kind;
        this.cursor(kind);
      } else {
        this.pauseHand(false);
        this.mode = "pan";
        // Native hand stays active, receives the original mousedown/mousemove.
        // Controls and links retain their own cursor and native behavior.
        this.cursor(e.target.closest?.(CONTROLS) ? null : "grabbing");
      }
    }
    finish() {
      this.pauseHand(false);
      this.mode = null; this.last = null; this.textHover = false;
      this.cursor(null);
    }
    destroy() {
      this.finish();
      this.removers.splice(0).forEach(remove => remove());
      this.bus?._off("cursortoolchanged", this.toolChange);
      if (this.view.getActionAtPosition === this.actionWrapper) {
        if (this.ownAction) Object.defineProperty(this.view, "getActionAtPosition", this.ownAction);
        else delete this.view.getActionAtPosition;
      }
      this.style.remove();
    }
  }
  const controllers = new Map();
  let timer = null;
  function scan() {
    const current = new Set();
    for (const reader of Zotero.Reader._readers || []) {
      if (reader._internalReader?._type !== "pdf") continue;
      for (const view of [reader._internalReader._primaryView, reader._internalReader._secondaryView]) {
        try {
          if (!view?._iframe?.isConnected || view._suspended || !view._autoScroll
            || !view._iframeWindow?.PDFViewerApplication?.pdfCursorTools
            || typeof view.getActionAtPosition !== "function" || view._tools?.pointer?.type !== "pointer") continue;
          current.add(view);
          if (controllers.has(view) && controllers.get(view).doc !== view._iframeWindow.document) {
            controllers.get(view).destroy(); controllers.delete(view);
          }
          if (!controllers.has(view)) controllers.set(view, new Controller(view, e => Zotero.logError(e)));
          if (!controllers.get(view).enabled()) controllers.get(view).finish();
        } catch (e) { Zotero.logError(e); }
      }
    }
    for (const [view, controller] of controllers) if (!current.has(view)) {
      try { controller.destroy(); } catch (e) { Zotero.logError(e); }
      controllers.delete(view);
    }
  }
  function start() {
    if (timer !== null) return;
    Zotero.Reader.registerEventListener("renderToolbar", scan, ID);
    timer = setInterval(scan, 500); scan();
  }
  function stop() {
    clearInterval(timer); timer = null;
    Zotero.Reader.unregisterEventListener("renderToolbar", scan);
    for (const c of controllers.values()) { try { c.destroy(); } catch (e) { Zotero.logError(e); } }
    controllers.clear();
  }
  return { start, stop, Controller, scrollbar, textHit };
})();
