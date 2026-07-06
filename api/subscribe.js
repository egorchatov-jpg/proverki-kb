const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'egorchatov-jpg';
const GITHUB_REPO  = process.env.GITHUB_DATA_REPO || 'proverki-kb-data';
const SUBS_FILE    = 'subscriptions.json';

async function ghGet(fileName) {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodeURIComponent(fileName)}`;
  const r = await fetch(url, {
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'proverki-kb',
    },
  });
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
  const r = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'proverki-kb',
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`GitHub PUT "${fileName}": HTTP ${r.status}`);
  return r.json();
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!GITHUB_TOKEN) return res.status(500).json({ error: 'GITHUB_TOKEN not configured' });

  try {
    const { subscription } = req.body || {};
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: 'Missing subscription.endpoint' });
    }

    // Load existing subscriptions
    const existing = await ghGet(SUBS_FILE);
    let data = { subscriptions: [] };
    let sha;

    if (existing && existing.content) {
      sha = existing.sha;
      const txt = Buffer.from(existing.content.replace(/\n/g, ''), 'base64').toString('utf8');
      data = JSON.parse(txt);
      if (!Array.isArray(data.subscriptions)) data.subscriptions = [];
    }

    // Add or replace by endpoint (unique per device/browser)
    const idx = data.subscriptions.findIndex(s => s.endpoint === subscription.endpoint);
    if (idx >= 0) {
      data.subscriptions[idx] = subscription;
    } else {
      data.subscriptions.push(subscription);
    }

    const content = Buffer.from(JSON.stringify(data, null, 2), 'utf8');
    await ghPut(SUBS_FILE, content, sha, `Subscribe: ${subscription.endpoint.slice(-20)}`);

    return res.status(200).json({ success: true, total: data.subscriptions.length });
  } catch (err) {
    console.error('[subscribe] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
