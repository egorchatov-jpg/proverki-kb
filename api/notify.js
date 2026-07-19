const { sendViolationPush } = require('../lib/push-notify');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { record, senderEndpoint } = req.body || {};
    if (!record) return res.status(400).json({ error: 'Missing record' });
    const result = await sendViolationPush(record, senderEndpoint);
    return res.status(200).json(result);
  } catch (err) {
    console.error('[notify] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
