const fs = require('fs');
const path = require('path');

const INDEX = path.join(__dirname, '..', 'index.html');
let t = fs.readFileSync(INDEX, 'utf8').replace(/\r\n/g, '\n');

const from = `function migrateLocalPiiOnce() {
  (appState.db || []).forEach(function(r) {
    if (!r) return;
    r.inspector = '';
    r.curator = '';
    r.violator = '';
  });
  if (appState.autocomplete) {
    delete appState.autocomplete.inspector;
    delete appState.autocomplete.curator;
  }
}`;

const to = `function migrateLocalPiiOnce() {
  (appState.db || []).forEach(function(r) {
    if (!r) return;
    r.curator = '';
    r.violator = '';
  });
  if (appState.autocomplete) {
    delete appState.autocomplete.curator;
  }
}`;

if (!t.includes(from)) throw new Error('migrateLocalPiiOnce block not found');
t = t.replace(from, to);
fs.writeFileSync(INDEX, Buffer.from(t, 'utf8'));
console.log('inspector kept in migrateLocalPiiOnce');
