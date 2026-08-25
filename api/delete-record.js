const { deleteRecord } = require('../lib/delete-record-lib');
const { getDb } = require('../lib/db');
const { flushDbPersist, deletePhotoFromGithub } = require('../lib/github-persist');
const { sendRecordsChangedPush } = require('../lib/push-notify');
const { assertWritesAllowed } = require('../lib/write-gate');
const { requireSession } = require('../lib/auth-session');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    if (!assertWritesAllowed(res)) return;
    if (!requireSession(req, res)) return;
    getDb();
    const record = req.body && req.body.record ? req.body.record : req.body;
    if (!record || (!record.dateEntry && !record.checkId)) {
      return res.status(400).json({ error: 'Missing record dateEntry or checkId' });
    }
    const result = await deleteRecord(record);
    // Persist synchronously before responding — see api/update.js for why.
    try {
      await flushDbPersist();
    } catch (persistErr) {
      console.warn('[delete-record] github persist failed:', persistErr.message);
    }
    if (result && result.deletedPhotos && result.deletedPhotos.length) {
      for (const filename of result.deletedPhotos) {
        try { await deletePhotoFromGithub(filename); } catch (e) {
          console.warn('[delete-record] photo delete from github failed:', filename, e.message);
        }
      }
    }
    sendRecordsChangedPush(req.body && req.body.senderEndpoint).catch(function(e) {
      console.warn('[delete] silent sync push failed:', e.message);
    });
    return res.status(200).json(result);
  } catch (err) {
    console.error('[delete-record] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
