/**
 * Apply checklist-import-60-violations.xlsx to SQLite (+ optional GitHub push).
 *
 * Usage:
 *   node scripts/apply-checklist-import.js
 *   node scripts/apply-checklist-import.js --push
 *   node scripts/apply-checklist-import.js --dry-run
 */
const path = require('path');
const ROOT = path.join(__dirname, '..');
const DB_ARG = process.argv.find(a => a.startsWith('--db='));
const TARGET_DB = DB_ARG
  ? (path.isAbsolute(DB_ARG.slice(5)) ? DB_ARG.slice(5) : path.join(ROOT, DB_ARG.slice(5)))
  : path.join(ROOT, 'data', 'proverki-analysis.db');
process.env.DATABASE_PATH = TARGET_DB;
process.env.PKB_ENV = 'production';
require('../lib/load-env');
process.env.DATABASE_PATH = TARGET_DB;
process.env.PKB_ENV = 'production';

const fs = require('fs');
const XLSX = require('xlsx');

const XLSX_PATH = path.join(ROOT, 'data', 'checklist-import-60-violations.xlsx');

const DRY_RUN = process.argv.includes('--dry-run');
const DO_PUSH = process.argv.includes('--push');

function normalizeCheckId(id) {
  let s = String(id == null ? '' : id).trim();
  if (/^\d+$/.test(s) && s.length <= 6) return s.padStart(6, '0');
  return s;
}

const { getDb, closeDb, getDbPath } = require('../lib/db');
const { loadSettings } = require('../lib/settings-store');
const { calcBarrierInPK } = require('../api/excel-utils');
const { saveChecklistForRecord } = require('../lib/checklists-store');

function extractCodePrefix(text) {
  const s = String(text || '').trim();
  if (!s) return { code: '', rest: '' };
  const m = s.match(/^([A-Za-zА-Яа-яЁё0-9]+(?:\.[A-Za-zА-Яа-яЁё0-9]+)*\.?)\s*(.*)$/s);
  if (!m) return { code: '', rest: s };
  let code = m[1];
  if (code.charAt(code.length - 1) !== '.') code += '.';
  return { code, rest: (m[2] || '').trim() };
}

function normBarrier(name) {
  let s = String(name || '').trim().toUpperCase();
  if (!s) return '';
  if (!/\.$/.test(s) && /\.\d/.test(s)) s += '.';
  return s;
}

function normCode(code) {
  return String(code || '').toUpperCase().replace(/\s+/g, '').replace(/\?+$/, '').replace(/\.+$/, '');
}

function barrierMatches(entry, name) {
  const key = normBarrier(name).replace(/\.$/, '');
  const code = normBarrier(entry.code).replace(/\.$/, '');
  if (code && (key === code || key.startsWith(code) || code.startsWith(key))) return true;
  const label = String(entry.label || '').trim();
  return label.startsWith(String(name || '').trim());
}

function buildPassportIndex() {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'passports', 'manifest.json'), 'utf8'));
  const index = [];
  for (const p of manifest.passports || []) {
    const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'passports', p.id + '.json'), 'utf8'));
    (data.barriers || []).forEach((b, bi) => {
      const questions = [];
      (b.criteria || []).forEach((c, ci) => {
        (c.questions || []).forEach((q, qi) => {
          const parts = extractCodePrefix(q);
          questions.push({
            ci, qi,
            key: ci + ':' + qi,
            code: parts.code,
            text: String(q || '').trim(),
          });
        });
      });
      index.push({ passportId: p.id, barrierIdx: bi, barrier: b, questions });
    });
  }
  return index;
}

function findPassportForBarrier(barrierName, passportIndex) {
  const key = normBarrier(barrierName).replace(/\.$/, '');
  for (const entry of passportIndex) {
    if (barrierMatches(entry.barrier, barrierName)) return entry;
  }
  for (const entry of passportIndex) {
    const code = normBarrier(entry.barrier.code).replace(/\.$/, '');
    if (code.startsWith(key) || key.startsWith(code)) return entry;
  }
  return null;
}

function resolveQuestionKey(passportEntry, questionCode, questionText, part) {
  if (passportEntry && questionCode && questionCode !== '?') {
    const nc = normCode(questionCode);
    for (const q of passportEntry.questions) {
      if (normCode(q.code) === nc) return { key: q.key, questionText: q.text };
    }
    for (const q of passportEntry.questions) {
      if (normCode(q.code).startsWith(nc) || nc.startsWith(normCode(q.code))) {
        return { key: q.key, questionText: q.text };
      }
    }
  }
  if (passportEntry && questionText) {
    const qt = String(questionText).trim();
    for (const q of passportEntry.questions) {
      if (q.text === qt || q.text.startsWith(qt.slice(0, 40))) return { key: q.key, questionText: q.text };
    }
  }
  return { key: 'import:' + part, questionText: questionText || questionCode || '' };
}

function buildPlainDesc(items) {
  return items.map(function(item) {
    return item.formatted;
  }).filter(Boolean).join(';\n\n');
}

/** Assign one import row to checklist maps; merge into same key if question already used. */
function assignChecklistPart(checklistViolations, checklistQuestionTexts, resolved, qText, violationText, partId) {
  let useKey = resolved.key;
  if (Object.prototype.hasOwnProperty.call(checklistViolations, useKey)) {
    const prev = String(checklistViolations[useKey] || '').trim();
    checklistViolations[useKey] = prev ? prev + '\n\n' + violationText : violationText;
    return;
  }
  checklistQuestionTexts[useKey] = qText;
  checklistViolations[useKey] = violationText;
}

