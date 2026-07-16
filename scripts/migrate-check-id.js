/**
 * Add "ID проверки" column (position 2) to all Excel DB files on GitHub.
 * Assigns IDs by dateEntry ascending: NNNNYY (NNNN = entry seq in year, YY = year).
 *
 * Usage: GITHUB_TOKEN=... node scripts/migrate-check-id.js
 */
const XLSX = require('xlsx');
const {
  COLUMNS, COL, buildColIdx, toDateEntryNum, sortAndRenumberSheet, ensureCheckIdColumn,
} = require('../api/excel-utils');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'egorchatov-jpg';
const GITHUB_REPO = process.env.GITHUB_DATA_REPO || 'proverki-kb-data';

if (!GITHUB_TOKEN) {
  console.error('GITHUB_TOKEN required');
  process.exit(1);
}

const GH_HEADERS = {
  Authorization: `token ${GITHUB_TOKEN}`,
  Accept: 'application/vnd.github.v3+json',
  'User-Agent': 'proverki-kb-migrate-check-id',
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

function yearFromFileName(name) {
  const m = name.match(/(\d{4})/);
  return m ? m[1] : String(new Date().getFullYear());
}

function assignMissingIds(rows, year) {
  const header = rows[0].map(h => String(h || '').trim());
  const colIdx = buildColIdx(header);
  const idCol = colIdx.checkId ?? COL.checkId;
  const deCol = colIdx.dateEntry ?? COL.dateEntry;
  const yearSuffix = String(year).slice(-2).padStart(2, '0');

  const data = rows.slice(1).filter(row => String(row[colIdx.dateCheck ?? COL.dateCheck] || '').trim());
  let maxSeq = 0;

  data.forEach(row => {
    const id = String(row[idCol] || '').trim();
    const m = id.match(/^(\d{4})(\d{2})$/);
    if (m && m[2] === yearSuffix) maxSeq = Math.max(maxSeq, parseInt(m[1], 10));
  });

  const missing = data
    .map((row, i) => ({ row, i: i + 1 }))
    .filter(({ row }) => !String(row[idCol] || '').trim());

  missing.sort((a, b) => toDateEntryNum(a.row[deCol]) - toDateEntryNum(b.row[deCol]));

  missing.forEach(({ row }) => {
    maxSeq += 1;
    while (row.length <= idCol) row.push('');
    row[idCol] = String(maxSeq).padStart(4, '0') + yearSuffix;
  });

  return rows;
}

async function migrateFile(fileName) {
  const meta = await ghGet(fileName);
  if (!meta || !meta.content) {
    console.log('  skip (not found)');
    return;
  }

  const year = yearFromFileName(fileName);
  const buf = Buffer.from(meta.content.replace(/\n/g, ''), 'base64');
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  let rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });

  if (!rows.length) {
    rows = [COLUMNS.map(c => c.h)];
  }

  const beforeHeader = rows[0].map(h => String(h || '').trim()).join('|');
  rows = ensureCheckIdColumn(rows);
  rows = assignMissingIds(rows, year);
  rows = sortAndRenumberSheet(rows);

  const afterHeader = rows[0].map(h => String(h || '').trim()).join('|');
  const colIdx = buildColIdx(rows[0].map(h => String(h || '').trim()));
  const idCol = colIdx.checkId ?? COL.checkId;
  const ids = rows.slice(1).map(r => String(r[idCol] || '').trim()).filter(Boolean);

  const newWs = XLSX.utils.aoa_to_sheet(rows);
  newWs['!cols'] = ws['!cols'];
  wb.Sheets[wb.SheetNames[0]] = newWs;
  const b64 = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }).toString('base64');

  await ghPut(fileName, b64, meta.sha, `Migrate: add ID проверки column (${fileName})`);
  console.log(`  OK: ${ids.length} IDs, header changed: ${beforeHeader !== afterHeader}`);
  if (ids.length) console.log(`    first=${ids[0]} last=${ids[ids.length - 1]}`);
}

(async () => {
  const files = await listExcelFiles();
  console.log('Files:', files.length);
  for (const f of files) {
    console.log(f);
    await migrateFile(f);
  }
  console.log('Done.');
})().catch(e => {
  console.error(e);
  process.exit(1);
});
