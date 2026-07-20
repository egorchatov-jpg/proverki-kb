/**
 * Delete inspection records entered after a cutoff from GitHub Excel + checklists.
 *
 * Usage:
 *   node scripts/delete-records-after.js [--dry-run] [--cutoff "19.07.2026 17:00:00"]
 *   node scripts/delete-records-after.js --url https://kbcheck.webtm.ru
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env.prod') });
require('dotenv').config({ path: require('path').join(__dirname, '../.env.local') });
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
require('dotenv').config({ path: require('path').join(__dirname, '../timeweb.env') });

const { execSync } = require('child_process');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const urlIdx = args.indexOf('--url');
const REMOTE_URL = urlIdx >= 0 ? args[urlIdx + 1] : '';
const cutoffArgIdx = args.indexOf('--cutoff');
const DEFAULT_CUTOFF = '19.07.2026 17:00:00';
const CUTOFF_STR = cutoffArgIdx >= 0 ? args[cutoffArgIdx + 1] : DEFAULT_CUTOFF;

function resolveGithubToken() {
  const envTok = process.env.GITHUB_TOKEN && String(process.env.GITHUB_TOKEN).trim();
  if (envTok) return envTok;
  try {
    return execSync('gh auth token', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch (_) {
    return '';
  }
}

async function runRemote() {
  const base = REMOTE_URL.replace(/\/$/, '');
  const r = await fetch(base + '/api/purge-records', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cutoff: CUTOFF_STR, dryRun: DRY_RUN }),
  });
  const data = await r.json().catch(function() { return {}; });
  if (!r.ok) {
    throw new Error(data.error || ('HTTP ' + r.status));
  }
  console.log(JSON.stringify(data, null, 2));
}

async function runLocal() {
  const token = resolveGithubToken();
  if (!token) {
    console.error('No GITHUB_TOKEN. Use gh auth login or --url https://kbcheck.webtm.ru');
    process.exit(1);
  }
  process.env.GITHUB_TOKEN = token;
  const { deleteRecordsAfter } = require('../lib/delete-records-lib');
  const result = await deleteRecordsAfter(CUTOFF_STR, { dryRun: DRY_RUN });
  console.log(JSON.stringify({ success: true, result }, null, 2));
}

async function main() {
  console.log('Cutoff (strictly after): ' + CUTOFF_STR + (DRY_RUN ? ' [dry-run]' : ''));
  if (REMOTE_URL) {
    await runRemote();
  } else {
    await runLocal();
  }
}

main().catch(function(err) {
  console.error(err.message || err);
  process.exit(1);
});
