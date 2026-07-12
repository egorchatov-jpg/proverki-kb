const XLSX = require('xlsx');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'egorchatov-jpg';
const GITHUB_REPO  = process.env.GITHUB_DATA_REPO || 'proverki-kb-data';

const CORRECTIVE_HEADER = 'Корректирующие мероприятия';
const REMOVED_CORR_EXEC   = 'Выполнение корректирующих мероприятий';
const REMOVED_CONTEST_STATUS = 'Статус оспаривания в СОКБ';
const CONTEST_HEADER = 'Оспаривание в СОКБ';

const EXPECTED_HEADERS = [
  '№', 'Дата проверки', 'Дата внесения проверки', 'Метод проверки',
  'Проверку выполнил', 'Проверяемая организация', 'Проверяемый объект',
  'Куратор от заказчика', 'Проверяемый барьер', 'Барьер в ПК',
  'Работоспособность барьера', 'Нарушение допустил', 'Описание нарушения',
  CORRECTIVE_HEADER,
  CONTEST_HEADER,
];

const COL_COUNT = EXPECTED_HEADERS.length;

function ghApiUrl(filePath) {
  return `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodeURIComponent(filePath)}`;
}

const GH_HEADERS = {
  Authorization: `token ${GITHUB_TOKEN}`,
  Accept: 'application/vnd.github.v3+json',
  'User-Agent': 'proverki-kb-migrate',
};

async function ghGet(filePath) {
  const r = await fetch(ghApiUrl(filePath), { headers: GH_HEADERS });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GET ${filePath}: HTTP ${r.status}`);
  return r.json();
}

async function ghPut(filePath, base64, sha, message) {
  const r = await fetch(ghApiUrl(filePath), {
    method: 'PUT',
    headers: { ...GH_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, content: base64, sha }),
  });
  if (!r.ok) throw new Error(`PUT ${filePath}: HTTP ${r.status} — ${await r.text()}`);
  return r.json();
}

async function listExcelFiles() {
  const r = await fetch(ghApiUrl(''), { headers: GH_HEADERS });
  if (!r.ok) throw new Error(`List repo: HTTP ${r.status}`);
  const items = await r.json();
  return items
    .filter(i => i.name && i.name.endsWith('.xlsx') && i.name.includes('Проверки КБ'))
    .map(i => i.name);
}

function normHeader(h) {
  return String(h || '').trim().replace(/\s+/g, ' ');
}

function removeColumn(rows, header, predicate, log) {
  const idx = header.findIndex(predicate);
  if (idx < 0) return { rows, changed: false };
  log.push(`Удалён столбец ${idx + 1}: «${header[idx]}»`);
  return {
    rows: rows.map(row => {
      const r = [...row];
      if (r.length > idx) r.splice(idx, 1);
      return r;
    }),
    changed: true,
  };
}

function migrateRows(rows) {
  if (!rows.length) return { rows, changed: false, log: [] };

  const log = [];
  let changed = false;
  rows = rows.map(r => [...(r || [])]);
  let header = rows[0].map(normHeader);

  let res = removeColumn(rows, header, h =>
    h === REMOVED_CORR_EXEC ||
    (/выполнение/i.test(h) && /корректиру/i.test(h) && /мероприят/i.test(h))
  , log);
  if (res.changed) { rows = res.rows; changed = true; header = rows[0].map(normHeader); }

  res = removeColumn(rows, header, h =>
    h === REMOVED_CONTEST_STATUS ||
    (/статус/i.test(h) && /сокб/i.test(h))
  , log);
  if (res.changed) { rows = res.rows; changed = true; header = rows[0].map(normHeader); }

  rows.forEach(r => { while (r.length < COL_COUNT) r.push(''); });

  if (normHeader(rows[0][13]) !== CORRECTIVE_HEADER) {
    log.push(`Столбец 14: «${normHeader(rows[0][13])}» → «${CORRECTIVE_HEADER}»`);
    rows[0][13] = CORRECTIVE_HEADER;
    changed = true;
  }

  const oldHeader = rows[0].map(normHeader).join('|');
  rows[0] = EXPECTED_HEADERS.slice();
  if (oldHeader !== EXPECTED_HEADERS.join('|')) changed = true;

  for (let i = 1; i < rows.length; i++) {
    while (rows[i].length < COL_COUNT) rows[i].push('');
    if (rows[i].length > COL_COUNT) { rows[i] = rows[i].slice(0, COL_COUNT); changed = true; }
  }

  return { rows, changed, log };
}

async function migrateFile(fileName) {
  const meta = await ghGet(fileName);
  if (!meta || !meta.content) return { file: fileName, status: 'not_found' };

  const buf = Buffer.from(meta.content.replace(/\n/g, ''), 'base64');
  const wb = XLSX.read(buf, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  const { rows: newRows, changed, log } = migrateRows(rows);
  if (!changed) return { file: fileName, status: 'unchanged' };

  const newWs = XLSX.utils.aoa_to_sheet(newRows);
  newWs['!cols'] = [
    { wch: 4 }, { wch: 12 }, { wch: 18 }, { wch: 14 }, { wch: 18 },
    { wch: 24 }, { wch: 24 }, { wch: 18 }, { wch: 20 }, { wch: 10 },
    { wch: 20 }, { wch: 18 }, { wch: 40 }, { wch: 30 }, { wch: 30 },
  ];
  wb.Sheets[wb.SheetNames[0]] = newWs;

  const b64 = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }).toString('base64');
  await ghPut(fileName, b64, meta.sha, `Миграция: столбец 16 удалён, столбец 15 переименован — ${fileName}`);
  return { file: fileName, status: 'migrated', log };
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!GITHUB_TOKEN) return res.status(500).json({ error: 'GITHUB_TOKEN not configured' });

  try {
    let files = await listExcelFiles();
    if (!files.length) files = ['Проверки КБ 2026.xlsx'];

    const results = [];
    for (const f of files) {
      results.push(await migrateFile(f));
    }
    return res.status(200).json({ success: true, results });
  } catch (err) {
    console.error('[migrate-excel]', err.message);
    return res.status(500).json({ error: err.message });
  }
};
