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
  ghListDir,
  ghPutFile,
  ghDelete,
  GITHUB_OWNER,
  GITHUB_REPO,
} = require('./github-api');
const { isLocalDev } = require('./runtime-env');

const DB_REMOTE_PATH = 'database/proverki.db';
const MANIFEST_REMOTE = 'backups/manifest.json';
const SNAPSHOTS_REMOTE = 'backups/snapshots';
const PHOTOS_REMOTE = 'photos';

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

// Plain FIFO queue for photo push/delete — different files never conflict,
// so simple sequencing (no dedup) is enough here.
function enqueuePush(fn) {
  _pushChain = _pushChain.then(fn).catch(function(e) {
    console.warn('[persist] push queue error:', e.message);
  });
  return _pushChain;
}

/**
 * Join-or-follow mutex for the whole-DB push specifically. If a DB push is
 * already running, the caller awaits it and then triggers one more push —
 * guaranteeing its own (already-committed, since SQLite writes are
 * synchronous) change is durably included, rather than just piggy-backing
 * on a snapshot that may predate it. Callers that arrive while a "follow-up"
 * push is already scheduled share that single follow-up instead of each
 * queuing their own (they'll all be satisfied by the same fresh snapshot).
 * This replaces the old FIFO queue for DB pushes, which was the root cause
 * of write requests taking increasingly long — and losing data entirely if
 * the process was killed mid-queue — during a burst of edits.
 */
let _inFlightDbPush = null;
let _followUpDbPush = null;

function runDbPush(fn) {
  if (!_inFlightDbPush) {
    _inFlightDbPush = Promise.resolve()
      .then(fn)
      .catch(function(e) {
        console.warn('[persist] db push error:', e.message);
        throw e;
      })
      .finally(function() {
        _inFlightDbPush = null;
      });
    return _inFlightDbPush;
  }
  if (!_followUpDbPush) {
    var startedAfter = _inFlightDbPush;
    _followUpDbPush = startedAfter.catch(function() {}).then(function() {
      var p = runDbPush(fn);
      p.finally(function() {
        if (_followUpDbPush === p) _followUpDbPush = null;
      });
      return p;
    });
  }
  return _followUpDbPush;
}

