const XLSX = require('xlsx');
const { sortAndRenumberSheet } = require('./excel-utils');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'egorchatov-jpg';
const GITHUB_REPO  = process.env.GITHUB_DATA_REPO || 'proverki-kb-data';

// Must match COLUMNS in save.js
const COLUMNS = [
  { h: '№',                                       k: 'num'             },
  { h: 'Дата проверки',                           k: 'dateCheck'       },
  { h: 'Дата внесения проверки',                  k: 'dateEntry'       },
  { h: 'Метод проверки',                          k: 'method'          },
  { h: 'Проверку выполнил',                       k: 'inspector'       },
  { h: 'Проверяемая организация',                 k: 'org'             },
  { h: 'Проверяемый объект',                      k: 'obj'             },
  { h: 'Куратор от заказчика',                    k: 'curator'         },
  { h: 'Проверяемый барьер',                      k: 'barrier'         },
  { h: 'Барьер в ПК',                             k: 'barrierInPK'     },
  { h: 'Работоспособность барьера',               k: 'works'           },
  { h: 'Нарушение допустил',                      k: 'violator'        },
  { h: 'Описание нарушения',                      k: 'desc'            },
  { h: 'Корректирующие мероприятия',              k: 'corrective'      },
  { h: 'Оспаривание в СОКБ',                      k: 'contestMeasures' },
];

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

function pad(n) { return String(n).padStart(2, '0'); }

function dateEntryToNum(s) {
  const m = String(s || '').match(/(\d{1,2})\.(\d{1,2})\.(\d{4}),?\s*(\d{1,2}):(\d{2}):(\d{2})/);
  if (!m) return 0;
  return +m[3] * 10000000000 + +m[2] * 100000000 + +m[1] * 1000000 + +m[4] * 10000 + +m[5] * 100 + +m[6];
}

function normDateEntry(s) {
  const m = String(s || '').match(/(\d{1,2})\.(\d{1,2})\.(\d{4}),?\s*(\d{1,2}):(\d{2}):(\d{2})/);
  if (!m) return String(s || '').trim();
  return `${pad(m[1])}.${pad(m[2])}.${m[3]}, ${pad(m[4])}:${pad(m[5])}:${pad(m[6])}`;
}

// Convert Excel cell value (string, serial number, or Date) to comparable dateEntry string
function excelCellToDateEntry(v) {
  if (v instanceof Date) {
    return `${pad(v.getDate())}.${pad(v.getMonth() + 1)}.${v.getFullYear()}, ${pad(v.getHours())}:${pad(v.getMinutes())}:${pad(v.getSeconds())}`;
  }
  if (typeof v === 'number' && v > 30000) {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const d = new Date(epoch.getTime() + Math.round(v * 86400000));
    return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
  }
  return normDateEntry(v);
}

function buildColIdx(header) {
  const idx = {};
  COLUMNS.forEach(c => {
    const i = header.findIndex(h => String(h || '').trim() === c.h);
    if (i >= 0) idx[c.k] = i;
  });
  // Fuzzy match for corrective column (typo "Корректирущие" etc.)
  if (idx.corrective === undefined) {
    const ci = header.findIndex(h => {
      const lower = String(h || '').toLowerCase();
      return lower.includes('корректиру') && lower.includes('мероприят') && !lower.includes('выполнение');
    });
    if (ci >= 0) idx.corrective = ci;
  }
  if (idx.contestMeasures === undefined) {
    const ci = header.findIndex(h => {
      const lower = String(h || '').toLowerCase();
      return (lower.includes('оспаривание') || lower.includes('обоснование')) && lower.includes('сокб');
    });
    if (ci >= 0) idx.contestMeasures = ci;
  }
  return idx;
}

function rowFingerprint(row, colIdx) {
  return [
    row[colIdx.dateCheck],
    row[colIdx.method],
    row[colIdx.org],
    row[colIdx.barrier],
  ].map(v => String(v || '').trim()).join('|');
}

function findRowIndex(rows, colIdx, dateEntry, fallback) {
  const targetNum = dateEntryToNum(dateEntry);
  const targetNorm = normDateEntry(dateEntry);

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (colIdx.dateEntry === undefined) break;
    const cellVal = row[colIdx.dateEntry];
    const rowNorm = excelCellToDateEntry(cellVal);
    if (targetNum && dateEntryToNum(rowNorm) === targetNum) return i;
    if (rowNorm && rowNorm === targetNorm) return i;
    if (String(cellVal || '').trim() === String(dateEntry || '').trim()) return i;
  }

  // Fallback: match by dateCheck + method + org + barrier
  if (fallback && fallback.dateCheck) {
    const fp = [
      fallback.dateCheck,
      fallback.method || '',
      fallback.org || '',
      fallback.barrier || '',
    ].map(v => String(v || '').trim()).join('|');
    for (let i = 1; i < rows.length; i++) {
      if (rowFingerprint(rows[i], colIdx) === fp) return i;
    }
  }

  return -1;
}

async function updateRecord(fileName, dateEntry, fields, fallback) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const existing = await ghGet(fileName);
    if (!existing || !existing.content) throw new Error('File not found');

    const buf = Buffer.from(existing.content.replace(/\n/g, ''), 'base64');
    const wb = XLSX.read(buf, { type: 'buffer', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });

    if (!rows.length) throw new Error('Empty workbook');

    const header = rows[0].map(h => String(h || '').trim());
    const colIdx = buildColIdx(header);

    if (colIdx.dateEntry === undefined) {
      throw new Error('Column "Дата внесения проверки" not found in ' + fileName);
    }

    const rowIdx = findRowIndex(rows, colIdx, dateEntry, fallback);
    if (rowIdx < 0) {
      throw new Error('Record not found: ' + dateEntry + (fallback ? ' [' + fallback.dateCheck + '|' + fallback.org + ']' : ''));
    }

    // Ensure row array is long enough
    while (rows[rowIdx].length < header.length) rows[rowIdx].push('');

    Object.keys(fields).forEach(k => {
      const ci = colIdx[k];
      if (ci !== undefined) rows[rowIdx][ci] = fields[k];
    });

    const sorted = sortAndRenumberSheet(rows);
    const newWs = XLSX.utils.aoa_to_sheet(sorted);
    newWs['!cols'] = ws['!cols'];
    wb.Sheets[wb.SheetNames[0]] = newWs;

    const b64 = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }).toString('base64');
    try {
      await ghPut(fileName, b64, existing.sha, `Обновление записи — ${dateEntry}`);
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
    const { dateEntry, year, fields, dateCheck, method, org, barrier } = req.body || {};
    if (!dateEntry || !fields) return res.status(400).json({ error: 'Missing dateEntry or fields' });

    const y = year || String(new Date().getFullYear());
    const fileName = `Проверки КБ ${y}.xlsx`;
    const fallback = { dateCheck, method, org, barrier };

    await updateRecord(fileName, dateEntry, fields, fallback);
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[update] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
