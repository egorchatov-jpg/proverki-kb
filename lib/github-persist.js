/**
 * Persist SQLite database and backups to GitHub data repo (Timeweb has no persistent disk).
 */
const fs = require('fs');
const path = require('path');
const { closeDb, resolveDbPath, getDbPath } = require('./db');
const {
  githubToken,
  ghGetMeta,
  ghGetRaw,
  ghPutFile,
  ghListDir,
  GITHUB_OWNER,
  GITHUB_REPO,
} = require('./github-api');
const { isLocalDev } = require('./runtime-env');

const DB_REMOTE_PATH = 'database/proverki.db';
const MANIFEST_REMOTE = 'backups/manifest.json';
const SNAPSHOTS_REMOTE = 'backups/snapshots';

const PUSH_DEBOUNCE_MS = 20000;

let _pushTimer = null;
let _pushChain = Promise.resolve();

function isEnabled() {
  if (isLocalDev()) return false;
  if (process.env.ENABLE_GITHUB_PERSIST === '0') return false;
  return !!githubToken();
}

function checkpointLiveDb() {
  try {
    const { getDb } = require('./db');
    const db = getDb();
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  } catch (_e) { /* ignore */ }
}

function scheduleDbPersist() {
  if (!isEnabled()) return;
  if (_pushTimer) clearTimeout(_pushTimer);
  _pushTimer = setTimeout(function() {
    _pushTimer = null;
    pushDbToGithub().catch(function(e) {
      console.warn('[persist] scheduled db push failed:', e.message);
    });
  }, PUSH_DEBOUNCE_MS);
}

function enqueuePush(fn) {
  _pushChain = _pushChain.then(fn).catch(function(e) {
    console.warn('[persist] push queue error:', e.message);
  });
  return _pushChain;
}

async function pushDbToGithub() {
  if (!isEnabled()) return { skipped: true, reason: 'disabled' };
  return enqueuePush(async function() {
    checkpointLiveDb();
    const localPath = getDbPath();
    if (!fs.existsSync(localPath)) throw new Error('Local database missing: ' + localPath);
    const buf = fs.readFileSync(localPath);
    await ghPutFile(DB_REMOTE_PATH, buf, 'Sync SQLite database from Timeweb');
    console.log('[persist] pushed database to GitHub:', DB_REMOTE_PATH, '(' + buf.length + ' bytes)');
    return { pushed: true, bytes: buf.length };
  });
}

async function pullDbFromGithub() {
  if (!isEnabled()) return { pulled: false, reason: 'disabled' };
  const meta = await ghGetMeta(DB_REMOTE_PATH);
  if (!meta || !meta.sha) return { pulled: false, reason: 'missing_on_github' };

  const localPath = resolveDbPath();
  if (fs.existsSync(localPath)) {
    const localStat = fs.statSync(localPath);
    const remoteTime = new Date(meta.updated_at || 0).getTime();
    if (localStat.size > 0 && localStat.mtimeMs >= remoteTime - 2000) {
      return { pulled: false, reason: 'local_newer_or_same' };
    }
  }

  const buf = await ghGetRaw(DB_REMOTE_PATH);
  if (!buf || !Buffer.isBuffer(buf) || !buf.length) {
    return { pulled: false, reason: 'empty_remote' };
  }

  closeDb();
  fs.mkdirSync(path.dirname(localPath), { recursive: true });
  fs.writeFileSync(localPath, buf);
  console.log('[persist] pulled database from GitHub:', DB_REMOTE_PATH, '(' + buf.length + ' bytes)');
  return { pulled: true, bytes: buf.length };
}

function readLocalManifestSafe() {
  const { readManifest } = require('./backups-lib');
  return readManifest();
}

