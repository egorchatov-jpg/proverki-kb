const { getDb } = require('../lib/db');
const { loadSettings, saveSettings } = require('../lib/settings-store');
const { scheduleDbPersist } = require('../lib/github-persist');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    getDb();

    if (req.method === 'GET') {
      return res.status(200).json(loadSettings());
    }

    if (req.method === 'PUT') {
      const result = saveSettings(req.body || {});
      scheduleDbPersist();
      return res.status(200).json({ success: true, excelSync: result.excelSync });
    }

    return res.status(405).end();
  } catch (e) {
    console.error('[settings] error:', e.message);
    return res.status(500).json({ error: e.message });
  }
};
