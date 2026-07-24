/**
 * One-time import: GitHub data repo (Excel + JSON) → local SQLite.
 *
 * Usage:
 *   node scripts/migrate-github-to-sqlite.js
 *   node scripts/migrate-github-to-sqlite.js --repo=proverki-kb-data
 *   node scripts/migrate-github-to-sqlite.js --db=data/proverki-dev.db
 */
require('../lib/load-env');

const { resolveDbPath, closeDb } = require('../lib/db');
const { importFromGithub } = require('../lib/migrate-from-github');

const REPO_ARG = process.argv.find(a => a.startsWith('--repo='));
const DB_ARG = process.argv.find(a => a.startsWith('--db='));

if (DB_ARG) process.env.DATABASE_PATH = DB_ARG.slice(5);
if (REPO_ARG) process.env.GITHUB_DATA_REPO = REPO_ARG.slice(7);

async function main() {
  console.log('Import from GitHub → SQLite');
  console.log('  db:', resolveDbPath());
  const result = await importFromGithub();
  closeDb();
  console.log('');
  console.log(`Done. ${result.total} records in ${result.dbPath}`);
}

main().catch(function(e) {
  console.error(e.message || e);
  process.exit(1);
});
