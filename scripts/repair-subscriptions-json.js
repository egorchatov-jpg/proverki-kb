const fs = require('fs');
const path = require('path');

function loadEnv() {
  for (const f of ['.env', 'timeweb-upload.env']) {
    const p = path.join(__dirname, f);
    if (!fs.existsSync(p)) continue;
    fs.readFileSync(p, 'utf8').split(/\r?\n/).forEach(line => {
      const i = line.indexOf('=');
      if (i < 1 || line.startsWith('#')) return;
      const k = line.slice(0, i).trim();
      let v = line.slice(i + 1).trim().replace(/^"|"$/g, '');
      if (!process.env[k]) process.env[k] = v;
    });
    break;
  }
}

const SUBS_FILE = 'subscriptions.json';
const GH_HEADERS = (token) => ({
  Authorization: 'token ' + token,
  Accept: 'application/vnd.github.v3+json',
  'User-Agent': 'proverki-kb',
  'Content-Type': 'application/json',
});

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

async function ghGet(token, fileName) {
  const owner = process.env.GITHUB_OWNER || 'egorchatov-jpg';
  const repo = process.env.GITHUB_DATA_REPO || 'proverki-kb-data';
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(fileName)}`;
  const r = await fetch(url, { headers: GH_HEADERS(token) });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('GitHub GET: HTTP ' + r.status);
  return r.json();
}

async function ghPut(token, fileName, jsonObj, sha, message) {
  const owner = process.env.GITHUB_OWNER || 'egorchatov-jpg';
  const repo = process.env.GITHUB_DATA_REPO || 'proverki-kb-data';
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(fileName)}`;
  const contentBuf = Buffer.from(JSON.stringify(jsonObj, null, 2), 'utf8');
  const body = {
    message,
    content: contentBuf.toString('base64'),
    sha,
  };
  const r = await fetch(url, { method: 'PUT', headers: GH_HEADERS(token), body: JSON.stringify(body) });
  if (!r.ok) throw new Error('GitHub PUT: HTTP ' + r.status + ' ' + (await r.text()));
  return r.json();
}

async function verifyFile(token) {
  const meta = await ghGet(token, SUBS_FILE);
  const raw = decodeGithubFileContent(meta.content);
  if (!raw.trim().startsWith('{')) {
    throw new Error('Verify failed: file still not plain JSON after repair');
  }
  const data = JSON.parse(raw);
  return { count: (data.subscriptions || []).length, sha: meta.sha };
}

loadEnv();
(async () => {
  let token = process.env.GITHUB_TOKEN;
  if (!token) {
    try {
      token = require('child_process').execSync('gh auth token', { encoding: 'utf8' }).trim();
    } catch (_e) {}
  }
  if (!token) throw new Error('GITHUB_TOKEN missing');
  const meta = await ghGet(token, SUBS_FILE);
  if (!meta) throw new Error('subscriptions.json not found');
  const raw = decodeGithubFileContent(meta.content);
  const data = parseSubscriptionsJson(raw);
  console.log('Parsed subscriptions:', data.subscriptions.length);
  await ghPut(token, SUBS_FILE, data, meta.sha, 'Fix subscriptions.json encoding (push notify)');
  const verified = await verifyFile(token);
  console.log('Verified plain JSON on GitHub, subscriptions:', verified.count);
  console.log('Repaired and uploaded subscriptions.json');
})().catch(e => { console.error(e.message); process.exit(1); });
