/**
 * Persist SQLite database and backups to GitHub data repo.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { closeDb, resolveDbPath, getDbPath, getDb, wipeLocalDbFiles } = require('./db');
const {
  githubToken,
  ghGetMeta,
  ghGetRaw,
  ghPutFile,
  GITHUB_OWNER,
  GITHUB_REPO,
} = require('./github-api');
const { isLocalDev } = require('./runtime-env');

const DB_REMOTE_PATH = 'database/proverki.db';
const MANIFEST_REMOTE = 'backups/manifest.json';
const SNAPSHOTS_REMOTE = 'backups/snapshots';

const PUSH_DEBOUNCE_MS = 1500;

let _pushTimer = null;
let _pushChain = Promise.resolve();
let _shutdownHooksInstalled = false;

function isEnabled() {
  if (isLocalDev()) return false;
  if (process.env.ENABLE_GITHUB_PERSIST === '0') return false;
  return !!githubToken();
}

function checkpointLiveDb() {
  const db = getDb();
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
}

/**
 * Export a consistent SQLite snapshot for GitHub upload.
 * Prefers VACUUM INTO; falls back to checkpoint + file copy.
 */
function exportDbBufferForPush() {
  const localPath = getDbPath();
  if (!fs.existsSync(localPath)) throw new Error('Local database missing: ' + localPath);

  checkpointLiveDb();

  const tmp = path.join(os.tmpdir(), 'pkb-export-' + process.pid + '-' + Date.now() + '.db');
  try {
    const db = getDb();
    try { fs.unlinkSync(tmp); } catch (_e) { /* ignore */ }
    // VACUUM INTO creates a consistent standalone copy
    db.exec("VACUUM INTO '" + tmp.replace(/'/g, "''") + "'");
    const buf = fs.readFileSync(tmp);
    try { fs.unlinkSync(tmp); } catch (_e) { /* ignore */ }
    return buf;
  } catch (e) {
    console.warn('[persist] VACUUM INTO failed, using checkpointed main file:', e.message);
    try { fs.unlinkSync(tmp); } catch (_e) { /* ignore */ }
    checkpointLiveDb();
    ['-wal', '-shm'].forEach(function(suffix) {
      const sidecar = localPath + suffix;
      if (fs.existsSync(sidecar) && fs.statSync(sidecar).size > 0) {
        throw new Error('WAL sidecar still present after checkpoint — refusing unsafe push');
      }
    });
    return fs.readFileSync(localPath);
  }
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
    if (_pushTimer) {
      clearTimeout(_pushTimer);
      _pushTimer = null;
    }
    const localPath = getDbPath();
    if (!fs.existsSync(localPath)) throw new Error('Local database missing: ' + localPath);

    const localCount = countLocalRecords(localPath);
    if (localCount <= 0) {
      console.warn('[persist] refusing to push database with no records');
      return { skipped: true, reason: 'empty_local' };
    }
    if (localCount < 50) {
      console.warn('[persist] refusing to push database with too few records:', localCount);
      return { skipped: true, reason: 'too_few_records' };
    }

    const remoteMeta = await ghGetMeta(DB_REMOTE_PATH);
    const remoteSize = remoteMeta && remoteMeta.size ? remoteMeta.size : 0;
    if (remoteSize > 500000 && localCount < 100) {
      console.warn('[persist] refusing to overwrite large remote database with small local copy');
      return { skipped: true, reason: 'would_wipe_remote' };
    }

    const buf = exportDbBufferForPush();
    if (remoteSize > 500000 && buf.length < 200000) {
      console.warn('[persist] refusing to push small database file over large remote copy');
      return { skipped: true, reason: 'local_file_too_small' };
    }
    await ghPutFile(DB_REMOTE_PATH, buf, 'Sync SQLite database from Timeweb');
    console.log('[persist] pushed database to GitHub:', DB_REMOTE_PATH, '(' + buf.length + ' bytes,', localCount, 'records)');
    return { pushed: true, bytes: buf.length, records: localCount };
  });
}

async function flushDbPersist() {
  if (!isEnabled()) return { skipped: true, reason: 'disabled' };
  if (_pushTimer) {
    clearTimeout(_pushTimer);
    _pushTimer = null;
  }
  return pushDbToGithub();
}

function installShutdownFlushHooks() {
  if (_shutdownHooksInstalled || isLocalDev()) return;
  _shutdownHooksInstalled = true;
  var flushing = false;
  function onSignal(sig) {
    if (flushing) return;
    flushing = true;
    console.log('[persist] ' + sig + ' — flushing database to GitHub');
    flushDbPersist()
      .catch(function(e) { console.warn('[persist] shutdown flush failed:', e.message); })
      .finally(function() {
        try { closeDb(); } catch (_e) { /* ignore */ }
        process.exit(0);
      });
    setTimeout(function() { process.exit(1); }, 20000);
  }
  process.on('SIGTERM', function() { onSignal('SIGTERM'); });
  process.on('SIGINT', function() { onSignal('SIGINT'); });
}

