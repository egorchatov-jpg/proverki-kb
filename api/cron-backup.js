const { createBackupFromLive } = require('./backups-lib');

module.exports = async (req, res) => {
  const auth = req.headers['authorization'];
  const secret = process.env.CRON_SECRET;
  if (secret && auth !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const result = await createBackupFromLive(new Date());
    return res.status(200).json({ success: true, ...result });
  } catch (e) {
    console.error('[cron-backup]', e.message);
    return res.status(500).json({ error: e.message });
  }
};
