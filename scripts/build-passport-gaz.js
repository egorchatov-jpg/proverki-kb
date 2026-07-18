/**
 * Build passports/gaz-01.json from source Excel.
 * Usage: node scripts/build-passport-gaz.js
 */
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const SRC = 'C:/Users/egorc/KBBKSSPD/ПАСПОРТА КАРКАСЫ БЕЗОПАСНОСТИ 2026/БКС/Паспорт ГАЗ 01.01.2026.xlsx';
const OUT = path.join(__dirname, '../passports/gaz-01.json');

function cellText(cell) {
  const v = cell.value;
  if (v == null) return '';
  if (typeof v === 'string' || typeof v === 'number') return String(v).trim();
  if (v.richText) return v.richText.map(r => r.text).join('').trim();
  if (v.text) return String(v.text).trim();
  return String(v).trim();
}

function parseBarrierCell(text) {
  const mubIdx = text.search(/МУБ\s*:/i);
  let titlePart = text;
  let mub = '';
  if (mubIdx >= 0) {
    titlePart = text.slice(0, mubIdx).trim();
    mub = text.slice(mubIdx).replace(/^МУБ\s*:\s*/i, '').trim();
  }
  return { label: titlePart, mub };
}

function parseAppendix1(ws) {
  const raw = cellText(ws.getCell(1, 1));
  const footnote = cellText(ws.getCell(3, 1));
  const lines = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const titleLine = lines[0] || 'Перечень замкнутых пространств:';
  const title = titleLine.endsWith(':') ? titleLine : titleLine + ':';
  const items = [];
  lines.slice(1).forEach(function(line) {
    const m = line.match(/^(\d+)\.\s*(.+)$/);
    if (m) items.push({ n: +m[1], text: m[2].trim() });
  });
  return { title, items, footnote };
}

function formatAppendix2Col2(text) {
  if (!text) return '';
  return String(text)
    .replace(/\r\n/g, '\n')
    .replace(/;\s*\n-/g, ';\n-')
    .replace(/(\.\n)([А-ЯA-Z«])/g, '$1\n$2')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function mainBarrierCode(text) {
  const m = text.match(/^([A-ZА-Я]{2,4}\.\d{1,2})\./i);
  return m ? m[1] + '.' : null;
}

function parseBarrierChecklists(ws, barrierCodes) {
  const codeSet = new Set(barrierCodes);
  const maps = {};
  barrierCodes.forEach(function(code) { maps[code] = new Map(); });

  for (let r = 2; r <= ws.rowCount; r++) {
    const b = cellText(ws.getCell(r, 2));
    const c = cellText(ws.getCell(r, 3));
    if (!b) continue;
    const code = mainBarrierCode(b);
    if (!code || !codeSet.has(code)) continue;
    const map = maps[code];
    if (!map.has(b)) map.set(b, { label: b, questions: [] });
    if (c) map.get(b).questions.push(c);
  }

  const out = {};
  barrierCodes.forEach(function(code) {
    out[code] = Array.from(maps[code].values());
  });
  return out;
}

function parseAppendix2(ws) {
  const rows = [];
  for (let r = 1; r <= ws.rowCount; r++) {
    const c1 = cellText(ws.getCell(r, 1));
    const c2 = cellText(ws.getCell(r, 2));
    if (c1 || c2) rows.push({ col1: c1, col2: c2 });
  }
  const header = rows[0] || { col1: 'вид СИЗОД', col2: 'положение наготове' };
  const table = rows.slice(1).filter(function(row) {
    return row.col1 && row.col2 && !/^Исключения/i.test(row.col1);
  }).map(function(row) {
    return { col1: row.col1, col2: formatAppendix2Col2(row.col2) };
  });
  const exceptions = rows.filter(function(row) {
    return /^Исключения/i.test(row.col1) || /^Исключения/i.test(row.col2);
  });
  return {
    title: 'Приложение 2',
    header,
    table,
    exceptions: exceptions.length ? exceptions[0] : null,
  };
}

(async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(SRC);
  const ws = wb.getWorksheet('Барьеры ГАЗ');

  const title = cellText(ws.getCell(1, 1));
  const barriers = [];
  const seen = new Set();

  for (let r = 2; r <= ws.rowCount; r++) {
    const text = cellText(ws.getCell(r, 1));
    if (!text) continue;
    const codeMatch = text.match(/^([A-ZА-Я]{2,4}\.\d{1,2}(?:-в)?\.?)/i);
    if (!codeMatch) continue;
    const code = codeMatch[1].replace(/\s+$/, '');
    if (seen.has(code)) continue;
    seen.add(code);
    const parsed = parseBarrierCell(text);
    barriers.push({
      code,
      label: parsed.label,
      mub: parsed.mub,
      criteria: [],
    });
  }

  const checklists = parseBarrierChecklists(ws, barriers.map(function(b) { return b.code; }));
  barriers.forEach(function(b) {
    b.criteria = checklists[b.code] || [];
  });

  const data = {
    id: 'gaz-01',
    settingsLabel: 'Паспорт ГАЗ 01.',
    sheetTitle: title,
    barriers,
    appendix1: parseAppendix1(wb.getWorksheet('приложение 1')),
    appendix2: parseAppendix2(wb.getWorksheet('приложение 2')),
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(data, null, 2), 'utf8');
  console.log('Written', OUT, '- barriers:', barriers.length);
})();
