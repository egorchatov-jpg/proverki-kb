const { loadAllChecklists } = require('../lib/checklists-lib');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.GITHUB_TOKEN) return res.status(500).json({ error: 'GITHUB_TOKEN not configured' });

  try {
    const data = await loadAllChecklists();
    return res.status(200).json({ items: data.items || {} });
  } catch (err) {
    console.error('[checklists] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
