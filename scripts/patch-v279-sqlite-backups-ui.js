const fs = require('fs');

let html = fs.readFileSync('index.html', 'utf8').replace(/\r\n/g, '\n');
let sw = fs.readFileSync('sw.js', 'utf8');

function mustReplace(oldStr, newStr, label) {
  if (!html.includes(oldStr)) throw new Error('NOT FOUND: ' + label);
  html = html.split(oldStr).join(newStr);
}

mustReplace(
  `// ===== \u0422\u041e\u0427\u041a\u0418 \u0412\u041e\u0421\u0421\u0422\u0410\u041d\u041e\u0412\u041b\u0415\u041d\u0418\u042f (\u0431\u044d\u043a\u0430\u043f\u044b Excel) =====`,
  `// ===== \u0422\u041e\u0427\u041a\u0418 \u0412\u041e\u0421\u0421\u0422\u0410\u041d\u041e\u0412\u041b\u0415\u041d\u0418\u042f (SQLite) =====`,
  'restore comment'
);

mustReplace(
  `  fetch('/api/backups')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      _restoreBackupsState.activeBackupId = data.activeBackupId || null;
      _restoreBackupsState.backups = data.backups || [];
      renderRestorePointsList();
    })`,
  `  fetch('/api/backups', { cache: 'no-store' })
    .then(function(r) {
      return r.json().then(function(data) {
        if (!r.ok) throw new Error(data.error || ('HTTP ' + r.status));
        return data;
      });
    })
    .then(function(data) {
      _restoreBackupsState.activeBackupId = data.activeBackupId || null;
      _restoreBackupsState.backups = data.backups || [];
      renderRestorePointsList();
    })`,
  'fetch backups no-store'
);

mustReplace(
  `      _restoreBackupsState.activeBackupId = res.d.id;
      return fetch('/api/backups').then(function(r) { return r.json(); });`,
  `      _restoreBackupsState.activeBackupId = res.d.backupId || res.d.id;
      return fetch('/api/backups', { cache: 'no-store' }).then(function(r) {
        return r.json().then(function(data) {
          if (!r.ok) throw new Error(data.error || ('HTTP ' + r.status));
          return data;
        });
      });`,
  'restore backup fetch fix'
);

mustReplace(
  `var APP_BUILD = 'pkb-v278';`,
  `var APP_BUILD = 'pkb-v279';`,
  'APP_BUILD bump'
);

sw = sw.replace(/pkb-static-v278/g, 'pkb-static-v279');
sw = sw.replace(/pkb-api-v278/g, 'pkb-api-v279');

fs.writeFileSync('index.html', html, 'utf8');
fs.writeFileSync('sw.js', sw, 'utf8');
console.log('patch-v279-sqlite-backups-ui OK -> pkb-v279');
