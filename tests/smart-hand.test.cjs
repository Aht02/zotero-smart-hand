const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const scope = { exportReaderFunction: fn => fn };
vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname, '../content/smart-hand.js'), 'utf8'), scope);
const { Controller } = scope.SmartHand;
function fixture() {
  const attrs = new Map(), handlers = new Map();
  const target = { addEventListener(t, f) { handlers.set(t, f); }, removeEventListener() {} };
  const root = { appendChild() {}, getAttribute: k => attrs.get(k), setAttribute: (k,v) => attrs.set(k,v), removeAttribute: k => attrs.delete(k) };
  const container = { ...target, contains: n => !!n?.inside, clientLeft: 0, clientTop: 0, clientWidth: 90, clientHeight: 100,
    getBoundingClientRect: () => ({ left:0, top:0, right:100, bottom:100 }) };
  const hand = { active: true, activations: 0, deactivations: 0,
    activate() { this.active = true; this.activations++; }, deactivate() { this.active = false; this.deactivations++; } };
  const tools = { activeTool: 1, _handTool: hand };
  const doc = { ...target, documentElement: root, getElementById: () => container, createElement: () => ({ remove() {} }) };
  const win = { ...target, document:doc, PDFViewerApplication: { pdfCursorTools:tools, pdfViewer: { _pages:[{ viewport:{ scale:1 } }] } } };
  const original = function() { return this._tool.type; };
  const view = { _iframeWindow:win, _tool:{ type:'hand' }, _tools:{ pointer:{type:'pointer'} }, _pdfPages:[{ chars:[{ rect:[10,10,20,20] }] }],
    pointerEventToPosition: e => ({ pageIndex:0, rects:[[e.clientX,e.clientY]] }), getActionAtPosition:original };
  const c = new Controller(view, e => { throw e; });
  const event = (x=15, y=15, buttons=0) => ({ target:{ inside:true, closest:()=>null }, clientX:x, clientY:y, buttons, button:0, pointerType:'mouse' });
  return { c, hand, view, tools, event, attrs, original, handlers };
}
test('hover text actually deactivates native hand before any press', () => {
  const f=fixture(); f.c.hover(f.event());
  assert.equal(f.hand.active,false); assert.equal(f.c.mode,null);
  assert.equal(f.attrs.get('data-smart-hand-cursor'),'text');
  f.c.hover(f.event()); assert.equal(f.hand.deactivations,1);
  f.c.down(f.event(15,15,1)); assert.equal(f.hand.activations,0);
  assert.equal(f.view.getActionAtPosition(),'pointer'); assert.equal(f.view._tool.type,'hand');
});
test('moving from text to blank restores hand, without pressing', () => {
  const f=fixture(); f.c.hover(f.event()); f.c.hover(f.event(50,50));
  assert.equal(f.hand.active,true); assert.equal(f.hand.activations,1); assert.equal(f.attrs.size,0);
});
test('blank gesture never restarts or disables native engine; crossing text keeps pan', () => {
  const f=fixture(); f.c.hover(f.event(50,50)); f.c.down(f.event(50,50,1)); f.c.hover(f.event(15,15,1));
  assert.equal(f.c.mode,'pan'); assert.equal(f.hand.activations,0); assert.equal(f.hand.deactivations,0);
  assert.equal(f.view.getActionAtPosition(),'hand');
});
test('text gesture stays selection when crossing blank', () => {
  const f=fixture(); f.c.hover(f.event()); f.c.down(f.event(15,15,1)); f.c.hover(f.event(50,50,1));
  assert.equal(f.c.mode,'text'); assert.equal(f.hand.active,false);
  f.c.finish(); assert.equal(f.hand.active,true);
});
test('scrollbar hover yields hand and uses arrow', () => {
  const f=fixture(); f.c.hover(f.event(95,50));
  assert.equal(f.hand.active,false); assert.equal(f.attrs.get('data-smart-hand-cursor'),'default');
  f.c.down(f.event(95,50,1)); assert.equal(f.c.mode,'default'); assert.equal(f.view.getActionAtPosition(),'hand');
});
test('tool off is inert, and cleanup does not reactivate it', () => {
  const f=fixture(); f.c.hover(f.event()); f.tools.activeTool=0; f.view._tool={type:'pointer'};
  f.c.hover(f.event()); f.c.down(f.event(15,15,1));
  assert.equal(f.hand.activations,0); assert.equal(f.c.mode,null); assert.equal(f.attrs.size,0);
});
test('leave and destroy restore native behavior and original method', () => {
  const f=fixture(); f.c.hover(f.event()); f.handlers.get('pointerleave')(); assert.equal(f.hand.active,true);
  f.c.hover(f.event()); f.c.destroy(); assert.equal(f.hand.active,true); assert.equal(f.view.getActionAtPosition,f.original);
});
test('action exception always restores tool', () => {
  const f=fixture(); f.c.originalAction=()=>{throw new Error('probe');}; f.c.down(f.event(15,15,1));
  assert.throws(()=>f.view.getActionAtPosition(),/probe/); assert.equal(f.view._tool.type,'hand');
});

