/**
 * Fix double spaces and spaces before punctuation in GAZ passport Excel.
 * Usage: node scripts/fix-passport-gaz-spacing.js
 */
const ExcelJS = require('exceljs');

const SRC = 'C:/Users/egorc/KBBKSSPD/ПАСПОРТА КАРКАСЫ БЕЗОПАСНОСТИ 2026/БКС/Паспорт ГАЗ 01.01.2026.xlsx';

function normalizeSpacing(text) {
  if (text == null || text === '') return text;
  return String(text)
    .replace(/\u00a0/g, ' ')
    .split(/\r?\n/)
    .map(function(line) {
      return line
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/ ([.,;:])/g, '$1')
        .replace(/ \)/g, ')')
        .trim();
    })
    .join('\n')
    .trim();
}

function cellRaw(cell) {
  const v = cell.value;
  if (v == null) return '';
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  if (v.richText) return v.richText.map(function(r) { return r.text; }).join('');
  if (v.text) return String(v.text);
  return String(v);
}

function setCellText(cell, text) {
  if (!text) {
    cell.value = null;
    return;
  }
  cell.value = text;
}

(async function() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(SRC);
  const ws = wb.getWorksheet('Барьеры ГАЗ');
  let fixed = 0;

  for (let r = 1; r <= ws.rowCount; r++) {
    for (let c = 1; c <= 3; c++) {
      const cell = ws.getCell(r, c);
      const raw = cellRaw(cell);
      if (!raw) continue;
      const norm = normalizeSpacing(raw);
      if (norm !== raw) {
        setCellText(cell, norm);
        fixed++;
        console.log('fixed', String.fromCharCode(64 + c) + r);
      }
    }
  }

  await wb.xlsx.writeFile(SRC);
  console.log('Done. Cells fixed:', fixed);
})().catch(function(err) {
  if (err.code === 'EBUSY') {
    console.error('Excel file is open — close it and run again.');
    console.error('JSON is still normalized on build via build-passport-gaz.js');
    process.exit(1);
  }
  throw err;
});
