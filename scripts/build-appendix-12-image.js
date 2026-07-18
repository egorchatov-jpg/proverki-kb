/**
 * Crop appendix 1.2 reference image to visible bounds.
 * Usage: node scripts/build-appendix-12-image.js
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const SRC = 'C:/Users/egorc/.cursor/projects/c-Users-egorc-proverki-kb/assets/c__Users_egorc_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_image-0b7605fe-e155-44c1-a1be-6a3482d80673.png';
const OUT = path.join(__dirname, '../passports/gruz-01/img/appendix-12.png');

function isBorder(r, g, b, a) {
  if (a < 16) return true;
  if (r > 248 && g > 248 && b > 248) return true;
  if (r < 12 && g < 12 && b < 12) return true;
  return false;
}

async function trimImage(src) {
  const img = sharp(src);
  const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const ch = info.channels;

  let top = h;
  let left = w;
  let bottom = 0;
  let right = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * ch;
      if (!isBorder(data[i], data[i + 1], data[i + 2], data[i + 3])) {
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  }

  if (bottom < top) return sharp(src);

  const pad = 1;
  left = Math.max(0, left - pad);
  top = Math.max(0, top - pad);
  right = Math.min(w - 1, right + pad);
  bottom = Math.min(h - 1, bottom + pad);

  return sharp(src).extract({
    left: left,
    top: top,
    width: right - left + 1,
    height: bottom - top + 1,
  });
}

(async function() {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const trimmed = await trimImage(SRC);
  await trimmed.png().toFile(OUT);
  const meta = await sharp(OUT).metadata();
  console.log('Written', OUT, meta.width + 'x' + meta.height);
})();
