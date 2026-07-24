const { saveChecklistForRecord } = require('../lib/checklists-lib');
const { updateRecord } = require('../lib/records-store');
const { getDb } = require('../lib/db');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    getDb();
    const { dateEntry, year, fields, dateCheck, method, org, barrier } = req.body || {};
    if (!dateEntry || !fields) return res.status(400).json({ error: 'Missing dateEntry or fields' });

    const fallback = { dateCheck, method, org, barrier };
    await updateRecord(dateEntry, fields, fallback);

    if (fields.checklistFilled) {
      try {
        await saveChecklistForRecord(Object.assign({}, fields, { dateEntry }));
      } catch (clErr) {
        console.warn('[update] checklist save failed:', clErr.message);
      }
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[update] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
