/**
 * Export checklist desc patch JSON for client-side localStorage update.
 * Reads from analysis DB + xlsx apply rows.
 */
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');

const ROOT = path.join(__dirname, '..');
const DB = path.join(ROOT, 'data', 'proverki-analysis.db');
const XLSX_PATH = path.join(ROOT, 'data', 'checklist-import-60-violations.xlsx');
const OUT = path.join(ROOT, 'data', 'checklist-desc-patch.json');

process.env.DATABASE_PATH = DB;
const { getDb } = require('../lib/db');
const { DatabaseSync } = require('node:sqlite');

function normalizeCheckId(id) {
  let s = String(id == null ? '' : id).trim();
  if (/^\d+$/.test(s) && s.length <= 6) return s.padStart(6, '0');
  return s;
}

const wb = XLSX.readFile(XLSX_PATH);
const sheetName = wb.SheetNames.includes('Import') ? 'Import' : wb.SheetNames[0];
const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' })
  .filter(function(r) {
    return String(r.import_action || '').trim().toLowerCase() === 'apply' && String(r.check_id || '').trim();
  });

const checkIds = [];
const seen = {};
rows.forEach(function(r) {
  const id = normalizeCheckId(r.check_id);
  if (!seen[id]) { seen[id] = true; checkIds.push(id); }
});

const rawDb = new DatabaseSync(DB, { readOnly: true });
const items = {};

checkIds.forEach(function(checkId) {
  const row = rawDb.prepare('SELECT check_id, barrier, violation_desc FROM records WHERE check_id = ?').get(checkId);
  if (!row) return;
  const cl = rawDb.prepare('SELECT payload FROM checklists WHERE record_key = ?').get(checkId);
  const item = {
    desc: row.violation_desc || '',
    barrier: row.barrier || '',
  };
  if (cl && cl.payload) {
    try {
      const payload = JSON.parse(cl.payload);
      item.checklistFilled = true;
      item.checklistViolations = payload.checklistViolations || {};
      item.checklistQuestionTexts = payload.checklistQuestionTexts || {};
      item.checklistPassportId = payload.checklistPassportId || null;
    } catch (_e) { /* ignore */ }
  }
  items[checkId] = item;
});
rawDb.close();

const patch = { version: 1, updatedAt: Date.now(), items: items };
fs.writeFileSync(OUT, JSON.stringify(patch, null, 2) + '\n', 'utf8');
console.log('Wrote', OUT, '—', Object.keys(items).length, 'records');
