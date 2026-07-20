/**
 * Timeweb Cloud / standalone Node server for Проверки КБ.
 * Wraps existing api/*.js handlers and serves static PWA assets.
 */
const express = require('express');
const path = require('path');
const cron = require('node-cron');
const { createBackupFromLive } = require('./lib/backups-lib');

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

function setNoCache(res) {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
}

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '4mb' }));

app.get('/health', function(_req, res) {
  res.status(200).json({ ok: true, build: process.env.APP_BUILD || 'local' });
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

if (process.env.ENABLE_BACKUP_CRON !== '0') {
  cron.schedule('0 0 * * *', function() {
    createBackupFromLive(new Date())
      .then(function(r) { console.log('[cron] backup:', r.label || r.id, r.skipped ? '(skip)' : ''); })
      .catch(function(e) { console.error('[cron] backup failed:', e.message); });
  }, { timezone: 'Europe/Moscow' });
  console.log('[cron] daily backup scheduled at 00:00 MSK');
}

app.listen(PORT, HOST, function() {
  console.log('proverki-kb listening on http://' + HOST + ':' + PORT);
});
