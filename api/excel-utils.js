const COLUMNS = [
  { h: '№',                                       k: 'num'             },
  { h: 'ID проверки',                             k: 'checkId'         },
  { h: 'Дата проверки',                           k: 'dateCheck'       },
  { h: 'Дата внесения проверки',                  k: 'dateEntry'       },
  { h: 'Метод проверки',                          k: 'method'          },
  { h: 'Проверку выполнил',                       k: 'inspector'       },
  { h: 'Проверяемая организация',                 k: 'org'             },
  { h: 'Проверяемый объект',                      k: 'obj'             },
  { h: 'Куратор от заказчика',                    k: 'curator'         },
  { h: 'Проверяемый барьер',                      k: 'barrier'         },
  { h: 'Барьер в ПК',                             k: 'barrierInPK'     },
  { h: 'Работоспособность барьера',               k: 'works'           },
  { h: 'Нарушение допустил',                      k: 'violator'        },
  { h: 'Описание нарушения',                      k: 'desc'            },
  { h: 'Корректирующие мероприятия',              k: 'corrective'      },
  { h: 'Оспаривание в СОКБ',                      k: 'contestMeasures' },
];

const COL = {
  num: 0, checkId: 1, dateCheck: 2, dateEntry: 3, method: 4, inspector: 5, org: 6, obj: 7,
  curator: 8, barrier: 9, barrierInPK: 10, works: 11, violator: 12, desc: 13,
  corrective: 14, contestMeasures: 15,
};

function pad2(n) { return String(n).padStart(2, '0'); }

function excelSerialToDate(n) {
  return new Date((Math.floor(n) - 25569) * 86400 * 1000);
}

