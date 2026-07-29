const { getDb, withTransaction } = require('./db');

function recordChecklistKey(record) {
  if (!record) return '';
  return String(record.checkId || record.dateEntry || '').trim();
}

function readExistingChecklist(db, key) {
  const row = db.prepare('SELECT payload FROM checklists WHERE record_key = ?').get(key);
  if (!row || !row.payload) return null;
  try {
    return JSON.parse(row.payload);
  } catch (_e) {
    return null;
  }
}

function extractChecklistPayload(record) {
  if (!record || !record.checklistFilled) return null;
  const key = recordChecklistKey(record);
  if (!key) return null;
  return {
    key,
    checklistViolations: record.checklistViolations || {},
    checklistQuestionTexts: record.checklistQuestionTexts || {},
    checklistPassportId: record.checklistPassportId || null,
    checklistFilled: true,
    // Base revision the client last knew (for optimistic concurrency).
    clientBaseAt: Number(record.checklistUpdatedAt) || 0,
  };
}

function loadAllChecklists() {
  const db = getDb();
  const rows = db.prepare('SELECT record_key, payload FROM checklists').all();
  const items = {};
  rows.forEach(function(row) {
    try {
      items[row.record_key] = JSON.parse(row.payload);
    } catch (_e) {}
  });
  return { items };
}

/**
 * Check checklist optimistic concurrency without writing.
 * Client must send checklistUpdatedAt = last known server revision (or 0 for first fill).
 */
function assertChecklistWritable(record) {
  const payload = extractChecklistPayload(record);
  if (!payload) return null;
  const existing = readExistingChecklist(getDb(), payload.key);
  const existingAt = existing && existing.updatedAt != null ? Number(existing.updatedAt) || 0 : 0;
  const clientBase = payload.clientBaseAt || 0;
  if (existingAt > 0 && clientBase > 0 && clientBase < existingAt) {
    return { rejected: true, reason: 'stale_checklist', checklist: existing };
  }
  return null;
}

/**
 * Save filled checklist for a record.
 * Optimistic concurrency: if client sends checklistUpdatedAt older than server, reject.
 * Returns { rejected, reason, checklist } or the saved checklist payload.
 */
function saveChecklistForRecord(record) {
  const payload = extractChecklistPayload(record);
  if (!payload) return null;
  const conflict = assertChecklistWritable(record);
  if (conflict) {
    console.warn('[checklists] rejected stale overwrite for', payload.key);
    return conflict;
  }

  const newAt = Date.now();
  const data = {
    checklistViolations: payload.checklistViolations,
    checklistQuestionTexts: payload.checklistQuestionTexts,
    checklistPassportId: payload.checklistPassportId,
    checklistFilled: true,
    updatedAt: newAt,
  };
  getDb().prepare(`
    INSERT INTO checklists (record_key, payload, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(record_key) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at
  `).run(payload.key, JSON.stringify(data), newAt);
  return data;
}

function purgeChecklistKey(key) {
  if (!key) return { removed: 0 };
  const db = getDb();
  const info = db.prepare('DELETE FROM checklists WHERE record_key = ?').run(String(key));
  return { removed: info.changes ? 1 : 0 };
}

function importChecklistItems(items) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO checklists (record_key, payload, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(record_key) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at
  `);
  withTransaction(function() {
    Object.keys(items || {}).forEach(function(key) {
      const item = items[key];
      if (!item) return;
      stmt.run(key, JSON.stringify(item), item.updatedAt || Date.now());
    });
  });
}

function clearAllChecklists() {
  getDb().exec('DELETE FROM checklists');
}

module.exports = {
  recordChecklistKey,
  extractChecklistPayload,
  loadAllChecklists,
  assertChecklistWritable,
  saveChecklistForRecord,
  purgeChecklistKey,
  importChecklistItems,
  clearAllChecklists,
};
