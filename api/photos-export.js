const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const { getDb, getDbPath } = require('../lib/db');

function getPhotosDir() {
  return path.join(path.dirname(getDbPath()), 'photos');
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();
  const year = String(req.query.year || '').replace(/\D/g, '');
  if (!year) return res.status(400).json({ error: 'Не указан год' });

  try {
    const db = getDb();
    const photos = db.prepare(
      `SELECT p.filename FROM photos p
       INNER JOIN records r ON r.check_id = p.check_id
       WHERE r.year = ? ORDER BY p.id`
    ).all(Number(year));
    const photosDir = getPhotosDir();
    const files = photos.filter(function(photo) {
      return /^[^\\/]+$/.test(photo.filename) && fs.existsSync(path.join(photosDir, photo.filename));
    });
    if (!files.length) return res.status(404).json({ error: 'Нет фотографий за ' + year + ' год' });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent('Фото КБ ' + year + '.zip')}`);
    res.setHeader('Cache-Control', 'no-store');
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', function(err) { res.destroy(err); });
    archive.pipe(res);
    files.forEach(function(photo) { archive.file(path.join(photosDir, photo.filename), { name: photo.filename }); });
    return archive.finalize();
  } catch (err) {
    console.error('[photos-export] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
