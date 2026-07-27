const { saveChecklistForRecord } = require('../lib/checklists-lib');
const { updateRecord } = require('../lib/records-store');
const { getDb } = require('../lib/db');
const { scheduleDbPersist } = require('../lib/github-persist');
const { sendRecordsChangedPush } = require('../lib/push-notify');
const { assertWritesAllowed } = require('../lib/write-gate');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    if (!assertWritesAllowed(res)) return;
    getDb();
    const body = req.body || {};
    const { dateEntry, year, fields, dateCheck, method, org, barrier, updatedAt, senderEndpoint } = body;
    if (!dateEntry || !fields) return res.status(400).json({ error: 'Missing dateEntry or fields' });

    const fallback = { dateCheck, method, org, barrier };
    const updated = await updateRecord(dateEntry, fields, fallback, { updatedAt: updatedAt });

    if (fields.checklistFilled) {
      try {
        await saveChecklistForRecord(Object.assign({}, fields, { dateEntry }));
      } catch (clErr) {
        console.warn('[update] checklist save failed:', clErr.message);
      }
    }

    scheduleDbPersist();
    sendRecordsChangedPush(senderEndpoint || null).catch(function(e) {
      console.warn('[update] silent sync push failed:', e.message);
    });

    return res.status(200).json({
      success: true,
      checkId: updated && updated.checkId,
      updatedAt: updated && updated.updatedAt,
      year: year || (updated && updated.year),
    });
  } catch (err) {
    if (err && err.code === 'CONFLICT') {
      return res.status(409).json({
        success: false,
        conflict: true,
        error: 'conflict',
        record: err.record || null,
      });
    }
    console.error('[update] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
