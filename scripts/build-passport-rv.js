/**
 * Build passports/rv-01.json (+ images) from source Excel.
 * Usage: node scripts/build-passport-rv.js
 */
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const u = require('./passport-utils');

const SRC = 'C:/Users/egorc/KBBKSSPD/ПАСПОРТА КАРКАСЫ БЕЗОПАСНОСТИ 2026/БКС/Паспорт РВ 01.01.2026.xlsx';
const OUT = path.join(__dirname, '../passports/rv-01.json');
const IMG_DIR = path.join(__dirname, '../passports/rv-01/img');
const IMG_URL = 'passports/rv-01/img/';
const APPENDIX_IMAGE_SCRIPTS = [
  path.join(__dirname, 'build-rv-appendix-11-image.js'),
  path.join(__dirname, 'build-rv-appendix-12-image.js'),
];
const KEEP_IMAGES = ['appendix-11.jpg', 'appendix-12.jpg'];

(async function() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(SRC);
  const ws = wb.getWorksheet('Барьеры РВ');
  if (!ws) {
    console.error('Sheet not found: Барьеры РВ');
    process.exit(1);
  }
  const parsed = u.parseBarriersSheet(ws);

  APPENDIX_IMAGE_SCRIPTS.forEach(function(script) {
    require('child_process').execSync('node "' + script + '"', { stdio: 'inherit' });
  });

  if (fs.existsSync(IMG_DIR)) {
    fs.readdirSync(IMG_DIR).forEach(function(f) {
      if (KEEP_IMAGES.indexOf(f) < 0) fs.unlinkSync(path.join(IMG_DIR, f));
    });
  }

  const appendices = [
    {
      id: '1.1',
      label: 'Приложение 1.1.',
      sheet: 'Приложение 1.1.',
      content: {
        layout: 'imagePage',
        images: [IMG_URL + 'appendix-11.jpg'],
      },
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
  ];

  const data = {
    id: 'rv-01',
    settingsLabel: 'Паспорт РВ 01.',
    sheetTitle: parsed.title,
    barriers: parsed.barriers,
    appendices: appendices,
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(data, null, 2), 'utf8');
  console.log('Written', OUT);
  console.log('Barriers:', parsed.barriers.length);
  console.log('Appendices:', appendices.length);
  parsed.barriers.forEach(function(b) {
    console.log(' ', b.code, 'criteria:', b.criteria.length);
  });
})();
