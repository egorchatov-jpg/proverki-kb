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
const APP11_IMG_SCRIPT = path.join(__dirname, 'build-appendix-11-image.js');
const APP12_IMG_SCRIPT = path.join(__dirname, 'build-appendix-12-image.js');
const APP21_IMG_SCRIPT = path.join(__dirname, 'build-appendix-21-image.js');
const APP51_IMG_SCRIPT = path.join(__dirname, 'build-appendix-51-image.js');
const APP52_IMG_SCRIPT = path.join(__dirname, 'build-appendix-52-image.js');
const KEEP_IMAGES = [
  'appendix-11.jpg',
  'appendix-12.jpg',
  'appendix-21.jpg',
  'appendix-51.jpg',
  'appendix-52.jpg',
];
const APPENDIX_IMAGE_SCRIPTS = [
  APP11_IMG_SCRIPT,
  APP12_IMG_SCRIPT,
  APP21_IMG_SCRIPT,
  APP51_IMG_SCRIPT,
  APP52_IMG_SCRIPT,
];

(async function() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(SRC);
  const ws = wb.getWorksheet('Барьеры ГРУЗ');
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
    {
      id: '2.1',
      label: 'Приложение 2.1.',
      sheet: 'Приложение 2.1.',
      content: {
        layout: 'imagePage',
        images: [IMG_URL + 'appendix-21.jpg'],
      },
    },
    {
      id: '5.1',
      label: 'Приложение 5.1.',
      sheet: 'Приложение 5.1.',
      content: {
        layout: 'imagePage',
        images: [IMG_URL + 'appendix-51.jpg'],
      },
    },
    {
      id: '5.2',
      label: 'Приложение 5.2.',
      sheet: 'Приложение 5.2.',
      content: {
        layout: 'imagePage',
        images: [IMG_URL + 'appendix-52.jpg'],
      },
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
  console.log('Appendix images:', KEEP_IMAGES.join(', '));
  parsed.barriers.forEach(function(b) {
    console.log(' ', b.code, 'criteria:', b.criteria.length);
  });
})();
