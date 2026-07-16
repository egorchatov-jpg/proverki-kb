const { getBackupsState, restoreBackup, createBackupFromLive } = require('../lib/backups-lib');

function checkCronAuth(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return req.headers['authorization'] === `Bearer ${secret}`;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      if (req.headers['x-vercel-cron']) {
        if (!checkCronAuth(req)) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
        const result = await createBackupFromLive(new Date());
        return res.status(200).json({ success: true, ...result });
      }

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