test('spaces within lines and normal interline gaps stay text without hand churn', () => {
  const f = fixture();
  f.view._pdfPages[0].chars = [
    {rect:[10,10,20,20]}, {rect:[30,10,40,20],lineBreakAfter:true},
    {rect:[10,30,20,40]}, {rect:[30,30,40,40],lineBreakAfter:true}
  ];
  for (const [x,y] of [[15,15],[25,15],[25,25],[15,35],[25,25]]) {
    f.c.hover(f.event(x,y));
    assert.equal(f.attrs.get('data-smart-hand-cursor'),'text');
  }
  assert.equal(f.hand.activations,0);
  assert.equal(f.hand.deactivations,1);
  f.c.down(f.event(25,25,1));
  assert.equal(f.c.mode,'text');
});

test('column gutters, paragraph gaps and ragged ends use the hand', () => {
  const f = fixture();
  f.view._pdfPages[0].chars = [
    {rect:[10,10,30,20],lineBreakAfter:true}, {rect:[60,10,80,20],lineBreakAfter:true},
    {rect:[10,30,30,40],lineBreakAfter:true}, {rect:[60,30,80,40],lineBreakAfter:true},
    {rect:[10,80,30,90],lineBreakAfter:true}
  ];
  for (const [x,y] of [[45,15],[45,25],[20,60],[75,85]]) {
    f.c.hover(f.event(x,y));
    assert.equal(f.attrs.size,0);
    assert.equal(f.hand.active,true);
  }
  f.c.hover(f.event(3,50));
  assert.equal(f.hand.active,true);
  f.c.hover(f.event(88,50));
  assert.equal(f.hand.active,true);
  // An indented first line does not inherit the width of later lines.
  f.view._pdfPages[0].chars = [
    {rect:[30,10,80,20],lineBreakAfter:true},
    {rect:[10,30,80,40],lineBreakAfter:true}
  ];
  f.c.hover(f.event(15,15));
  assert.equal(f.attrs.size,0);
  f.c.hover(f.event(15,25));
  assert.equal(f.attrs.size,0);
  f.c.hover(f.event(40,25));
  assert.equal(f.attrs.get('data-smart-hand-cursor'),'text');
});

test('large image and chapter gaps stay hand even between aligned text lines', () => {
  const f = fixture();
  f.view._pdfPages[0].chars = [
    {rect:[10,10,80,20],lineBreakAfter:true},
    {rect:[10,70,80,80],lineBreakAfter:true}
  ];
  f.c.hover(f.event(40,15));
  for (const y of [30,45,60,90]) {
    f.c.hover(f.event(40,y));
    assert.equal(f.hand.active,true);
  }
  f.c.down(f.event(40,45,1));
  assert.equal(f.c.mode,'pan');
});

test('explicit leading/trailing spaces do not enlarge the text hit area', () => {
  const f = fixture();
  f.view._pdfPages[0].chars = [
    {c:' ',rect:[5,10,30,20]}, {c:'word',rect:[30,10,50,20]},
    {c:' ',rect:[50,10,85,20],lineBreakAfter:true}
  ];
  for (const x of [15,70]) {
    f.c.hover(f.event(x,15));
    assert.equal(f.hand.active,true);
  }
  f.c.hover(f.event(40,15));
  assert.equal(f.hand.active,false);
});

test('missing line-break metadata still splits lines and wide horizontal gaps', () => {
  const f = fixture();
  f.view._pdfPages[0].chars = [
    {rect:[10,10,20,20]}, {rect:[60,10,80,20]},
    {rect:[10,30,20,40]}, {rect:[60,30,80,40]}
  ];
  f.c.hover(f.event(40,15));
  assert.equal(f.hand.active,true);
  f.c.hover(f.event(15,25));
  assert.equal(f.hand.active,false);
});

test('text exit has small hysteresis and honors zoom', () => {
  const f = fixture();
  f.c.hover(f.event());
  f.c.hover(f.event(24,15));
  assert.equal(f.hand.active,false);
  f.c.hover(f.event(26,15));
  assert.equal(f.hand.active,true);
  f.view._iframeWindow.PDFViewerApplication.pdfViewer._pages[0].viewport.scale=2;
  f.c.hover(f.event());
  f.c.hover(f.event(24,15));
  assert.equal(f.hand.active,true);
});

