/**
 * Timeweb Cloud / standalone Node server for Проверки КБ.
 * Wraps existing api/*.js handlers and serves static PWA assets.
 */
require('./lib/load-env');

const express = require('express');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const { createBackupFromLive } = require('./lib/backups-lib');
const { getDb, getDbPath, getDbStatus } = require('./lib/db');
const { migrateFromGithubIfEmpty } = require('./lib/migrate-from-github');
const { purgeGithubLegacyExcelBackups } = require('./lib/github-legacy-backups');
const {
  bootstrapGithubPersist,
  pushDbToGithub,
  isEnabled: isGithubPersistEnabled,
} = require('./lib/github-persist');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

const API_ROUTES = {
  '/api/save': './api/save',
  '/api/notify': './api/notify',
  '/api/subscribe': './api/subscribe',
  '/api/update': './api/update',
  '/api/records': './api/records',
  '/api/checklists': './api/checklists',
  '/api/export': './api/export',
  '/api/settings': './api/settings',
  '/api/backups': './api/backups',
  '/api/purge-records': './api/purge-records',
  '/api/delete-record': './api/delete-record',
};

function mountHandler(app, routePath, handler) {
  app.all(routePath, function(req, res) {
    Promise.resolve(handler(req, res)).catch(function(err) {
      console.error('[' + routePath + ']', err.message);
      if (!res.headersSent) {
        res.status(500).json({ error: err.message || 'Internal server error' });
      }
    });
  });
}

function readAppBuildTag() {
  try {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const m = html.match(/var APP_BUILD = '(pkb-v\d+)';/);
    if (m) return m[1];
  } catch (_e) { /* ignore */ }
  return process.env.APP_BUILD || 'unknown';
}

function setNoCache(res) {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
}

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '4mb' }));

app.get('/health', function(_req, res) {
  const db = getDbStatus();
  const payload = {
    ok: db.ok,
    build: readAppBuildTag(),
    node: process.version,
    database: db.ok ? path.basename(db.path) : path.basename(getDbPath()),
  };
  if (db.ephemeral) payload.ephemeral = true;
  if (isGithubPersistEnabled()) payload.githubPersist = true;
  if (!db.ok) payload.error = db.error;
  res.status(db.ok ? 200 : 503).json(payload);
});

app.get('/api/version', function(_req, res) {
  setNoCache(res);
  const db = getDbStatus();
  res.status(200).json({
    build: readAppBuildTag(),
    databaseOk: db.ok,
  });
});

Object.keys(API_ROUTES).forEach(function(routePath) {
  mountHandler(app, routePath, require(API_ROUTES[routePath]));
});

app.get('/', function(_req, res) {
  setNoCache(res);
  res.sendFile(path.join(ROOT, 'index.html'));
});

app.get('/sw.js', function(_req, res) {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  setNoCache(res);
  res.setHeader('Service-Worker-Allowed', '/');
  res.sendFile(path.join(ROOT, 'sw.js'));
});

app.get('/manifest.json', function(_req, res) {
  res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
  res.sendFile(path.join(ROOT, 'manifest.json'));
});

app.use(express.static(ROOT, {
  index: false,
  setHeaders: function(res, filePath) {
    if (/\.(png|jpg|jpeg|svg|webp)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    }
  },
}));

app.use(function(_req, res) {
  res.status(404).json({ error: 'Not found' });
});

async function bootstrapData() {
  await bootstrapGithubPersist();
  getDb();
  const migrated = await migrateFromGithubIfEmpty();
  if (migrated) {
    await pushDbToGithub().catch(function(e) {
      console.warn('[persist] push after migrate failed:', e.message);
    });
  }
  purgeGithubLegacyExcelBackups()
    .then(function(r) {
      if (r && r.deletedFiles) console.log('[backups] purged legacy GitHub Excel backups:', r.deletedFiles, 'files');
    })
    .catch(function(e) { console.warn('[backups] legacy GitHub cleanup:', e.message); });
  createBackupFromLive(new Date())
    .then(function(r) {
      if (!r.skipped) console.log('[backups] startup snapshot:', r.label || r.id);
    })
    .catch(function(e) { console.warn('[backups] startup snapshot failed:', e.message); });
}

if (process.env.ENABLE_BACKUP_CRON !== '0') {
  cron.schedule('0 0 * * *', function() {
    createBackupFromLive(new Date())
      .then(function(r) { console.log('[cron] backup:', r.label || r.id, r.skipped ? '(skip)' : ''); })
      .catch(function(e) { console.error('[cron] backup failed:', e.message); });
  }, { timezone: 'Europe/Moscow' });
  console.log('[cron] daily backup scheduled at 00:00 MSK');
}

app.listen(PORT, HOST, function() {
  console.log('proverki-kb listening on http://' + HOST + ':' + PORT + ' (Node ' + process.version + ')');
  bootstrapData()
    .then(function() {
      const db = getDbStatus();
      if (db.ok) {
        console.log('[data] SQLite:', db.path);
        if (db.ephemeral && isGithubPersistEnabled()) {
          console.log('[data] Local path is ephemeral; database persists via GitHub sync');
        } else if (db.ephemeral) {
          console.warn('[data] Ephemeral storage — database resets on Timeweb redeploy');
        }
      } else {
        console.error('[data] SQLite init failed:', db.error);
        console.error('[data] Static UI is served; API will return errors until DATABASE_PATH is writable and Node >= 22.5');
      }
    })
    .catch(function(e) {
      console.error('[bootstrap] failed:', e.message);
    });
});
