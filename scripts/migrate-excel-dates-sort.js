/**
 * Migrate Excel on GitHub: normalize dateCheck to DD.MM.YYYY, re-sort, renumber.
 * Usage: node scripts/migrate-excel-dates-sort.js [--dry-run]
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env.prod') });
require('dotenv').config({ path: require('path').join(__dirname, '../.env.local') });

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ExcelJS = require('exceljs');
const {
  COL, buildColIdx, normalizeDateStr, toDateNum, toDateEntryNum,
} = require('../api/excel-utils');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || (() => {
  try { return execSync('gh auth token', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch (_) { return ''; }
})();
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'egorchatov-jpg';
const GITHUB_REPO  = process.env.GITHUB_DATA_REPO || 'proverki-kb-data';
const TARGET_FILE  = 'Проверки КБ 2026.xlsx';
const COL_COUNT    = 15;
const DRY_RUN      = process.argv.includes('--dry-run');

const GH_HEADERS = {
  Authorization: `token ${GITHUB_TOKEN}`,
  Accept: 'application/vnd.github.v3+json',
  'User-Agent': 'proverki-kb-migrate-dates',
};

function ghApiUrl(filePath) {
  return `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodeURIComponent(filePath)}`;
}

function rawCellValue(val) {
  if (val == null) return '';
  if (val instanceof Date) return val;
  if (typeof val === 'object' && val.richText) return val.richText.map(t => t.text).join('');
  if (typeof val === 'object' && val.text) return val.text;
  return val;
}

function cloneRowSnapshot(row) {
  const cells = [];
  for (let c = 1; c <= COL_COUNT; c++) {
    const cell = row.getCell(c);
    cells.push({
      style: cell.style,
      numFmt: cell.numFmt,
    });
  }
  return { height: row.height, cells };
}

function applySnapshot(row, snap, values) {
  for (let i = 0; i < COL_COUNT; i++) {
    const cell = row.getCell(i + 1);
    const src = snap.cells[i];
    cell.value = values[i];
    if (src && src.style) cell.style = src.style;
    if (src && src.numFmt) cell.numFmt = src.numFmt;
  }
  if (snap.height) row.height = snap.height;
  row.commit();
}

function sortItems(items, colIdx) {
  const dc = colIdx.dateCheck ?? COL.dateCheck;
  const de = colIdx.dateEntry ?? COL.dateEntry;
  const org = colIdx.org ?? COL.org;
  const method = colIdx.method ?? COL.method;
  const barrier = colIdx.barrier ?? COL.barrier;

  items.sort((a, b) => {
    let d = toDateNum(a.values[dc]) - toDateNum(b.values[dc]);
    if (d) return d;
    d = toDateEntryNum(b.values[de]) - toDateEntryNum(a.values[de]);
    if (d) return d;
    d = String(a.values[org] || '').localeCompare(String(b.values[org] || ''), 'ru');
    if (d) return d;
    d = String(a.values[method] || '').localeCompare(String(b.values[method] || ''), 'ru');
    if (d) return d;
    return String(a.values[barrier] || '').localeCompare(String(b.values[barrier] || ''), 'ru');
  });
  items.forEach((item, i) => { item.values[COL.num] = i + 1; });
}

async function ghGet(fileName) {
  const r = await fetch(ghApiUrl(fileName), { headers: GH_HEADERS });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GitHub GET: HTTP ${r.status}`);
  return r.json();
}

async function ghPut(fileName, base64Content, sha, message) {
  const r = await fetch(ghApiUrl(fileName), {
    method: 'PUT',
    headers: { ...GH_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, content: base64Content, sha }),
  });
  if (!r.ok) throw new Error(`GitHub PUT: HTTP ${r.status} — ${await r.text()}`);
  return r.json();
}

async function main() {
  if (!GITHUB_TOKEN) {
    console.error('GITHUB_TOKEN не найден');
    process.exit(1);
  }

  console.log(`Файл: ${TARGET_FILE}`);
  if (DRY_RUN) console.log('Режим: DRY-RUN');

  const meta = await ghGet(TARGET_FILE);
  if (!meta || !meta.content) throw new Error('Файл не найден на GitHub');

  const buf = Buffer.from(meta.content.replace(/\n/g, ''), 'base64');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.worksheets[0];

  const headerRow = [];
  for (let c = 1; c <= COL_COUNT; c++) {
    headerRow.push(String(ws.getRow(1).getCell(c).value || '').trim());
  }
  const colIdx = buildColIdx(headerRow);

  const items = [];
  let dateFixed = 0;

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const values = [];
    for (let c = 1; c <= COL_COUNT; c++) values.push(rawCellValue(row.getCell(c).value));
    if (!String(values[COL.dateCheck] || '').trim() && values[COL.dateCheck] !== 0) continue;

    const before = String(values[COL.dateCheck] || '');
    values[COL.dateCheck] = normalizeDateStr(values[COL.dateCheck]);
    if (before !== values[COL.dateCheck]) dateFixed++;

    items.push({ snap: cloneRowSnapshot(row), values });
  }

  console.log(`Строк данных: ${items.length}`);
  console.log(`Дат нормализовано: ${dateFixed}`);

  sortItems(items, colIdx);

  console.log('После сортировки:');
  console.log('  №1  dateCheck:', items[0].values[COL.dateCheck]);
  console.log('  №' + items.length + ' dateCheck:', items[items.length - 1].values[COL.dateCheck]);

  items.forEach((item, i) => {
    applySnapshot(ws.getRow(2 + i), item.snap, item.values);
  });

  // Clear leftover rows if sheet had more rows before (unlikely same count)
  for (let r = 2 + items.length; r <= ws.rowCount; r++) {
    ws.getRow(r).values = [];
  }

  const outLocal = path.join(__dirname, '_migrate-dates-ready.xlsx');
  await wb.xlsx.writeFile(outLocal);
  console.log(`Локальная копия: ${outLocal}`);

  if (DRY_RUN) {
    console.log('DRY-RUN завершён.');
    return;
  }

  const backupDir = path.join(__dirname, 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, `${TARGET_FILE.replace('.xlsx', '')}-before-dates-${Date.now()}.xlsx`);
  fs.writeFileSync(backupPath, buf);
  console.log(`Бэкап: ${backupPath}`);

  const outBuf = await wb.xlsx.writeBuffer();
  const b64 = Buffer.from(outBuf).toString('base64');
  const message = `Миграция: даты DD.MM.YYYY + сортировка + нумерация (${items.length} проверок)`;

  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await ghGet(TARGET_FILE);
    try {
      const result = await ghPut(TARGET_FILE, b64, current.sha, message);
      console.log('✓ Загружено на GitHub, commit:', result.commit && result.commit.sha);
      return;
    } catch (err) {
      if (attempt < 2 && /409/.test(err.message)) continue;
      throw err;
    }
  }
}

main().catch(e => { console.error('Ошибка:', e.message); process.exit(1); });
