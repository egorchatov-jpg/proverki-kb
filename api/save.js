const { sendViolationPush } = require('../lib/push-notify');
const { saveChecklistForRecord } = require('../lib/checklists-lib');
const { loadSettings } = require('../lib/settings-store');
const { insertRecord } = require('../lib/records-store');
const { getDb } = require('../lib/db');
const { scheduleDbPersist } = require('../lib/github-persist');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    getDb();
    const { record, senderEndpoint } = req.body || {};
    if (!record) return res.status(400).json({ error: 'Missing record' });

    const settings = loadSettings();
    const saveResult = insertRecord(record, settings.barriersConfig);

    if (!saveResult.duplicate && record.checklistFilled) {
      try {
        await saveChecklistForRecord(record);
      } catch (clErr) {
        console.warn('[save] checklist save failed:', clErr.message);
      }
    }

    let notified = 0;
    if (!saveResult.duplicate && record.works === 'Нет') {
      try {
        const pushResult = await sendViolationPush(record, senderEndpoint || null);
        notified = pushResult.sent || 0;
      } catch (pushErr) {
        console.warn('[save] push notify failed:', pushErr.message);
      }
    }

    if (!saveResult.duplicate) scheduleDbPersist();

    return res.status(200).json({
      success: true,
      duplicate: !!saveResult.duplicate,
      notified,
      num: record.num,
      year: saveResult.year || record.year,
      checkId: record.checkId,
    });
  } catch (err) {
    console.error('[save] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
