const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'egorchatov-jpg';
const GITHUB_REPO  = process.env.GITHUB_DATA_REPO || 'proverki-kb-data';
const SUBS_FILE    = 'subscriptions.json';

function ghFetch(url, opts, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  return fetch(url, { ...opts, signal: ctrl.signal })
    .finally(() => clearTimeout(timer));
}

async function ghGet(fileName) {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodeURIComponent(fileName)}`;
  const r = await ghFetch(url, {
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
  const r = await ghFetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'proverki-kb',
    },
    body: JSON.stringify(body),
  }, 12000);
  if (!r.ok) {
    const err = new Error(`GitHub PUT "${fileName}": HTTP ${r.status}`);
    err.httpStatus = r.status;
    throw err;
  }
  return r.json();
}

const { parseSubscriptionsFromGithubContent } = require('../lib/subs-parse');

function readSubsFile(existing) {
  if (!existing || !existing.content) return { data: { subscriptions: [] }, sha: undefined };
  const data = parseSubscriptionsFromGithubContent(existing.content);
  return { data, sha: existing.sha };
}

async function writeSubscriptions(updater, logSuffix) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const existing = await ghGet(SUBS_FILE);
    const { data, sha } = readSubsFile(existing);
    const next = updater(data);
    const content = Buffer.from(JSON.stringify(next, null, 2), 'utf8');
    try {
      await ghPut(SUBS_FILE, content, sha, logSuffix);
      return next;
    } catch (err) {
      if (err.httpStatus === 409 && attempt < 2) {
        console.warn(`[subscribe] 409 conflict, retry ${attempt + 1}/3`);
        continue;
      }
      throw err;
    }
  }
  throw new Error('Failed to save subscriptions after retries');
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

    const data = await writeSubscriptions(function(current) {
      const idx = current.subscriptions.findIndex(s => s.endpoint === subscription.endpoint);
      if (idx >= 0) current.subscriptions[idx] = subscription;
      else current.subscriptions.push(subscription);
      return current;
    }, `Subscribe: ${subscription.endpoint.slice(-20)}`);

    return res.status(200).json({ success: true, total: data.subscriptions.length });
  } catch (err) {
    console.error('[subscribe] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
