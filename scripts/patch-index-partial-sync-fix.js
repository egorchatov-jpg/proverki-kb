const fs = require('fs');
const path = require('path');

const INDEX = path.join(__dirname, '..', 'index.html');
let html = fs.readFileSync(INDEX, 'utf8').replace(/\r\n/g, '\n');

function mustReplace(oldStr, newStr, label) {
  if (!html.includes(oldStr)) throw new Error('Missing: ' + label);
  html = html.replace(oldStr, newStr);
}

mustReplace(
  "var APP_BUILD = 'pkb-v312';",
  "var APP_BUILD = 'pkb-v313';",
  'APP_BUILD'
);

mustReplace(
  `    if (d && Array.isArray(d.records)) {
      var localDb = appState.db.slice();
      seedUpdateQueueFromLocalDb(d.records);
      appState.db = mergeServerRecords(d.records);`,
  `    if (d && Array.isArray(d.records)) {
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
      appState.db = mergeServerRecords(serverRecords);`,
  'partial server safeguard'
);

fs.writeFileSync(INDEX, Buffer.from(html, 'utf8'));
console.log('OK: index.html pkb-v313 partial-sync safeguard');