function mergeManifests(local, remote) {
  const byId = {};
  (remote.backups || []).forEach(function(b) { if (b && b.id) byId[b.id] = b; });
  (local.backups || []).forEach(function(b) {
    if (!b || !b.id) return;
    const prev = byId[b.id];
    if (!prev || (b.createdAt || 0) >= (prev.createdAt || 0)) byId[b.id] = b;
  });
  const backups = Object.values(byId).sort(function(a, b) {
    return (b.createdAt || 0) - (a.createdAt || 0);
  });
  let activeBackupId = local.activeBackupId || remote.activeBackupId || null;
  if (activeBackupId && !byId[activeBackupId]) {
    activeBackupId = backups.length ? backups[0].id : null;
  }
  return { activeBackupId: activeBackupId, backups: backups };
}

async function pullBackupsFromGithub() {
  if (!isEnabled()) return { pulled: 0, reason: 'disabled' };

  const { snapshotDbPath, writeManifest, backupsRoot } = require('./backups-lib');
  const local = readLocalManifestSafe();
  let remote = { activeBackupId: null, backups: [] };

  const raw = await ghGetRaw(MANIFEST_REMOTE);
  if (raw) {
    try {
      remote = JSON.parse(raw);
    } catch (_e) {
      console.warn('[persist] invalid remote backups manifest');
    }
  }

  const merged = mergeManifests(local, remote);
  let pulledSnapshots = 0;

  for (const entry of merged.backups) {
    if (!entry || !entry.id) continue;
    const localSnap = snapshotDbPath(entry.id);
    if (fs.existsSync(localSnap)) continue;
    const remotePath = `${SNAPSHOTS_REMOTE}/${entry.id}/proverki.db`;
    const buf = await ghGetRaw(remotePath);
    if (!buf || !Buffer.isBuffer(buf) || !buf.length) continue;
    fs.mkdirSync(path.dirname(localSnap), { recursive: true });
    fs.writeFileSync(localSnap, buf);
    pulledSnapshots++;
  }

  fs.mkdirSync(backupsRoot(), { recursive: true });
  writeManifest(merged);
  if (pulledSnapshots) {
    console.log('[persist] pulled', pulledSnapshots, 'backup snapshot(s) from GitHub');
  }
  return { pulled: pulledSnapshots, total: merged.backups.length };
}

async function pushBackupToGithub(backupId, manifest) {
  if (!isEnabled()) return { skipped: true, reason: 'disabled' };
  return enqueuePush(async function() {
    const { snapshotDbPath } = require('./backups-lib');
    const snapFile = snapshotDbPath(backupId);
    if (!fs.existsSync(snapFile)) throw new Error('Backup snapshot missing: ' + backupId);

    const snapBuf = fs.readFileSync(snapFile);
    await ghPutFile(
      `${SNAPSHOTS_REMOTE}/${backupId}/proverki.db`,
      snapBuf,
      `Backup snapshot ${backupId}`
    );

    const manifestData = manifest || readLocalManifestSafe();
    await ghPutFile(
      MANIFEST_REMOTE,
      JSON.stringify({
        activeBackupId: manifestData.activeBackupId,
        backups: manifestData.backups,
        format: 'sqlite',
        updatedAt: Date.now(),
      }, null, 2) + '\n',
      `Update backups manifest (${backupId})`
    );
    console.log('[persist] pushed backup to GitHub:', backupId);
    return { pushed: true, backupId: backupId };
  });
}

async function bootstrapGithubPersist() {
  if (isLocalDev()) {
    console.log('[persist] local dev — GitHub sync disabled (settings stay in data/proverki-dev.db)');
    return { enabled: false, localDev: true };
  }
  if (!isEnabled()) {
    console.log('[persist] GitHub sync off (set GITHUB_TOKEN + ENABLE_GITHUB_PERSIST=1 on Timeweb)');
    return { enabled: false };
  }

  console.log('[persist] GitHub data repo:', GITHUB_OWNER + '/' + GITHUB_REPO);
  const dbPull = await pullDbFromGithub();
  const backupsPull = await pullBackupsFromGithub();
  return { enabled: true, dbPull: dbPull, backupsPull: backupsPull };
}

module.exports = {
  isEnabled,
  scheduleDbPersist,
  pushDbToGithub,
  pullDbFromGithub,
  pullBackupsFromGithub,
  pushBackupToGithub,
  bootstrapGithubPersist,
};
