/**
 * SQLite via Node.js built-in node:sqlite (Node 22.5+). No native addons.
 */
const fs = require('fs');
const path = require('path');

let DatabaseSync = null;
let _sqliteLoadError = null;
try {
  DatabaseSync = require('node:sqlite').DatabaseSync;
} catch (e) {
  _sqliteLoadError = e;
}

function sqliteUnavailableMessage() {
  if (_sqliteLoadError) {
    return 'node:sqlite unavailable (need Node.js >= 22.5, current ' + process.version + '): ' + _sqliteLoadError.message;
  }
  return 'node:sqlite unavailable';
}

const ROOT = path.join(__dirname, '..');
const DEFAULT_DB_PATH = path.join(ROOT, 'data', 'proverki.db');
const TIMEWEB_FALLBACK_DB_PATH = '/tmp/proverki-kb/proverki.db';

let _db = null;
let _dbPath = null;
let _dbPathEphemeral = false;

function tryPrepareDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
  fs.accessSync(dirPath, fs.constants.W_OK);
}

function dbPathCandidates() {
  const custom = process.env.DATABASE_PATH || process.env.SQLITE_PATH;
  if (custom) {
    return [path.isAbsolute(custom) ? custom : path.join(ROOT, custom)];
  }
  const candidates = [DEFAULT_DB_PATH];
  if (process.platform !== 'win32') candidates.push(TIMEWEB_FALLBACK_DB_PATH);
  return candidates;
}

function pickWritableDbPath() {
  let lastErr = null;
  for (const dbPath of dbPathCandidates()) {
    try {
      tryPrepareDir(path.dirname(dbPath));
      _dbPathEphemeral = dbPath.startsWith('/tmp/');
      if (_dbPathEphemeral && !process.env.DATABASE_PATH && !process.env.SQLITE_PATH) {
        console.warn('[data] Using /tmp for SQLite (ephemeral on redeploy; enable GITHUB_TOKEN for GitHub sync)');
      }
      return dbPath;
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error('Cannot create SQLite database directory: ' + (lastErr && lastErr.message));
}

function resolveDbPath() {
  return pickWritableDbPath();
}

function getDbPath() {
  if (!_dbPath) _dbPath = pickWritableDbPath();
  return _dbPath;
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS records (
  check_id          TEXT PRIMARY KEY,
  num               INTEGER NOT NULL DEFAULT 0,
  year              INTEGER NOT NULL,
  date_check        TEXT NOT NULL,
  date_entry        TEXT NOT NULL UNIQUE,
  method            TEXT NOT NULL DEFAULT '',
  inspector         TEXT NOT NULL DEFAULT '',
  org               TEXT NOT NULL DEFAULT '',
  obj               TEXT NOT NULL DEFAULT '',
  curator           TEXT NOT NULL DEFAULT '',
  barrier           TEXT NOT NULL DEFAULT '',
  barrier_in_pk     TEXT NOT NULL DEFAULT '',
  works             TEXT NOT NULL DEFAULT '',
  violator          TEXT NOT NULL DEFAULT '',
  violation_desc    TEXT NOT NULL DEFAULT '',
  corrective        TEXT NOT NULL DEFAULT '',
  contest_measures  TEXT NOT NULL DEFAULT '',
  updated_at        INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_records_year ON records(year);
CREATE INDEX IF NOT EXISTS idx_records_date_check ON records(date_check);
CREATE TABLE IF NOT EXISTS checklists (
  record_key   TEXT PRIMARY KEY,
  payload      TEXT NOT NULL,
  updated_at   INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE IF NOT EXISTS app_settings (
  id           INTEGER PRIMARY KEY CHECK (id = 1),
  json         TEXT NOT NULL,
  updated_at   INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint     TEXT PRIMARY KEY,
  json         TEXT NOT NULL,
  updated_at   INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE IF NOT EXISTS schema_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

function initSchema(db) {
  db.exec(SCHEMA_SQL);
  db.prepare("INSERT OR IGNORE INTO schema_meta (key, value) VALUES ('db_version', '1')").run();
}

function getDb(options) {
  if (!DatabaseSync) throw new Error(sqliteUnavailableMessage());

  if (options && options.reopen && _db) {
    try { _db.close(); } catch (_e) {}
    _db = null;
  }
  if (_db) return _db;

  const dbPath = getDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  _db = new DatabaseSync(dbPath);
  _db.exec('PRAGMA journal_mode = WAL');
  _db.exec('PRAGMA foreign_keys = ON');
  _db.exec('PRAGMA busy_timeout = 5000');
  initSchema(_db);
  return _db;
}

function closeDb() {
  if (_db) {
    try { _db.close(); } catch (_e) {}
    _db = null;
  }
}

function wipeLocalDbFiles() {
  closeDb();
  _dbPath = null;
  const dbPath = pickWritableDbPath();
  ['', '-wal', '-shm'].forEach(function(suffix) {
    const p = dbPath + suffix;
    if (!fs.existsSync(p)) return;
    try { fs.unlinkSync(p); } catch (_e) { /* ignore */ }
  });
  return dbPath;
}

function replaceDbFile(newFilePath) {
  closeDb();
  const dest = getDbPath();
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(newFilePath, dest);
  getDb({ reopen: true });
}

function withTransaction(fn) {
  const db = getDb();
  db.exec('BEGIN IMMEDIATE');
  try {
    fn(db);
    db.exec('COMMIT');
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch (_e) {}
    throw e;
  }
}

function getDbStatus() {
  if (!DatabaseSync) {
    return { ok: false, error: sqliteUnavailableMessage() };
  }
  try {
    getDb();
    return {
      ok: true,
      path: getDbPath(),
      ephemeral: _dbPathEphemeral,
    };
  } catch (e) {
    return { ok: false, error: e.message, path: getDbPath() };
  }
}

module.exports = {
  getDb,
  closeDb,
  getDbPath,
  getDbStatus,
  replaceDbFile,
  resolveDbPath,
  wipeLocalDbFiles,
  withTransaction,
  DEFAULT_DB_PATH,
};
