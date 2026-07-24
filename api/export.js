const { getDb } = require('../lib/db');
const { exportYearToXlsxBuffer, listRecordsByYear } = require('../lib/records-store');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  const year = String(req.query.year || new Date().getFullYear()).replace(/\D/g, '');
  const fileName = `Проверки КБ ${year}.xlsx`;

  try {
    getDb();
    const records = listRecordsByYear(year);
    if (!records.length) {
      return res.status(404).json({ error: 'Нет проверок за ' + year + ' год' });
    }

    const buf = exportYearToXlsxBuffer(year);
    const safeFileName = encodeURIComponent(fileName);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${safeFileName}`);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(buf);
  } catch (err) {
    console.error('[export] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
