const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'egorchatov-jpg';
const GITHUB_REPO = process.env.GITHUB_DATA_REPO || 'proverki-kb-data';
const CHECKLISTS_FILE = 'checklists.json';

const GH_HEADERS = {
  Authorization: `token ${GITHUB_TOKEN}`,
  Accept: 'application/vnd.github.v3+json',
  'User-Agent': 'proverki-kb',
};

function ghFetch(url, opts, timeoutMs = 8000) {
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
  }, 12000);
  if (!r.ok) {
    const err = new Error(`GitHub PUT "${fileName}": HTTP ${r.status}`);
    err.httpStatus = r.status;
    throw err;
  }
  return r.json();
}

function parseChecklistsContent(b64Content) {
  if (!b64Content) return { items: {} };
  const raw = Buffer.from(String(b64Content).replace(/\n/g, ''), 'base64').toString('utf8');
  try {
    const data = JSON.parse(raw);
    if (!data.items || typeof data.items !== 'object') data.items = {};
    return data;
  } catch (_e) {
    return { items: {} };
  }
}

function recordChecklistKey(record) {
  if (!record) return '';
  return String(record.checkId || record.dateEntry || '').trim();
}

function extractChecklistPayload(record) {
  if (!record || !record.checklistFilled) return null;
  const key = recordChecklistKey(record);
  if (!key) return null;
  return {
    key,
    checklistViolations: record.checklistViolations || {},
    checklistQuestionTexts: record.checklistQuestionTexts || {},
    checklistPassportId: record.checklistPassportId || null,
    checklistFilled: true,
    updatedAt: Date.now(),
  };
}

async function readChecklistsFile() {
  const existing = await ghGet(CHECKLISTS_FILE);
  if (!existing || !existing.content) {
    return { data: { items: {} }, sha: undefined };
  }
  return { data: parseChecklistsContent(existing.content), sha: existing.sha };
}

async function writeChecklists(updater, message) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, sha } = await readChecklistsFile();
    const next = updater(data);
    const content = Buffer.from(JSON.stringify(next, null, 2), 'utf8');
    try {
      await ghPut(CHECKLISTS_FILE, content, sha, message);
      return next;
    } catch (err) {
      if (err.httpStatus === 409 && attempt < 2) continue;
      throw err;
    }
  }
  throw new Error('Failed to save checklists after retries');
}

async function loadAllChecklists() {
  if (!GITHUB_TOKEN) throw new Error('GITHUB_TOKEN not configured');
  const { data } = await readChecklistsFile();
  return data;
}

async function saveChecklistForRecord(record) {
  if (!GITHUB_TOKEN) throw new Error('GITHUB_TOKEN not configured');
  const payload = extractChecklistPayload(record);
  if (!payload) return null;
  const key = payload.key;
  return writeChecklists(function(current) {
    current.items[key] = {
      checklistViolations: payload.checklistViolations,
      checklistQuestionTexts: payload.checklistQuestionTexts,
      checklistPassportId: payload.checklistPassportId,
      checklistFilled: true,
      updatedAt: payload.updatedAt,
    };
    return current;
  }, `Checklist: ${key}`);
}

module.exports = {
  CHECKLISTS_FILE,
  recordChecklistKey,
  extractChecklistPayload,
  loadAllChecklists,
  saveChecklistForRecord,
  parseChecklistsContent,
};
