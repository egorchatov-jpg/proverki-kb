const { getDb } = require('../lib/db');
const {
  listAllRecords,
  listRecordsByYear,
  listYearsWithRecords,
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

    if (req.query.year) {
      const year = String(req.query.year);
      const shaKey = 'sha' + year;
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

    const years = listYearsWithRecords();
    const shas = {};
    years.forEach(function(y) {
      shas['sha' + y] = getYearRevision(y);
    });

    const clientHasAll = years.length > 0 && years.every(function(y) {
      const key = 'sha' + y;
      return !!(req.query[key] && String(req.query[key]) === shas[key]);
    });
    if (clientHasAll) {
      return res.status(200).json({ unchanged: true, shas: shas });
    }

    const allRecords = listAllRecords();
    return res.status(200).json({ records: allRecords, shas: shas });
  } catch (err) {
    console.error('[records] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
