/**
 * Merge local dev DB → production GitHub DB.
 * - Local (proverki-dev.db) is source of truth for all records
 * - Master-only records on 25.07.2026 are preserved from current prod GitHub copy
 * - Duplicate check_id: local wins, except prod 25.07.2026 entries are kept
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.join(__dirname, '..');
const LOCAL_DB = path.join(ROOT, 'data', 'proverki-dev.db');
const OUT_DB = path.join(ROOT, 'data', 'proverki-merged-prod.db');

const RECORD_COLS = [
  'check_id', 'num', 'year', 'date_check', 'date_entry', 'method', 'inspector',
  'org', 'obj', 'curator', 'barrier', 'barrier_in_pk', 'works', 'violator',
  'violation_desc', 'corrective', 'contest_measures', 'updated_at',
];

function isJul25(dateCheck) {
  return String(dateCheck || '').trim().startsWith('25.07.2026');
}

async function downloadProdDb() {
  const token = execSync('gh auth token', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  const r = await fetch(
    'https://api.github.com/repos/egorchatov-jpg/proverki-kb-data/contents/database/proverki.db',
    { headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.raw' } }
  );
  if (!r.ok) throw new Error('GitHub prod DB download failed: HTTP ' + r.status);
  const p = path.join(os.tmpdir(), 'prod-merge-src.db');
  fs.writeFileSync(p, Buffer.from(await r.arrayBuffer()));
  return p;
}

function readRecords(dbPath) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  const rows = db.prepare('SELECT * FROM records').all();
  const checklists = db.prepare('SELECT record_key, payload, updated_at FROM checklists').all();
  db.close();
  return { rows, checklists };
}

function writeMerged(outPath, records, checklists) {
  if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
  fs.copyFileSync(LOCAL_DB, outPath);
  const db = new DatabaseSync(outPath);
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec('DELETE FROM records');
    db.exec('DELETE FROM checklists');
    const ins = db.prepare(
      'INSERT INTO records (' + RECORD_COLS.join(', ') + ') VALUES (' + RECORD_COLS.map(function() { return '?'; }).join(', ') + ')'
    );
    records.forEach(function(row) {
      ins.run(...RECORD_COLS.map(function(c) { return row[c]; }));
    });
    const insCl = db.prepare('INSERT INTO checklists (record_key, payload, updated_at) VALUES (?, ?, ?)');
    checklists.forEach(function(row) {
      insCl.run(row.record_key, row.payload, row.updated_at || Math.floor(Date.now() / 1000));
    });
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  db.close();
}

function renumber(dbPath) {
  process.env.DATABASE_PATH = dbPath;
  delete require.cache[require.resolve('../lib/db')];
  delete require.cache[require.resolve('../lib/records-store')];
  const { getDb } = require('../lib/db');
  const { listYearsWithRecords, renumberYear } = require('../lib/records-store');
  const db = getDb();
  listYearsWithRecords().forEach(function(y) { renumberYear(db, parseInt(y, 10)); });
}

async function main() {
  if (!fs.existsSync(LOCAL_DB)) throw new Error('Missing local DB: ' + LOCAL_DB);
  const prodPath = await downloadProdDb();
  const local = readRecords(LOCAL_DB);
  const prod = readRecords(prodPath);

  const byId = {};
  local.rows.forEach(function(r) { byId[r.check_id] = r; });

  var keptJul25 = 0;
  prod.rows.forEach(function(r) {
    if (!isJul25(r.date_check)) return;
    byId[r.check_id] = r;
    keptJul25++;
  });

  const checklistByKey = {};
  local.checklists.forEach(function(c) { checklistByKey[c.record_key] = c; });
  prod.checklists.forEach(function(c) {
    const rec = byId[c.record_key];
    if (rec && isJul25(rec.date_check)) checklistByKey[c.record_key] = c;
  });

  const mergedRecords = Object.values(byId);
  const mergedChecklists = Object.values(checklistByKey);

  writeMerged(OUT_DB, mergedRecords, mergedChecklists);
  renumber(OUT_DB);

  const verify = new DatabaseSync(OUT_DB, { readOnly: true });
  const total = verify.prepare('SELECT COUNT(*) AS c FROM records').get().c;
  const feb17 = verify.prepare("SELECT COUNT(*) AS c FROM records WHERE date_check LIKE '17.02.2026%'").get().c;
  const feb20 = verify.prepare("SELECT COUNT(*) AS c FROM records WHERE date_check LIKE '20.02.2026%'").get().c;
  const jul25 = verify.prepare("SELECT COUNT(*) AS c FROM records WHERE date_check LIKE '25.07.2026%'").get().c;
  verify.close();

  console.log(JSON.stringify({
    out: OUT_DB,
    total: total,
    feb17: feb17,
    feb20: feb20,
    jul25: jul25,
    keptJul25FromProd: keptJul25,
  }, null, 2));

  fs.copyFileSync(OUT_DB, path.join(ROOT, 'data', 'proverki-analysis.db'));
}

main().catch(function(e) {
  console.error(e.message || e);
  process.exit(1);
});
