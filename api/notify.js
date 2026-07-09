const webpush = require('web-push');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'egorchatov-jpg';
const GITHUB_REPO  = process.env.GITHUB_DATA_REPO || 'proverki-kb-data';
const SUBS_FILE    = 'subscriptions.json';

const VAPID_PUBLIC  = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:egorchatov@gmail.com';

const GH_HEADERS = {
  Authorization: `token ${GITHUB_TOKEN}`,
  Accept: 'application/vnd.github.v3+json',
  'User-Agent': 'proverki-kb',
};

function ghFetch(url, opts, timeoutMs = 6000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  return fetch(url, { ...opts, signal: ctrl.signal })
    .finally(() => clearTimeout(timer));
}

async function ghGet(fileName) {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodeURIComponent(fileName)}`;
  const r = await ghFetch(url, { headers: GH_HEADERS });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GitHub GET "${fileName}": HTTP ${r.status}`);
  return r.json();
}

async function ghPut(fileName, contentBuf, sha, message) {
  const b64 = Buffer.isBuffer(contentBuf)
    ? contentBuf.toString('base64')
    : Buffer.from(contentBuf).toString('base64');
  const body = { message, content: b64 };
  if (sha) body.sha = sha;
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodeURIComponent(fileName)}`;
  const r = await ghFetch(url, {
    method: 'PUT',
    headers: { ...GH_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, 8000);
  if (!r.ok) throw new Error(`GitHub PUT "${fileName}": HTTP ${r.status}`);
  return r.json();
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!GITHUB_TOKEN) return res.status(500).json({ error: 'GITHUB_TOKEN not configured' });
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return res.status(200).json({ sent: 0, reason: 'VAPID not configured' });

  try {
    const { record } = req.body || {};
    if (!record) return res.status(400).json({ error: 'Missing record' });
    if (record.works !== 'Нет') return res.status(200).json({ sent: 0, reason: 'No violation' });

    const subsFile = await ghGet(SUBS_FILE);
    if (!subsFile || !subsFile.content) return res.status(200).json({ sent: 0, reason: 'No subscribers' });

    let data;
    try {
      const txt = Buffer.from(subsFile.content.replace(/\n/g, ''), 'base64').toString('utf8');
      data = JSON.parse(txt);
    } catch (e) {
      return res.status(200).json({ sent: 0, reason: 'Parse error' });
    }

    const subs = data.subscriptions || [];
    if (subs.length === 0) return res.status(200).json({ sent: 0, reason: 'Empty subscribers' });

    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

    const payload = JSON.stringify({
      title: '⚠ Нарушение КБ',
      body: [
        record.org || '',
        record.barrier ? 'Барьер: ' + record.barrier : '',
        record.desc || '',
      ].filter(Boolean).join('\n'),
      tag: 'violation-' + (record.id || Date.now()),
    });

    const results = await Promise.allSettled(
      subs.map(sub => webpush.sendNotification(sub, payload))
    );

    const sent = results.filter(r => r.status === 'fulfilled').length;

    // Remove expired subscriptions (410 = endpoint gone, 404 = not found)
    const alive = subs.filter((_, i) => {
      const r = results[i];
      if (r.status === 'rejected') {
        const code = r.reason && r.reason.statusCode;
        return code !== 410 && code !== 404;
      }
      return true;
    });

    if (alive.length !== subs.length) {
      data.subscriptions = alive;
      const b64 = Buffer.from(JSON.stringify(data, null, 2), 'utf8').toString('base64');
      await ghPut(SUBS_FILE, b64, subsFile.sha, 'Remove expired push subscriptions').catch(() => {});
    }

    console.log(`[notify] sent ${sent}/${subs.length}`);
    return res.status(200).json({ sent, total: subs.length });
  } catch (err) {
    console.error('[notify] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
