/**
 * Shared GitHub Contents API helpers for proverki-kb-data repo.
 */
const { execSync } = require('child_process');

const GITHUB_OWNER = process.env.GITHUB_OWNER || 'egorchatov-jpg';
const GITHUB_REPO = process.env.GITHUB_DATA_REPO || process.env.PROD_DATA_REPO || 'proverki-kb-data';

function githubToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN.trim();
  try {
    return execSync('gh auth token', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch (_e) {
    return '';
  }
}

function ghUrl(filePath) {
  return `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodeURIComponent(filePath)}`;
}

function ghHeaders(token, accept) {
  return {
    Authorization: `token ${token}`,
    Accept: accept || 'application/vnd.github.v3+json',
    'User-Agent': 'proverki-kb-github-api',
  };
}

async function ghFetch(url, opts, timeoutMs) {
  timeoutMs = timeoutMs || 60000;
  const ctrl = new AbortController();
  const timer = setTimeout(function() { ctrl.abort(); }, timeoutMs);
  try {
    return await fetch(url, Object.assign({}, opts, { signal: ctrl.signal }));
  } finally {
    clearTimeout(timer);
  }
}

async function ghGetMeta(filePath, token) {
  const t = token || githubToken();
  if (!t) return null;
  const r = await ghFetch(ghUrl(filePath), { headers: ghHeaders(t) });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GitHub meta "${filePath}": HTTP ${r.status}`);
  const data = await r.json();
  if (Array.isArray(data)) return { type: 'dir', items: data };
  return data;
}

async function ghGetRaw(filePath, token) {
  const t = token || githubToken();
  if (!t) throw new Error('GITHUB_TOKEN required');
  const r = await ghFetch(ghUrl(filePath), {
    headers: Object.assign({}, ghHeaders(t), { Accept: 'application/vnd.github.raw' }),
  });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GitHub GET "${filePath}": HTTP ${r.status}`);
  if (/\.(db|xlsx)$/i.test(filePath)) return Buffer.from(await r.arrayBuffer());
  return r.text();
}

async function ghPutFile(filePath, content, message, token) {
  const t = token || githubToken();
  if (!t) throw new Error('GITHUB_TOKEN required');
  const isBuffer = Buffer.isBuffer(content);
  const payload = isBuffer ? content.toString('base64') : Buffer.from(content, 'utf8').toString('base64');
  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const body = {
      message: message || `Update ${filePath}`,
      content: payload,
    };
    const meta = await ghGetMeta(filePath, t);
    if (meta && meta.sha) body.sha = meta.sha;
    const r = await ghFetch(ghUrl(filePath), {
      method: 'PUT',
      headers: Object.assign({}, ghHeaders(t), { 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    });
    if (r.ok) return r.json();
    const text = await r.text().catch(function() { return ''; });
    lastErr = new Error(`GitHub PUT "${filePath}": HTTP ${r.status} ${text}`);
    // 409 = SHA conflict — refresh meta and retry
    if (r.status !== 409 && r.status !== 422) break;
  }
  throw lastErr;
}

async function ghListDir(dirPath, token) {
  const t = token || githubToken();
  const meta = await ghGetMeta(dirPath, t);
  if (!meta) return [];
  if (meta.items) return meta.items;
  return Array.isArray(meta) ? meta : [];
}

async function ghDelete(filePath, sha, message, token) {
  const t = token || githubToken();
  const r = await ghFetch(ghUrl(filePath), {
    method: 'DELETE',
    headers: Object.assign({}, ghHeaders(t), { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ message: message || `Delete ${filePath}`, sha: sha }),
  });
  if (!r.ok) {
    const text = await r.text().catch(function() { return ''; });
    throw new Error(`GitHub DELETE "${filePath}": HTTP ${r.status} ${text}`);
  }
}

module.exports = {
  GITHUB_OWNER,
  GITHUB_REPO,
  githubToken,
  ghUrl,
  ghFetch,
  ghHeaders,
  ghGetMeta,
  ghGetRaw,
  ghPutFile,
  ghListDir,
  ghDelete,
};
