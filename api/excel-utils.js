const COLUMNS = [
  { h: '№',                                       k: 'num'             },
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
  num: 0, dateCheck: 1, dateEntry: 2, method: 3, inspector: 4, org: 5, obj: 6,
  curator: 7, barrier: 8, barrierInPK: 9, works: 10, violator: 11, desc: 12,
  corrective: 13, contestMeasures: 14,
};

function toDateNum(s) {
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
  toDateNum,
  toDateEntryNum,
  sortDataRows,
  sortAndRenumberSheet,
  applyBarrierInPK,
  calcBarrierInPK,
};
