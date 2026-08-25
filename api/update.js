const { saveChecklistForRecord, assertChecklistWritable } = require('../lib/checklists-lib');
const { updateRecord } = require('../lib/records-store');
const { getDb } = require('../lib/db');
const { flushDbPersist } = require('../lib/github-persist');
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
    const body = req.body || {};
    const { dateEntry, year, fields, dateCheck, method, org, barrier, updatedAt, senderEndpoint } = body;
    if (!dateEntry || !fields) return res.status(400).json({ error: 'Missing dateEntry or fields' });

    const fallback = { dateCheck, method, org, barrier };
    const checklistProbe = Object.assign({}, fields, {
      dateEntry: dateEntry,
      checkId: fields.checkId,
    });
    if (fields.checklistFilled) {
      const pre = assertChecklistWritable(checklistProbe);
      if (pre && pre.rejected) {
        return res.status(409).json({
          success: false,
          conflict: true,
          error: 'checklist_conflict',
          reason: pre.reason || 'stale_checklist',
          checklist: pre.checklist || null,
        });
      }
    }

    const updated = await updateRecord(dateEntry, fields, fallback, { updatedAt: updatedAt });

    let checklistResult = null;
    if (fields.checklistFilled) {
      try {
        checklistResult = await saveChecklistForRecord(Object.assign({}, checklistProbe, {
          checkId: (updated && updated.checkId) || fields.checkId,
        }));
      } catch (clErr) {
        console.warn('[update] checklist save failed:', clErr.message);
      }
    }
    if (checklistResult && checklistResult.rejected) {
      return res.status(409).json({
        success: false,
        conflict: true,
        error: 'checklist_conflict',
        reason: checklistResult.reason || 'stale_checklist',
        checklist: checklistResult.checklist || null,
        record: updated || null,
      });
    }

    // Persist synchronously before responding: Timeweb's disk is ephemeral
    // and a redeploy right after this response (before a debounced push
    // completes) would otherwise silently drop the update.
    try {
      await flushDbPersist();
    } catch (persistErr) {
      console.warn('[update] github persist failed:', persistErr.message);
    }
    sendRecordsChangedPush(senderEndpoint || null).catch(function(e) {
      console.warn('[update] silent sync push failed:', e.message);
    });

    return res.status(200).json({
      success: true,
      checkId: updated && updated.checkId,
      updatedAt: updated && updated.updatedAt,
      year: year || (updated && updated.year),
      checklistUpdatedAt: checklistResult && checklistResult.updatedAt ? checklistResult.updatedAt : undefined,
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
