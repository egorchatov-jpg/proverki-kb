const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'index.html');
let t = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

if (!t.includes("var APP_BUILD = 'pkb-v315';")) {
  throw new Error('Expected pkb-v315 in index.html');
}
t = t.replace("var APP_BUILD = 'pkb-v315';", "var APP_BUILD = 'pkb-v316';");

const insertAfter = `function clearApiCacheViaSw() {
  try {
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_API_CACHE' });
    }
  } catch (_e) {}
}`;

const withFallback = insertAfter + `

function applyLoadedRecords(serverRecords, finish) {
  var localDb = appState.db.slice();
  if (localDb.length >= 50 && serverRecords.length < Math.min(100, Math.floor(localDb.length * 0.5))) {
    console.warn('[server] неполный ответ сервера (' + serverRecords.length + ' из ' + localDb.length + ') — сохраняем локальные проверки');
    var jul25FromServer = serverRecords.filter(function(r) {
      return String(r.dateCheck || '').trim().indexOf('25.07.2026') === 0;
    });
    serverRecords = localDb.slice();
    jul25FromServer.forEach(function(sr) {
      if (!sr.checkId) return;
      var idx = -1;
      for (var i = 0; i < serverRecords.length; i++) {
        if (serverRecords[i].checkId === sr.checkId) { idx = i; break; }
      }
      if (idx >= 0) serverRecords[idx] = sr;
      else serverRecords.push(sr);
    });
  }
  seedUpdateQueueFromLocalDb(serverRecords);
  appState.db = mergeServerRecords(serverRecords);
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
      if (migrateSamoproverkaToSamootsenka()) markSettingsDirty();
      saveState();
      refreshActiveRecordLists();
      retryAllQueues();
      finish(true);
    });
}

function recoverRecordsWhenServerEmpty(finish) {
  fetch('/api/self-heal?_=' + Date.now(), { cache: 'no-store' })
    .then(function(r) { return r.json().catch(function() { return null; }); })
    .catch(function() { return null; })
    .then(function() {
      return fetch('/api/records?_=' + Date.now(), { cache: 'no-store' });
    })
    .then(function(r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function(d) {
      if (d && Array.isArray(d.records) && d.records.length > 0) {
        console.log('[server] восстановлено с сервера после self-heal:', d.records.length);
        return d.records;
      }
      return fetch('/data/records-snapshot.json?v=' + APP_BUILD, { cache: 'no-store' })
        .then(function(r) { return r.ok ? r.json() : null; })
        .catch(function() { return null; })
        .then(function(snap) {
          if (snap && Array.isArray(snap.records) && snap.records.length > 0) {
            console.warn('[server] сервер пуст — загружен резервный снимок:', snap.records.length);
            return snap.records;
          }
          return [];
        });
    })
    .then(function(records) {
      if (!records.length) { finish(true); return; }
      applyLoadedRecords(records, finish);
    })
    .catch(function(e) {
      console.warn('[server] восстановление не удалось:', e.message);
      finish(true);
    });
}`;

if (!t.includes('function applyLoadedRecords(serverRecords, finish)')) {
  if (!t.includes(insertAfter)) throw new Error('clearApiCacheViaSw block not found');
  t = t.replace(insertAfter, withFallback);
}

const oldBlock = `    if (d && Array.isArray(d.records)) {
      var localDb = appState.db.slice();
      var serverRecords = d.records;
      if (localDb.length >= 50 && serverRecords.length < Math.min(100, Math.floor(localDb.length * 0.5))) {
        console.warn('[server] неполный ответ сервера (' + serverRecords.length + ' из ' + localDb.length + ') — сохраняем локальные проверки');
        var jul25FromServer = serverRecords.filter(function(r) {
          return String(r.dateCheck || '').trim().indexOf('25.07.2026') === 0;
        });
        serverRecords = localDb.slice();
        jul25FromServer.forEach(function(sr) {
          if (!sr.checkId) return;
          var idx = -1;
          for (var i = 0; i < serverRecords.length; i++) {
            if (serverRecords[i].checkId === sr.checkId) { idx = i; break; }
          }
          if (idx >= 0) serverRecords[idx] = sr;
          else serverRecords.push(sr);
        });
      }
      seedUpdateQueueFromLocalDb(serverRecords);
      appState.db = mergeServerRecords(serverRecords);
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
          if (migrateSamoproverkaToSamootsenka()) markSettingsDirty();
          saveState();
          refreshActiveRecordLists();
          retryAllQueues();
          finish(true);
        });
      return;
    }`;

const newBlock = `    if (d && Array.isArray(d.records)) {
      if (d.records.length === 0) {
        recoverRecordsWhenServerEmpty(finish);
        return;
      }
      applyLoadedRecords(d.records, finish);
      return;
    }`;

if (!t.includes('function recoverRecordsWhenServerEmpty(finish)')) {
  throw new Error('recoverRecordsWhenServerEmpty not inserted');
}
if (!t.includes(oldBlock)) {
  throw new Error('loadFromServer records block not found');
}
t = t.replace(oldBlock, newBlock);

fs.writeFileSync(file, Buffer.from(t, 'utf8'));
console.log('OK: index.html pkb-v316 empty-server recovery');
