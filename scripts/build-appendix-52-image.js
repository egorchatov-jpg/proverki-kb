/**
 * Copy appendix 5.2 source image into passports/gruz-01/img/.
 * Usage: node scripts/build-appendix-52-image.js
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const SRC = 'C:/Users/egorc/OneDrive/Desktop/Приложение 5.2.jpg';
const OUT = path.join(__dirname, '../passports/gruz-01/img/appendix-52.jpg');

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
