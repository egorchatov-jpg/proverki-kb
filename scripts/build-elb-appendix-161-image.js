/**
 * Copy ELB appendix 16.1 source image into passports/elb-01/img/.
 * Usage: node scripts/build-elb-appendix-161-image.js
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const SRC = 'C:/Users/egorc/OneDrive/Desktop/Приложение 16.1.jpg';
const OUT = path.join(__dirname, '../passports/elb-01/img/appendix-161.jpg');

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
