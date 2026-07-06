const XLSX = require('xlsx');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'egorchatov-jpg';
const GITHUB_REPO  = process.env.GITHUB_DATA_REPO || 'proverki-kb-data';

const COLUMN_MAP = {
  '№':                                       'num',
  'Дата проверки':                           'dateCheck',
  'Дата внесения проверки':                  'dateEntry',
  'Метод проверки':                          'method',
  'Проверку выполнил':                       'inspector',
  'Проверяемая организация':                 'org',
  'Проверяемый объект':                      'obj',
  'Куратор от заказчика':                    'curator',
  'Проверяемый барьер':                      'barrier',
  'Барьер в ПК':                             'barrierInPK',
  'Работоспособность барьера':               'works',
  'Описание нарушения':                      'desc',
  'Нарушение допустил':                      'violator',
  'Корректирующие мероприятия':              'corrective',
  'Выполнение корректирующих мероприятий':   'correctiveDone',
  'Мероприятия по оспариванию в СОКБ':       'contestMeasures',
  'Статус оспаривания в СОКБ':               'contestStatus',
};

// Convert JS Date (from cellDates:true) → "DD.MM.YYYY"
function fmtDate(d) {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${d.getFullYear()}`;
}

// Fetch with 8-second timeout (Vercel Hobby limit is 10s)
async function ghGet(fileName) {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodeURIComponent(fileName)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(url, {
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'proverki-kb',
      },
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`GitHub GET "${fileName}": HTTP ${r.status}`);
    return r.json();
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

function parseXlsx(base64) {
  const buf = Buffer.from(base64.replace(/\n/g, ''), 'base64');
  // cellDates:true → date cells become JS Date objects (not serial numbers)
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { raw: true, defval: '' });

  return rows.map(row => {
    const rec = {};
    for (const [col, key] of Object.entries(COLUMN_MAP)) {
      const val = row[col];
      if (val === null || val === undefined || val === '') {
        rec[key] = '';
      } else if (val instanceof Date) {
        rec[key] = fmtDate(val);   // Excel date cell → DD.MM.YYYY
      } else {
        rec[key] = String(val);
      }
    }
    return rec;
  });
}

module.exports = async (req, res) => {
  // Prevent any caching of this endpoint
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
