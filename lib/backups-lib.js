/**
 * SQLite file backups on local disk (replaces GitHub Excel snapshots).
 */
const fs = require('fs');
const path = require('path');
const { getDbPath, replaceDbFile, closeDb, getDb } = require('./db');

const ROOT = path.join(__dirname, '..');
const MSK_TZ = 'Europe/Moscow';
const MAX_BACKUPS = 10;

function backupsRoot() {
  const custom = process.env.BACKUPS_DIR;
  if (custom) return path.isAbsolute(custom) ? custom : path.join(ROOT, custom);
  return path.join(path.dirname(getDbPath()), 'backups');
}

function manifestPath() {
  return path.join(backupsRoot(), 'manifest.json');
}

function mskParts(date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: MSK_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = type => (parts.find(p => p.type === type) || {}).value || '00';
  return {
    day: get('day'),
    month: get('month'),
    year: get('year'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

function formatLabel(date) {
  const p = mskParts(date);
  return `${p.day}.${p.month}.${p.year} - ${p.hour}:${p.minute}:${p.second}`;
}

function makeBackupId(date) {
  const p = mskParts(date);
  return `${p.year}-${p.month}-${p.day}T${p.hour}-${p.minute}-${p.second}`;
}

function readManifest() {
  const p = manifestPath();
  if (!fs.existsSync(p)) {
    return { activeBackupId: null, backups: [] };
  }
  try {
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    return {
      activeBackupId: data.activeBackupId || null,
      backups: Array.isArray(data.backups) ? data.backups : [],
    };
  } catch (_e) {
    return { activeBackupId: null, backups: [] };
  }
}

function writeManifest(manifest) {
  const dir = backupsRoot();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(manifestPath(), JSON.stringify({
    activeBackupId: manifest.activeBackupId,
    backups: manifest.backups,
    updatedAt: Date.now(),
  }, null, 2) + '\n', 'utf8');
}

async function createBackupFromLive(atDate) {
  const when = atDate || new Date();
  const id = makeBackupId(when);
  const label = formatLabel(when);
  const manifest = readManifest();
  if (manifest.backups.some(b => b.id === id)) {
    return { id, label, skipped: true, reason: 'already_exists' };
  }

  const src = getDbPath();
  if (!fs.existsSync(src)) throw new Error('Database file not found: ' + src);

  const snapDir = path.join(backupsRoot(), 'snapshots', id);
  fs.mkdirSync(snapDir, { recursive: true });
  const destFile = path.join(snapDir, 'proverki.db');
  fs.copyFileSync(src, destFile);

  const entry = { id, label, createdAt: when.getTime(), files: ['proverki.db'] };
  manifest.backups.unshift(entry);
  while (manifest.backups.length > MAX_BACKUPS) {
    const removed = manifest.backups.pop();
    if (removed && removed.id) {
      const oldDir = path.join(backupsRoot(), 'snapshots', removed.id);
      fs.rmSync(oldDir, { recursive: true, force: true });
    }
  }
  manifest.activeBackupId = id;
  writeManifest(manifest);
  return { id, label, files: 1 };
}

async function restoreBackup(backupId) {
  const manifest = readManifest();
  const entry = manifest.backups.find(b => b.id === backupId);
  if (!entry) throw new Error('Backup not found');

  const snapFile = path.join(backupsRoot(), 'snapshots', backupId, 'proverki.db');
  if (!fs.existsSync(snapFile)) throw new Error('Backup file missing');

  closeDb();
  fs.copyFileSync(snapFile, getDbPath());
  getDb({ reopen: true });

  manifest.activeBackupId = backupId;
  writeManifest(manifest);
  return { backupId, label: entry.label };
}

async function getBackupsState() {
  return readManifest();
}

module.exports = {
  createBackupFromLive,
  restoreBackup,
  getBackupsState,
  formatLabel,
  makeBackupId,
};
