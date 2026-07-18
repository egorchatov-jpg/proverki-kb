const ExcelJS = require('exceljs');
const SRC = 'C:/Users/egorc/KBBKSSPD/ПАСПОРТА КАРКАСЫ БЕЗОПАСНОСТИ 2026/БКС/Паспорт ГАЗ 01.01.2026.xlsx';

function cellText(cell) {
  const v = cell.value;
  if (v == null) return '';
  if (typeof v === 'string' || typeof v === 'number') return String(v).trim();
  if (v.richText) return v.richText.map(r => r.text).join('').trim();
  if (v.text) return String(v.text).trim();
  return String(v).trim();
}

function rawCell(cell) {
  const v = cell.value;
  if (v == null) return '';
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  if (v.richText) return v.richText.map(r => r.text).join('');
  if (v.text) return String(v.text);
  return String(v);
}

(async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(SRC);
  const ws = wb.getWorksheet('Барьеры ГАЗ');
  const issues = [];

  for (let r = 1; r <= ws.rowCount; r++) {
    ['A','B','C'].forEach((col, ci) => {
      const idx = ci + 1;
      if (idx === 1 && r > 1) return;
      const raw = rawCell(ws.getCell(r, idx));
      const text = cellText(ws.getCell(r, idx));
      if (!text && !raw) return;
      const loc = col + r;
      if (/  +/.test(raw)) issues.push({ loc, kind: 'двойной (лишний) пробел', text: text.slice(0, 90) });
      if (/ \./.test(raw)) issues.push({ loc, kind: 'пробел перед точкой', text: text.slice(0, 90) });
      if (/ ,/.test(raw)) issues.push({ loc, kind: 'пробел перед запятой', text: text.slice(0, 90) });
      if (/ ;/.test(raw)) issues.push({ loc, kind: 'пробел перед ;', text: text.slice(0, 90) });
      if (/ :(?!\s)/.test(raw.replace(/\d+\.\d+\./g, '')) === false && / [;:](?!\d)/.test(raw)) {
        if (/ :/.test(raw)) issues.push({ loc, kind: 'пробел перед двоеточием', text: text.slice(0, 90) });
      }
      if (/\u00a0/.test(raw)) issues.push({ loc, kind: 'неразрывный пробел (NBSP)', text: text.slice(0, 90) });
      if (/\d\.\.[A-ZА-Я]/.test(text)) issues.push({ loc, kind: 'нет пробела после номера критерия', text: text.slice(0, 90) });
      if (/\.[A-ZА-Я]/.test(text.replace(/ГАЗ\.\d+\.\d+\./g, ''))) {
        const m = text.match(/\d\.\d+\.([A-ZА-Я])/);
        if (m) issues.push({ loc, kind: 'нет пробела после «ГАЗ.xx.y.»', text: text.slice(0, 90) });
      }
    });
  }

  // Specific grammar checks on B column
  for (let r = 2; r <= ws.rowCount; r++) {
    const b = cellText(ws.getCell(r, 2));
    if (!b) continue;
    if (/работы замкнутом/i.test(b)) issues.push({ loc: 'B'+r, kind: 'грамматика: пропущено «в» → «работы в замкнутом»', text: b.slice(0, 90) });
    if (/т\.ч\.скребки/i.test(b)) issues.push({ loc: 'B'+r, kind: 'нет пробела после «т.ч.»', text: b.slice(0, 90) });
    if (/ДО ГПН\s\/\sДО/.test(b) && !/ДО ГПН\/ ДО/.test(b)) { /* ok */ }
  }

  const seen = new Set();
  const uniq = issues.filter(i => {
    const k = i.loc + i.kind;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  console.log(JSON.stringify(uniq, null, 2));
})();
