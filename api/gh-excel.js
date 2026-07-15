const XLSX = require('xlsx');
const { sortAndRenumberSheet, applyBarrierInPK } = require('./excel-utils');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'egorchatov-jpg';
const GITHUB_REPO  = process.env.GITHUB_DATA_REPO || 'proverki-kb-data';

const GH_HEADERS = {
  Authorization: `token ${GITHUB_TOKEN}`,
  Accept: 'application/vnd.github.v3+json',
  'User-Agent': 'proverki-kb',
};

function ghApiUrl(filePath) {
  return `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodeURIComponent(filePath)}`;
}

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

async function listExcelFiles() {
  const r = await ghFetch(ghApiUrl(''), { headers: GH_HEADERS });
  if (!r.ok) throw new Error(`List repo: HTTP ${r.status}`);
  const items = await r.json();
  return items
    .filter(i => i.name && i.name.endsWith('.xlsx') && i.name.includes('Проверки КБ'))
    .map(i => i.name);
}

function yearFromFileName(fileName) {
  const m = String(fileName).match(/(\d{4})/);
  return m ? m[1] : String(new Date().getFullYear());
}

function readRowsFromMeta(meta) {
  const buf = Buffer.from(meta.content.replace(/\n/g, ''), 'base64');
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return { wb, ws, rows: XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' }) };
}

function writeWorkbook(wb, ws, rows) {
  const newWs = XLSX.utils.aoa_to_sheet(rows);
  newWs['!cols'] = ws['!cols'];
  wb.Sheets[wb.SheetNames[0]] = newWs;
  return XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }).toString('base64');
}

async function updateExcelFile(fileName, transformFn, message) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const meta = await ghGet(fileName);
    if (!meta || !meta.content) return { file: fileName, status: 'not_found' };

    const { wb, ws, rows } = readRowsFromMeta(meta);
    if (!rows.length) return { file: fileName, status: 'empty' };

    const newRows = transformFn(rows);
    const b64 = writeWorkbook(wb, ws, newRows);
    try {
      await ghPut(fileName, b64, meta.sha, message);
      return { file: fileName, status: 'updated' };
    } catch (err) {
      if (err.httpStatus === 409 && attempt < 2) continue;
      throw err;
    }
  }
  return { file: fileName, status: 'failed' };
}

async function syncBarriersConfigToExcel(barriersConfig) {
  let files = await listExcelFiles();
  if (!files.length) files = [`Проверки КБ ${new Date().getFullYear()}.xlsx`];

  const results = [];
  for (const fileName of files) {
    const defaultYear = yearFromFileName(fileName);
    const result = await updateExcelFile(
      fileName,
      rows => sortAndRenumberSheet(applyBarrierInPK(rows, barriersConfig, defaultYear)),
      `Синхронизация «Барьер в ПК» — ${fileName}`
    );
    results.push(result);
  }
  return results;
}

module.exports = {
  ghGet,
  ghPut,
  listExcelFiles,
  updateExcelFile,
  syncBarriersConfigToExcel,
  sortAndRenumberSheet,
};
