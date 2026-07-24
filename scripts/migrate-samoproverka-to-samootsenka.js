/**
 * Rename Самопроверка → Самооценка in GitHub settings.json and Excel records.
 *
 * Usage: node scripts/migrate-samoproverka-to-samootsenka.js [--dry-run]
 */
require('../lib/load-env');

const { execSync } = require('child_process');
const XLSX = require('xlsx');
const { buildColIdx } = require('../api/excel-utils');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || (() => {
  try { return execSync('gh auth token', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch (_) { return ''; }
})();
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'egorchatov-jpg';
const REPO_ARG = process.argv.find(a => a.startsWith('--repo='));
const GITHUB_REPO = REPO_ARG ? REPO_ARG.slice(7) : (process.env.GITHUB_DATA_REPO || 'proverki-kb-data');
const DRY_RUN = process.argv.includes('--dry-run');

if (!GITHUB_TOKEN) {
  console.error('GITHUB_TOKEN required');
  process.exit(1);
}

const GH_HEADERS = {
  Authorization: `token ${GITHUB_TOKEN}`,
  Accept: 'application/vnd.github.v3+json',
  'User-Agent': 'proverki-kb-migrate-samootsenka',
};

function renameSamoproverkaText(text) {
  return String(text || '').replace(/([Сс])амопроверк/g, (_, c) => c + 'амооценк');
}

function ghApiUrl(filePath) {
  return `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodeURIComponent(filePath)}`;
}

async function ghGet(path) {
  const r = await fetch(ghApiUrl(path), { headers: GH_HEADERS });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GET ${path}: HTTP ${r.status}`);
  return r.json();
}

async function ghPut(path, base64, sha, message) {
  if (DRY_RUN) {
    console.log(`  DRY RUN PUT ${path}: ${message}`);
    return null;
  }
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

async function migrateSettings() {
  const meta = await ghGet('settings.json');
  if (!meta || !meta.content) {
    console.log('settings.json: not found, skip');
    return;
  }
  const settings = JSON.parse(Buffer.from(meta.content.replace(/\n/g, ''), 'base64').toString('utf8'));
  let changes = 0;
  if (Array.isArray(settings.methods)) {
    settings.methods.forEach(m => {
      if (m && m.name) {
        const n = renameSamoproverkaText(m.name);
        if (n !== m.name) { m.name = n; changes++; }
      }
    });
  }
  if (!changes) {
    console.log('settings.json: already up to date');
    return;
  }
  const json = JSON.stringify(settings, null, 2) + '\n';
  await ghPut('settings.json', Buffer.from(json, 'utf8').toString('base64'), meta.sha,
    'Rename Самопроверка → Самооценка in methods');
  console.log(`settings.json: renamed ${changes} method(s)`);
}

async function migrateExcel(fileName) {
  const meta = await ghGet(fileName);
  if (!meta || !meta.content) {
    console.log(`${fileName}: skip (not found)`);
    return;
  }
  const buf = Buffer.from(meta.content.replace(/\n/g, ''), 'base64');
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
  if (!rows.length) {
    console.log(`${fileName}: empty, skip`);
    return;
  }
  const colIdx = buildColIdx(rows[0].map(h => String(h || '').trim()));
  const methodCol = colIdx.method;
  if (methodCol === undefined) {
    console.log(`${fileName}: no method column, skip`);
    return;
  }
  let changes = 0;
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const val = row[methodCol];
    if (val == null || val === '') continue;
    const n = renameSamoproverkaText(String(val));
    if (n !== String(val)) {
      row[methodCol] = n;
      changes++;
    }
  }
  if (!changes) {
    console.log(`${fileName}: already up to date`);
    return;
  }
  const outWs = XLSX.utils.aoa_to_sheet(rows);
  wb.Sheets[wb.SheetNames[0]] = outWs;
  const outBuf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  await ghPut(fileName, outBuf.toString('base64'), meta.sha,
    `Rename Самопроверка → Самооценка in ${fileName}`);
  console.log(`${fileName}: renamed ${changes} record(s)`);
}

(async () => {
  console.log(`Repo: ${GITHUB_OWNER}/${GITHUB_REPO}${DRY_RUN ? ' (dry-run)' : ''}`);
  await migrateSettings();
  const files = await listExcelFiles();
  for (const f of files) await migrateExcel(f);
  console.log('Done.');
})().catch(err => {
  console.error(err.message || err);
  process.exit(1);
});
