require('dotenv').config({ path: require('path').join(__dirname, '../.env.prod') });
require('dotenv').config({ path: require('path').join(__dirname, '../.env.local') });
const { execSync } = require('child_process');
if (!process.env.GITHUB_TOKEN) {
  try {
    process.env.GITHUB_TOKEN = execSync('gh auth token', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch (_) {}
}
const { createBackupFromLive } = require('../lib/backups-lib');
createBackupFromLive(new Date())
  .then(function(r) { console.log(JSON.stringify(r, null, 2)); })
  .catch(function(e) { console.error(e.message); process.exit(1); });
