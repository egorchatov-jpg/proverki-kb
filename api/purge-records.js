const { deleteRecordsAfter, DEFAULT_CUTOFF } = require('../lib/delete-records-lib');
const { getDb } = require('../lib/db');
const { scheduleDbPersist } = require('../lib/github-persist');
const { requireAdmin } = require('../lib/admin-auth');
const { assertWritesAllowed } = require('../lib/write-gate');

module.exports = async function purgeRecordsHandler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!requireAdmin(req, res)) return;

  const body = req.body || {};
  const cutoff = body.cutoff || DEFAULT_CUTOFF;
  const dryRun = !!body.dryRun;

  try {
    if (!assertWritesAllowed(res)) return;
    getDb();
    const result = await deleteRecordsAfter(cutoff, { dryRun });
    if (!dryRun) scheduleDbPersist();
    return res.status(200).json({ success: true, result });
  } catch (err) {
    console.error('[purge-records]', err.message);
    return res.status(500).json({ error: err.message });
  }
};
