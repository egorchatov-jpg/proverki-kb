/**
 * App update overlay + server version check + deferred SW activation.
 */
const fs = require('fs');
const path = require('path');

const INDEX = path.join(__dirname, '..', 'index.html');

let t = fs.readFileSync(INDEX, 'utf8').replace(/\r\n/g, '\n');

function mustReplace(label, from, to) {
  if (!t.includes(from)) throw new Error('Missing: ' + label);
  t = t.replace(from, to);
}

mustReplace(
  'update overlay css',
  `#overlay-push-prompt .overlay-btn { flex: 0 0 auto; width: calc(33.333% - 7px); }`,
  `#overlay-push-prompt .overlay-btn { flex: 0 0 auto; width: calc(33.333% - 7px); }
#overlay-app-update { z-index: 10050; }
#overlay-app-update .overlay-box {
  display: flex; flex-direction: column; align-items: center;
  min-height: 220px; padding-bottom: 28px;
}
#overlay-app-update .overlay-title { text-align: center; margin-bottom: auto; padding-top: 8px; }
.overlay-app-update-footer {
  width: 100%; display: flex; justify-content: center; padding-top: 32px;
}
.overlay-app-update-footer .overlay-btn {
  flex: 0 0 auto; min-width: 220px; max-width: 320px; width: 72%;
}`
);

mustReplace(
  'update overlay html',
  `<!-- ===== PUSH PERMISSION OVERLAY ===== -->
<div class="overlay" id="overlay-push-prompt">`,
  `<!-- ===== APP UPDATE OVERLAY ===== -->
<div class="overlay" id="overlay-app-update">
  <div class="overlay-box">
    <div class="overlay-title">Необходимо обновить приложение</div>
    <div class="overlay-app-update-footer">
      <button type="button" class="overlay-btn overlay-btn-apply" onclick="applyAppUpdate()">Обновить</button>
    </div>
  </div>
</div>

<!-- ===== PUSH PERMISSION OVERLAY ===== -->
<div class="overlay" id="overlay-push-prompt">`
);

mustReplace(
  'ensureAppBuildFresh',
  `function ensureAppBuildFresh() {
  try {
    var prev = localStorage.getItem('pkb-app-build');
    if (prev && prev !== APP_BUILD) {
      localStorage.setItem('pkb-app-build', APP_BUILD);
      if ('caches' in window) {
        caches.keys().then(function(keys) {
          return Promise.all(keys.map(function(k) { return caches.delete(k); }));
        }).then(function() { window.location.reload(); });
      } else {
        window.location.reload();
      }
      return;
    }
    if (!prev) localStorage.setItem('pkb-app-build', APP_BUILD);
  } catch (_e) {}
}`,
  `var _appUpdateApplying = false;
var _appUpdateOverlayShown = false;

function showAppUpdateOverlay() {
  if (_appUpdateOverlayShown) return;
  _appUpdateOverlayShown = true;
  var el = document.getElementById('overlay-app-update');
  if (el) el.classList.add('active');
}

function applyAppUpdate() {
  _appUpdateApplying = true;
  try { localStorage.removeItem('pkb-app-build'); } catch (_e) {}
  var reload = function() {
    window.location.href = '/?v=' + Date.now();
  };
  var activateWaitingSw = function() {
    if (swRegistration && swRegistration.waiting) {
      swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_ALL_CACHES' });
    }
  };
  if ('caches' in window) {
    caches.keys().then(function(keys) {
      return Promise.all(keys.map(function(k) { return caches.delete(k); }));
    }).then(function() {
      activateWaitingSw();
      setTimeout(reload, 250);
    }).catch(function() {
      activateWaitingSw();
      reload();
    });
  } else {
    activateWaitingSw();
    reload();
  }
}

function checkForAppUpdate() {
  if (_appUpdateOverlayShown || _appUpdateApplying) return;
  fetch('/api/version', { cache: 'no-store' })
    .then(function(r) { return r.ok ? r.json() : null; })
    .then(function(d) {
      if (d && d.build && d.build !== APP_BUILD && d.build !== 'unknown' && d.build !== 'local') {
        showAppUpdateOverlay();
      }
    })
    .catch(function() {});
}

function noteWaitingServiceWorker(reg) {
  if (!reg || !reg.waiting || !navigator.serviceWorker.controller) return;
  showAppUpdateOverlay();
}

function ensureAppBuildFresh() {
  try {
    var prev = localStorage.getItem('pkb-app-build');
    if (!prev || prev !== APP_BUILD) localStorage.setItem('pkb-app-build', APP_BUILD);
  } catch (_e) {}
}`
);

mustReplace(
  '_finishInit registerSW',
  `function _finishInit() {
  registerSW();`,
  `function _finishInit() {
  registerSW();
  checkForAppUpdate();`
);

mustReplace(
  'visibility check update',
  `      clearNotificationsAndBadge();
      if (swRegistration) subscribeToPush(swRegistration);`,
  `      clearNotificationsAndBadge();
      checkForAppUpdate();
      if (swRegistration) {
        swRegistration.update().then(function() { noteWaitingServiceWorker(swRegistration); });
        subscribeToPush(swRegistration);
      }`
);

mustReplace(
  'registerSW',
  `function registerSW() {
  if ('serviceWorker' in navigator) {
    var reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', function() {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    });
    navigator.serviceWorker.addEventListener('message', function(e) {
      var data = e.data || {};
      if (data.type === 'RECORDS_CHANGED') {
        clearApiCacheViaSw();
        loadFromServer(function() { refreshActiveRecordLists(); }, { forceFull: true });
      }
    });
    navigator.serviceWorker.register('/sw.js?v=' + APP_BUILD).then(function(reg) {
      swRegistration = reg;
      subscribeToPush(reg);
      reg.update();
      if (reg.active) prefetchPassportAssets();
      reg.addEventListener('updatefound', function() {
        var nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', function() {
          if (nw.state === 'activated') prefetchPassportAssets();
        });
      });
    }).catch(function(){});
  }
}`,
  `function registerSW() {
  if ('serviceWorker' in navigator) {
    var reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', function() {
      if (reloaded) return;
      if (!_appUpdateApplying) return;
      reloaded = true;
      window.location.href = '/?v=' + Date.now();
    });
    navigator.serviceWorker.addEventListener('message', function(e) {
      var data = e.data || {};
      if (data.type === 'RECORDS_CHANGED') {
        clearApiCacheViaSw();
        loadFromServer(function() { refreshActiveRecordLists(); }, { forceFull: true });
      }
    });
    navigator.serviceWorker.register('/sw.js?v=' + APP_BUILD).then(function(reg) {
      swRegistration = reg;
      subscribeToPush(reg);
      reg.update().then(function() { noteWaitingServiceWorker(reg); });
      if (reg.active) prefetchPassportAssets();
      reg.addEventListener('updatefound', function() {
        var nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', function() {
          if (nw.state === 'installed') {
            noteWaitingServiceWorker(reg);
            checkForAppUpdate();
          }
          if (nw.state === 'activated') prefetchPassportAssets();
        });
      });
    }).catch(function(){});
  }
}`
);

mustReplace('APP_BUILD', "var APP_BUILD = 'pkb-v260';", "var APP_BUILD = 'pkb-v261';");

fs.writeFileSync(INDEX, Buffer.from(t, 'utf8'));
console.log('patch-app-update-overlay OK → pkb-v261');
