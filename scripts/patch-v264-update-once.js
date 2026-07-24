/**
 * Fix multi-step app update overlay (pkb-v264).
 */
const fs = require('fs');

let html = fs.readFileSync('index.html', 'utf8').replace(/\r\n/g, '\n');

function mustReplace(oldStr, newStr, label) {
  if (!html.includes(oldStr)) throw new Error('NOT FOUND in index: ' + label);
  html = html.split(oldStr).join(newStr);
}

mustReplace(
  'var _appUpdateApplying = false;\nvar _appUpdateOverlayShown = false;\n\nfunction showAppUpdateOverlay() {\n  if (_appUpdateOverlayShown) return;\n  _appUpdateOverlayShown = true;\n  var el = document.getElementById(\'overlay-app-update\');\n  if (el) el.classList.add(\'active\');\n}\n\nfunction applyAppUpdate() {\n  _appUpdateApplying = true;\n  try { localStorage.removeItem(\'pkb-app-build\'); } catch (_e) {}\n  var reload = function() {\n    window.location.href = \'/?v=\' + Date.now();\n  };\n  var activateWaitingSw = function() {\n    if (swRegistration && swRegistration.waiting) {\n      swRegistration.waiting.postMessage({ type: \'SKIP_WAITING\' });\n    }\n    if (navigator.serviceWorker && navigator.serviceWorker.controller) {\n      navigator.serviceWorker.controller.postMessage({ type: \'CLEAR_ALL_CACHES\' });\n    }\n  };\n  if (\'caches\' in window) {\n    caches.keys().then(function(keys) {\n      return Promise.all(keys.map(function(k) { return caches.delete(k); }));\n    }).then(function() {\n      activateWaitingSw();\n      setTimeout(reload, 250);\n    }).catch(function() {\n      activateWaitingSw();\n      reload();\n    });\n  } else {\n    activateWaitingSw();\n    reload();\n  }\n}\n\nfunction checkForAppUpdate() {\n  if (_appUpdateOverlayShown || _appUpdateApplying) return;\n  fetch(\'/api/version\', { cache: \'no-store\' })\n    .then(function(r) { return r.ok ? r.json() : null; })\n    .then(function(d) {\n      if (d && d.build && d.build !== APP_BUILD && d.build !== \'unknown\' && d.build !== \'local\') {\n        showAppUpdateOverlay();\n      }\n    })\n    .catch(function() {});\n}\n\nfunction noteWaitingServiceWorker(reg) {\n  if (!reg || !reg.waiting || !navigator.serviceWorker.controller) return;\n  showAppUpdateOverlay();\n}',
  `var _appUpdateApplying = false;
var _appUpdateOverlayShown = false;
var _updateReloadDone = false;
var _lastUpdateCheckMs = 0;

function showAppUpdateOverlay() {
  if (_appUpdateOverlayShown || _appUpdateApplying) return;
  _appUpdateOverlayShown = true;
  var el = document.getElementById('overlay-app-update');
  if (el) el.classList.add('active');
}

function clearUpdateInProgressFlag() {
  try { sessionStorage.removeItem('pkb-update-in-progress'); } catch (_e) {}
}

function reloadForAppUpdate() {
  if (_updateReloadDone) return;
  _updateReloadDone = true;
  window.location.replace('/?v=' + Date.now());
}

function applyAppUpdate() {
  if (_appUpdateApplying) return;
  _appUpdateApplying = true;
  _appUpdateOverlayShown = true;
  try { sessionStorage.setItem('pkb-update-in-progress', '1'); } catch (_e) {}
  try { localStorage.removeItem('pkb-app-build'); } catch (_e) {}

  var hasWaitingSw = !!(swRegistration && swRegistration.waiting);
  var activateWaitingSw = function() {
    if (swRegistration && swRegistration.waiting) {
      swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
    } else if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_ALL_CACHES' });
    }
  };

  var finishUpdate = function() {
    activateWaitingSw();
    if (hasWaitingSw) {
      setTimeout(function() {
        if (_appUpdateApplying && !_updateReloadDone) reloadForAppUpdate();
      }, 4000);
    } else {
      reloadForAppUpdate();
    }
  };

  if ('caches' in window) {
    caches.keys().then(function(keys) {
      return Promise.all(keys.map(function(k) { return caches.delete(k); }));
    }).then(finishUpdate).catch(finishUpdate);
  } else {
    finishUpdate();
  }
}

function evaluateAppUpdate(reg) {
  if (_appUpdateOverlayShown || _appUpdateApplying) return;
  var now = Date.now();
  if (now - _lastUpdateCheckMs < 5000) return;
  _lastUpdateCheckMs = now;

  var swWaiting = !!(reg && reg.waiting && navigator.serviceWorker.controller);
  fetch('/api/version', { cache: 'no-store' })
    .then(function(r) { return r.ok ? r.json() : null; })
    .then(function(d) {
      var serverBuild = d && d.build;
      var htmlStale = serverBuild && serverBuild !== APP_BUILD && serverBuild !== 'unknown' && serverBuild !== 'local';
      if (htmlStale || swWaiting) {
        showAppUpdateOverlay();
      } else {
        clearUpdateInProgressFlag();
      }
    })
    .catch(function() {
      if (swWaiting) showAppUpdateOverlay();
    });
}

function checkForAppUpdate() {
  evaluateAppUpdate(swRegistration);
}

function noteWaitingServiceWorker(reg) {
  evaluateAppUpdate(reg || swRegistration);
}`,
  'app update block'
);

