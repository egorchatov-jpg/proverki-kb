const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'timeweb.env');
const out = path.join(__dirname, '..', 'timeweb-upload.env');

const keys = [
  'GITHUB_TOKEN',
  'GITHUB_OWNER',
  'GITHUB_DATA_REPO',
  'VAPID_PUBLIC_KEY',
  'VAPID_PRIVATE_KEY',
  'VAPID_SUBJECT',
];

if (!fs.existsSync(src)) {
  console.error('timeweb.env not found — run: vercel env pull timeweb.env --environment=production');
  process.exit(1);
}

const lines = fs.readFileSync(src, 'utf8').split(/\r?\n/);
const found = {};
for (const line of lines) {
  if (!line || line.startsWith('#')) continue;
  const i = line.indexOf('=');
  if (i < 0) continue;
  const k = line.slice(0, i).trim();
  let v = line.slice(i + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  found[k] = v;
}

const outLines = [];
for (const k of keys) {
  if (found[k]) outLines.push(k + '=' + found[k]);
  else console.warn('MISSING:', k);
}
outLines.push('ENABLE_BACKUP_CRON=1');

fs.writeFileSync(out, outLines.join('\n') + '\n', 'utf8');

console.log('Created:', out);
keys.forEach(function(k) {
  const v = found[k] || '';
  console.log('  ' + k + ': ' + (v.length > 8 ? 'OK (' + v.length + ' chars)' : v ? 'SHORT (' + v.length + ')' : 'MISSING'));
});
