/**
 * Crop and stitch appendix 1.2 reference images.
 * Usage: node scripts/build-appendix-12-image.js
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const SRC1 = 'C:/Users/egorc/.cursor/projects/c-Users-egorc-proverki-kb/assets/c__Users_egorc_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_image-03dc72e9-96b8-4aed-bf38-c68c1f198149.png';
const SRC2 = 'C:/Users/egorc/.cursor/projects/c-Users-egorc-proverki-kb/assets/c__Users_egorc_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_image-78ba3407-f848-4266-a1b5-2a96e5ac6daa.png';
const OUT = path.join(__dirname, '../passports/gruz-01/img/appendix-12.png');

async function trimImage(src) {
  const img = sharp(src);
  const meta = await img.metadata();
  const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const ch = info.channels;

  function isWhite(r, g, b, a) {
    if (a < 16) return true;
    return r > 248 && g > 248 && b > 248;
  }

  let top = h;
  let left = w;
  let bottom = 0;
  let right = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * ch;
      if (!isWhite(data[i], data[i + 1], data[i + 2], data[i + 3])) {
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  }

  if (bottom < top) {
    return sharp(src);
  }

  const pad = 2;
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
  const part1 = await trimImage(SRC1);
  const part2 = await trimImage(SRC2);
  const buf1 = await part1.png().toBuffer();
  const buf2 = await part2.png().toBuffer();
  const m1 = await sharp(buf1).metadata();
  const m2 = await sharp(buf2).metadata();
  const width = Math.max(m1.width, m2.width);

  const norm1 = await sharp(buf1)
    .extend({ top: 0, bottom: 0, left: 0, right: width - m1.width, background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .png()
    .toBuffer();
  const norm2 = await sharp(buf2)
    .extend({ top: 0, bottom: 0, left: 0, right: width - m2.width, background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .png()
    .toBuffer();

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  await sharp({
    create: {
      width: width,
      height: m1.height + m2.height,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite([
      { input: norm1, top: 0, left: 0 },
      { input: norm2, top: m1.height, left: 0 },
    ])
    .png()
    .toFile(OUT);

  const outMeta = await sharp(OUT).metadata();
  console.log('Written', OUT, outMeta.width + 'x' + outMeta.height);
})();
