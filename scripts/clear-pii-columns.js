/**
 * Clear personal data columns (inspector, curator, violator) in Excel files on GitHub.
 * Columns remain; cell values are emptied.
 *
 * Usage: node scripts/clear-pii-columns.js [--dry-run]
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env.prod') });
require('dotenv').config({ path: require('path').join(__dirname, '../.env.local') });

const { execSync } = require('child_process');
const XLSX = require('xlsx');
const { buildColIdx } = require('../api/excel-utils');

const PII_KEYS = ['inspector', 'curator', 'violator'];

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || (() => {
  try { return execSync('gh auth token', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch (_) { return ''; }
})();
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'egorchatov-jpg';
const GITHUB_REPO = process.env.GITHUB_DATA_REPO || 'proverki-kb-data';
const DRY_RUN = process.argv.includes('--dry-run');

if (!GITHUB_TOKEN) {
  console.error('GITHUB_TOKEN required (env or gh auth login)');
  process.exit(1);
}

const GH_HEADERS = {
  Authorization: `token ${GITHUB_TOKEN}`,
  Accept: 'application/vnd.github.v3+json',
  'User-Agent': 'proverki-kb-clear-pii',
};

function ghApiUrl(path) {
  return `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodeURIComponent(path)}`;
}

async function ghGet(path) {
  const r = await fetch(ghApiUrl(path), { headers: GH_HEADERS });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GET ${path}: HTTP ${r.status}`);
  return r.json();
}

async function ghPut(path, base64, sha, message) {
  const r = await fetch(ghApiUrl(path), {
    method: 'PUT',
    headers: { ...GH_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, content: base64, sha }),
  });
  if (!r.ok) throw new Error(`PUT ${path}: HTTP ${r.status} — ${await r.text()}`);
  return r.json();
}

async function listExcelFiles() {
  const r = await fetch(ghApiUrl(''), { headers: GH_HEADERS });
  if (!r.ok) throw new Error(`List repo: HTTP ${r.status}`);
  const items = await r.json();
  return items
    .filter(i => i.name && i.name.endsWith('.xlsx') && i.name.includes('Проверки КБ'))
    .map(i => i.name);
}

async function clearFile(fileName) {
  const meta = await ghGet(fileName);
  if (!meta || !meta.content) {
    console.log('  skip (not found)');
    return;
  }

  const buf = Buffer.from(meta.content.replace(/\n/g, ''), 'base64');
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
  if (!rows.length) {
    console.log('  skip (empty)');
    return;
  }

  const colIdx = buildColIdx(rows[0].map(h => String(h || '').trim()));
  const cols = PII_KEYS.map(k => colIdx[k]).filter(i => i !== undefined);
  if (!cols.length) {
    console.log('  skip (PII columns not found)');
    return;
  }

  let cleared = 0;
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    for (const c of cols) {
      if (String(row[c] || '').trim()) {
        row[c] = '';
        cleared++;
      }
    }
  }

  if (DRY_RUN) {
    console.log(`  DRY RUN: would clear ${cleared} cells`);
    return;
  }

  const newWs = XLSX.utils.aoa_to_sheet(rows);
  newWs['!cols'] = ws['!cols'];
  wb.Sheets[wb.SheetNames[0]] = newWs;
  const b64 = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }).toString('base64');

  await ghPut(fileName, b64, meta.sha, `Clear PII columns (${fileName})`);
  console.log(`  OK: cleared ${cleared} cells`);
}

(async () => {
  const files = await listExcelFiles();
  console.log('Files:', files.length, DRY_RUN ? '(dry-run)' : '');
  for (const f of files) {
    console.log(f);
    await clearFile(f);
  }
  console.log('Done.');
})().catch(e => {
  console.error(e);
  process.exit(1);
});
