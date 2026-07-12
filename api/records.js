const XLSX = require('xlsx');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'egorchatov-jpg';
const GITHUB_REPO  = process.env.GITHUB_DATA_REPO || 'proverki-kb-data';

// Must match COLUMNS in save.js
const COLUMN_DEFS = [
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
  { h: 'Обоснование для оспаривания в СОКБ',       k: 'contestMeasures' },
  { h: 'Статус оспаривания в СОКБ',               k: 'contestStatus'   },
];

function pad(n) { return String(n).padStart(2, '0'); }

function fmtDate(d) {
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

function fmtDateTime(d) {
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function normHeader(h) {
  return String(h || '').trim().replace(/\s+/g, ' ');
}

// Map Excel header text → field key (handles typos and legacy columns)
function headerToKey(h) {
  const n = normHeader(h);
  if (!n) return null;

  const exact = COLUMN_DEFS.find(c => c.h === n);
  if (exact) return exact.k;

  const lower = n.toLowerCase();

  // Typo in some Excel files: "Корректирущие мероприятия"
  if (lower.includes('корректиру') && lower.includes('мероприят') && !lower.includes('выполнение')) {
    return 'corrective';
  }
  // Legacy removed column — skip
  if (lower.includes('выполнение') && lower.includes('корректиру')) {
    return null;
  }
  if (lower.includes('обоснование') && lower.includes('сокб')) return 'contestMeasures';
  if (lower.includes('статус') && lower.includes('сокб')) return 'contestStatus';
  if (lower.includes('дата') && lower.includes('внесен')) return 'dateEntry';
  if (lower.includes('дата') && lower.includes('проверк')) return 'dateCheck';
  if (n === '№' || lower === 'no' || lower === 'n') return 'num';

  return null;
}

function buildColMap(headerRow) {
  const keyToIdx = {};
  headerRow.forEach((h, i) => {
    const k = headerToKey(h);
    if (k && keyToIdx[k] === undefined) keyToIdx[k] = i;
  });

  // Positional fallback only for standard 16-column layout (no legacy extra columns)
  if (headerRow.length <= 16) {
    COLUMN_DEFS.forEach((c, i) => {
      if (keyToIdx[c.k] === undefined) keyToIdx[c.k] = i;
    });
  }

  return keyToIdx;
}

function cellToStr(val, key) {
  if (val === null || val === undefined || val === '') return '';
  if (val instanceof Date) {
    return key === 'dateEntry' ? fmtDateTime(val) : fmtDate(val);
  }
  return String(val).trim();
}

function parseXlsx(base64) {
  const buf = Buffer.from(base64.replace(/\n/g, ''), 'base64');
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });

  if (!rows.length) return [];

  const headerRow = rows[0].map(h => normHeader(h));
  const colMap = buildColMap(headerRow);

  const recs = [];
  for (let ri = 1; ri < rows.length; ri++) {
    const row = rows[ri];
    if (!row || !row.length) continue;

    const rec = {};
    COLUMN_DEFS.forEach(c => {
      const idx = colMap[c.k];
      rec[c.k] = idx !== undefined ? cellToStr(row[idx], c.k) : '';
    });

    if (rec.dateCheck && rec.dateCheck.trim()) recs.push(rec);
  }

  const dn = s => {
    const p = (s || '').split('.');
    return p.length >= 3 ? parseInt(p[2].slice(0, 4) + p[1] + p[0]) : 0;
  };
  recs.sort((a, b) => dn(b.dateCheck) - dn(a.dateCheck));
  recs.forEach((r, i) => { r.num = i + 1; });
  return recs;
}

// Fetch with 8-second timeout (Vercel Hobby limit is 10s).
async function ghGet(fileName, cachedSha) {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodeURIComponent(fileName)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  const headers = {
    Authorization: `token ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'proverki-kb',
  };
  if (cachedSha) headers['If-None-Match'] = `"${cachedSha}"`;
  try {
    const r = await fetch(url, { headers, signal: ctrl.signal });
    clearTimeout(timer);
    if (r.status === 304) return { notModified: true };
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`GitHub GET "${fileName}": HTTP ${r.status}`);
    return r.json();
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!GITHUB_TOKEN) return res.status(500).json({ error: 'GITHUB_TOKEN not configured' });

  try {
    const cur = new Date().getFullYear();
    const years = req.query.year
      ? [req.query.year]
      : Array.from({ length: cur - 2025 }, (_, i) => String(2026 + i));

    if (years.length === 1) {
      const year = years[0];
      const shaKey = `sha${year}`;
      const clientSha = (req.query[shaKey] || '').trim();

      const file = await ghGet(`Проверки КБ ${year}.xlsx`, clientSha);

      if (!file) {
        return res.status(200).json({ records: [], shas: {} });
      }
      if (file.notModified) {
        return res.status(200).json({ unchanged: true, shas: { [shaKey]: clientSha } });
      }

      const recs = parseXlsx(file.content);
      recs.forEach(r => { r.year = year; });
      return res.status(200).json({ records: recs, shas: { [shaKey]: file.sha } });
    }

    let allRecords = [];
    for (const year of years) {
      const file = await ghGet(`Проверки КБ ${year}.xlsx`);
      if (!file || !file.content) continue;
      const recs = parseXlsx(file.content);
      recs.forEach(r => { r.year = year; });
      allRecords = allRecords.concat(recs);
    }

    return res.status(200).json({ records: allRecords });
  } catch (err) {
    console.error('[records] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
