const { getDb } = require('../lib/db');
const { loadSettings, saveSettings } = require('../lib/settings-store');
const { scheduleDbPersist, pushDbToGithub } = require('../lib/github-persist');
const { isLocalDev } = require('../lib/runtime-env');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    getDb();

    if (req.method === 'GET') {
      return res.status(200).json(Object.assign({}, loadSettings(), { localDev: isLocalDev() }));
    }

    if (req.method === 'PUT') {
      const result = saveSettings(req.body || {});
      if (result.rejected) {
        return res.status(409).json({
          success: false,
          rejected: true,
          reason: result.reason,
          settings: result.settings,
          localDev: isLocalDev(),
        });
      }
      if (!isLocalDev()) {
        scheduleDbPersist();
        pushDbToGithub().catch(function(e) {
          console.warn('[settings] immediate GitHub db push failed:', e.message);
        });
      }
      return res.status(200).json({
        success: true,
        excelSync: result.excelSync,
        localDev: isLocalDev(),
      });
    }

    return res.status(405).end();
  } catch (e) {
    console.error('[settings] error:', e.message);
    return res.status(500).json({ error: e.message });
  }
};
