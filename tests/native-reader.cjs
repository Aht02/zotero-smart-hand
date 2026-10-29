// Read the installed Zotero code rather than maintaining a copy of its selection algorithm.
const fs = require('node:fs');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const archive = process.env.ZOTERO_APP_ARCHIVE || 'D:/Program Files/Zotero/app/omni.ja';
// ZOTERO_READER_JS can point at an already-extracted resource/reader/reader.js,
// which avoids needing Python (or a process spawn) to unpack the app archive.
const extracted = process.env.ZOTERO_READER_JS;
const hasExtracted = !!extracted && fs.existsSync(extracted);
exports.available = hasExtracted || fs.existsSync(archive);
exports.load = function () {
  const source = hasExtracted ? fs.readFileSync(extracted, 'utf8') : execFileSync('python', ['-c',
    "import sys,zipfile; sys.stdout.buffer.write(zipfile.ZipFile(sys.argv[1]).read('resource/reader/reader.js'))", archive],
  { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  function moduleSource(name) {
    const start = source.indexOf(';// ./src/' + name);
    if (start < 0) throw new Error('Native module not found: ' + name);
    return source.slice(start, source.indexOf(';// ./src/', start + 10));
  }
  const pdf = moduleSource('pdf/pdf-view.js');
  function method(name, next) {
    const start = pdf.indexOf('  ' + name);
    const end = pdf.indexOf('\n  ' + next, start + 1);
    if (start < 0 || end < 0) throw new Error('Native method not found: ' + name);
    return pdf.slice(start, end);
  }
  const context = {
    // UI side effects are stubbed; action lookup and text-range calculations are native.
    throttle: fn => fn, isRTL: () => false,
    syncTextLayerSelection: (win, ranges) => { win.selectedText = ranges.map(r => r.text).join(' '); },
    clearTimeout, setTimeout
  };
  return vm.runInNewContext(moduleSource('pdf/lib/utilities.js') + '\n' + moduleSource('pdf/selection.js') + `
    setTextLayerSelection = syncTextLayerSelection;
    class NativeView {
      ${method('getActionAtPosition(', 'updateCursor(')}
      ${method('_handlePointerDown(', '_handleTouchMove(')}
      ${method('_handlePointerMove =', '_shouldHandleBackdropTap(')}
      ${method('_handlePointerUp(', '_handlePointerCancel(')}
    }
    NativeView;
  `, context);
};
