const fs = require('fs');
const path = require('path');

function normalizeSpacing(text) {
  if (text == null || text === '') return '';
  return String(text)
    .replace(/\u00a0/g, ' ')
    .split(/\r?\n/)
    .map(function(line) {
      return line
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/ ([.,;:])/g, '$1')
        .replace(/ \)/g, ')')
        .trim();
    })
    .join('\n')
    .trim();
}

function cellText(cell) {
  const v = cell.value;
  if (v == null) return '';
  let s = '';
  if (typeof v === 'string' || typeof v === 'number') s = String(v);
  else if (v.richText) s = v.richText.map(function(r) { return r.text; }).join('');
  else if (v.text) s = String(v.text);
  else if (v.result != null) s = String(v.result);
  else s = String(v);
  return normalizeSpacing(s);
}

function parseBarrierCell(text) {
  const mubIdx = text.search(/МУБ\s*:/i);
  let titlePart = text;
  let mub = '';
  if (mubIdx >= 0) {
    titlePart = text.slice(0, mubIdx).trim();
    mub = text.slice(mubIdx).replace(/^МУБ\s*:\s*/i, '').trim();
  }
  return { label: titlePart, mub: mub };
}

function mainBarrierCode(text) {
  const m = text.match(/^([A-ZА-Я]{2,4}\.\d{1,2})\./i);
  return m ? m[1] + '.' : null;
}

function parseBarrierChecklists(ws, barrierCodes) {
  const codeSet = new Set(barrierCodes);
  const maps = {};
  barrierCodes.forEach(function(code) { maps[code] = new Map(); });

  for (let r = 2; r <= ws.rowCount; r++) {
    const b = cellText(ws.getCell(r, 2));
    const c = cellText(ws.getCell(r, 3));
    if (!b) continue;
    const code = mainBarrierCode(b);
    if (!code || !codeSet.has(code)) continue;
    const map = maps[code];
    if (!map.has(b)) map.set(b, { label: b, questions: [] });
    if (c) map.get(b).questions.push(c);
  }

  const out = {};
  barrierCodes.forEach(function(code) {
    out[code] = Array.from(maps[code].values());
  });
  return out;
}

function parseBarriersSheet(ws) {
  const title = cellText(ws.getCell(1, 1));
  const barriers = [];
  const seen = new Set();

  for (let r = 2; r <= ws.rowCount; r++) {
    const text = cellText(ws.getCell(r, 1));
    if (!text) continue;
    const codeMatch = text.match(/^([A-ZА-Я]{2,4}\.\d{1,2}(?:-в)?\.?)/i);
    if (!codeMatch) continue;
    const code = codeMatch[1].replace(/\s+$/, '');
    if (seen.has(code)) continue;
    seen.add(code);
    const parsed = parseBarrierCell(text);
    barriers.push({
      code: code,
      label: parsed.label,
      mub: parsed.mub,
      criteria: [],
    });
  }

  const checklists = parseBarrierChecklists(ws, barriers.map(function(b) { return b.code; }));
  barriers.forEach(function(b) {
    b.criteria = checklists[b.code] || [];
  });

  return { title: title, barriers: barriers };
}

function imageCellKey(row, col) {
  return row + ':' + col;
}

function collectSheetImages(ws) {
  const byCell = {};
  ws.getImages().forEach(function(img) {
    const tl = img.range.tl;
    const row = (tl.nativeRow != null ? tl.nativeRow : tl.row) + 1;
    const col = (tl.nativeCol != null ? tl.nativeCol : tl.col) + 1;
    const key = imageCellKey(row, col);
    if (!byCell[key]) byCell[key] = [];
    if (byCell[key].indexOf(img.imageId) < 0) byCell[key].push(img.imageId);
  });
  return byCell;
}

function saveWorkbookImages(wb, imageIds, outDir, urlPrefix) {
  fs.mkdirSync(outDir, { recursive: true });
  const map = {};
  imageIds.forEach(function(id) {
    if (map[id] != null) return;
    const imgData = wb.getImage(id);
    const ext = imgData.extension || 'png';
    const fname = id + '.' + ext;
    fs.writeFileSync(path.join(outDir, fname), imgData.buffer);
    map[id] = urlPrefix + fname;
  });
  return map;
}

function resolveImages(ids, savedMap) {
  return (ids || []).map(function(id) { return savedMap[id]; }).filter(Boolean);
}

function imagesNearRow(byCell, savedMap, row, cols, depth) {
  depth = depth || 3;
  const out = {};
  cols.forEach(function(col) {
    const imgs = [];
    for (let dr = 0; dr <= depth; dr++) {
      const ids = byCell[imageCellKey(row + dr, col)];
      if (ids) ids.forEach(function(id) {
        const url = savedMap[id];
        if (url && imgs.indexOf(url) < 0) imgs.push(url);
      });
    }
    if (imgs.length) out[col] = imgs;
  });
  return out;
}

function parseAppendix11Sheet(ws, savedMap) {
  const byCell = collectSheetImages(ws);
  const rows = [];

  for (let r = 1; r <= ws.rowCount; r++) {
    const text = cellText(ws.getCell(r, 1));
    const images = resolveImages(byCell[imageCellKey(r, 1)], savedMap);
    if (!text && !images.length) continue;
    rows.push({ text: text, images: images });
  }

  return { layout: 'excelColumn', rows: rows };
}

