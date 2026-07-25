/**
 * Remove legacy Excel snapshot backups from GitHub data repo (pre-SQLite).
 */
const { githubToken } = require('./migrate-from-github');

const GITHUB_OWNER = process.env.GITHUB_OWNER || 'egorchatov-jpg';
const GITHUB_REPO = process.env.GITHUB_DATA_REPO || process.env.PROD_DATA_REPO || 'proverki-kb-data';
const MANIFEST_PATH = 'backups/manifest.json';
const SNAPSHOTS_PREFIX = 'backups/snapshots/';

function ghHeaders(token) {
  return {
    Authorization: `token ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'proverki-kb-backups-cleanup',
  };
}

function ghUrl(filePath) {
  return `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodeURIComponent(filePath)}`;
}

async function ghFetch(url, opts, timeoutMs) {
  timeoutMs = timeoutMs || 15000;
  const ctrl = new AbortController();
  const timer = setTimeout(function() { ctrl.abort(); }, timeoutMs);
  try {
    return await fetch(url, Object.assign({}, opts, { signal: ctrl.signal }));
  } finally {
    clearTimeout(timer);
  }
}

async function ghListDir(dirPath, token) {
  const r = await ghFetch(ghUrl(dirPath || ''), { headers: ghHeaders(token) });
  if (r.status === 404) return [];
  if (!r.ok) throw new Error(`GitHub list "${dirPath}": HTTP ${r.status}`);
  const data = await r.json();
  return Array.isArray(data) ? data : [];
}

async function ghDelete(filePath, sha, message, token) {
  const r = await ghFetch(ghUrl(filePath), {
    method: 'DELETE',
    headers: Object.assign({}, ghHeaders(token), { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ message: message, sha: sha }),
  });
  if (!r.ok) {
    const text = await r.text().catch(function() { return ''; });
    throw new Error(`GitHub DELETE "${filePath}": HTTP ${r.status} ${text}`);
  }
}

async function purgeGithubLegacyExcelBackups() {
  const token = githubToken();
  if (!token) {
    return { skipped: true, reason: 'no_github_token' };
  }

  let deletedFiles = 0;
  let deletedSnapshots = 0;

  const snapshotDirs = await ghListDir('backups/snapshots', token);
  for (const dir of snapshotDirs) {
    if (dir.type !== 'dir' || !dir.name) continue;
    const dirPath = SNAPSHOTS_PREFIX + dir.name;
    const files = await ghListDir(dirPath, token);
    let hadExcel = false;
    for (const file of files) {
      if (file.type !== 'file' || !file.sha || !file.name) continue;
      const isExcel = file.name.endsWith('.xlsx');
      const isLegacyJson = file.name === 'settings.json' || file.name === 'checklists.json';
      if (!isExcel && !isLegacyJson && file.name !== 'manifest.json') continue;
      if (isExcel) hadExcel = true;
      await ghDelete(`${dirPath}/${file.name}`, file.sha,
        `Remove legacy Excel backup file ${dir.name}/${file.name}`, token);
      deletedFiles++;
    }
    if (hadExcel) deletedSnapshots++;
  }

  const manifestMeta = await ghFetch(ghUrl(MANIFEST_PATH), { headers: ghHeaders(token) });
  if (manifestMeta.ok) {
    const meta = await manifestMeta.json();
    if (meta && meta.sha) {
      await ghDelete(MANIFEST_PATH, meta.sha, 'Remove legacy Excel backups manifest', token);
      deletedFiles++;
    }
  }

  return { deletedFiles, deletedSnapshots };
}

module.exports = {
  purgeGithubLegacyExcelBackups,
};
