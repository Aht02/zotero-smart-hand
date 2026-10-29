/* global Zotero, Services, Components, setInterval, clearInterval */
var smartHandScope;
async function startup({ rootURI }) {
  await Zotero.initializationPromise;
  smartHandScope = {
    Zotero, setInterval, clearInterval,
    exportReaderFunction: (fn, target) => Components.utils.exportFunction(fn, target, { allowCrossOriginArguments: true })
  };
  // The installed XPI keeps the same resource URI across upgrades. Zotero
  // bypasses its bootstrap cache, but sub-scripts need the same treatment.
  Services.scriptloader.loadSubScriptWithOptions(rootURI + "content/smart-hand.js", {
    target: smartHandScope,
    ignoreCache: true
  });
  smartHandScope.SmartHand.start();
}
function shutdown() { smartHandScope?.SmartHand.stop(); smartHandScope = null; }
function install() {}
function uninstall() {}
