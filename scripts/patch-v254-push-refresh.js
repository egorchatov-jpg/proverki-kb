const fs = require('fs');
const p = 'index.html';
let t = fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
if (t.includes('RECORDS_CHANGED')) {
  console.log('skip');
  process.exit(0);
}
const oldStr = `    navigator.serviceWorker.addEventListener('controllerchange', function() {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    });`;
const newStr = oldStr + `
    navigator.serviceWorker.addEventListener('message', function(e) {
      var data = e.data || {};
      if (data.type === 'RECORDS_CHANGED') {
        clearApiCacheViaSw();
        loadFromServer(function() { refreshActiveRecordLists(); }, { forceFull: true });
      }
    });`;
if (!t.includes(oldStr)) {
  console.error('anchor not found');
  process.exit(1);
}
t = t.replace(oldStr, newStr);
fs.writeFileSync(p, Buffer.from(t.replace(/\n/g, '\r\n'), 'utf8'));
console.log('added RECORDS_CHANGED listener');
