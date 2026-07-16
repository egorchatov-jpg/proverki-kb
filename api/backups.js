const { getBackupsState, restoreBackup } = require('./backups-lib');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const manifest = await getBackupsState();
      return res.status(200).json({
        activeBackupId: manifest.activeBackupId,
        backups: manifest.backups.map(b => ({
          id: b.id,
          label: b.label,
          createdAt: b.createdAt,
        })),
      });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const backupId = body.backupId;
      if (!backupId) return res.status(400).json({ error: 'backupId required' });
      const result = await restoreBackup(backupId);
      return res.status(200).json({ success: true, ...result });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('[backups]', e.message);
    return res.status(500).json({ error: e.message });
  }
};
