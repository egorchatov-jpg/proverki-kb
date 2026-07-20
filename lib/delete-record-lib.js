const { updateExcelFile, ghGet, ghPut } = require('../api/gh-excel');
const { buildColIdx, sortAndRenumberSheet, COL } = require('../api/excel-utils');

const CHECKLISTS_FILE = 'checklists.json';

function pad(n) { return String(n).padStart(2, '0'); }

function dateEntryToNum(s) {
  const m = String(s || '').match(/(\d{1,2})\.(\d{1,2})\.(\d{4}),?\s*(\d{1,2}):(\d{2}):(\d{2})/);
  if (!m) return 0;
  return +m[3] * 10000000000 + +m[2] * 100000000 + +m[1] * 1000000 + +m[4] * 10000 + +m[5] * 100 + +m[6];
}

function normDateEntry(s) {
  const m = String(s || '').match(/(\d{1,2})\.(\d{1,2})\.(\d{4}),?\s*(\d{1,2}):(\d{2}):(\d{2})/);
  if (!m) return String(s || '').trim();
  return `${pad(m[1])}.${pad(m[2])}.${m[3]}, ${pad(m[4])}:${pad(m[5])}:${pad(m[6])}`;
}

function excelCellToDateEntry(v) {
  if (v instanceof Date) {
    return `${pad(v.getDate())}.${pad(v.getMonth() + 1)}.${v.getFullYear()}, ${pad(v.getHours())}:${pad(v.getMinutes())}:${pad(v.getSeconds())}`;
  }
  if (typeof v === 'number' && v > 30000) {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const d = new Date(epoch.getTime() + Math.round(v * 86400000));
    return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
  }
  return normDateEntry(v);
}

function rowFingerprint(row, colIdx) {
  return [
    row[colIdx.dateCheck ?? COL.dateCheck],
    row[colIdx.method ?? COL.method],
    row[colIdx.org ?? COL.org],
    row[colIdx.barrier ?? COL.barrier],
  ].map(v => String(v || '').trim()).join('|');
}

function findRowIndex(rows, colIdx, record) {
  const dateEntry = String(record.dateEntry || '').trim();
  const checkId = String(record.checkId || '').trim();
  const idCol = colIdx.checkId ?? COL.checkId;
  const deCol = colIdx.dateEntry ?? COL.dateEntry;
  const targetNum = dateEntryToNum(dateEntry);
  const targetNorm = normDateEntry(dateEntry);

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (checkId && String(row[idCol] || '').trim() === checkId) return i;
    if (deCol === undefined) continue;
    const cellVal = row[deCol];
    const rowNorm = excelCellToDateEntry(cellVal);
    if (targetNum && dateEntryToNum(rowNorm) === targetNum) return i;
    if (rowNorm && rowNorm === targetNorm) return i;
    if (String(cellVal || '').trim() === dateEntry) return i;
  }

  if (record.dateCheck) {
    const fp = [
      String(record.dateCheck || '').trim(),
      String(record.method || '').trim(),
      String(record.org || '').trim(),
      String(record.barrier || '').trim(),
    ].join('|');
    for (let i = 1; i < rows.length; i++) {
      if (rowFingerprint(rows[i], colIdx) === fp) return i;
    }
  }

  return -1;
}

function recordKeyFromRow(row, colIdx, record) {
  const checkId = String(row[colIdx.checkId ?? COL.checkId] || '').trim();
  if (checkId) return checkId;
  const de = String(row[colIdx.dateEntry ?? COL.dateEntry] || '').trim();
  if (de) return de;
  return String(record.checkId || record.dateEntry || '').trim();
}

async function purgeChecklistKey(key) {
  if (!key) return { removed: 0 };
  const meta = await ghGet(CHECKLISTS_FILE);
  if (!meta || !meta.content) return { removed: 0 };
  let data = { items: {} };
  try {
    data = JSON.parse(Buffer.from(String(meta.content).replace(/\n/g, ''), 'base64').toString('utf8'));
    if (!data.items || typeof data.items !== 'object') data.items = {};
  } catch (_e) {
    return { removed: 0 };
  }
  if (!data.items[key]) return { removed: 0 };
  delete data.items[key];
  const content = Buffer.from(JSON.stringify(data, null, 2), 'utf8').toString('base64');
  await ghPut(CHECKLISTS_FILE, content, meta.sha, 'Remove checklist for deleted record ' + key);
  return { removed: 1 };
}

async function deleteRecord(record) {
  if (!record) throw new Error('Missing record');
  const year = record.year
    || (record.dateCheck && String(record.dateCheck).split('.')[2])
    || String(new Date().getFullYear());
  const fileName = `Проверки КБ ${year}.xlsx`;
  let deletedKey = '';

  const result = await updateExcelFile(
    fileName,
    function(rows) {
      if (!rows.length) throw new Error('Empty workbook');
      const header = rows[0].map(h => String(h || '').trim());
      const colIdx = buildColIdx(header);
      const rowIdx = findRowIndex(rows, colIdx, record);
      if (rowIdx < 0) throw new Error('Record not found');
      deletedKey = recordKeyFromRow(rows[rowIdx], colIdx, record);
      const kept = rows.filter(function(_row, idx) { return idx === 0 || idx !== rowIdx; });
      return sortAndRenumberSheet(kept);
    },
    'Удаление проверки ' + (record.checkId || record.dateEntry || '')
  );

  const checklistResult = await purgeChecklistKey(deletedKey);
  return {
    success: true,
    year,
    deletedKey,
    file: result,
    checklists: checklistResult,
  };
}

module.exports = { deleteRecord };
