const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { getDb, getDbPath } = require('../lib/db');
const { requireSession } = require('../lib/auth-session');

function getPhotosDir() {
  return path.join(path.dirname(getDbPath()), 'photos');
}

function ensurePhotosDir() {
  const dir = getPhotosDir();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function removeStoredFallbacks(dir, filename) {
  const base = path.basename(filename, path.extname(filename));
  ['.webp', '.jpeg', '.jpg'].forEach(function(ext) {
    try { fs.rmSync(path.join(dir, base + ext), { force: true }); } catch (_e) {}
  });
}

function formatDateDMY(date) {
  const d = date.getDate().toString().padStart(2, '0');
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const y = date.getFullYear();
  return d + '.' + m + '.' + y;
}

async function processImage(buffer) {
  return sharp(buffer)
    .resize({ width: 1080, height: 1080, fit: 'inside', withoutEnlargement: true })
    .avif({ quality: 50 })
    .toBuffer();
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const matchUpload = req.url.match(/^\/upload/);
  const matchList = req.url.match(/^\/list\/([^\/]+)$/);
  const matchDelete = req.url.match(/^\/delete\/([^\/]+)\/([^\/]+)$/);
  const matchVariant = req.url.match(/^\/variant\/(webp|jpeg)\/([^\/]+?)(?:\?.*)?$/i);

  try {
    if (matchUpload && req.method === 'POST') {
      if (!requireSession(req, res)) return;
      const { checkId, imageData, violationIndex, clientPhotoId } = req.body || {};
      if (!checkId || !imageData) {
        return res.status(400).json({ error: 'Missing checkId or imageData' });
      }

      const db = getDb();
      if (clientPhotoId) {
        const existing = db.prepare('SELECT filename FROM photos WHERE client_photo_id = ?').get(clientPhotoId);
        if (existing) return res.status(200).json({ success: true, filename: existing.filename, duplicate: true });
      }
      const countRow = db.prepare("SELECT COUNT(*) as cnt FROM photos WHERE check_id = ?").get(checkId);
      const nextIndex = (countRow.cnt || 0) + 1;
      const dateStr = formatDateDMY(new Date());
       const filename = checkId + '_' + nextIndex + '_' + dateStr + '.avif';

      const buffer = Buffer.from(imageData, 'base64');
       const processed = await processImage(buffer);

       const photosDir = ensurePhotosDir();
        const filePath = path.join(photosDir, filename);
        fs.writeFileSync(filePath, processed);
        removeStoredFallbacks(photosDir, filename);
        try {
          db.prepare(
            "INSERT INTO photos (check_id, filename, violation_index, uploaded_at, client_photo_id) VALUES (?, ?, ?, unixepoch(), ?)"
          ).run(checkId, filename, violationIndex || 0, clientPhotoId || null);
        } catch (dbError) {
          try { fs.rmSync(filePath, { force: true }); } catch (_e) {}
          // If UNIQUE constraint on client_photo_id, check if duplicate exists
          if (clientPhotoId && dbError.message && dbError.message.includes('UNIQUE constraint failed: photos.client_photo_id')) {
            const existing = db.prepare('SELECT filename FROM photos WHERE client_photo_id = ?').get(clientPhotoId);
            if (existing) {
              console.log('[photos] duplicate clientPhotoId detected, returning existing:', existing.filename);
              return res.status(200).json({ success: true, filename: existing.filename, duplicate: true });
            }
          }
          throw dbError;
        }

      return res.status(200).json({ success: true, filename, index: nextIndex });
    }

    if (matchList && req.method === 'GET') {
      const checkId = decodeURIComponent(matchList[1]);
      const db = getDb();
      const rows = db.prepare(
        "SELECT filename, violation_index, uploaded_at FROM photos WHERE check_id = ? ORDER BY id"
      ).all(checkId);
      const photosDir = getPhotosDir();
      const validRows = rows.filter(function(row) {
        return /^[^\\/]+$/.test(row.filename) && fs.existsSync(path.join(photosDir, row.filename));
      });
      if (validRows.length !== rows.length) {
        const remove = db.prepare('DELETE FROM photos WHERE check_id = ? AND filename = ?');
        rows.forEach(function(row) {
          if (validRows.indexOf(row) < 0) remove.run(checkId, row.filename);
        });
      }
      return res.status(200).json({ photos: validRows });
    }

    if (matchVariant && req.method === 'GET') {
      const format = matchVariant[1].toLowerCase();
      const filename = decodeURIComponent(matchVariant[2]);
      if (!/^[^\\/]+\.avif$/i.test(filename)) return res.status(400).end();
      const sourcePath = path.join(getPhotosDir(), filename);
      if (!fs.existsSync(sourcePath)) return res.status(404).end();
      const output = await sharp(sourcePath)[format]().toBuffer();
      res.setHeader('Content-Type', format === 'webp' ? 'image/webp' : 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      return res.status(200).send(output);
    }

    if (matchDelete && req.method === 'DELETE') {
      const session = requireSession(req, res, ['superuser', 'admin']);
      if (!session) return;
      const checkId = decodeURIComponent(matchDelete[1]);
      const filename = decodeURIComponent(matchDelete[2]);

      const db = getDb();
      db.prepare("DELETE FROM photos WHERE check_id = ? AND filename = ?").run(checkId, filename);

       const photosDir = getPhotosDir();
       removeStoredFallbacks(photosDir, filename);
      const filePath = path.join(photosDir, filename);
       ['.avif', '.webp', '.jpeg'].forEach(function(ext) {
         const variantPath = path.join(photosDir, path.basename(filename, path.extname(filename)) + ext);
         if (fs.existsSync(variantPath)) {
           try { fs.unlinkSync(variantPath); } catch (_e) {}
         }
       });

      return res.status(200).json({ success: true });
    }

    return res.status(404).json({ error: 'Not found' });
  } catch (err) {
    console.error('[photos] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
