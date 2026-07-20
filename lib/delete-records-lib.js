const {
  listExcelFiles,
  updateExcelFile,
  ghGet,
  ghPut,
} = require('../api/gh-excel');
const { buildColIdx, sortAndRenumberSheet, COL } = require('../api/excel-utils');

const CHECKLISTS_FILE = 'checklists.json';
const DEFAULT_CUTOFF = '19.07.2026 17:00:00';

function parseCutoff(str) {
  const m = String(str || '').trim().match(/(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})/);
  if (!m) throw new Error('Invalid cutoff format, use DD.MM.YYYY HH:mm:ss');
  return new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +m[6]).getTime();
}

function parseDateEntry(str) {
  const m = String(str || '').trim().match(/(\d{1,2})\.(\d{1,2})\.(\d{4}),?\s*(\d{1,2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  return new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +m[6]).getTime();
}

function recordKeyFromRow(row, colIdx) {
  const checkId = String(row[colIdx.checkId ?? COL.checkId] || '').trim();
  if (checkId) return checkId;
  return String(row[colIdx.dateEntry ?? COL.dateEntry] || '').trim();
}

function rowSnapshot(row, colIdx) {
  return {
    dateEntry: row[colIdx.dateEntry ?? COL.dateEntry],
    checkId: row[colIdx.checkId ?? COL.checkId],
    org: row[colIdx.org ?? COL.org],
    barrier: row[colIdx.barrier ?? COL.barrier],
  };
}

function filterRowsAfterCutoff(rows, cutoffTs) {
  if (!rows.length) return { kept: rows, deleted: [], deletedKeys: [] };
  const header = rows[0].map(h => String(h || '').trim());
  const colIdx = buildColIdx(header);
  const deCol = colIdx.dateEntry ?? COL.dateEntry;
  const kept = [rows[0]];
  const deleted = [];
  const deletedKeys = [];
  rows.slice(1).forEach(function(row) {
    const ts = parseDateEntry(row[deCol]);
    if (ts != null && ts > cutoffTs) {
      deleted.push(rowSnapshot(row, colIdx));
      deletedKeys.push(recordKeyFromRow(row, colIdx));
    } else {
      kept.push(row);
    }
  });
  return { kept, deleted, deletedKeys };
}

async function purgeChecklists(deletedKeys, dryRun, message) {
  const keys = (deletedKeys || []).filter(Boolean);
  if (!keys.length) return { removed: 0 };
  const meta = await ghGet(CHECKLISTS_FILE);
  let data = { items: {} };
  let sha;
  if (meta && meta.content) {
    sha = meta.sha;
    const raw = Buffer.from(String(meta.content).replace(/\n/g, ''), 'base64').toString('utf8');
    try {
      data = JSON.parse(raw);
      if (!data.items || typeof data.items !== 'object') data.items = {};
    } catch (_e) {
      data = { items: {} };
    }
  }
  let removed = 0;
  keys.forEach(function(key) {
    if (data.items[key]) {
      delete data.items[key];
      removed++;
    }
  });
  if (!removed) return { removed: 0 };
  if (dryRun) return { removed, dryRun: true };
  const content = Buffer.from(JSON.stringify(data, null, 2), 'utf8').toString('base64');
  await ghPut(CHECKLISTS_FILE, content, sha, message);
  return { removed };
}

async function deleteRecordsAfter(cutoffStr, opts) {
  opts = opts || {};
  const dryRun = !!opts.dryRun;
  const cutoff = cutoffStr || DEFAULT_CUTOFF;
  const cutoffTs = parseCutoff(cutoff);
  let files = await listExcelFiles();
  if (!files.length) files = [`Проверки КБ ${new Date().getFullYear()}.xlsx`];

  const fileResults = [];
  const allDeleted = [];
  const allDeletedKeys = [];

  for (const fileName of files) {
    if (dryRun) {
      const meta = await ghGet(fileName);
      if (!meta || !meta.content) {
        fileResults.push({ file: fileName, status: 'not_found', deleted: [] });
        continue;
      }
      const buf = Buffer.from(String(meta.content).replace(/\n/g, ''), 'base64');
      const XLSX = require('xlsx');
      const wb = XLSX.read(buf, { type: 'buffer', cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
      const filtered = filterRowsAfterCutoff(rows, cutoffTs);
      filtered.deleted.forEach(function(item) { allDeleted.push(item); });
      filtered.deletedKeys.forEach(function(key) { allDeletedKeys.push(key); });
      fileResults.push({
        file: fileName,
        status: 'dry_run',
        deletedCount: filtered.deleted.length,
        deleted: filtered.deleted,
      });
      continue;
    }

    const deleted = [];
    const deletedKeys = [];
    const result = await updateExcelFile(
      fileName,
      function(rows) {
        const filtered = filterRowsAfterCutoff(rows, cutoffTs);
        deleted.push.apply(deleted, filtered.deleted);
        deletedKeys.push.apply(deletedKeys, filtered.deletedKeys);
        return sortAndRenumberSheet(filtered.kept);
      },
      'Удаление проверок после ' + cutoff
    );
    deleted.forEach(function(item) { allDeleted.push(item); });
    deletedKeys.forEach(function(key) { allDeletedKeys.push(key); });
    fileResults.push({
      file: fileName,
      status: result.status,
      deletedCount: deleted.length,
      deleted: deleted,
    });
  }

  const checklistResult = await purgeChecklists(
    allDeletedKeys,
    dryRun,
    'Remove checklists for deleted records after ' + cutoff
  );

  return {
    cutoff,
    dryRun,
    deletedCount: allDeleted.length,
    deleted: allDeleted,
    files: fileResults,
    checklists: checklistResult,
  };
}

module.exports = {
  DEFAULT_CUTOFF,
  deleteRecordsAfter,
  parseCutoff,
  parseDateEntry,
};
