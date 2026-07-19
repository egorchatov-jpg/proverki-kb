function decodeGithubFileContent(b64Content) {
  return Buffer.from(String(b64Content || '').replace(/\n/g, ''), 'base64').toString('utf8');
}

function parseSubscriptionsJson(raw) {
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data.subscriptions)) data.subscriptions = [];
    return data;
  } catch (_e) {}
  const trimmed = String(raw || '').trim();
  if (/^[A-Za-z0-9+/=\s]+$/.test(trimmed.slice(0, 120))) {
    const inner = Buffer.from(trimmed.replace(/\s/g, ''), 'base64').toString('utf8');
    const data = JSON.parse(inner);
    if (!Array.isArray(data.subscriptions)) data.subscriptions = [];
    return data;
  }
  throw new Error('Cannot parse subscriptions.json');
}

function parseSubscriptionsFromGithubContent(b64Content) {
  return parseSubscriptionsJson(decodeGithubFileContent(b64Content));
}

module.exports = {
  decodeGithubFileContent,
  parseSubscriptionsJson,
  parseSubscriptionsFromGithubContent,
};
