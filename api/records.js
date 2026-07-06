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

async function ghGet(fileName) {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodeURIComponent(fileName)}`;
  const r = await fetch(url, {
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'proverki-kb',
    },
  });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GitHub GET "${fileName}": HTTP ${r.status}`);
  return r.json();
}

function parseXlsx(base64) {
  const buf = Buffer.from(base64.replace(/\n/g, ''), 'base64');
  const wb = XLSX.read(buf, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  // sheet_to_json with header:1 returns rows as arrays
  const rows = XLSX.utils.sheet_to_json(ws);
  return rows.map(row => {
    const record = {};
    for (const [excelCol, appKey] of Object.entries(COLUMN_MAP)) {
      const val = row[excelCol];
      record[appKey] = val !== undefined ? String(val) : '';
    }
    return record;
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!GITHUB_TOKEN) return res.status(500).json({ error: 'GITHUB_TOKEN not configured' });

  try {
    // If ?year= not provided, load from all years starting from 2026
    const years = req.query.year
      ? [req.query.year]
      : (() => {
          const cur = new Date().getFullYear();
          const arr = [];
          for (let y = 2026; y <= cur; y++) arr.push(String(y));
          return arr;
        })();

    let allRecords = [];
    for (const year of years) {
      const fileName = `Проверки КБ ${year}.xlsx`;
      const file = await ghGet(fileName);
      if (!file || !file.content) continue;
      const records = parseXlsx(file.content);
      // Annotate with year
      records.forEach(r => { r.year = year; });
      allRecords = allRecords.concat(records);
    }

    return res.status(200).json({ records: allRecords });
  } catch (err) {
    console.error('[records] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
