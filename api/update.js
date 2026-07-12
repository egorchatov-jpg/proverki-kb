const XLSX = require('xlsx');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'egorchatov-jpg';
const GITHUB_REPO  = process.env.GITHUB_DATA_REPO || 'proverki-kb-data';

function ghApiUrl(fileName) {
  return `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodeURIComponent(fileName)}`;
}

const GH_HEADERS = {
  Authorization: `token ${GITHUB_TOKEN}`,
  Accept: 'application/vnd.github.v3+json',
  'User-Agent': 'proverki-kb',
};

function ghFetch(url, opts, timeoutMs = 10000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

async function ghGet(fileName) {
  const r = await ghFetch(ghApiUrl(fileName), { headers: GH_HEADERS });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GitHub GET "${fileName}": HTTP ${r.status}`);
  return r.json();
}

async function ghPut(fileName, base64Content, sha, message) {
  const body = { message, content: base64Content };
  if (sha) body.sha = sha;
  const r = await ghFetch(ghApiUrl(fileName), {
    method: 'PUT',
    headers: { ...GH_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, 12000);
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    const err = new Error(`GitHub PUT "${fileName}": HTTP ${r.status} — ${text}`);
    err.httpStatus = r.status;
    throw err;
  }
  return r.json();
}

// Column key → 0-based index (must match COLUMNS in save.js after removing correctiveDone)
const COL_IDX = {
  num: 0, dateCheck: 1, dateEntry: 2, method: 3, inspector: 4,
  org: 5, obj: 6, curator: 7, barrier: 8, barrierInPK: 9,
  works: 10, violator: 11, desc: 12, corrective: 13,
  contestMeasures: 14, contestStatus: 15,
};

async function updateRecord(fileName, dateEntry, fields) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const existing = await ghGet(fileName);
    if (!existing || !existing.content) throw new Error('File not found');

    const buf = Buffer.from(existing.content.replace(/\n/g, ''), 'base64');
    const wb = XLSX.read(buf, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

    // Find row by dateEntry (col 2)
    const rowIdx = rows.findIndex((row, i) => i > 0 && String(row[COL_IDX.dateEntry] || '') === String(dateEntry));
    if (rowIdx < 0) throw new Error('Record not found: ' + dateEntry);

    // Update specified columns
    Object.keys(fields).forEach(k => {
      const ci = COL_IDX[k];
      if (ci !== undefined) rows[rowIdx][ci] = fields[k];
    });

    const newWs = XLSX.utils.aoa_to_sheet(rows);
    newWs['!cols'] = ws['!cols'];
    wb.Sheets[wb.SheetNames[0]] = newWs;

    const b64 = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }).toString('base64');
    try {
      await ghPut(fileName, b64, existing.sha, `Обновление мероприятий — ${dateEntry}`);
      return;
    } catch (err) {
      if (err.httpStatus === 409 && attempt < 2) { continue; }
      throw err;
    }
  }
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!GITHUB_TOKEN) return res.status(500).json({ error: 'GITHUB_TOKEN not configured' });

  try {
    const { dateEntry, year, fields } = req.body || {};
    if (!dateEntry || !fields) return res.status(400).json({ error: 'Missing dateEntry or fields' });

    const y = year || String(new Date().getFullYear());
    const fileName = `Проверки КБ ${y}.xlsx`;

    await updateRecord(fileName, dateEntry, fields);
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[update] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
