/**
 * Build passports/gruz-01.json (+ images) from source Excel.
 * Usage: node scripts/build-passport-gruz.js
 */
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const u = require('./passport-utils');

const SRC = 'C:/Users/egorc/KBBKSSPD/ПАСПОРТА КАРКАСЫ БЕЗОПАСНОСТИ 2026/БКС/Паспорт ГРУЗ 01.01.2026.xlsx';
const OUT = path.join(__dirname, '../passports/gruz-01.json');
const IMG_DIR = path.join(__dirname, '../passports/gruz-01/img');
const IMG_URL = 'passports/gruz-01/img/';
const APP12_IMG_SCRIPT = path.join(__dirname, 'build-appendix-12-image.js');

(async function() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(SRC);
  const ws = wb.getWorksheet('Барьеры ГРУЗ');
  const parsed = u.parseBarriersSheet(ws);

  require('child_process').execSync('node "' + APP12_IMG_SCRIPT + '"', { stdio: 'inherit' });

  if (fs.existsSync(IMG_DIR)) {
    fs.readdirSync(IMG_DIR).forEach(function(f) {
      if (f !== 'appendix-12.jpg') fs.unlinkSync(path.join(IMG_DIR, f));
    });
  }

  const allImageIds = new Set();
  ['Приложение 1.1.'].forEach(function(name) {
    const sh = wb.getWorksheet(name);
    if (!sh) return;
    sh.getImages().forEach(function(img) { allImageIds.add(img.imageId); });
  });
  const savedMap = u.saveWorkbookImages(wb, Array.from(allImageIds), IMG_DIR, IMG_URL);

  const appendices = [
    {
      id: '1.1',
      label: 'Приложение 1.1.',
      sheet: 'Приложение 1.1.',
      content: u.parseAppendix11Sheet(wb.getWorksheet('Приложение 1.1.'), savedMap),
    },
    {
      id: '1.2',
      label: 'Приложение 1.2.',
      sheet: 'Приложение 1.2.',
      content: {
        layout: 'imagePage',
        images: [IMG_URL + 'appendix-12.jpg'],
      },
    },
    {
      id: '2.1',
      label: 'Приложение 2.1.',
      sheet: 'Приложение 2.1.',
      content: u.parseAppendix21Sheet(wb.getWorksheet('Приложение 2.1.')),
    },
    {
      id: '5.1',
      label: 'Приложение 5.1.',
      sheet: 'Приложение 5.1.',
      content: u.parseTableSheet(wb.getWorksheet('Приложение 5.1.'), 2, 4),
    },
    {
      id: '5.2',
      label: 'Приложение 5.2.',
      sheet: 'Приложение 5.2.',
      content: u.parseTableSheet(wb.getWorksheet('Приложение 5.2.'), 3, 5),
    },
  ];

  const data = {
    id: 'gruz-01',
    settingsLabel: 'Паспорт ГРУЗ 01.',
    sheetTitle: parsed.title,
    barriers: parsed.barriers,
    appendices: appendices,
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(data, null, 2), 'utf8');
  console.log('Written', OUT);
  console.log('Barriers:', parsed.barriers.length);
  console.log('Images:', allImageIds.size);
  parsed.barriers.forEach(function(b) {
    console.log(' ', b.code, 'criteria:', b.criteria.length);
  });
})();
