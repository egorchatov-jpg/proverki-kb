/**
 * Create local dev SQLite from production GitHub archive.
 */
require('../lib/load-env');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DEV_DB = 'data/proverki-dev.db';

function writeEnvLocal() {
  const envLocal = path.join(ROOT, '.env.local');
  let lines = ['# Local dev SQLite (auto-generated)'];
  if (fs.existsSync(envLocal)) {
    lines = fs.readFileSync(envLocal, 'utf8').split(/\r?\n/);
  }
  const upsert = (key, val) => {
    const re = new RegExp('^' + key + '=');
    let found = false;
    lines = lines.map(l => {
      if (re.test(l)) { found = true; return key + '=' + val; }
      return l;
    });
    if (!found) lines.push(key + '=' + val);
  };
  upsert('DATABASE_PATH', DEV_DB);
  upsert('ENABLE_BACKUP_CRON', '0');
  fs.writeFileSync(envLocal, lines.join('\n') + '\n', 'utf8');
  console.log('Wrote .env.local DATABASE_PATH=' + DEV_DB);
}

console.log('Setting up local dev SQLite...');
writeEnvLocal();
execSync('node scripts/migrate-github-to-sqlite.js --repo=proverki-kb-data --db=' + DEV_DB, {
  cwd: ROOT,
  stdio: 'inherit',
  env: process.env,
});
console.log('Done. npm start');
