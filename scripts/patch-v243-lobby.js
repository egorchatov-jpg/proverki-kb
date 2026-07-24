const fs = require('fs');
const path = require('path');
const indexPath = path.join(__dirname, '..', 'index.html');
let html = fs.readFileSync(indexPath, 'utf8').replace(/\r\n/g, '\n');
const old = `  loadState();
  if (needDataMigration) {
    migrateLocalPiiOnce();
    saveState();
  }
  initDateDrum();`;
const neu = `  loadState();
  if (needDataMigration) {
    migrateLocalPiiOnce();
    saveState();
  }
  renderLobby();
  initDateDrum();`;
if (!html.includes(old)) { console.error('block not found'); process.exit(1); }
html = html.replace(old, neu);
fs.writeFileSync(indexPath, html.replace(/\n/g, '\r\n'), 'utf8');
console.log('Added immediate renderLobby after loadState');
