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
  if (!r.ok) {
    const err = new Error(`GitHub PUT "${fileName}": HTTP ${r.status}`);
    err.httpStatus = r.status;
    throw err;
  }
  return r.json();
}

function buildViolationPayload(record) {
  return JSON.stringify({
    title: '⚠ Нарушение КБ',
    body: [
      record.org || '',
      record.barrier ? 'Барьер: ' + record.barrier : '',
      record.desc || '',
    ].filter(Boolean).join('\n'),
    tag: 'violation-' + (record.id || record.checkId || Date.now()),
  });
}

async function sendViolationPush(record, senderEndpoint) {
  if (!record || record.works !== 'Нет') {
    return { sent: 0, total: 0, reason: 'No violation' };
  }
  if (!GITHUB_TOKEN) throw new Error('GITHUB_TOKEN not configured');
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    return { sent: 0, total: 0, reason: 'VAPID not configured' };
  }

  const subsFile = await ghGet(SUBS_FILE);
  if (!subsFile || !subsFile.content) {
    return { sent: 0, total: 0, reason: 'No subscribers' };
  }

  let data;
  try {
    const txt = Buffer.from(subsFile.content.replace(/\n/g, ''), 'base64').toString('utf8');
    data = JSON.parse(txt);
  } catch (e) {
    return { sent: 0, total: 0, reason: 'Parse error' };
  }

  const subs = data.subscriptions || [];
  if (subs.length === 0) {
    return { sent: 0, total: 0, reason: 'Empty subscribers' };
  }

  const recipients = senderEndpoint
    ? subs.filter(sub => sub.endpoint !== senderEndpoint)
    : subs;

  if (recipients.length === 0) {
    return { sent: 0, total: 0, reason: 'No recipients after excluding sender' };
  }

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
  const payload = buildViolationPayload(record);
  const pushOptions = { urgency: 'high', TTL: 86400 };
  const results = await Promise.allSettled(
    recipients.map(sub => webpush.sendNotification(sub, payload, pushOptions))
  );

  const sent = results.filter(r => r.status === 'fulfilled').length;

  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      const ep = (recipients[i].endpoint || '').slice(-30);
      const code = r.reason && r.reason.statusCode;
      console.warn(`[push] failed ...${ep}: HTTP ${code} — ${r.reason && r.reason.message}`);
    }
  });

  const deadEndpoints = new Set(
    recipients
      .filter((_, i) => {
        const r = results[i];
        return r.status === 'rejected' &&
          r.reason && (r.reason.statusCode === 410 || r.reason.statusCode === 404);
      })
      .map(s => s.endpoint)
  );

  if (deadEndpoints.size > 0) {
    data.subscriptions = subs.filter(s => !deadEndpoints.has(s.endpoint));
    const b64 = Buffer.from(JSON.stringify(data, null, 2), 'utf8').toString('base64');
    await ghPut(SUBS_FILE, b64, subsFile.sha, 'Remove expired push subscriptions').catch(() => {});
  }

  console.log(`[push] sent ${sent}/${recipients.length} (excluded sender: ${senderEndpoint ? 'yes' : 'no'}, total subs: ${subs.length})`);
  return { sent, total: recipients.length };
}

module.exports = {
  sendViolationPush,
  buildViolationPayload,
};
