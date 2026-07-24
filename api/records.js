const { getDb } = require('../lib/db');
const {
  listAllRecords,
  listRecordsByYear,
  getYearRevision,
} = require('../lib/records-store');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    getDb();
    const cur = new Date().getFullYear();
    const years = req.query.year
      ? [String(req.query.year)]
      : Array.from({ length: cur - 2025 }, (_, i) => String(2026 + i));

    if (years.length === 1) {
      const year = years[0];
      const shaKey = `sha${year}`;
      const clientSha = (req.query[shaKey] || '').trim();
      const serverSha = getYearRevision(year);

      if (clientSha && clientSha === serverSha) {
        return res.status(200).json({ unchanged: true, shas: { [shaKey]: clientSha } });
      }

      const recs = listRecordsByYear(year);
      return res.status(200).json({
        records: recs,
        shas: { [shaKey]: serverSha },
      });
    }

    const allRecords = listAllRecords();
    return res.status(200).json({ records: allRecords });
  } catch (err) {
    console.error('[records] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
