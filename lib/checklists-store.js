const { getDb, withTransaction } = require('./db');

function recordChecklistKey(record) {
  if (!record) return '';
  return String(record.checkId || record.dateEntry || '').trim();
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
    updatedAt: Date.now(),
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

function saveChecklistForRecord(record) {
  const payload = extractChecklistPayload(record);
  if (!payload) return null;
  const db = getDb();
  const data = {
    checklistViolations: payload.checklistViolations,
    checklistQuestionTexts: payload.checklistQuestionTexts,
    checklistPassportId: payload.checklistPassportId,
    checklistFilled: true,
    updatedAt: payload.updatedAt,
  };
  db.prepare(`
    INSERT INTO checklists (record_key, payload, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(record_key) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at
  `).run(payload.key, JSON.stringify(data), payload.updatedAt);
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
  saveChecklistForRecord,
  purgeChecklistKey,
  importChecklistItems,
  clearAllChecklists,
};