test('links, annotations, touch and right click are not converted to selection', () => {
  const f = fixture();
  f.view._getSelectableOverlay=()=>({type:'external-link'});
  f.c.hover(f.event());
  assert.equal(f.attrs.size,0);
  delete f.view._getSelectableOverlay;
  f.c.down({...f.event(15,15,1),pointerType:'touch'});
  assert.equal(f.c.mode,null);
  f.c.down({...f.event(15,15,2),button:2});
  assert.equal(f.c.mode,null);
});

test('mousedown can select even without a preceding plugin pointerdown', () => {
  const f = fixture();
  const event = {...f.event(15,15,1),type:'mousedown',pointerType:undefined};
  f.c.originalAction = function () {
    assert.equal(this._tool,this._tools.pointer);
    return this._tool.type;
  };
  assert.equal(f.view.getActionAtPosition({},event),'pointer');
  assert.equal(f.view._tool.type,'hand');
  assert.equal(f.c.mode,'text');
});

test('native calls never pass privileged arrays through the content function apply method', () => {
  const f = fixture();
  f.c.originalAction = function () { return this._tool.type; };
  f.c.originalAction.apply = () => { throw new Error('Permission denied to access property length'); };
  assert.equal(f.view.getActionAtPosition(),'hand');
  f.c.down(f.event(15,15,1));
  assert.equal(f.view.getActionAtPosition(),'pointer');
  assert.equal(f.view._tool.type,'hand');
});

const native = require('./native-reader.cjs');
test('installed Zotero: native mousedown/move/up produce selected text and double-click selects word',
  {skip: !native.available}, () => {
    const NativeView = native.load();
    function nativeFixture() {
      const f = fixture(), v = new NativeView();
      f.c.destroy();
      Object.assign(v,f.view, {
        getActionAtPosition: NativeView.prototype.getActionAtPosition,
        _selectionRanges:[], _selectedAnnotationIDs:[], _options:{},
        _isSelectionCollapsed:()=>true, _clearFocus(){}, getSelectedAnnotations:()=>[],
        getSelectableAnnotations:()=>[], getPageByIndex:()=>({}),
        _getSelectableOverlay:()=>null, _onSelectAnnotations(){}, _onSetSelectionPopup(){},
        _onSetOverlayPopup(){}, _onSetAnnotationPopup(){}, updateCursor(){}, _render(){}, _updateViewStats(){},
        _shouldHandleBackdropTap:()=>false, _getPageLabel:()=> '1',
        getClientRectForPopup:()=>[0,0,1,1], _overlayPopupDelayer:{close: fn=>fn()},
        _getAnnotationFromSelectionRanges:r=>({text:r.map(x=>x.text).join(' '),position:r[0].position}),
        _autoScroll:{enable(){},disable(){},setPointerPosition(){}},
        pointerEventToAltPosition: f.view.pointerEventToPosition
      });
      v._iframeWindow.getSelection=()=>({removeAllRanges(){}});
      const chars = [...'hello world'].map((c,i)=>({c,pageIndex:0,offset:i,rotation:0,rect:[10+i*5,10,15+i*5,20],
        inlineRect:[10+i*5,10,15+i*5,20],wordBreakAfter:i===4||i===10,lineBreakAfter:i===10}));
      v._pdfPages=[{chars,viewBox:[0,0,100,100]}];
      const controller = new Controller(v,e=>{throw e;});
      const event = (x,type='mousedown',detail=1)=>({...f.event(x,15,1),type,detail,
        pointerType:type==='mousedown'?undefined:'mouse',target:{inside:true,closest:selector=>selector==='#viewerContainer'?{}:null,
          classList:{contains:()=>false}}});
      return {f,v,controller,event};
    }
    const {v,controller,event} = nativeFixture();
    v._handlePointerDown(event(10)); // Native handler runs before plugin capture listener.
    assert.equal(v.action.type,'selectText');
    assert.equal(v._tool.type,'hand');
    v._handlePointerMove(event(34,'pointermove'));
    assert.equal(v._selectionRanges[0].text,'hello');
    v._handlePointerUp({...event(34,'pointerup'),buttons:0});
    assert.equal(v._iframeWindow.selectedText,'hello');
    controller.finish();
    const second = nativeFixture();
    second.v._handlePointerDown(second.event(22,'mousedown',2));
    assert.equal(second.v._selectionRanges[0].text,'hello');
    assert.equal(second.v.action.mode,'words');
    second.controller.destroy();
    controller.destroy();
  });
