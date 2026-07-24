/**
 * Rename Самопроверка → Самооценка (all grammatical forms) in index.html + runtime migration.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/\r\n/g, '\n');

html = html.replace(
  "{ name: 'Самопроверка', show: true }",
  "{ name: 'Самооценка', show: true }"
);

if (!html.includes('function renameSamoproverkaText(')) {
  html = html.replace(
    `// One-time cleanup for devices that cached PII before fields were removed from UI.
function migrateLocalPiiOnce() {`,
    `function renameSamoproverkaText(text) {
  return String(text || '').replace(/([Сс])амопроверк/g, function(_, c) { return c + 'амооценк'; });
}

function migrateSamoproverkaToSamootsenka() {
  var changed = false;
  function touchMethod(obj) {
    if (obj && obj.method) {
      var n = renameSamoproverkaText(obj.method);
      if (n !== obj.method) { obj.method = n; changed = true; }
    }
  }
  (appState.methods || []).forEach(function(m) {
    if (m && m.name) {
      var n = renameSamoproverkaText(m.name);
      if (n !== m.name) { m.name = n; changed = true; }
    }
  });
  (appState.db || []).forEach(touchMethod);
  try {
    var sq = getSyncQueue();
    var sqChanged = false;
    sq.forEach(function(r) {
      if (!r || !r.method) return;
      var n = renameSamoproverkaText(r.method);
      if (n !== r.method) { r.method = n; sqChanged = true; changed = true; }
    });
    if (sqChanged) localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(sq));
    var uq = getUpdateQueue();
    var uqChanged = false;
    uq.forEach(function(item) {
      if (!item || !item.method) return;
      var n = renameSamoproverkaText(item.method);
      if (n !== item.method) { item.method = n; uqChanged = true; changed = true; }
    });
    if (uqChanged) localStorage.setItem(UPDATE_QUEUE_KEY, JSON.stringify(uq));
  } catch (_e) {}
  return changed;
}

// One-time cleanup for devices that cached PII before fields were removed from UI.
function migrateLocalPiiOnce() {`
  );
}

if (!html.includes('migrateSamoproverkaToSamootsenka();')) {
  html = html.replace(
    `  loadState();
  if (needDataMigration) {
    migrateLocalPiiOnce();
    saveState();
  }`,
    `  loadState();
  if (migrateSamoproverkaToSamootsenka()) saveState();
  if (needDataMigration) {
    migrateLocalPiiOnce();
    saveState();
  }`
  );
}

if (!html.includes('data.methods = data.methods.map(function(m)')) {
  html = html.replace(
    `      if (data.methods && data.methods.length) {
        appState.methods = preferLocal
          ? mergeMethods(data.methods, localMethods)
          : data.methods.map(function(m) { return Object.assign({}, m); });
      }`,
    `      if (data.methods && data.methods.length) {
        data.methods = data.methods.map(function(m) {
          var copy = Object.assign({}, m);
          if (copy.name) copy.name = renameSamoproverkaText(copy.name);
          return copy;
        });
        appState.methods = preferLocal
          ? mergeMethods(data.methods, localMethods)
          : data.methods.map(function(m) { return Object.assign({}, m); });
      }`
  );
}

if (!html.includes('migrateSamoproverkaToSamootsenka();\n      saveState();')) {
  html = html.replace(
    `          applyChecklistsMap(appState.db, cl.items || {});
          saveState();
          refreshActiveRecordLists();`,
    `          applyChecklistsMap(appState.db, cl.items || {});
          if (migrateSamoproverkaToSamootsenka()) markSettingsDirty();
          saveState();
          refreshActiveRecordLists();`
  );
}

if (!html.includes("name: 'Самооценка'")) {
  console.error('DEFAULT_METHODS patch failed');
  process.exit(1);
}

fs.writeFileSync(path.join(root, 'index.html'), Buffer.from(html.replace(/\n/g, '\r\n'), 'utf8'));
console.log('patched index.html: Самопроверка → Самооценка');
