const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const { getDb, withTransaction } = require('./db');
const {
  COLUMNS,
  toDateNum,
  toDateEntryNum,
  calcBarrierInPK,
  normalizeDateStr,
} = require('../api/excel-utils');

function pad(n) { return String(n).padStart(2, '0'); }

function nowDateEntry() {
  const now = new Date();
  return `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()}, ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

function yearFromRecord(record) {
  if (record.year) return parseInt(String(record.year), 10);
  if (record.dateCheck) return parseInt(String(record.dateCheck).split('.')[2], 10);
  return new Date().getFullYear();
}

function cmpRecords(a, b) {
  let d = toDateNum(a.dateCheck) - toDateNum(b.dateCheck);
  if (d) return d;
  d = toDateEntryNum(a.dateEntry) - toDateEntryNum(b.dateEntry);
  if (d) return d;
  d = String(a.org || '').localeCompare(String(b.org || ''), 'ru');
  if (d) return d;
  d = String(a.method || '').localeCompare(String(b.method || ''), 'ru');
  if (d) return d;
  return String(a.barrier || '').localeCompare(String(b.barrier || ''), 'ru');
}

function rowToRecord(row) {
  if (!row) return null;
  return {
    num: row.num,
    checkId: row.check_id || '',
    dateCheck: row.date_check || '',
    dateEntry: row.date_entry || '',
    method: row.method || '',
    org: row.org || '',
    obj: row.obj || '',
    curator: row.curator || '',
    barrier: row.barrier || '',
    barrierInPK: row.barrier_in_pk || '',
    works: row.works || '',
    violator: row.violator || '',
    desc: row.violation_desc || '',
    corrective: row.corrective || '',
    contestMeasures: row.contest_measures || '',
    year: String(row.year),
    updatedAt: row.updated_at != null ? Number(row.updated_at) : 0,
    photoCount: row.photo_count != null ? Number(row.photo_count) : undefined,
  };
}

function recordFingerprint(r) {
  return [
    r.dateCheck, r.method, r.org, r.obj, r.barrier, r.desc,
  ].map(v => String(v || '').trim()).join('|');
}

const RECORDS_WITH_PHOTO_COUNT_SQL = `
  SELECT r.*, (SELECT COUNT(*) FROM photos p WHERE p.check_id = r.check_id) AS photo_count
  FROM records r
`;

function selectAllRecords(db) {
  return db.prepare(RECORDS_WITH_PHOTO_COUNT_SQL).all().map(rowToRecord);
}

function renumberYear(db, year) {
  const rows = db.prepare('SELECT * FROM records WHERE year = ?').all(year).map(rowToRecord);
  rows.sort(cmpRecords);
  const stmt = db.prepare('UPDATE records SET num = ?, updated_at = unixepoch() WHERE check_id = ?');
  withTransaction(function() {
    rows.forEach(function(r, i) {
      stmt.run(i + 1, r.checkId);
    });
  });
  return rows.length;
}

function getYearRevision(year) {
  const db = getDb();
  const row = db.prepare(
    'SELECT COUNT(*) AS c, COALESCE(MAX(updated_at), 0) AS m FROM records WHERE year = ?'
  ).get(parseInt(String(year), 10));
  return `${row.c}-${row.m}`;
}

function listYearsWithRecords() {
  const db = getDb();
  return db.prepare('SELECT DISTINCT year FROM records ORDER BY year DESC')
    .all()
    .map(r => String(r.year));
}

function listAllRecords() {
  const records = selectAllRecords(getDb());
  records.sort(cmpRecords);
  records.forEach(function(r, i) { r.num = i + 1; });
  return records;
}

function listRecordsByYear(year) {
  const y = parseInt(String(year), 10);
  const records = getDb().prepare(RECORDS_WITH_PHOTO_COUNT_SQL + ' WHERE r.year = ?').all(y).map(rowToRecord);
  records.sort(cmpRecords);
  records.forEach(function(r, i) { r.num = i + 1; });
  return records;
}

function findRecord(dateEntry, fallback) {
  const db = getDb();
  let row = db.prepare('SELECT * FROM records WHERE date_entry = ?').get(String(dateEntry || '').trim());
  if (row) return rowToRecord(row);
  if (fallback && fallback.dateCheck) {
    const all = selectAllRecords(db);
    const fp = [
      fallback.dateCheck,
      fallback.method || '',
      fallback.org || '',
      fallback.barrier || '',
    ].map(v => String(v || '').trim()).join('|');
    for (let i = 0; i < all.length; i++) {
      const r = all[i];
      const match = [
        r.dateCheck, r.method || '', r.org || '', r.barrier || '',
      ].map(v => String(v || '').trim()).join('|');
      if (match === fp) return r;
    }
  }
  return null;
}

function nextCheckIdForYear(year) {
  const suffix = String(year).slice(-2).padStart(2, '0');
  const rows = getDb().prepare(
    `SELECT check_id FROM records WHERE year = ?
     UNION
     SELECT p.check_id FROM photos p
     WHERE p.check_id GLOB '[0-9]*' AND substr(p.check_id, -2) = ?`
  ).all(parseInt(String(year), 10), suffix);
  let maxSeq = 0;
  rows.forEach(function(row) {
    const m = String(row.check_id || '').match(/^(\d{4})(\d{2})$/);
    if (m && m[2] === suffix) {
      const seq = parseInt(m[1], 10);
      if (seq > maxSeq) maxSeq = seq;
    }
  });
  return String(maxSeq + 1).padStart(4, '0') + suffix;
}

function insertRecord(record, barriersConfig) {
  const db = getDb();
  const year = yearFromRecord(record);
  if (!record.dateEntry) record.dateEntry = nowDateEntry();
  if (record.dateCheck) record.dateCheck = normalizeDateStr(record.dateCheck);
  const dateEntryKey = String(record.dateEntry).trim();

  // Дедуп по точному ключу date_entry: клиент всегда отправляет его
  // (timestamp с точностью до секунды) и повторяет при ретраях, поэтому
  // повторная отправка той же проверки распознаётся надёжно. Отпечаток
  // (dateCheck|method|org|obj|barrier|desc) здесь НЕ используется: несколько
  // легитимных проверок одного барьера в один день на одном объекте без
  // описания нарушения имеют одинаковый отпечаток и раньше молча отбрасывались
  // как «дубликаты» — клиент получал success, убирал запись из очереди, и она
  // исчезала при следующем фоновом опросе (~90 c). Отпечаток остаётся только
  // как fallback для записей без dateEntry (очень старые клиенты).
  let dup = db.prepare('SELECT * FROM records WHERE date_entry = ?').get(dateEntryKey);
  if (!dup) {
    const fp = recordFingerprint(record);
    dup = selectAllRecords(db).find(r => recordFingerprint(r) === fp && !String(r.dateEntry || '').trim());
  }
  if (dup) {
    return {
      duplicate: true,
      num: dup.num,
      year: String(dup.year || year),
      checkId: dup.checkId,
    };
  }

  if (!record.checkId) {
    record.checkId = nextCheckIdForYear(year);
  }

  if (!record.barrierInPK && record.barrier) {
    record.barrierInPK = calcBarrierInPK(barriersConfig, year, record.barrier);
  }

  db.prepare(`
    INSERT INTO records (
      check_id, num, year, date_check, date_entry, method, org, obj, curator,
      barrier, barrier_in_pk, works, violator, violation_desc, corrective, contest_measures, updated_at
    ) VALUES (?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())
  `).run(
    record.checkId,
    year,
    record.dateCheck || '',
    record.dateEntry,
    record.method || '',
    record.org || '',
    record.obj || '',
    record.curator || '',
    record.barrier || '',
    record.barrierInPK || '',
    record.works || '',
    record.violator || '',
    record.desc || '',
    record.corrective || '',
    record.contestMeasures || ''
  );

  renumberYear(db, year);
  const saved = db.prepare('SELECT num, updated_at FROM records WHERE check_id = ?').get(record.checkId);
  record.num = saved ? saved.num : 0;
  record.year = String(year);
  record.updatedAt = saved && saved.updated_at != null ? Number(saved.updated_at) : 0;
  return { duplicate: false, num: record.num, year: String(year), checkId: record.checkId, updatedAt: record.updatedAt };
}

const UPDATABLE = {
  method: 'method',
  org: 'org',
  obj: 'obj',
  curator: 'curator',
  barrier: 'barrier',
  barrierInPK: 'barrier_in_pk',
  works: 'works',
  violator: 'violator',
  desc: 'violation_desc',
  corrective: 'corrective',
  contestMeasures: 'contest_measures',
  dateCheck: 'date_check',
};

function updateRecord(dateEntry, fields, fallback, options) {
  const db = getDb();
  const rec = findRecord(dateEntry, fallback);
  if (!rec) throw new Error('Record not found: ' + dateEntry);

  const clientUpdatedAt = options && options.updatedAt != null ? Number(options.updatedAt) : null;
  if (clientUpdatedAt != null && clientUpdatedAt > 0 && rec.updatedAt > 0 && clientUpdatedAt < rec.updatedAt) {
    const err = new Error('conflict');
    err.code = 'CONFLICT';
    err.record = rec;
    throw err;
  }

  const sets = [];
  const values = [];
  Object.keys(fields || {}).forEach(function(k) {
    if (k === 'checkId' || k === 'updatedAt') return;
    const col = UPDATABLE[k];
    if (!col) return;
    sets.push(`${col} = ?`);
    values.push(fields[k]);
  });
  if (!sets.length) return rec;

  sets.push('updated_at = unixepoch()');
  values.push(rec.checkId);
  db.prepare(`UPDATE records SET ${sets.join(', ')} WHERE check_id = ?`).run(...values);

  const year = yearFromRecord(rec);
  renumberYear(db, year);
  return findRecord(dateEntry, fallback) || findRecord(rec.dateEntry, rec);
}

function deleteRecordByKey(record) {
  const db = getDb();
  const rec = findRecord(record.dateEntry, record) ||
    (record.checkId
      ? rowToRecord(db.prepare('SELECT * FROM records WHERE check_id = ?').get(record.checkId))
      : null);
  if (!rec) throw new Error('Record not found');

  const year = yearFromRecord(rec);
  const deletedKey = rec.checkId || rec.dateEntry;
  const photos = db.prepare('SELECT filename FROM photos WHERE check_id = ?').all(rec.checkId);
  db.prepare('DELETE FROM records WHERE check_id = ?').run(rec.checkId);
  db.prepare('DELETE FROM photos WHERE check_id = ?').run(rec.checkId);
  db.prepare('DELETE FROM checklists WHERE record_key = ?').run(deletedKey);
  const photosDir = path.join(path.dirname(require('./db').getDbPath()), 'photos');
  photos.forEach(function(photo) {
    const base = path.basename(photo.filename, path.extname(photo.filename));
    ['.avif', '.webp', '.jpeg', '.jpg'].forEach(function(ext) {
      try { fs.rmSync(path.join(photosDir, base + ext), { force: true }); } catch (_e) {}
    });
  });
  renumberYear(db, year);
  return { success: true, year: String(year), deletedKey, file: null, checklists: { removed: 1 }, deletedPhotos: photos.map(function(p) { return p.filename; }) };
}

function syncBarrierInPk(barriersConfig) {
  if (!barriersConfig) return { updated: 0 };
  const db = getDb();
  const rows = db.prepare('SELECT check_id, year, barrier, barrier_in_pk FROM records').all();
  const stmt = db.prepare('UPDATE records SET barrier_in_pk = ?, updated_at = unixepoch() WHERE check_id = ?');
  let updated = 0;
  withTransaction(function() {
    rows.forEach(function(row) {
      const val = calcBarrierInPK(barriersConfig, row.year, row.barrier);
      if (val !== row.barrier_in_pk) {
        stmt.run(val, row.check_id);
        updated++;
      }
    });
  });
  return { updated };
}

function exportYearToXlsxBuffer(year) {
  const records = listRecordsByYear(year);
  const header = COLUMNS.map(c => c.h);
  const rows = [header];
  records.forEach(function(r) {
    rows.push(COLUMNS.map(c => r[c.k] ?? ''));
  });
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = COLUMNS.map((_, i) => ({
    wch: [4, 12, 12, 18, 14, 24, 18, 20, 10, 20, 18, 40, 30, 30][i] || 15,
  }));
  XLSX.utils.book_append_sheet(wb, ws, 'Проверки');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', cellDates: true });
}

function deleteRecordsAfterCutoff(cutoffStr, dryRun) {
  const m = String(cutoffStr || '').trim().match(/(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})/);
  if (!m) throw new Error('Invalid cutoff format');
  const cutoffTs = new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +m[6]).getTime();

  const db = getDb();
  const all = db.prepare('SELECT check_id, date_entry FROM records').all();
  const toDelete = [];
  all.forEach(function(row) {
    const dm = String(row.date_entry || '').match(/(\d{1,2})\.(\d{1,2})\.(\d{4}),?\s*(\d{1,2}):(\d{2}):(\d{2})/);
    if (!dm) return;
    const ts = new Date(+dm[3], +dm[2] - 1, +dm[1], +dm[4], +dm[5], +dm[6]).getTime();
    if (ts > cutoffTs) toDelete.push(row.check_id);
  });

  if (dryRun) return { deleted: toDelete.length, keys: toDelete };

  const delRec = db.prepare('DELETE FROM records WHERE check_id = ?');
  const delCl = db.prepare('DELETE FROM checklists WHERE record_key = ?');
  withTransaction(function() {
    toDelete.forEach(function(id) {
      const row = db.prepare('SELECT check_id, date_entry FROM records WHERE check_id = ?').get(id);
      if (!row) return;
      delCl.run(row.check_id);
      if (row.date_entry) delCl.run(row.date_entry);
      delRec.run(id);
    });
  });
  listYearsWithRecords().forEach(y => renumberYear(db, parseInt(y, 10)));
  return { deleted: toDelete.length, keys: toDelete };
}

function importRecordRow(record) {
  const db = getDb();
  const year = yearFromRecord(record);
  if (!record.checkId) return false;
  db.prepare(`
    INSERT OR REPLACE INTO records (
      check_id, num, year, date_check, date_entry, method, org, obj, curator,
      barrier, barrier_in_pk, works, violator, violation_desc, corrective, contest_measures, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())
  `).run(
    record.checkId,
    record.num || 0,
    year,
    record.dateCheck || '',
    record.dateEntry || record.checkId,
    record.method || '',
    record.org || '',
    record.obj || '',
    record.curator || '',
    record.barrier || '',
    record.barrierInPK || '',
    record.works || '',
    record.violator || '',
    record.desc || '',
    record.corrective || '',
    record.contestMeasures || ''
  );
  return true;
}

function clearAllRecords() {
  const db = getDb();
  db.exec('DELETE FROM records');
}

function countAllRecords() {
  const row = getDb().prepare('SELECT COUNT(*) AS c FROM records').get();
  return row ? row.c : 0;
}

module.exports = {
  rowToRecord,
  listAllRecords,
  listRecordsByYear,
  listYearsWithRecords,
  getYearRevision,
  insertRecord,
  updateRecord,
  deleteRecordByKey,
  findRecord,
  syncBarrierInPk,
  exportYearToXlsxBuffer,
  deleteRecordsAfterCutoff,
  importRecordRow,
  clearAllRecords,
  countAllRecords,
  renumberYear,
  cmpRecords,
};
