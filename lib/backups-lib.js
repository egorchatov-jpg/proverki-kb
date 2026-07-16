const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'egorchatov-jpg';
const GITHUB_REPO  = process.env.GITHUB_DATA_REPO || 'proverki-kb-data';
const MANIFEST_PATH = 'backups/manifest.json';
const MAX_BACKUPS = 10;
const MSK_TZ = 'Europe/Moscow';

const GH_HEADERS = {
  Authorization: `token ${GITHUB_TOKEN}`,
  Accept: 'application/vnd.github.v3+json',
  'User-Agent': 'proverki-kb',
};

function ghApiUrl(filePath) {
  return `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodeURIComponent(filePath)}`;
}

function ghFetch(url, opts, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

async function ghGetJson(filePath) {
  const r = await ghFetch(ghApiUrl(filePath), { headers: GH_HEADERS });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GitHub GET "${filePath}": HTTP ${r.status}`);
  return r.json();
}

async function ghGetRaw(filePath) {
  const r = await ghFetch(ghApiUrl(filePath), {
    headers: { ...GH_HEADERS, Accept: 'application/vnd.github.raw' },
  });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GitHub GET raw "${filePath}": HTTP ${r.status}`);
  return r.text();
}

async function ghPut(filePath, base64Content, sha, message) {
  const body = { message, content: base64Content, ...(sha ? { sha } : {}) };
  const r = await ghFetch(ghApiUrl(filePath), {
    method: 'PUT',
    headers: { ...GH_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, 15000);
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`GitHub PUT "${filePath}": HTTP ${r.status} — ${text}`);
  }
  return r.json();
}

async function ghDelete(filePath, sha, message) {
  const r = await ghFetch(ghApiUrl(filePath), {
    method: 'DELETE',
    headers: { ...GH_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, sha }),
  }, 15000);
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`GitHub DELETE "${filePath}": HTTP ${r.status} — ${text}`);
  }
  return r.json();
}

function mskParts(date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: MSK_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = type => (parts.find(p => p.type === type) || {}).value || '00';
  return {
    day: get('day'),
    month: get('month'),
    year: get('year'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

function formatLabel(date) {
  const p = mskParts(date);
  return `${p.day}.${p.month}.${p.year} - ${p.hour}:${p.minute}:${p.second}`;
}

function makeBackupId(date) {
  const p = mskParts(date);
  return `${p.year}-${p.month}-${p.day}T${p.hour}-${p.minute}-${p.second}`;
}

function snapshotDir(id) {
  return `backups/snapshots/${id}`;
}

async function listRepoItems(dir) {
  const path = dir ? `${dir}` : '';
  const r = await ghFetch(ghApiUrl(path), { headers: GH_HEADERS });
  if (r.status === 404) return [];
  if (!r.ok) throw new Error(`List "${path || '/'}": HTTP ${r.status}`);
  const data = await r.json();
  return Array.isArray(data) ? data : [];
}

async function listLiveExcelFiles() {
  const items = await listRepoItems('');
  return items
    .filter(i => i.type === 'file' && i.name && i.name.endsWith('.xlsx') && i.name.includes('Проверки КБ'))
    .map(i => i.name);
}

async function readManifest() {
  const raw = await ghGetRaw(MANIFEST_PATH);
  if (!raw) {
    return { activeBackupId: null, backups: [] };
  }
  try {
    const data = JSON.parse(raw);
    return {
      activeBackupId: data.activeBackupId || null,
      backups: Array.isArray(data.backups) ? data.backups : [],
    };
  } catch (_) {
    return { activeBackupId: null, backups: [] };
  }
}

async function writeManifest(manifest) {
  const meta = await ghGetJson(MANIFEST_PATH);
  const text = JSON.stringify({
    activeBackupId: manifest.activeBackupId,
    backups: manifest.backups,
    updatedAt: Date.now(),
  }, null, 2) + '\n';
  await ghPut(MANIFEST_PATH, Buffer.from(text, 'utf8').toString('base64'), meta && meta.sha, 'Update backups manifest');
}

async function copyFile(srcPath, destPath, message) {
  const src = await ghGetJson(srcPath);
  if (!src || !src.content) throw new Error(`Missing file: ${srcPath}`);
  const dest = await ghGetJson(destPath);
  await ghPut(destPath, src.content.replace(/\n/g, ''), dest && dest.sha, message);
}

async function deleteSnapshot(id) {
  const dir = snapshotDir(id);
  const items = await listRepoItems(dir);
  for (const item of items) {
    if (item.type !== 'file' || !item.sha) continue;
    await ghDelete(`${dir}/${item.name}`, item.sha, `Remove old backup file ${id}/${item.name}`);
  }
}

async function createBackupFromLive(atDate) {
  if (!GITHUB_TOKEN) throw new Error('GITHUB_TOKEN not configured');
  const when = atDate || new Date();
  const id = makeBackupId(when);
  const label = formatLabel(when);
  const manifest = await readManifest();
  if (manifest.backups.some(b => b.id === id)) {
    return { id, label, skipped: true, reason: 'already_exists' };
  }

  const liveFiles = await listLiveExcelFiles();
  if (!liveFiles.length) throw new Error('No Excel database files found');

  const dir = snapshotDir(id);
  for (const name of liveFiles) {
    await copyFile(name, `${dir}/${name}`, `Daily backup ${label}: ${name}`);
  }

  const entry = { id, label, createdAt: when.getTime(), files: liveFiles };
  manifest.backups.unshift(entry);
  while (manifest.backups.length > MAX_BACKUPS) {
    const removed = manifest.backups.pop();
    if (removed && removed.id) await deleteSnapshot(removed.id);
  }
  manifest.activeBackupId = id;
  await writeManifest(manifest);
  return { id, label, files: liveFiles.length };
}

async function restoreBackup(backupId) {
  if (!GITHUB_TOKEN) throw new Error('GITHUB_TOKEN not configured');
  const manifest = await readManifest();
  const entry = manifest.backups.find(b => b.id === backupId);
  if (!entry) throw new Error('Backup not found');

  const dir = snapshotDir(backupId);
  const snapItems = await listRepoItems(dir);
  const snapFiles = snapItems.filter(i => i.type === 'file').map(i => i.name);
  if (!snapFiles.length) throw new Error('Backup snapshot is empty');

  for (const name of snapFiles) {
    await copyFile(`${dir}/${name}`, name, `Restore database from backup ${entry.label}: ${name}`);
  }

  manifest.activeBackupId = backupId;
  await writeManifest(manifest);
  return { id: backupId, label: entry.label, files: snapFiles.length };
}

async function getBackupsState() {
  const manifest = await readManifest();
  if (!manifest.backups.length) {
    try {
      await createBackupFromLive(new Date());
      return readManifest();
    } catch (e) {
      return manifest;
    }
  }
  if (!manifest.activeBackupId && manifest.backups.length) {
    manifest.activeBackupId = manifest.backups[0].id;
  }
  return manifest;
}

module.exports = {
  MAX_BACKUPS,
  formatLabel,
  createBackupFromLive,
  restoreBackup,
  getBackupsState,
};