function removeDbSidecars(dbPath) {
  ['-wal', '-shm'].forEach(function(suffix) {
    const sidecar = dbPath + suffix;
    if (!fs.existsSync(sidecar)) return;
    try {
      fs.unlinkSync(sidecar);
    } catch (e) {
      console.warn('[persist] could not remove', sidecar + ':', e.message);
    }
  });
}

function countLocalRecords(dbPath) {
  if (!fs.existsSync(dbPath) || !fs.statSync(dbPath).size) return 0;
  try {
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(dbPath, { readOnly: true });
    const row = db.prepare('SELECT COUNT(*) AS c FROM records').get();
    db.close();
    return row && row.c != null ? Number(row.c) : 0;
  } catch (_e) {
    return -1;
  }
}

async function pullDbFromGithub(options) {
  if (!isEnabled()) return { pulled: false, reason: 'disabled' };
  const force = !!(options && options.force);
  const meta = await ghGetMeta(DB_REMOTE_PATH);
  if (!meta || !meta.sha) return { pulled: false, reason: 'missing_on_github', repo: GITHUB_OWNER + '/' + GITHUB_REPO };

  const localPath = resolveDbPath();
  const remoteSize = meta.size || 0;

  if (!force && fs.existsSync(localPath)) {
    const localStat = fs.statSync(localPath);
    const localCount = countLocalRecords(localPath);
    const remoteTime = meta.updated_at ? new Date(meta.updated_at).getTime() : 0;
    const localEmpty = localCount === 0;
    const localCorrupt = localCount < 0;
    const remotePopulated = remoteSize > 200000;
    const localPopulated = localCount >= 50;

    if (!localPopulated || localEmpty || localCorrupt) {
      if (remotePopulated) {
        console.log('[persist] local database empty/small — pulling populated remote copy');
      }
    } else if (!localEmpty && !localCorrupt && remoteTime > 0 && localStat.size > 0 && localStat.mtimeMs >= remoteTime - 2000) {
      return { pulled: false, reason: 'local_newer_or_same' };
    } else if (!localEmpty && !localCorrupt && localStat.size > 0 && remoteSize > 0 && localStat.size >= remoteSize * 0.85) {
      return { pulled: false, reason: 'local_has_data' };
    }
  }

  const buf = await ghGetRaw(DB_REMOTE_PATH);
  if (!buf || !Buffer.isBuffer(buf) || !buf.length) {
    return { pulled: false, reason: 'empty_remote' };
  }

  closeDb();
  fs.mkdirSync(path.dirname(localPath), { recursive: true });
  fs.writeFileSync(localPath, buf);
  removeDbSidecars(localPath);
  getDb({ reopen: true });
  const count = countLocalRecords(localPath);
  console.log('[persist] pulled database from GitHub:', count, 'records,', buf.length, 'bytes');
  return { pulled: true, records: count, bytes: buf.length };
}

async function forcePullDbFromGithub() {
  const dbPath = wipeLocalDbFiles();
  console.log('[persist] force wipe + pull into:', dbPath);
  return pullDbFromGithub({ force: true });
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
    const remotePath = SNAPSHOTS_REMOTE + '/' + entry.id + '/proverki.db';
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
      SNAPSHOTS_REMOTE + '/' + backupId + '/proverki.db',
      snapBuf,
      'Backup snapshot ' + backupId
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
      'Update backups manifest (' + backupId + ')'
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
  const dbPath = wipeLocalDbFiles();
  console.log('[persist] fresh pull into:', dbPath);
  const dbPull = await pullDbFromGithub({ force: true });
  let backupsPull = { pulled: 0, reason: 'skipped' };
  try {
    backupsPull = await pullBackupsFromGithub();
  } catch (e) {
    console.warn('[persist] backup pull failed (non-fatal):', e.message);
    backupsPull = { pulled: 0, error: e.message };
  }
  return { enabled: true, dbPull: dbPull, backupsPull: backupsPull };
}

module.exports = {
  isEnabled,
  scheduleDbPersist,
  flushDbPersist,
  installShutdownFlushHooks,
  pushDbToGithub,
  pullDbFromGithub,
  forcePullDbFromGithub,
  pullBackupsFromGithub,
  pushBackupToGithub,
  bootstrapGithubPersist,
};
