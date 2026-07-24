const { loadAllChecklists } = require('../lib/checklists-lib');
const { getDb } = require('../lib/db');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    getDb();
    const data = loadAllChecklists();
    return res.status(200).json({ items: data.items || {} });
  } catch (err) {
    console.error('[checklists] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
