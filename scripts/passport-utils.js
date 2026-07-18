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
    byCell[key].push(img.imageId);
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

function cellFillKind(cell) {
  const f = cell.fill;
  if (!f || f.type !== 'pattern' || !f.fgColor) return 'item';
  if (f.fgColor.argb && f.fgColor.argb.toUpperCase().endsWith('FFC000')) return 'title';
  if (f.fgColor.theme === 0) return 'section';
  return 'item';
}

function parseCellTextParts(cell) {
  const v = cell.value;
  if (!v || !v.richText || v.richText.length < 2) {
    const text = cellText(cell);
    return { text: text, textAfter: '' };
  }
  const first = normalizeSpacing(v.richText[0].text || '').replace(/\n+$/, '');
  const rest = normalizeSpacing(
    v.richText.slice(1).map(function(r) { return r.text || ''; }).join('')
  );
  const small = v.richText.slice(1).some(function(r) { return r.font && r.font.size && r.font.size < 10; });
  return { text: first, textAfter: rest, textAfterSmall: small };
}

function parseAppendix11Sheet(ws, savedMap) {
  const byCell = collectSheetImages(ws);
  const rows = [];

  for (let r = 1; r <= ws.rowCount; r++) {
    const cell = ws.getCell(r, 1);
    const parts = parseCellTextParts(cell);
    const images = resolveImages(byCell[imageCellKey(r, 1)], savedMap);
    if (!parts.text && !parts.textAfter && !images.length) continue;
    const kind = cellFillKind(cell);
    rows.push({
      kind: kind,
      text: parts.text,
      textAfter: parts.textAfter,
      textAfterSmall: !!parts.textAfterSmall,
      images: images,
    });
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

function colLettersToNum(letters) {
  let n = 0;
  for (let i = 0; i < letters.length; i++) {
    n = n * 26 + (letters.charCodeAt(i) - 64);
  }
  return n;
}

function parseMergeRange(range) {
  const m = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(range);
  if (!m) return null;
  return {
    r1: parseInt(m[2], 10),
    c1: colLettersToNum(m[1]),
    r2: parseInt(m[4], 10),
    c2: colLettersToNum(m[3]),
  };
}

function buildMergeMap(ws) {
  const masters = {};
  const covered = new Set();
  (ws.model.merges || []).forEach(function(range) {
    const m = parseMergeRange(range);
    if (!m) return;
    masters[m.r1 + ':' + m.c1] = {
      rowspan: m.r2 - m.r1 + 1,
      colspan: m.c2 - m.c1 + 1,
      r1: m.r1, c1: m.c1, r2: m.r2, c2: m.c2,
    };
    for (let r = m.r1; r <= m.r2; r++) {
      for (let c = m.c1; c <= m.c2; c++) {
        if (r !== m.r1 || c !== m.c1) covered.add(r + ':' + c);
      }
    }
  });
  return { masters: masters, covered: covered };
}

function cellFontColor(cell) {
  const c = cell.font && cell.font.color;
  if (!c || !c.argb) return null;
  return '#' + c.argb.slice(2).toLowerCase();
}

function cellStyleKind12(cell, text, col) {
  const f = cell.fill;
  if (!f || f.type !== 'pattern' || !f.fgColor) return 'white';
  const fg = f.fgColor;
  if (fg.theme === 5) return 'orange';
  if (fg.theme === 4) {
    if (/^Шаг 1\./.test(text || '')) return 'step-light';
    return 'step';
  }
  if (fg.theme === 2) return 'note';
  if (fg.theme === 0 && fg.tint != null && fg.tint < 0) {
    if (col === 1 && /Условие расчета/i.test(text || '')) return 'sidebar';
    return 'note';
  }
  if (fg.theme === 0 && col === 1) return 'sidebar';
  return 'white';
}

function imagesAtCell(byCell, savedMap, r, c) {
  const ids = byCell[imageCellKey(r, c)] || [];
  return ids.map(function(id) { return savedMap[id]; }).filter(Boolean);
}

function imagesInRangeAll(byCell, savedMap, r1, c1, r2, c2) {
  const out = [];
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      const ids = byCell[imageCellKey(r, c)] || [];
      ids.forEach(function(id) {
        const url = savedMap[id];
        if (url) out.push(url);
      });
    }
  }
  return out;
}