async function pushDbToGithub() {
  if (!isEnabled()) return { skipped: true, reason: 'disabled' };
  return runDbPush(async function() {
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
    const minRecords = Number(process.env.PUSH_MIN_RECORDS || 50);
    if (localCount < minRecords) {
      console.warn('[persist] refusing to push database with too few records:', localCount, '(min', minRecords + ')');
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

/**
 * Wait for the durable write to actually complete before the caller
 * responds to its client. pushDbToGithub()/runDbPush() already guarantee
 * that this caller's own (already-committed) change is included — either
 * as the sole push, or via the join-then-follow-up mutex if another push
 * was already running.
 */
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

// Mutex for forcePullDbFromGithub(): without this, several concurrent
// callers (e.g. every open client tab/device independently calling
// GET /api/self-heal the moment it sees an empty record list — which is
// exactly what happens while the DB is legitimately still empty right after
// a redeploy) would each run their own wipeLocalDbFiles() + pullDbFromGithub
// pair. Since wipe deletes the file and pull re-downloads + rewrites it,
// concurrent pairs stomp on each other — one caller's wipe can delete the
// file another caller just finished downloading, so the DB never gets a
// chance to stay populated. Observed in production logs as an unbounded
// "[persist] force wipe + pull into: ..." loop that never converged, even
// after the earlier /health-triggered container-restart-loop was fixed
// (pkb-v463) — confirming this second, independent cause. Now every
// concurrent caller shares the single in-flight pull instead of starting
// their own.
let _inFlightForcePull = null;
async function forcePullDbFromGithub() {
  if (_inFlightForcePull) return _inFlightForcePull;
  _inFlightForcePull = (async function() {
    const dbPath = wipeLocalDbFiles();
    console.log('[persist] force wipe + pull into:', dbPath);
    const result = await pullDbFromGithub({ force: true });
    console.log('[persist] force pull result:', JSON.stringify(result));
    return result;
  })().finally(function() {
    _inFlightForcePull = null;
  });
  return _inFlightForcePull;
}

/**
 * Push a single live photo file to GitHub immediately after upload/delete.
 * Unlike the debounced whole-DB push, this must complete before responding
 * to the client — Timeweb's disk is ephemeral, and a redeploy between the
 * upload response and the (previously debounced) sync would silently drop
 * both the file and its DB row.
 */
async function pushPhotoToGithub(filename, localFilePath) {
  if (!isEnabled()) return { skipped: true, reason: 'disabled' };
  return enqueuePush(async function() {
    const buf = fs.readFileSync(localFilePath);
    await ghPutFile(PHOTOS_REMOTE + '/' + filename, buf, 'Add photo ' + filename);
    return { pushed: true, filename: filename, bytes: buf.length };
  });
}

async function deletePhotoFromGithub(filename) {
  if (!isEnabled()) return { skipped: true, reason: 'disabled' };
  return enqueuePush(async function() {
    const remotePath = PHOTOS_REMOTE + '/' + filename;
    const meta = await ghGetMeta(remotePath);
    if (!meta || !meta.sha) return { skipped: true, reason: 'not_found' };
    await ghDelete(remotePath, meta.sha, 'Delete photo ' + filename);
    return { deleted: true, filename: filename };
  });
}

/**
 * Pull any photo that exists on GitHub but is missing on the local
 * (ephemeral) disk. Called on server bootstrap right after the DB pull, so
 * photo rows in the freshly-pulled DB always have a matching file.
 */
async function pullMissingPhotosFromGithub(photosDir) {
  if (!isEnabled()) return { pulled: 0, reason: 'disabled' };
  const remoteFiles = await ghListDir(PHOTOS_REMOTE);
  if (!remoteFiles.length) return { pulled: 0, total: 0 };
  fs.mkdirSync(photosDir, { recursive: true });
  let pulled = 0;
  for (const entry of remoteFiles) {
    if (!entry || entry.type !== 'file' || !entry.name) continue;
    const localPath = path.join(photosDir, entry.name);
    if (fs.existsSync(localPath)) continue;
    const buf = await ghGetRaw(PHOTOS_REMOTE + '/' + entry.name);
    if (!buf || !Buffer.isBuffer(buf) || !buf.length) continue;
    fs.writeFileSync(localPath, buf);
    pulled++;
  }
  if (pulled) console.log('[persist] pulled', pulled, 'missing photo(s) from GitHub');
  return { pulled: pulled, total: remoteFiles.length };
}

/**
 * Pull a single photo from GitHub on-demand (e.g. when a client requests it
 * and it's missing locally — typically right after a redeploy, before the
 * bulk bootstrap pull has reached it). No-op if disabled or already present.
 */
async function pullSinglePhotoFromGithub(filename, photosDir) {
  if (!isEnabled()) return { pulled: false, reason: 'disabled' };
  const localPath = path.join(photosDir, filename);
  if (fs.existsSync(localPath)) return { pulled: false, reason: 'already_present' };
  const buf = await ghGetRaw(PHOTOS_REMOTE + '/' + filename);
  if (!buf || !Buffer.isBuffer(buf) || !buf.length) return { pulled: false, reason: 'not_found' };
  fs.mkdirSync(photosDir, { recursive: true });
  fs.writeFileSync(localPath, buf);
  return { pulled: true };
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

  const { snapshotDbPath, snapshotPhotosPath, writeManifest, backupsRoot } = require('./backups-lib');
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
    if (!fs.existsSync(localSnap)) {
      const remotePath = SNAPSHOTS_REMOTE + '/' + entry.id + '/proverki.db';
      const buf = await ghGetRaw(remotePath);
      if (!buf || !Buffer.isBuffer(buf) || !buf.length) continue;
      fs.mkdirSync(path.dirname(localSnap), { recursive: true });
      fs.writeFileSync(localSnap, buf);
      pulledSnapshots++;
    }
      const remotePhotos = await ghListDir(SNAPSHOTS_REMOTE + '/' + entry.id + '/photos');
      if (remotePhotos.length) {
        const localPhotos = snapshotPhotosPath(entry.id);
        fs.mkdirSync(localPhotos, { recursive: true });
        for (const photo of remotePhotos) {
          if (!photo || photo.type !== 'file' || !photo.name) continue;
          const photoBuf = await ghGetRaw(photo.path);
          if (photoBuf) fs.writeFileSync(path.join(localPhotos, photo.name), photoBuf);
        }
      }
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
    const { snapshotDbPath, snapshotPhotosPath } = require('./backups-lib');
    const snapFile = snapshotDbPath(backupId);
    if (!fs.existsSync(snapFile)) throw new Error('Backup snapshot missing: ' + backupId);

    const snapBuf = fs.readFileSync(snapFile);
    await ghPutFile(
      SNAPSHOTS_REMOTE + '/' + backupId + '/proverki.db',
      snapBuf,
      'Backup snapshot ' + backupId
    );

    const photosDir = snapshotPhotosPath(backupId);
    if (fs.existsSync(photosDir)) {
      const photoNames = fs.readdirSync(photosDir);
      for (const name of photoNames) {
        const photoPath = path.join(photosDir, name);
        if (!fs.statSync(photoPath).isFile() || !/\.avif$/i.test(name)) continue;
        await ghPutFile(
          SNAPSHOTS_REMOTE + '/' + backupId + '/photos/' + name,
          fs.readFileSync(photoPath),
          'Backup photo ' + name
        );
      }
    }

    const manifestData = manifest || readLocalManifestSafe();
    await ghPutFile(
      MANIFEST_REMOTE,
      JSON.stringify({
        activeBackupId: manifestData.activeBackupId,
        backups: manifestData.backups,
         format: 'sqlite+photos',
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
  let photosPull = { pulled: 0, reason: 'skipped' };
  try {
    photosPull = await pullMissingPhotosFromGithub(path.join(path.dirname(dbPath), 'photos'));
  } catch (e) {
    console.warn('[persist] photos pull failed (non-fatal):', e.message);
    photosPull = { pulled: 0, error: e.message };
  }
  let backupsPull = { pulled: 0, reason: 'skipped' };
  try {
    backupsPull = await pullBackupsFromGithub();
  } catch (e) {
    console.warn('[persist] backup pull failed (non-fatal):', e.message);
    backupsPull = { pulled: 0, error: e.message };
  }
  return { enabled: true, dbPull: dbPull, photosPull: photosPull, backupsPull: backupsPull };
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
  pushPhotoToGithub,
  deletePhotoFromGithub,
  pullMissingPhotosFromGithub,
  pullSinglePhotoFromGithub,
  bootstrapGithubPersist,
};
