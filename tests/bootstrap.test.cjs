const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('upgrade at the same XPI URI bypasses stale sub-script cache and cleans up the new instance', async () => {
  const events = [];
  const uri = 'jar:file:///profile/extensions/smart-hand@aht02.github.io.xpi!/';
  const load = (url, options) => {
    assert.equal(url, uri + 'content/smart-hand.js');
    const version = options.ignoreCache ? 'disk' : 'stale-cache';
    options.target.SmartHand = {
      start() { events.push(version + ':start'); },
      stop() { events.push(version + ':stop'); }
    };
  };
  const scope = {
    Zotero: { initializationPromise: Promise.resolve() },
    Components: { utils: { exportFunction: fn => fn } },
    Services: { scriptloader: {
      loadSubScript: (url, target) => load(url, {target}),
      loadSubScriptWithOptions: load
    } },
    setInterval, clearInterval
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../bootstrap.js'), 'utf8'), scope);
  await scope.startup({rootURI: uri});
  scope.shutdown();
  await scope.startup({rootURI: uri});
  scope.shutdown();
  assert.deepEqual(events, ['disk:start','disk:stop','disk:start','disk:stop']);
  assert.equal(scope.smartHandScope, null);
});
