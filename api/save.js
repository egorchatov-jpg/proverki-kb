const { sendViolationPush, sendRecordsChangedPush } = require('../lib/push-notify');
const { saveChecklistForRecord } = require('../lib/checklists-lib');
const { loadSettings } = require('../lib/settings-store');
const { insertRecord } = require('../lib/records-store');
const { getDb } = require('../lib/db');
const { flushDbPersist, isEnabled: isGithubPersistEnabled } = require('../lib/github-persist');
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
    const { record, senderEndpoint } = req.body || {};
    if (!record) return res.status(400).json({ error: 'Missing record' });

    const settings = loadSettings();
    const saveResult = insertRecord(record, settings.barriersConfig);

    let checklistResult = null;
    if (!saveResult.duplicate && record.checklistFilled) {
      try {
        checklistResult = await saveChecklistForRecord(record);
      } catch (clErr) {
        console.warn('[save] checklist save failed:', clErr.message);
      }
    }
    if (checklistResult && checklistResult.rejected) {
      return res.status(409).json({
        success: false,
        conflict: true,
        error: 'checklist_conflict',
        reason: checklistResult.reason || 'stale_checklist',
        checklist: checklistResult.checklist || null,
        checkId: saveResult.checkId || record.checkId,
      });
    }

    let notified = 0;
    if (!saveResult.duplicate && record.works === 'Нет') {
      // Push delivery must not block saving. A stale subscription can take
      // several retry attempts and otherwise makes the client look frozen.
      sendViolationPush(record, senderEndpoint || null).catch(function(pushErr) {
        console.warn('[save] push notify failed:', pushErr.message);
      });
    }

    // Persist synchronously before responding — see api/update.js for why.
    // CRITICAL: if the GitHub push fails, we must NOT tell the client the
    // record is saved. The local SQLite lives on Timeweb's ephemeral disk;
    // the only durable copy is on GitHub. If we ack success here while the
    // push failed, the client drops the record from its retry queue and the
    // data is permanently lost on the next redeploy/force-pull. This exact
    // chain caused the silent loss of all 29.08.2026 checks during the
    // expired-GITHUB_TOKEN incident (see docs/current-task.md pkb-v465).
    // Runs for duplicates too: a record re-sent by the client retry queue may
    // already exist in the ephemeral local DB but still not be on GitHub, so
    // it must not be acked until the DB snapshot containing it is pushed.
    if (isGithubPersistEnabled()) {
      try {
        const persistResult = await flushDbPersist();
        if (!persistResult || persistResult.pushed !== true) {
          console.warn('[save] github persist did not confirm push:', JSON.stringify(persistResult));
          return res.status(503).json({
            success: false, retryable: true, error: 'persist_failed',
            reason: (persistResult && persistResult.reason) || 'not_pushed',
          });
        }
      } catch (persistErr) {
        console.warn('[save] github persist failed:', persistErr.message);
        return res.status(503).json({ success: false, retryable: true, error: 'persist_failed', reason: persistErr.message });
      }
    }
    if (!saveResult.duplicate) {
      sendRecordsChangedPush(senderEndpoint || null).catch(function(e) {
        console.warn('[save] silent sync push failed:', e.message);
      });
    }

    return res.status(200).json({
      success: true,
      duplicate: !!saveResult.duplicate,
      notified,
      num: saveResult.num != null ? saveResult.num : record.num,
      year: saveResult.year || record.year,
      checkId: saveResult.checkId || record.checkId,
      checklistUpdatedAt: checklistResult && checklistResult.updatedAt ? checklistResult.updatedAt : undefined,
    });
  } catch (err) {
    console.error('[save] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
