/**
 * Import local Excel database to GitHub data repo with formatting preserved.
 *
 * Usage:
 *   node scripts/import-excel-database.js [--dry-run] [--source "path\to\file.xlsx"]
 *
 * Actions:
 *  - Preserves cell formatting (borders, fonts, column widths, row heights, wrap)
 *  - Sets unique «Дата внесения проверки» for each row (migration timestamp)
 *  - Normalizes corrective/SOKB text to app-canonical format
 *  - Uploads to GitHub as «Проверки КБ 2026.xlsx»
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env.prod') });
require('dotenv').config({ path: require('path').join(__dirname, '../.env.local') });

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ExcelJS = require('exceljs');

function resolveGithubToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  try {
    return execSync('gh auth token', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch (_) {
    return '';
  }
}

const GITHUB_TOKEN = resolveGithubToken();
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'egorchatov-jpg';
const GITHUB_REPO  = process.env.GITHUB_DATA_REPO || 'proverki-kb-data';
const TARGET_FILE  = 'Проверки КБ 2026.xlsx';
const DEFAULT_SOURCE = 'C:\\Users\\egorc\\OneDrive\\Desktop\\Проверки КБ 2026.xlsx';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const sourceArg = args.find((a, i) => args[i - 1] === '--source');
const SOURCE = sourceArg || DEFAULT_SOURCE;

const GH_HEADERS = {
  Authorization: `token ${GITHUB_TOKEN}`,
  Accept: 'application/vnd.github.v3+json',
  'User-Agent': 'proverki-kb-import',
};

function ghApiUrl(filePath) {
  return `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodeURIComponent(filePath)}`;
}

function pad(n) { return String(n).padStart(2, '0'); }

function fmtDateTime(d) {
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function cellText(val) {
  if (val == null) return '';
  if (typeof val === 'object' && val.richText) return val.richText.map(t => t.text).join('');
  if (typeof val === 'object' && val.text) return String(val.text);
  if (val instanceof Date) return fmtDateTime(val);
  return String(val);
}

function normalizeCorrective(text) {
  if (!text || !String(text).trim()) return text;
  return String(text).replace(/^(\s*)Срок:/gim, '$1Выполнить до:');
}

function normalizeSokb(text) {
  if (!text || !String(text).trim()) return text;
  return String(text)
    .replace(/^(\s*)Рассмотрение:/gim, '$1Срок рассмотрения:')
    .replace(/^(\s*)Статус:/gim, '$1Статус оспаривания:');
}

async function ghGet(fileName) {
  const r = await fetch(ghApiUrl(fileName), { headers: GH_HEADERS });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GitHub GET "${fileName}": HTTP ${r.status}`);
  return r.json();
}

async function ghPut(fileName, base64Content, sha, message) {
  const body = { message, content: base64Content, sha };
  const r = await fetch(ghApiUrl(fileName), {
    method: 'PUT',
    headers: { ...GH_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`GitHub PUT "${fileName}": HTTP ${r.status} — ${await r.text()}`);
  return r.json();
}

async function prepareWorkbook(sourcePath) {
  if (!fs.existsSync(sourcePath)) throw new Error(`Файл не найден: ${sourcePath}`);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(sourcePath);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('В файле нет листов');

  const base = new Date();
  let dataRows = 0;
  let corrFixed = 0;
  let sokbFixed = 0;

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const dateCheck = cellText(row.getCell(2).value).trim();
    if (!dateCheck) continue;

    dataRows++;
    const ts = new Date(base.getTime() + (dataRows - 1) * 1000);
    row.getCell(3).value = fmtDateTime(ts);

    const corrRaw = cellText(row.getCell(14).value);
    if (corrRaw) {
      const norm = normalizeCorrective(corrRaw);
      if (norm !== corrRaw) corrFixed++;
      row.getCell(14).value = norm;
    }

    const sokbRaw = cellText(row.getCell(15).value);
    if (sokbRaw) {
      const norm = normalizeSokb(sokbRaw);
      if (norm !== sokbRaw) sokbFixed++;
      row.getCell(15).value = norm;
    }
  }

  return { wb, ws, stats: { dataRows, corrFixed, sokbFixed, sheetName: ws.name } };
}

async function main() {
  if (!GITHUB_TOKEN) {
    console.error('GITHUB_TOKEN не найден. Задайте в .env.local или выполните: gh auth login');
    process.exit(1);
  }

  console.log(`Источник: ${SOURCE}`);
  console.log(`Цель: ${GITHUB_OWNER}/${GITHUB_REPO}/${TARGET_FILE}`);
  if (DRY_RUN) console.log('Режим: DRY-RUN (без загрузки на GitHub)');

  const { wb, stats } = await prepareWorkbook(SOURCE);
  console.log(`Лист: ${stats.sheetName}`);
  console.log(`Строк данных: ${stats.dataRows}`);
  console.log(`Нормализовано корр. мероприятий: ${stats.corrFixed}`);
  console.log(`Нормализовано оспариваний СОКБ: ${stats.sokbFixed}`);

  const outLocal = path.join(__dirname, '_import-ready.xlsx');
  await wb.xlsx.writeFile(outLocal);
  console.log(`Локальная копия: ${outLocal}`);

  if (DRY_RUN) {
    console.log('DRY-RUN завершён.');
    return;
  }

  // Backup current server file
  const backupDir = path.join(__dirname, 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const meta = await ghGet(TARGET_FILE);
  if (meta && meta.content) {
    const backupPath = path.join(backupDir, `${TARGET_FILE.replace('.xlsx', '')}-before-import-${Date.now()}.xlsx`);
    fs.writeFileSync(backupPath, Buffer.from(meta.content.replace(/\n/g, ''), 'base64'));
    console.log(`Бэкап сервера: ${backupPath}`);
  } else {
    console.log('На сервере файла не было — создаём новый');
  }

  const buf = await wb.xlsx.writeBuffer();
  const b64 = Buffer.from(buf).toString('base64');
  const message = `Импорт базы: ${stats.dataRows} проверок из локального Excel (${new Date().toISOString().slice(0, 10)})`;

  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await ghGet(TARGET_FILE);
    const sha = current ? current.sha : undefined;
    try {
      const result = await ghPut(TARGET_FILE, b64, sha, message);
      console.log('✓ Загружено на GitHub, commit:', result.commit && result.commit.sha);
      return;
    } catch (err) {
      if (attempt < 2 && /409/.test(err.message)) {
        console.warn('Конфликт SHA, повтор...');
        continue;
      }
      throw err;
    }
  }
}

main().catch(e => { console.error('Ошибка:', e.message); process.exit(1); });
