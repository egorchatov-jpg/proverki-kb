const XLSX = require('xlsx');
const { COLUMNS, COL, buildColIdx, sortAndRenumberSheet, nextCheckId, ensureCheckIdColumn, assignMissingCheckIds } = require('./excel-utils');
const { sendViolationPush } = require('../lib/push-notify');

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

function ghFetch(url, opts, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  return fetch(url, { ...opts, signal: ctrl.signal })
    .finally(() => clearTimeout(timer));
}

async function ghGet(fileName, timeoutMs = 8000) {
  const r = await ghFetch(ghApiUrl(fileName), { headers: GH_HEADERS }, timeoutMs);
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
    err.httpStatus = r.status; // expose status code for retry logic
    throw err;
  }
  return r.json();
}

function buildEmptyWorkbook() {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([COLUMNS.map(c => c.h)]);
  ws['!cols'] = COLUMNS.map((_, i) => ({
    wch: [4, 12, 12, 18, 14, 18, 24, 24, 18, 20, 10, 20, 18, 40, 30, 30][i] || 15,
  }));
  XLSX.utils.book_append_sheet(wb, ws, 'Проверки');
  return wb;
}

// Read → modify → write with automatic retry on 409 Conflict (concurrent writes).
// GitHub returns 409 when two clients try to PUT the same file with the same SHA.
// Fix: re-GET the file to obtain the current SHA and retry up to 3 times.
async function appendRecord(fileName, record) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const existing = await ghGet(fileName);
    let wb;

    if (existing && existing.content) {
      const buf = Buffer.from(existing.content.replace(/\n/g, ''), 'base64');
      wb = XLSX.read(buf, { type: 'buffer' });
    } else {
      wb = buildEmptyWorkbook();
    }

    const ws = wb.Sheets[wb.SheetNames[0]];
    let rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
    rows = ensureCheckIdColumn(rows);
    const year = record.dateCheck
      ? record.dateCheck.split('.')[2]
      : String(new Date().getFullYear());
    rows = assignMissingCheckIds(rows, year);
    const header = rows.length ? rows[0].map(h => String(h || '').trim()) : COLUMNS.map(c => c.h);
    const colIdx = buildColIdx(header);

    // Dedup check: dateCheck+method+org+obj+barrier+desc
    const fp = [record.dateCheck, record.method, record.org, record.obj, record.barrier, record.desc].join('|');
    const isDupe = rows.slice(1).some(row => {
      const dc = colIdx.dateCheck ?? COL.dateCheck;
      if (!row[dc]) return false;
      return [
        String(row[colIdx.dateCheck ?? COL.dateCheck] || ''),
        String(row[colIdx.method ?? COL.method] || ''),
        String(row[colIdx.org ?? COL.org] || ''),
        String(row[colIdx.obj ?? COL.obj] || ''),
        String(row[colIdx.barrier ?? COL.barrier] || ''),
        String(row[colIdx.desc ?? COL.desc] || ''),
      ].join('|') === fp;
    });
    if (isDupe) {
      console.warn('[save] duplicate detected, skipping');
      return { duplicate: true };
    }

    if (!record.checkId) {
      record.checkId = nextCheckId(rows.slice(1), colIdx, year);
    }

    // Append new row
    rows.push(COLUMNS.map(c => record[c.k] ?? ''));

    const sorted = sortAndRenumberSheet(rows);
    const sortedColIdx = buildColIdx(sorted[0].map(h => String(h || '').trim()));
    const idCol = sortedColIdx.checkId ?? COL.checkId;
    const idx = sorted.slice(1).findIndex(row => String(row[idCol] || '').trim() === String(record.checkId || '').trim());
    record.num = idx >= 0 ? idx + 1 : sorted.length - 1;

    const newWs = XLSX.utils.aoa_to_sheet(sorted);
    newWs['!cols'] = ws['!cols'];
    wb.Sheets[wb.SheetNames[0]] = newWs;

    const b64 = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }).toString('base64');
    try {
      await ghPut(
        fileName, b64, existing ? existing.sha : undefined,
        `Проверка ${record.checkId || ('№' + record.num)} — ${record.org || ''}`
      );
      return { duplicate: false };
    } catch (err) {
      if (err.httpStatus === 409 && attempt < 2) {
        console.warn(`[save] 409 conflict, retry ${attempt + 1}/3`);
        continue;
      }
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
    const { record, senderEndpoint } = req.body || {};
    if (!record) return res.status(400).json({ error: 'Missing record' });

    const year = record.dateCheck
      ? record.dateCheck.split('.')[2]
      : String(new Date().getFullYear());
    const fileName = `Проверки КБ ${year}.xlsx`;

    if (!record.dateEntry) {
      const now = new Date();
      const p = n => String(n).padStart(2, '0');
      record.dateEntry = `${p(now.getDate())}.${p(now.getMonth()+1)}.${now.getFullYear()}, ${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}`;
    }

    const saveResult = await appendRecord(fileName, record);

    let notified = 0;
    if (!saveResult.duplicate && record.works === 'Нет') {
      try {
        const pushResult = await sendViolationPush(record, senderEndpoint || null);
        notified = pushResult.sent || 0;
      } catch (pushErr) {
        console.warn('[save] push notify failed:', pushErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      duplicate: !!saveResult.duplicate,
      notified,
      num: record.num,
      year,
      checkId: record.checkId,
    });
  } catch (err) {
    console.error('[save] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
