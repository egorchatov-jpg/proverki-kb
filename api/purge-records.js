const { deleteRecordsAfter, DEFAULT_CUTOFF } = require('../lib/delete-records-lib');

module.exports = async function purgeRecordsHandler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!process.env.GITHUB_TOKEN) return res.status(500).json({ error: 'GITHUB_TOKEN not configured' });

  const body = req.body || {};
  const cutoff = body.cutoff || DEFAULT_CUTOFF;
  const dryRun = !!body.dryRun;

  try {
    const result = await deleteRecordsAfter(cutoff, { dryRun });
    return res.status(200).json({ success: true, result });
  } catch (err) {
    console.error('[purge-records]', err.message);
    return res.status(500).json({ error: err.message });
  }
};