function buildSubgrid(byCell, savedMap, r1, c1, r2, c2) {
  const rows = [];
  for (let r = r1; r <= r2; r++) {
    const cells = [];
    for (let c = c1; c <= c2; c++) {
      cells.push({
        text: '',
        images: imagesAtCell(byCell, savedMap, r, c),
        align: 'center',
        valign: 'middle',
      });
    }
    rows.push({ cells: cells });
  }
  return rows;
}

function parseAppendix12Sheet(ws, savedMap) {
  const byCell = collectSheetImages(ws);
  const merge = buildMergeMap(ws);
  const maxCol = 3;
  const startRow = 2;
  const rows = [];

  for (let r = startRow; r <= ws.rowCount; r++) {
    const cells = [];
    for (let c = 1; c <= maxCol; c++) {
      if (merge.covered.has(r + ':' + c)) continue;
      const master = merge.masters[r + ':' + c];
      const r2 = master ? master.r2 : r;
      const c2 = master ? master.c2 : c;
      const cell = ws.getCell(r, c);
      const text = cellText(cell);
      const rowspan = master ? master.rowspan : 1;
      const colspan = master ? master.colspan : 1;
      const styleKind = cellStyleKind12(cell, text, c);
      const alignment = cell.alignment || {};
      let align = alignment.horizontal || 'left';
      if (/^ЗГ\s*[×x]\s*/.test(text || '')) align = 'center';
      if (styleKind === 'sidebar') align = 'center';

      let images = [];
      let subgrid = null;
      let imagesWrap = false;
      const subRows = r2 - r + 1;
      const subCols = c2 - c + 1;

      if (!text && subRows > 1 && subCols > 1) {
        subgrid = buildSubgrid(byCell, savedMap, r, c, r2, c2);
      } else if (!text && subRows === 1 && subCols === 3) {
        subgrid = buildSubgrid(byCell, savedMap, r, c, r2, c2);
      } else if (!text && (subRows > 1 || subCols > 1)) {
        images = imagesInRangeAll(byCell, savedMap, r, c, r2, c2);
        if (images.length > 2) imagesWrap = true;
      } else {
        images = imagesAtCell(byCell, savedMap, r, c);
      }

      if (!text && !images.length && !subgrid) {
        if (rowspan === 1 && colspan === 1) continue;
        const hasSubContent = subgrid && subgrid.some(function(sr) {
          return sr.cells.some(function(sc) { return sc.images && sc.images.length; });
        });
        if (!hasSubContent) continue;
      }

      cells.push({
        colspan: colspan,
        rowspan: rowspan,
        text: text,
        images: subgrid ? [] : images,
        subgrid: subgrid,
        imagesWrap: imagesWrap,
        style: styleKind,
        bold: !!(cell.font && cell.font.bold),
        color: styleKind === 'sidebar' ? '#0070c0' : cellFontColor(cell),
        align: align,
        valign: alignment.vertical || (styleKind === 'sidebar' ? 'middle' : 'top'),
      });
    }
    if (cells.length) rows.push({ cells: cells });
  }

  return { layout: 'excelGrid', colCount: maxCol, gridKind: 'sheet12', rows: rows };
}

function parseAppendix21Sheet(ws) {
  const merge = buildMergeMap(ws);
  const maxCol = 2;
  const rows = [];

  for (let r = 2; r <= ws.rowCount; r++) {
    const cells = [];
    for (let c = 1; c <= maxCol; c++) {
      if (merge.covered.has(r + ':' + c)) continue;
      const master = merge.masters[r + ':' + c];
      const cell = ws.getCell(r, c);
      const text = cellText(cell);
      if (!text) continue;
      const isHeader = r === 2;
      cells.push({
        colspan: master ? master.colspan : 1,
        rowspan: master ? master.rowspan : 1,
        text: text,
        images: [],
        style: isHeader ? 'header-yellow' : (c === 1 ? 'num' : 'white'),
        bold: !!(cell.font && cell.font.bold) || isHeader,
        align: isHeader ? 'center' : (c === 1 ? 'center' : 'left'),
        valign: isHeader ? 'middle' : (c === 1 ? 'middle' : 'top'),
      });
    }
    if (cells.length) rows.push({ cells: cells });
  }

  return { layout: 'excelGrid', colCount: maxCol, gridKind: 'numTable', rows: rows };
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
  parseAppendix12Sheet,
  parseAppendix21Sheet,
  parseTwoColGallery,
  parseFlowSheet,
  parseNumberedList,
  parseTableSheet,
  readRowCells,
};
