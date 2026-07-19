const keys = ['GITHUB_TOKEN', 'GITHUB_OWNER', 'GITHUB_DATA_REPO', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT'];
const out = {};
keys.forEach(function(k) {
  const v = process.env[k] || '';
  out[k] = v.length ? v : null;
});
require('fs').writeFileSync(require('path').join(__dirname, '..', 'timeweb-env-check.json'), JSON.stringify(out, null, 2));