mustReplace(
  "      checkForAppUpdate();\n      if (swRegistration) {\n        swRegistration.update().then(function() { noteWaitingServiceWorker(swRegistration); });",
  "      if (swRegistration) {\n        swRegistration.update().then(function() { evaluateAppUpdate(swRegistration); });",
  'visibility update check'
);

mustReplace(
  "    navigator.serviceWorker.addEventListener('controllerchange', function() {\n      if (reloaded) return;\n      if (!_appUpdateApplying) return;\n      reloaded = true;\n      window.location.href = '/?v=' + Date.now();\n    });",
  "    navigator.serviceWorker.addEventListener('controllerchange', function() {\n      if (!_appUpdateApplying || _updateReloadDone) return;\n      reloadForAppUpdate();\n    });",
  'controllerchange reload'
);

mustReplace(
  "    navigator.serviceWorker.register('/sw.js?v=' + APP_BUILD).then(function(reg) {\n      swRegistration = reg;\n      subscribeToPush(reg);\n      reg.update().then(function() { noteWaitingServiceWorker(reg); });\n      if (reg.active) prefetchPassportAssets();\n      reg.addEventListener('updatefound', function() {\n        var nw = reg.installing;\n        if (!nw) return;\n        nw.addEventListener('statechange', function() {\n          if (nw.state === 'installed') {\n            noteWaitingServiceWorker(reg);\n            checkForAppUpdate();\n          }\n          if (nw.state === 'activated') prefetchPassportAssets();\n        });\n      });\n    }).catch(function(){});",
  "    navigator.serviceWorker.register('/sw.js').then(function(reg) {\n      swRegistration = reg;\n      subscribeToPush(reg);\n      reg.update().then(function() { evaluateAppUpdate(reg); });\n      if (reg.active) prefetchPassportAssets();\n      reg.addEventListener('updatefound', function() {\n        var nw = reg.installing;\n        if (!nw) return;\n        nw.addEventListener('statechange', function() {\n          if (nw.state === 'installed') evaluateAppUpdate(reg);\n          if (nw.state === 'activated') prefetchPassportAssets();\n        });\n      });\n    }).catch(function(){});",
  'registerSW'
);

html = html.replace(/var APP_BUILD = 'pkb-v263';/, "var APP_BUILD = 'pkb-v264';");

fs.writeFileSync('index.html', Buffer.from(html, 'utf8'));
console.log('patch-v264-update-once OK -> pkb-v264');
