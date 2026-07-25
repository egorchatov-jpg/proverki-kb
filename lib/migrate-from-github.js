/**
 * Import GitHub data repo (Excel + JSON) into SQLite.
 */
const fs = require('fs');
const XLSX = require('xlsx');
const {
  normalizeDateStr,
  toDateNum,
  toDateEntryNum,
  assignMissingCheckIds,
  buildColIdx,
  COLUMNS,
} = require('../api/excel-utils');
const { getDb, closeDb, resolveDbPath } = require('./db');
const {
  clearAllRecords,
  importRecordRow,
  renumberYear,
  countAllRecords,
} = require('./records-store');
const { importSettings } = require('./settings-store');
const { importChecklistItems, clearAllChecklists } = require('./checklists-store');
const { importSubscriptions } = require('./subscriptions-store');
const {
  githubToken,
  ghGetRaw,
  ghListDir,
  GITHUB_OWNER,
  GITHUB_REPO,
} = require('./github-api');

async function ghListExcel(owner, repo) {
  const items = await ghListDir('', githubToken());
  return items
    .filter(i => i.name && i.name.endsWith('.xlsx') && i.name.includes('Проверки КБ'))
    .map(i => i.name);
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
    d = toDateEntryNum(a.dateEntry) - toDateEntryNum(b.dateEntry);
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

async function importFromGithub(options) {
  const owner = (options && options.owner) || process.env.GITHUB_OWNER || 'egorchatov-jpg';
  const repo = (options && options.repo) || process.env.GITHUB_DATA_REPO || process.env.PROD_DATA_REPO || 'proverki-kb-data';

  fs.mkdirSync(require('path').dirname(resolveDbPath()), { recursive: true });
  getDb();
  clearAllRecords();
  clearAllChecklists();
  getDb().exec('DELETE FROM push_subscriptions');
  getDb().exec('DELETE FROM app_settings');

  const settingsRaw = await ghGetRaw('settings.json');
  if (settingsRaw) importSettings(JSON.parse(settingsRaw));

  const clRaw = await ghGetRaw('checklists.json');
  if (clRaw) {
    const cl = JSON.parse(clRaw);
    importChecklistItems(cl.items || {});
  }

  const subsRaw = await ghGetRaw('subscriptions.json');
  if (subsRaw) {
    const subs = JSON.parse(subsRaw);
    importSubscriptions(subs.subscriptions || []);
  }

  const files = await ghListExcel(owner, repo);
  let total = 0;
  for (const name of files) {
    const m = name.match(/(\d{4})/);
    const year = m ? m[1] : String(new Date().getFullYear());
    const buf = await ghGetRaw(name);
    if (!buf) continue;
    const recs = parseWorkbook(buf, year);
    recs.forEach(r => importRecordRow(r));
    renumberYear(getDb(), parseInt(year, 10));
    total += recs.length;
  }

  return { total, dbPath: resolveDbPath(), repo: `${owner}/${repo}` };
}

async function migrateFromGithubIfEmpty() {
  if (process.env.AUTO_MIGRATE_FROM_GITHUB === '0') return null;
  if (countAllRecords() > 0) return null;
  if (!githubToken()) {
    console.warn('[migrate] database empty; GITHUB_TOKEN not set — skip auto-import');
    return null;
  }
  console.log('[migrate] empty database — importing from GitHub...');
  const result = await importFromGithub();
  console.log('[migrate] done:', result.total, 'records →', result.dbPath);
  return result;
}

module.exports = {
  importFromGithub,
  migrateFromGithubIfEmpty,
  githubToken,
  GITHUB_OWNER,
  GITHUB_REPO,
};