function readImportRows() {
  if (!fs.existsSync(XLSX_PATH)) throw new Error('Missing file: ' + XLSX_PATH);
  const wb = XLSX.readFile(XLSX_PATH);
  const sheetName = wb.SheetNames.includes('Import') ? 'Import' : wb.SheetNames[0];
  return XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' });
}

function yearFromDateCheck(dateCheck) {
  const m = String(dateCheck || '').match(/(\d{4})$/);
  return m ? parseInt(m[1], 10) : new Date().getFullYear();
}

async function main() {
  const rows = readImportRows().filter(function(r) {
    return String(r.import_action || '').trim().toLowerCase() === 'apply' && String(r.check_id || '').trim();
  });
  if (!rows.length) throw new Error('No rows with import_action=apply');

  const passportIndex = buildPassportIndex();
  getDb();
  const db = getDb();
  const settings = loadSettings();

  const byCheck = {};
  rows.forEach(function(r) {
    const id = normalizeCheckId(r.check_id);
    r.check_id = id;
    if (!byCheck[id]) byCheck[id] = [];
    byCheck[id].push(r);
  });

  Object.keys(byCheck).forEach(function(id) {
    byCheck[id].sort(function(a, b) {
      return Number(a.violation_part || 0) - Number(b.violation_part || 0);
    });
  });

  const report = { updated: 0, missing: [], errors: [], checks: [] };

  for (const checkId of Object.keys(byCheck)) {
    const parts = byCheck[checkId];
    const first = parts[0];
    const row = db.prepare('SELECT * FROM records WHERE check_id = ?').get(checkId);
    if (!row) {
      report.missing.push(checkId);
      continue;
    }

    const barrier = String(first.barrier_suggested || first.barrier_current || row.barrier || '').trim();
    const year = row.year || yearFromDateCheck(first.date_check || row.date_check);
    const barrierInPK = calcBarrierInPK(settings.barriersConfig, year, barrier);
    const passportEntry = findPassportForBarrier(barrier, passportIndex);
    const passportId = passportEntry ? passportEntry.passportId : null;

    const checklistViolations = {};
    const checklistQuestionTexts = {};
    const formattedItems = [];

    parts.forEach(function(p) {
      const formatted = String(p.desc_formatted || '').trim()
        || (String(p.question_code || '').trim() + ' ' + String(p.violation_desc_import || '').trim()).trim();
      if (!formatted) return;

      formattedItems.push({ formatted: formatted, part: p.violation_part || formattedItems.length + 1 });

      const split = extractCodePrefix(formatted);
      const qCode = String(p.question_code || '').trim();
      const resolved = resolveQuestionKey(
        passportEntry,
        qCode === '?' ? split.code : qCode,
        String(p.question_text || '').trim(),
        p.violation_part || formattedItems.length
      );

      let qText = resolved.questionText;
      if (!qText && split.code) qText = split.code + (split.rest ? ' ' + split.rest : '');
      if (!qText) qText = formatted;

      const partId = p.violation_part || formattedItems.length;
      const violationText = split.rest || String(p.violation_desc_import || '').trim() || formatted;
      assignChecklistPart(
        checklistViolations,
        checklistQuestionTexts,
        resolved,
        qText,
        violationText,
        partId
      );
    });

    const plainDesc = buildPlainDesc(formattedItems);
    if (!plainDesc) {
      report.errors.push({ checkId, error: 'empty desc_formatted' });
      continue;
    }

    const checklistRecord = {
      checkId: row.check_id,
      dateEntry: row.date_entry,
      checklistFilled: true,
      checklistViolations: checklistViolations,
      checklistQuestionTexts: checklistQuestionTexts,
      checklistPassportId: passportId,
    };

    report.checks.push({
      checkId,
      barrier: barrier,
      barrierWas: row.barrier,
      parts: parts.length,
      passportId,
      descPreview: plainDesc.slice(0, 120),
    });

    if (DRY_RUN) continue;

    db.prepare(`
      UPDATE records SET
        barrier = ?,
        barrier_in_pk = ?,
        violation_desc = ?,
        updated_at = unixepoch()
      WHERE check_id = ?
    `).run(barrier, barrierInPK, plainDesc, checkId);

    saveChecklistForRecord(checklistRecord);
    report.updated++;
  }

  console.log(JSON.stringify({
    dryRun: DRY_RUN,
    dbPath: getDbPath(),
    rowsInFile: rows.length,
    uniqueChecks: Object.keys(byCheck).length,
    updated: report.updated,
    missing: report.missing,
    errors: report.errors,
    sample: report.checks.slice(0, 5),
  }, null, 2));

  if (!DRY_RUN && DO_PUSH) {
    closeDb();
    process.env.GITHUB_DATA_REPO = process.env.PROD_DATA_REPO || 'proverki-kb-data';
    delete require.cache[require.resolve('../lib/github-api')];
    delete require.cache[require.resolve('../lib/github-persist')];
    const { pushDbToGithub } = require('../lib/github-persist');
    const { GITHUB_REPO } = require('../lib/github-api');
    console.log('GitHub push target:', GITHUB_REPO);
    const pushResult = await pushDbToGithub();
    console.log('GitHub push:', JSON.stringify(pushResult, null, 2));
  } else {
    closeDb();
  }
}

main().catch(function(e) {
  console.error(e.message || e);
  process.exit(1);
});