function parseTwoColGallery(ws, wb, savedMap) {
  const byCell = collectSheetImages(ws);
  const title = cellText(ws.getCell(1, 2)) || cellText(ws.getCell(1, 1));
  let docHeading = null;
  const sections = [];
  let current = null;

  for (let r = 2; r <= ws.rowCount; r++) {
    const c1 = cellText(ws.getCell(r, 1));
    const c2 = cellText(ws.getCell(r, 2));
    if (!c1 && !c2) continue;

    if (c1 && c1 === c2 && /^[A-ZА-Я]/.test(c1) && !/^\d/.test(c1)) {
      if (!docHeading && /^КРИТЕРИИ/i.test(c1)) {
        docHeading = c1;
        continue;
      }
      current = { heading: c1, pairs: [], notes: [] };
      sections.push(current);
      continue;
    }

    if (c1 && c2 && /^\d/.test(c1)) {
      if (!current) {
        current = { heading: '', pairs: [], notes: [] };
        sections.push(current);
      }
      const near = imagesNearRow(byCell, savedMap, r, [1, 2]);
      current.pairs.push({
        left: { text: c1, images: near[1] || [] },
        right: { text: c2, images: near[2] || [] },
      });
      continue;
    }

    if (c1 && !c2) {
      if (!current) {
        current = { heading: '', pairs: [], notes: [] };
        sections.push(current);
      }
      const near = imagesNearRow(byCell, savedMap, r, [1]);
      current.notes.push({ text: c1, images: near[1] || [] });
    }
  }

  return { layout: 'twoColGallery', title: title, heading: docHeading, sections: sections };
}

function readRowCells(ws, r, maxCol) {
  const cells = [];
  for (let c = 1; c <= maxCol; c++) cells.push(cellText(ws.getCell(r, c)));
  return cells;
}

function parseFlowSheet(ws, wb, savedMap, maxCol) {
  const byCell = collectSheetImages(ws);
  const title = cellText(ws.getCell(1, 1)) || cellText(ws.getCell(1, 2)) || cellText(ws.getCell(1, maxCol));
  const blocks = [];

  for (let r = 1; r <= ws.rowCount; r++) {
    const cells = readRowCells(ws, r, maxCol);
    if (!cells.some(Boolean)) continue;

    const rowImages = {};
    for (let c = 1; c <= maxCol; c++) {
      const imgs = resolveImages(byCell[imageCellKey(r, c)], savedMap);
      if (imgs.length) rowImages[c] = imgs;
    }

    const nonEmpty = cells.map(function(t, i) { return t ? { col: i + 1, text: t } : null; }).filter(Boolean);
    if (!nonEmpty.length && !Object.keys(rowImages).length) continue;

    if (r === 1 && nonEmpty.length === 1) {
      blocks.push({ type: 'subtitle', text: nonEmpty[0].text });
      continue;
    }

    const allSame = nonEmpty.length > 1 && nonEmpty.every(function(x) { return x.text === nonEmpty[0].text; });
    if (allSame) {
      blocks.push({
        type: 'banner',
        text: nonEmpty[0].text,
        images: Object.keys(rowImages).reduce(function(acc, k) { return acc.concat(rowImages[k]); }, []),
      });
      continue;
    }

    blocks.push({ type: 'row', cells: nonEmpty, images: rowImages });
  }

  return { layout: 'flow', title: title, maxCol: maxCol, blocks: blocks };
}

function parseNumberedList(ws) {
  const title = cellText(ws.getCell(1, 2)) || cellText(ws.getCell(1, 1));
  const heading = cellText(ws.getCell(2, 1)) || cellText(ws.getCell(2, 2));
  const items = [];
  for (let r = 3; r <= ws.rowCount; r++) {
    const num = cellText(ws.getCell(r, 1));
    const text = cellText(ws.getCell(r, 2)) || cellText(ws.getCell(r, 3));
    if (!text) continue;
    items.push({ num: num, text: text });
  }
  return { layout: 'numberedList', title: title, heading: heading, items: items };
}

function parseTableSheet(ws, headerRows, dataStartRow) {
  const title = cellText(ws.getCell(1, 2)) || cellText(ws.getCell(1, 1));
  const maxCol = ws.columnCount;
  const headers = [];
  for (let hr = 2; hr <= headerRows; hr++) {
    const row = readRowCells(ws, hr, maxCol).filter(Boolean);
    if (row.length) headers.push(row);
  }
  const rows = [];
  for (let r = dataStartRow; r <= ws.rowCount; r++) {
    const row = readRowCells(ws, r, maxCol);
    if (!row.some(Boolean)) continue;
    rows.push(row);
  }
  return { layout: 'table', title: title, headers: headers, rows: rows };
}

module.exports = {
  normalizeSpacing,
  cellText,
  parseBarrierCell,
  mainBarrierCode,
  parseBarrierChecklists,
  parseBarriersSheet,
  collectSheetImages,
  saveWorkbookImages,
  parseAppendix11Sheet,
  parseTwoColGallery,
  parseFlowSheet,
  parseNumberedList,
  parseTableSheet,
  readRowCells,
};
