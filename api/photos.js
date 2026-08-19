const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { getDb, getDbPath } = require('../lib/db');

function getPhotosDir() {
  return path.join(path.dirname(getDbPath()), 'photos');
}

function ensurePhotosDir() {
  const dir = getPhotosDir();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function formatDateDMY(date) {
  const d = date.getDate().toString().padStart(2, '0');
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const y = date.getFullYear();
  return d + '.' + m + '.' + y;
}

async function processImage(buffer) {
  return sharp(buffer)
    .resize({ width: 640, height: 640, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85, progressive: true })
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

  try {
    if (matchUpload && req.method === 'POST') {
      const { checkId, imageData, violationIndex } = req.body || {};
      if (!checkId || !imageData) {
        return res.status(400).json({ error: 'Missing checkId or imageData' });
      }

      const db = getDb();
      const countRow = db.prepare("SELECT COUNT(*) as cnt FROM photos WHERE check_id = ?").get(checkId);
      const nextIndex = (countRow.cnt || 0) + 1;
      const dateStr = formatDateDMY(new Date());
      const filename = checkId + '_' + nextIndex + '_' + dateStr + '.jpeg';

      const buffer = Buffer.from(imageData, 'base64');
      const processed = await processImage(buffer);

      const photosDir = ensurePhotosDir();
      const filePath = path.join(photosDir, filename);
      fs.writeFileSync(filePath, processed);

      db.prepare(
        "INSERT INTO photos (check_id, filename, violation_index, uploaded_at) VALUES (?, ?, ?, unixepoch())"
      ).run(checkId, filename, violationIndex || 0);

      return res.status(200).json({ success: true, filename, index: nextIndex });
    }

    if (matchList && req.method === 'GET') {
      const checkId = decodeURIComponent(matchList[1]);
      const db = getDb();
      const rows = db.prepare(
        "SELECT filename, violation_index, uploaded_at FROM photos WHERE check_id = ? ORDER BY id"
      ).all(checkId);
      return res.status(200).json({ photos: rows });
    }

    if (matchDelete && req.method === 'DELETE') {
      const checkId = decodeURIComponent(matchDelete[1]);
      const filename = decodeURIComponent(matchDelete[2]);

      const db = getDb();
      db.prepare("DELETE FROM photos WHERE check_id = ? AND filename = ?").run(checkId, filename);

      const photosDir = getPhotosDir();
      const filePath = path.join(photosDir, filename);
      if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch (_e) {}
      }

      return res.status(200).json({ success: true });
    }

    return res.status(404).json({ error: 'Not found' });
  } catch (err) {
    console.error('[photos] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
