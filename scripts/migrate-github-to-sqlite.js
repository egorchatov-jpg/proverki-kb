/**
 * One-time import: GitHub data repo (Excel + JSON) → local SQLite.
 *
 * Usage:
 *   node scripts/migrate-github-to-sqlite.js
 *   node scripts/migrate-github-to-sqlite.js --repo=proverki-kb-data
 *   node scripts/migrate-github-to-sqlite.js --db=data/proverki-dev.db
 */
require('../lib/load-env');

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const XLSX = require('xlsx');
const { normalizeDateStr, toDateNum, toDateEntryNum, assignMissingCheckIds, buildColIdx, COLUMNS, COL } = require('../api/excel-utils');
const { getDb, closeDb, resolveDbPath } = require('../lib/db');
const {
  clearAllRecords,
  importRecordRow,
  renumberYear,
  listYearsWithRecords,
} = require('../lib/records-store');
const { importSettings } = require('../lib/settings-store');
const { importChecklistItems, clearAllChecklists } = require('../lib/checklists-store');
const { importSubscriptions } = require('../lib/subscriptions-store');

const REPO_ARG = process.argv.find(a => a.startsWith('--repo='));
const DB_ARG = process.argv.find(a => a.startsWith('--db='));
const GITHUB_REPO = REPO_ARG ? REPO_ARG.slice(7) : (process.env.PROD_DATA_REPO || 'proverki-kb-data');
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'egorchatov-jpg';

if (DB_ARG) process.env.DATABASE_PATH = DB_ARG.slice(5);

function token() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN.trim();
  try {
    return execSync('gh auth token', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch (_) {
    return '';
  }
}

function ghUrl(filePath) {
  return `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodeURIComponent(filePath)}`;
}

async function ghGetRaw(filePath) {
  const t = token();
  if (!t) throw new Error('GITHUB_TOKEN required for migration');
  const r = await fetch(ghUrl(filePath), {
    headers: {
      Authorization: `token ${t}`,
      Accept: 'application/vnd.github.raw',
      'User-Agent': 'proverki-kb-migrate',
    },
  });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GET ${filePath}: HTTP ${r.status}`);
  if (filePath.endsWith('.xlsx')) return Buffer.from(await r.arrayBuffer());
  return r.text();
}

async function ghListExcel() {
  const t = token();
  const r = await fetch(ghUrl(''), {
    headers: { Authorization: `token ${t}`, Accept: 'application/vnd.github.v3+json', 'User-Agent': 'proverki-kb-migrate' },
  });
  if (!r.ok) throw new Error('List repo failed');
  const items = await r.json();
  return items.filter(i => i.name && i.name.endsWith('.xlsx') && i.name.includes('Проверки КБ')).map(i => i.name);
}

function pad(n) { return String(n).padStart(2, '0'); }

function fmtDate(d) {
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

function fmtDateTime(d) {
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function cellToStr(val, key) {
  if (val == null || val === '') return '';
  if (val instanceof Date) return key === 'dateEntry' ? fmtDateTime(val) : fmtDate(val);
  if (typeof val === 'number' && key === 'dateEntry' && val > 30000) {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    return fmtDateTime(new Date(epoch.getTime() + Math.round(val * 86400000)));
  }
  if (typeof val === 'number' && key === 'dateCheck' && val > 30000) return normalizeDateStr(val);
  const s = String(val).trim();
  if (key === 'dateCheck') return normalizeDateStr(s);
  return s;
}

function parseWorkbook(buf, year) {
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  let rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
  rows = assignMissingCheckIds(rows, year);
  if (!rows.length) return [];
  const header = rows[0].map(h => String(h || '').trim());
  const colIdx = buildColIdx(header);
  const recs = [];
  for (let ri = 1; ri < rows.length; ri++) {
    const row = rows[ri];
    if (!row || !row.length) continue;
    const rec = { year: String(year) };
    COLUMNS.forEach(c => {
      const idx = colIdx[c.k];
      rec[c.k] = idx !== undefined ? cellToStr(row[idx], c.k) : '';
    });
    if (rec.dateCheck && rec.dateCheck.trim()) recs.push(rec);
  }
  recs.sort(function(a, b) {
    let d = toDateNum(a.dateCheck) - toDateNum(b.dateCheck);
    if (d) return d;
    d = toDateEntryNum(b.dateEntry) - toDateEntryNum(a.dateEntry);
    if (d) return d;
    d = String(a.org || '').localeCompare(String(b.org || ''), 'ru');
    if (d) return d;
    d = String(a.method || '').localeCompare(String(b.method || ''), 'ru');
    if (d) return d;
    return String(a.barrier || '').localeCompare(String(b.barrier || ''), 'ru');
  });
  recs.forEach((r, i) => { r.num = i + 1; });
  return recs;
}

async function main() {
  console.log('Import from GitHub → SQLite');
  console.log('  repo:', `${GITHUB_OWNER}/${GITHUB_REPO}`);
  console.log('  db:  ', resolveDbPath());

  fs.mkdirSync(path.dirname(resolveDbPath()), { recursive: true });
  getDb();
  clearAllRecords();
  clearAllChecklists();
  getDb().exec('DELETE FROM push_subscriptions');
  getDb().exec('DELETE FROM app_settings');

  const settingsRaw = await ghGetRaw('settings.json');
  if (settingsRaw) {
    importSettings(JSON.parse(settingsRaw));
    console.log('  settings.json OK');
  }

  const clRaw = await ghGetRaw('checklists.json');
  if (clRaw) {
    const cl = JSON.parse(clRaw);
    importChecklistItems(cl.items || {});
    console.log('  checklists:', Object.keys(cl.items || {}).length);
  }

  const subsRaw = await ghGetRaw('subscriptions.json');
  if (subsRaw) {
    const subs = JSON.parse(subsRaw);
    importSubscriptions(subs.subscriptions || []);
    console.log('  subscriptions:', (subs.subscriptions || []).length);
  }

  const files = await ghListExcel();
  let total = 0;
  for (const name of files) {
    const m = name.match(/(\d{4})/);
    const year = m ? m[1] : String(new Date().getFullYear());
    const buf = await ghGetRaw(name);
    if (!buf) continue;
    const recs = parseWorkbook(buf, year);
    recs.forEach(r => importRecordRow(r));
    renumberYear(getDb(), parseInt(year, 10));
    console.log(`  ${name}: ${recs.length} records`);
    total += recs.length;
  }

  closeDb();
  console.log('');
  console.log(`Done. ${total} records in ${resolveDbPath()}`);
  console.log('Restart server: npm start');
}

main().catch(function(e) {
  console.error(e.message || e);
  process.exit(1);
});