function normalizeDateStr(val) {
  if (val == null || val === '') return '';
  if (typeof val === 'number' && val > 30000) val = excelSerialToDate(val);
  if (val instanceof Date) {
    return `${pad2(val.getDate())}.${pad2(val.getMonth() + 1)}.${val.getFullYear()}`;
  }
  const s = String(val).trim();
  if (!s) return '';
  const dot = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (dot) return `${pad2(+dot[1])}.${pad2(+dot[2])}.${dot[3]}`;
  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slash) {
    let y = +slash[3];
    if (y < 100) y += 2000;
    return `${pad2(+slash[2])}.${pad2(+slash[1])}.${y}`;
  }
  if (/^\d+(\.\d+)?$/.test(s) && +s > 30000) {
    const d = excelSerialToDate(+s);
    if (!Number.isNaN(d.getTime())) {
      return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`;
    }
  }
  return s;
}

function toDateNum(s) {
  s = normalizeDateStr(s);
  const p = String(s || '').split('.');
  return p.length >= 3 ? parseInt(p[2].slice(0, 4) + p[1] + p[0], 10) : 0;
}

function toDateEntryNum(s) {
  const m = String(s || '').match(/(\d{1,2})\.(\d{1,2})\.(\d{4}),?\s*(\d{1,2}):(\d{2}):(\d{2})/);
  if (!m) return 0;
  return +m[3] * 10000000000 + +m[2] * 100000000 + +m[1] * 1000000 + +m[4] * 10000 + +m[5] * 100 + +m[6];
}

function buildColIdx(header) {
  const idx = {};
  COLUMNS.forEach(c => {
    const i = header.findIndex(h => String(h || '').trim() === c.h);
    if (i >= 0) idx[c.k] = i;
  });
  if (idx.corrective === undefined) {
    const ci = header.findIndex(h => {
      const lower = String(h || '').toLowerCase();
      return lower.includes('корректиру') && lower.includes('мероприят') && !lower.includes('выполнение');
    });
    if (ci >= 0) idx.corrective = ci;
  }
  if (idx.contestMeasures === undefined) {
    const ci = header.findIndex(h => {
      const lower = String(h || '').toLowerCase();
      return (lower.includes('оспаривание') || lower.includes('обоснование')) && lower.includes('сокб');
    });
    if (ci >= 0) idx.contestMeasures = ci;
  }
  return idx;
}

// Sort priority:
// 1. dateCheck asc  2. dateEntry desc  3. org  4. method  5. barrier
function sortDataRows(data, colIdx) {
  const dc = colIdx.dateCheck ?? COL.dateCheck;
  const de = colIdx.dateEntry ?? COL.dateEntry;
  const org = colIdx.org ?? COL.org;
  const method = colIdx.method ?? COL.method;
  const barrier = colIdx.barrier ?? COL.barrier;
  const num = colIdx.num ?? COL.num;

  data.sort((a, b) => {
    let d = toDateNum(a[dc]) - toDateNum(b[dc]);
    if (d) return d;
    d = toDateEntryNum(b[de]) - toDateEntryNum(a[de]);
    if (d) return d;
    d = String(a[org] || '').localeCompare(String(b[org] || ''), 'ru');
    if (d) return d;
    d = String(a[method] || '').localeCompare(String(b[method] || ''), 'ru');
    if (d) return d;
    return String(a[barrier] || '').localeCompare(String(b[barrier] || ''), 'ru');
  });
  data.forEach((row, i) => { row[num] = i + 1; });
  return data;
}

function sortAndRenumberSheet(rows) {
  if (!rows.length) return rows;
  const header = rows[0].map(h => String(h || '').trim());
  const colIdx = buildColIdx(header);
  const dc = colIdx.dateCheck ?? COL.dateCheck;
  const data = rows.slice(1).filter(row => row[dc] && String(row[dc]).trim());
  sortDataRows(data, colIdx);
  return [header, ...data];
}

function calcBarrierInPK(barriersConfig, year, barrierName) {
  const cfg = (barriersConfig || {})[year] || (barriersConfig || {})[String(year)];
  if (!cfg || !Array.isArray(cfg)) return 'Нет';
  const entry = cfg.find(b => b && b.name === barrierName);
  return (entry && entry.inPK) ? 'Да' : 'Нет';
}

function nextCheckId(dataRows, colIdx, year) {
  const yearSuffix = String(year).slice(-2).padStart(2, '0');
  const idCol = colIdx.checkId ?? COL.checkId;
  let maxSeq = 0;
  for (const row of dataRows) {
    const id = String(row[idCol] || '').trim();
    const m = id.match(/^(\d{4})(\d{2})$/);
    if (m && m[2] === yearSuffix) {
      const seq = parseInt(m[1], 10);
      if (seq > maxSeq) maxSeq = seq;
    }
  }
  return String(maxSeq + 1).padStart(4, '0') + yearSuffix;
}

function ensureCheckIdColumn(rows) {
  if (!rows.length) return [COLUMNS.map(c => c.h)];
  const header = rows[0].map(h => String(h || '').trim());
  if (header.includes('ID проверки')) return rows;
  return rows.map((row, ri) => {
    const r = [...row];
    if (ri === 0) r.splice(1, 0, 'ID проверки');
    else r.splice(1, 0, '');
    return r;
  });
}

function assignMissingCheckIds(rows, year) {
  if (!rows.length) return rows;
  const header = rows[0].map(h => String(h || '').trim());
  const colIdx = buildColIdx(header);
  const idCol = colIdx.checkId;
  if (idCol === undefined) return rows;
  const deCol = colIdx.dateEntry ?? COL.dateEntry;
  const yearSuffix = String(year).slice(-2).padStart(2, '0');
  const data = rows.slice(1);
  let maxSeq = 0;
  data.forEach(row => {
    const id = String(row[idCol] || '').trim();
    const m = id.match(/^(\d{4})(\d{2})$/);
    if (m && m[2] === yearSuffix) maxSeq = Math.max(maxSeq, parseInt(m[1], 10));
  });
  const missing = data.filter(row => !String(row[idCol] || '').trim());
  missing.sort((a, b) => toDateEntryNum(a[deCol]) - toDateEntryNum(b[deCol]));
  missing.forEach(row => {
    maxSeq += 1;
    while (row.length <= idCol) row.push('');
    row[idCol] = String(maxSeq).padStart(4, '0') + yearSuffix;
  });
  return rows;
}

function applyBarrierInPK(rows, barriersConfig, defaultYear) {
  if (!rows.length || !barriersConfig) return rows;
  const header = rows[0];
  const colIdx = buildColIdx(header);
  const dc = colIdx.dateCheck ?? COL.dateCheck;
  const barrier = colIdx.barrier ?? COL.barrier;
  const barrierInPK = colIdx.barrierInPK ?? COL.barrierInPK;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    while (row.length <= barrierInPK) row.push('');
    const dateCheck = String(row[dc] || '');
    const parts = dateCheck.split('.');
    const year = parts.length >= 3 ? parts[2].slice(0, 4) : String(defaultYear || '');
    const bName = String(row[barrier] || '').trim();
    row[barrierInPK] = calcBarrierInPK(barriersConfig, year, bName);
  }
  return rows;
}

module.exports = {
  COLUMNS,
  COL,
  buildColIdx,
  normalizeDateStr,
  toDateNum,
  toDateEntryNum,
  sortDataRows,
  sortAndRenumberSheet,
  applyBarrierInPK,
  calcBarrierInPK,
  nextCheckId,
  ensureCheckIdColumn,
  assignMissingCheckIds,
};
