/**
 * One-time migration: fix column 14 header + remove column 15 from Excel files on GitHub.
 * Run: node scripts/migrate-excel-headers.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env.prod') });
require('dotenv').config({ path: require('path').join(__dirname, '../.env.local') });
const XLSX = require('xlsx');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'egorchatov-jpg';
const GITHUB_REPO  = process.env.GITHUB_DATA_REPO || 'proverki-kb-data';

const CORRECTIVE_HEADER = 'Корректирующие мероприятия';
const REMOVED_HEADER    = 'Выполнение корректирующих мероприятий';

const EXPECTED_HEADERS = [
  '№', 'Дата проверки', 'Дата внесения проверки', 'Метод проверки',
  'Проверку выполнил', 'Проверяемая организация', 'Проверяемый объект',
  'Куратор от заказчика', 'Проверяемый барьер', 'Барьер в ПК',
  'Работоспособность барьера', 'Нарушение допустил', 'Описание нарушения',
  CORRECTIVE_HEADER,
  'Обоснование для оспаривания в СОКБ', 'Статус оспаривания в СОКБ',
];

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

function migrateRows(rows) {
  if (!rows.length) return { rows, changed: false };

  let changed = false;
  rows = rows.map(r => [...(r || [])]);
  const header = rows[0].map(normHeader);

  // 1. Remove column "Выполнение корректирующих мероприятий"
  const removeIdx = header.findIndex(h =>
    h === REMOVED_HEADER ||
    (/выполнение/i.test(h) && /корректиру/i.test(h) && /мероприят/i.test(h))
  );
  if (removeIdx >= 0) {
    console.log(`  → удалён столбец ${removeIdx + 1}: «${header[removeIdx]}»`);
    rows = rows.map(row => {
      const r = [...row];
      if (r.length > removeIdx) r.splice(removeIdx, 1);
      return r;
    });
    changed = true;
  }

  // 2. Pad rows to at least 16 columns
  rows.forEach(r => { while (r.length < 16) r.push(''); });

  // 3. Fix column 14 (index 13) header
  if (normHeader(rows[0][13]) !== CORRECTIVE_HEADER) {
    console.log(`  → столбец 14: «${normHeader(rows[0][13])}» → «${CORRECTIVE_HEADER}»`);
    rows[0][13] = CORRECTIVE_HEADER;
    changed = true;
  }

  // 4. Enforce standard 16-column header
  const oldHeader = rows[0].map(normHeader).join('|');
  rows[0] = EXPECTED_HEADERS.slice();
  if (oldHeader !== EXPECTED_HEADERS.join('|')) changed = true;

  // 5. Trim/pad data rows
  for (let i = 1; i < rows.length; i++) {
    while (rows[i].length < 16) rows[i].push('');
    if (rows[i].length > 16) { rows[i] = rows[i].slice(0, 16); changed = true; }
  }

  return { rows, changed };
}

async function migrateFile(fileName) {
  console.log(`\nФайл: ${fileName}`);
  const meta = await ghGet(fileName);
  if (!meta || !meta.content) {
    console.log('  пропуск (не найден)');
    return;
  }

  const buf = Buffer.from(meta.content.replace(/\n/g, ''), 'base64');
  const wb = XLSX.read(buf, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  let rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  const { rows: newRows, changed } = migrateRows(rows);

  if (!changed) {
    console.log('  без изменений');
    return;
  }

  const newWs = XLSX.utils.aoa_to_sheet(newRows);
  newWs['!cols'] = [
    { wch: 4 }, { wch: 12 }, { wch: 18 }, { wch: 14 }, { wch: 18 },
    { wch: 24 }, { wch: 24 }, { wch: 18 }, { wch: 20 }, { wch: 10 },
    { wch: 20 }, { wch: 18 }, { wch: 40 }, { wch: 30 }, { wch: 30 }, { wch: 24 },
  ];
  wb.Sheets[wb.SheetNames[0]] = newWs;

  const b64 = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }).toString('base64');
  await ghPut(fileName, b64, meta.sha, `Миграция: исправлен столбец 14, удалён столбец 15 — ${fileName}`);
  console.log('  ✓ сохранено на GitHub');
}

async function main() {
  if (!GITHUB_TOKEN) {
    console.error('GITHUB_TOKEN не найден в .env.local');
    process.exit(1);
  }
  console.log(`Репозиторий: ${GITHUB_OWNER}/${GITHUB_REPO}`);

  const files = await listExcelFiles();
  if (!files.length) {
    console.log('Excel-файлы не найдены, пробуем 2026...');
    files.push('Проверки КБ 2026.xlsx');
  }

  for (const f of files) {
    await migrateFile(f);
  }
  console.log('\nГотово.');
}

main().catch(e => { console.error('Ошибка:', e.message); process.exit(1); });
