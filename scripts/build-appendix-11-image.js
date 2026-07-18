/**
 * Copy appendix 1.1 source image into passports/gruz-01/img/.
 * Usage: node scripts/build-appendix-11-image.js
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const SRC = 'C:/Users/egorc/OneDrive/Desktop/Приложение 1.1.jpg';
const OUT = path.join(__dirname, '../passports/gruz-01/img/appendix-11.jpg');

(async function() {
  if (!fs.existsSync(SRC)) {
    console.error('Source not found:', SRC);
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  await sharp(SRC).rotate().jpeg({ quality: 92, mozjpeg: true }).toFile(OUT);
  const meta = await sharp(OUT).metadata();
  console.log('Written', OUT, meta.width + 'x' + meta.height);
})();
