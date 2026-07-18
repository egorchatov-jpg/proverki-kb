/**
 * Build passports/dtp-01.json (+ images) from source Excel.
 * Usage: node scripts/build-passport-dtp.js
 */
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const u = require('./passport-utils');

const SRC = 'C:/Users/egorc/KBBKSSPD/ПАСПОРТА КАРКАСЫ БЕЗОПАСНОСТИ 2026/БКС/Паспорт ДТП 01.01.2026.xlsx';
const OUT = path.join(__dirname, '../passports/dtp-01.json');
const IMG_DIR = path.join(__dirname, '../passports/dtp-01/img');
const IMG_URL = 'passports/dtp-01/img/';
const APPENDIX_IMAGE_SCRIPTS = [
  path.join(__dirname, 'build-appendix-41-image.js'),
  path.join(__dirname, 'build-appendix-71-image.js'),
  path.join(__dirname, 'build-appendix-81-image.js'),
];
const KEEP_IMAGES = ['appendix-41.jpg', 'appendix-71.jpg', 'appendix-81.jpg'];

(async function() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(SRC);
  const ws = wb.getWorksheet('Барьеры ДТП');
  if (!ws) {
    console.error('Sheet not found: Барьеры ДТП');
    process.exit(1);
  }
  const parsed = u.parseBarriersSheet(ws);

  APPENDIX_IMAGE_SCRIPTS.forEach(function(script) {
    try {
      require('child_process').execSync('node "' + script + '"', { stdio: 'inherit' });
    } catch (e) {
      console.warn('Skipped:', path.basename(script));
    }
  });

  if (fs.existsSync(IMG_DIR)) {
    fs.readdirSync(IMG_DIR).forEach(function(f) {
      if (KEEP_IMAGES.indexOf(f) < 0) fs.unlinkSync(path.join(IMG_DIR, f));
    });
  }

  const appendices = [
    {
      id: '4.1',
      label: 'Приложение 4.1.',
      sheet: 'Приложение №4.1.',
      content: {
        layout: 'imagePage',
        images: fs.existsSync(path.join(IMG_DIR, 'appendix-41.jpg'))
          ? [IMG_URL + 'appendix-41.jpg']
          : [],
      },
    },
    {
      id: '7.1',
      label: 'Приложение 7.1.',
      sheet: 'Приложение №7.1.',
      content: {
        layout: 'imagePage',
        images: fs.existsSync(path.join(IMG_DIR, 'appendix-71.jpg'))
          ? [IMG_URL + 'appendix-71.jpg']
          : [],
      },
    },
    {
      id: '8.1',
      label: 'Приложение 8.1.',
      sheet: 'Приложение 8.1.',
      content: {
        layout: 'imagePage',
        images: fs.existsSync(path.join(IMG_DIR, 'appendix-81.jpg'))
          ? [IMG_URL + 'appendix-81.jpg']
          : [],
      },
    },
  ];

  const data = {
    id: 'dtp-01',
    settingsLabel: 'Паспорт ДТП 01.',
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
