const { deleteRecord } = require('../lib/delete-record-lib');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.GITHUB_TOKEN) return res.status(500).json({ error: 'GITHUB_TOKEN not configured' });

  try {
    const record = req.body && req.body.record ? req.body.record : req.body;
    if (!record || (!record.dateEntry && !record.checkId)) {
      return res.status(400).json({ error: 'Missing record dateEntry or checkId' });
    }
    const result = await deleteRecord(record);
    return res.status(200).json(result);
  } catch (err) {
    console.error('[delete-record] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
