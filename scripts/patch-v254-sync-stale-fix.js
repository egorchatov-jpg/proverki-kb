/**
 * pkb-v254: fix records disappearing when SW serves stale /api/records cache on flaky mobile networks.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/\r\n/g, '\n');

if (!html.includes('function mergeServerRecords(')) {
  html = html.replace(
    `// --- Load ALL records from server (source of truth) → onDone(ok:bool) ---
// Uses a shared-callbacks pattern: if a load is already in flight, new callers
// are queued and all receive the same result when the single request completes.
var _loadCallbacks = null; // null = idle; array = request in flight

function loadFromServer(onDone) {
  if (_loadCallbacks !== null) {
    // Reuse the in-flight request instead of firing a duplicate
    if (onDone) _loadCallbacks.push(onDone);
    return;
  }
  _loadCallbacks = onDone ? [onDone] : [];

  function finish(ok) {
    clearTimeout(safetyTimer);
    var cbs = _loadCallbacks;
    _loadCallbacks = null;
    cbs.forEach(function(cb) { cb(ok); });
  }

  // Safety net: if no response in 14s → continue offline
  var safetyTimer = setTimeout(function() {
    console.warn('[server] таймаут 14с — продолжаем офлайн');
    finish(false);
  }, 14000);

  // Build URL with per-year SHA params for conditional GET (ETag optimisation).
  // Server returns {unchanged:true} when file SHA matches → skips file transfer + parse.
  var shas = getServerShas();
  var params = [];
  Object.keys(shas).forEach(function(k) {
    if (shas[k]) params.push(k + '=' + encodeURIComponent(shas[k]));
  });
  var url = '/api/records' + (params.length ? '?' + params.join('&') : '');

  fetch(url, { cache: 'no-store' })
  .then(function(r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  })
  .then(function(d) {
    if (d.shas) saveServerShas(d.shas);

    if (d.unchanged) {
      // File unchanged on server — cached data is already current
      console.log('[server] без изменений, данные актуальны');
      retryAllQueues();
      finish(true);
      return;
    }

    if (d && Array.isArray(d.records)) {
      var localDb = appState.db.slice();
      seedUpdateQueueFromLocalDb(d.records);
      appState.db = mergeWithQueue(d.records);
      preserveLocalChecklists(appState.db, localDb);
      appState.db = applyPendingUpdates(appState.db);
      purgeSyncedUpdates(appState.db);
      normalizeDbDates();
      renumberDb();
      fetch('/api/checklists', { cache: 'no-store' })
        .then(function(r) { return r.ok ? r.json() : { items: {} }; })
        .catch(function() { return { items: {} }; })
        .then(function(cl) {
          applyChecklistsMap(appState.db, cl.items || {});
          saveState();
          renderLobby();
          var fs = document.getElementById('screen-find');
          if (fs && fs.classList.contains('active')) applyFindFilters(true);
          var cs = document.getElementById('screen-corrective-list');
          if (cs && cs.classList.contains('active')) renderCorrectiveList(true);
          var ss = document.getElementById('screen-sokb-list');
          if (ss && ss.classList.contains('active')) renderSokbList(true);
          retryAllQueues();
          finish(true);
        });
      return;
    }
    finish(true);
  })
  .catch(function(e) {
    console.warn('[server] офлайн:', e.message);
    finish(false);
  });
}`,
    `function recordStableKey(r) {
  if (r && r.checkId) return 'c:' + r.checkId;
  if (r && r.dateEntry) return 'e:' + r.dateEntry;
  return '';
}

// Merge server snapshot with offline queue; keep server-confirmed rows missing from a stale response.
function mergeServerRecords(serverRecords) {
  var merged = mergeWithQueue(serverRecords);
  var keys = {};
  merged.forEach(function(r) {
    var k = recordStableKey(r);
    if (k) keys[k] = true;
  });
  var added = false;
  (appState.db || []).forEach(function(local) {
    var k = recordStableKey(local);
    if (!k || keys[k]) return;
    if (local.checkId) {
      merged.push(local);
      keys[k] = true;
      added = true;
    }
  });
  if (added) {
    merged = merged.filter(function(r) { return r.dateCheck && r.dateCheck.trim(); });
    merged.forEach(function(r) { if (r.dateCheck) r.dateCheck = normalizeDateStr(r.dateCheck); });
    merged.sort(cmpRecords);
  }
  return merged;
}

function refreshActiveRecordLists() {
  renderLobby();
  var fs = document.getElementById('screen-find');
  if (fs && fs.classList.contains('active')) applyFindFilters(true);
  var cs = document.getElementById('screen-corrective-list');
  if (cs && cs.classList.contains('active')) renderCorrectiveList(true);
  var ss = document.getElementById('screen-sokb-list');
  if (ss && ss.classList.contains('active')) renderSokbList(true);
}

function clearApiCacheViaSw() {
  try {
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_API_CACHE' });
    }
  } catch (_e) {}
}

// --- Load ALL records from server (source of truth) → onDone(ok:bool) ---
// Uses a shared-callbacks pattern: if a load is already in flight, new callers
// are queued and all receive the same result when the single request completes.
var _loadCallbacks = null; // null = idle; array = request in flight
var _loadForceFull = false;

function loadFromServer(onDone, opts) {
  opts = opts || {};
  if (_loadCallbacks !== null) {
    if (onDone) _loadCallbacks.push(onDone);
    if (opts.forceFull) _loadForceFull = true;
    return;
  }
  _loadCallbacks = onDone ? [onDone] : [];
  _loadForceFull = !!opts.forceFull;

  function finish(ok) {
    clearTimeout(safetyTimer);
    var cbs = _loadCallbacks;
    var forceFull = _loadForceFull;
    _loadCallbacks = null;
    _loadForceFull = false;
    cbs.forEach(function(cb) { cb(ok); });
  }

  // Safety net: if no response in 14s → continue offline
  var safetyTimer = setTimeout(function() {
    console.warn('[server] таймаут 14с — продолжаем офлайн');
    finish(false);
  }, 14000);

  // Build URL with per-year SHA params for conditional GET (ETag optimisation).
  // Server returns {unchanged:true} when file SHA matches → skips file transfer + parse.
  // forceFull skips SHA (resume / pull / online) so other users' saves are always fetched.
  var params = ['_=' + Date.now()];
  if (!_loadForceFull) {
    var shas = getServerShas();
    Object.keys(shas).forEach(function(k) {
      if (shas[k]) params.push(k + '=' + encodeURIComponent(shas[k]));
    });
  }
  var url = '/api/records?' + params.join('&');

  fetch(url, { cache: 'no-store' })
  .then(function(r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  })
  .then(function(d) {
    if (d.shas) saveServerShas(d.shas);

    if (d.unchanged) {
      console.log('[server] без изменений, данные актуальны');
      retryAllQueues();
      refreshActiveRecordLists();
      finish(true);
      return;
    }

    if (d && Array.isArray(d.records)) {
      var localDb = appState.db.slice();
      seedUpdateQueueFromLocalDb(d.records);
      appState.db = mergeServerRecords(d.records);
      preserveLocalChecklists(appState.db, localDb);
      appState.db = applyPendingUpdates(appState.db);
      purgeSyncedUpdates(appState.db);
      normalizeDbDates();
      renumberDb();
      fetch('/api/checklists?_=' + Date.now(), { cache: 'no-store' })
        .then(function(r) { return r.ok ? r.json() : { items: {} }; })
        .catch(function() { return { items: {} }; })
        .then(function(cl) {
          applyChecklistsMap(appState.db, cl.items || {});
          saveState();
          refreshActiveRecordLists();
          retryAllQueues();
          finish(true);
        });
      return;
    }
    finish(true);
  })
  .catch(function(e) {
    console.warn('[server] офлайн:', e.message);
    finish(false);
  });
}`
  );
}

html = html.replace(
  `    loadFromServer(function(ok) {
      setPullIndicator('done', ok ? 'Обновлено' : 'Офлайн: данные из кэша');
      setTimeout(function() { hidePullIndicator(true); }, 1400);
    });`,
  `    clearApiCacheViaSw();
    loadFromServer(function(ok) {
      setPullIndicator('done', ok ? 'Обновлено' : 'Офлайн: данные из кэша');
      setTimeout(function() { hidePullIndicator(true); }, 1400);
    }, { forceFull: true });`
);

html = html.replace(
  `      loadFromServer(function() {
        retryAllQueues();
        if (isSettingsDirty()) syncSettingsToServer();
        prefetchPassportAssets();
        loadPassportManifest();
        var activeScr2 = document.querySelector('.screen.active');
        if (activeScr2 && LIST_SCROLL_SCREENS.indexOf(activeScr2.id) >= 0) {
          restoreListScrollPosition(activeScr2.id);
        }
      });`,
  `      clearApiCacheViaSw();
      loadFromServer(function() {
        retryAllQueues();
        if (isSettingsDirty()) syncSettingsToServer();
        prefetchPassportAssets();
        loadPassportManifest();
        var activeScr2 = document.querySelector('.screen.active');
        if (activeScr2 && LIST_SCROLL_SCREENS.indexOf(activeScr2.id) >= 0) {
          restoreListScrollPosition(activeScr2.id);
        }
      }, { forceFull: true });`
);

html = html.replace(
  `function syncWhenOnline() {
  loadFromServer(function() {
    retryAllQueues();
    if (isSettingsDirty()) syncSettingsToServer();
    prefetchPassportAssets();
    loadPassportManifest();
  });
}`,
  `function syncWhenOnline() {
  clearApiCacheViaSw();
  loadFromServer(function() {
    retryAllQueues();
    if (isSettingsDirty()) syncSettingsToServer();
    prefetchPassportAssets();
    loadPassportManifest();
  }, { forceFull: true });
}`
);

html = html.replace(
  `      loadFromServer(function() {
        var fs = document.getElementById('screen-find');
        if (fs && fs.classList.contains('active')) applyFindFilters();
        var cs = document.getElementById('screen-corrective-list');
        if (cs && cs.classList.contains('active')) renderCorrectiveList();
        var ss = document.getElementById('screen-sokb-list');
        if (ss && ss.classList.contains('active')) renderSokbList();
      });`,
  `      loadFromServer(function() {
        refreshActiveRecordLists();
      }, { forceFull: true });`
);

html = html.replace(
  "var APP_BUILD = 'pkb-v253';",
  "var APP_BUILD = 'pkb-v254';"
);

if (!html.includes('function mergeServerRecords(')) {
  console.error('patch failed: mergeServerRecords not inserted');
  process.exit(1);
}

fs.writeFileSync(path.join(root, 'index.html'), Buffer.from(html.replace(/\n/g, '\r\n'), 'utf8'));
console.log('patched index.html -> pkb-v254 sync stale fix');
