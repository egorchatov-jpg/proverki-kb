/**
 * Push local SQLite to production GitHub data repo (proverki-kb-data).
 * Ignores .env.local dev repo override — import must land on prod.
 *
 * Usage:
 *   node scripts/push-db-to-prod.js
 *   node scripts/push-db-to-prod.js --db=data/proverki-analysis.db
 */
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');

const DB_ARG = process.argv.find(function(a) { return a.startsWith('--db='); });
const SOURCE_DB = DB_ARG
  ? (path.isAbsolute(DB_ARG.slice(5)) ? DB_ARG.slice(5) : path.join(ROOT, DB_ARG.slice(5)))
  : path.join(ROOT, 'data', 'proverki-analysis.db');

process.env.PKB_ENV = 'production';
process.env.ENABLE_GITHUB_PERSIST = '1';
process.env.GITHUB_DATA_REPO = process.env.PROD_DATA_REPO || 'proverki-kb-data';

const dotenv = require('dotenv');
dotenv.config({ path: path.join(ROOT, '.env.prod') });
process.env.GITHUB_DATA_REPO = process.env.PROD_DATA_REPO || 'proverki-kb-data';

const { DatabaseSync } = require('node:sqlite');
const { ghPutFile, ghGetMeta, GITHUB_OWNER, GITHUB_REPO } = require('../lib/github-api');

function countRecords(dbPath) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  const row = db.prepare('SELECT COUNT(*) AS c FROM records').get();
  db.close();
  return row.c;
}

(async function() {
  if (!fs.existsSync(SOURCE_DB)) throw new Error('Database not found: ' + SOURCE_DB);
  const records = countRecords(SOURCE_DB);
  if (records < 1) throw new Error('Refusing to push empty database (' + records + ' records)');

  const buf = fs.readFileSync(SOURCE_DB);
  const remoteMeta = await ghGetMeta('database/proverki.db');
  console.log('target repo:', GITHUB_OWNER + '/' + GITHUB_REPO);
  console.log('source:', SOURCE_DB, '(' + buf.length + ' bytes,', records, 'records)');
  if (remoteMeta) {
    console.log('remote now:', remoteMeta.size, 'bytes, sha', remoteMeta.sha.slice(0, 12));
  }

  await ghPutFile('database/proverki.db', buf, 'Restore production SQLite with checklist import (' + records + ' records)');
  console.log('OK: pushed to production GitHub');
})().catch(function(e) {
  console.error(e.message || e);
  process.exit(1);
});
