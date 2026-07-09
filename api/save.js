const XLSX = require('xlsx');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'egorchatov-jpg';
const GITHUB_REPO  = process.env.GITHUB_DATA_REPO || 'proverki-kb-data';

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
  { h: 'Выполнение корректирующих мероприятий',   k: 'correctiveDone'  },
  { h: 'Обоснование для оспаривания в СОКБ',       k: 'contestMeasures' },
  { h: 'Статус оспаривания в СОКБ',               k: 'contestStatus'   },
];

function ghApiUrl(fileName) {
  return `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodeURIComponent(fileName)}`;
}

const GH_HEADERS = {
  Authorization: `token ${GITHUB_TOKEN}`,
  Accept: 'application/vnd.github.v3+json',
  'User-Agent': 'proverki-kb',
};

function ghFetch(url, opts, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  return fetch(url, { ...opts, signal: ctrl.signal })
    .finally(() => clearTimeout(timer));
}

async function ghGet(fileName, timeoutMs = 8000) {
  const r = await ghFetch(ghApiUrl(fileName), { headers: GH_HEADERS }, timeoutMs);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GitHub GET "${fileName}": HTTP ${r.status}`);
  return r.json();
}

async function ghPut(fileName, base64Content, sha, message) {
  const body = { message, content: base64Content };
  if (sha) body.sha = sha;
  const r = await ghFetch(ghApiUrl(fileName), {
    method: 'PUT',
    headers: { ...GH_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, 12000);
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    const err = new Error(`GitHub PUT "${fileName}": HTTP ${r.status} — ${text}`);
    err.httpStatus = r.status; // expose status code for retry logic
    throw err;
  }
  return r.json();
}

function buildEmptyWorkbook() {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([COLUMNS.map(c => c.h)]);
  ws['!cols'] = COLUMNS.map((_, i) => ({
    wch: [4, 12, 18, 14, 18, 24, 24, 18, 20, 10, 20, 18, 40, 30, 30, 30, 24][i] || 15,
  }));
  XLSX.utils.book_append_sheet(wb, ws, 'Проверки');
  return wb;
}

// Read → modify → write with automatic retry on 409 Conflict (concurrent writes).
// GitHub returns 409 when two clients try to PUT the same file with the same SHA.
// Fix: re-GET the file to obtain the current SHA and retry up to 3 times.
async function appendRecord(fileName, record) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const existing = await ghGet(fileName);
    let wb;

    if (existing && existing.content) {
      const buf = Buffer.from(existing.content.replace(/\n/g, ''), 'base64');
      wb = XLSX.read(buf, { type: 'buffer' });
    } else {
      wb = buildEmptyWorkbook();
    }

    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

    // Dedup check: dateCheck(1)+method(3)+org(5)+obj(6)+barrier(8)+violator(11)+desc(12)
    const fp = [record.dateCheck, record.method, record.org, record.obj, record.barrier, record.violator, record.desc].join('|');
    const isDupe = rows.slice(1).some(row =>
      row[1] && [String(row[1]||''), String(row[3]||''), String(row[5]||''), String(row[6]||''), String(row[8]||''), String(row[11]||''), String(row[12]||'')].join('|') === fp
    );
    if (isDupe) {
      console.warn('[save] duplicate detected, skipping');
      return; // report success to client so it clears the retry queue
    }

    // Append new row
    XLSX.utils.sheet_add_aoa(ws, [COLUMNS.map(c => record[c.k] ?? '')], {
      origin: { r: rows.length, c: 0 },
    });

    // Sort: dateCheck asc (col 1) → org А-Я (col 5) → barrier А-Я (col 8) → method А-Я (col 3) → obj А-Я (col 6) → dateEntry desc (col 2)
    const allRows = XLSX.utils.sheet_to_json(ws, { header: 1 });
    const header = allRows[0];
    const data = allRows.slice(1).filter(row => row[1] && String(row[1]).trim());
    const toDateNum = s => { const p = (s || '').split('.'); return p.length >= 3 ? parseInt(p[2].slice(0,4) + p[1] + p[0]) : 0; };
    const toDateEntryNum = s => {
      const m = String(s || '').match(/(\d{1,2})\.(\d{1,2})\.(\d{4}),?\s*(\d{1,2}):(\d{2}):(\d{2})/);
      if (!m) return 0;
      return +m[3]*10000000000 + +m[2]*100000000 + +m[1]*1000000 + +m[4]*10000 + +m[5]*100 + +m[6];
    };
    data.sort((a, b) => {
      let d = toDateNum(a[1]) - toDateNum(b[1]);                                    // date asc
      if (d) return d;
      d = String(a[5] || '').localeCompare(String(b[5] || ''), 'ru');               // org А-Я
      if (d) return d;
      d = String(a[8] || '').localeCompare(String(b[8] || ''), 'ru');               // barrier А-Я
      if (d) return d;
      d = String(a[3] || '').localeCompare(String(b[3] || ''), 'ru');               // method А-Я
      if (d) return d;
      d = String(a[6] || '').localeCompare(String(b[6] || ''), 'ru');               // obj А-Я
      if (d) return d;
      return toDateEntryNum(b[2]) - toDateEntryNum(a[2]);                           // dateEntry desc
    });
    data.forEach((row, i) => { row[0] = i + 1; });
    const idx = data.findIndex(row => row[1] === (record.dateCheck || '') && row[2] === (record.dateEntry || ''));
    record.num = idx >= 0 ? idx + 1 : data.length;

    const newWs = XLSX.utils.aoa_to_sheet([header, ...data]);
    newWs['!cols'] = ws['!cols'];
    wb.Sheets[wb.SheetNames[0]] = newWs;

    const b64 = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }).toString('base64');
    try {
      await ghPut(
        fileName, b64, existing ? existing.sha : undefined,
        `Проверка №${record.num} — ${record.org || ''}`
      );
      return; // success
    } catch (err) {
      if (err.httpStatus === 409 && attempt < 2) {
        console.warn(`[save] 409 conflict, retry ${attempt + 1}/3`);
        continue;
      }
      throw err;
    }
  }
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!GITHUB_TOKEN) return res.status(500).json({ error: 'GITHUB_TOKEN not configured' });

  try {
    const { record } = req.body || {};
    if (!record) return res.status(400).json({ error: 'Missing record' });

    const year = record.dateCheck
      ? record.dateCheck.split('.')[2]
      : String(new Date().getFullYear());
    const fileName = `Проверки КБ ${year}.xlsx`;

    if (!record.dateEntry) {
      const now = new Date();
      const p = n => String(n).padStart(2, '0');
      record.dateEntry = `${p(now.getDate())}.${p(now.getMonth()+1)}.${now.getFullYear()}, ${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}`;
    }

    await appendRecord(fileName, record);

    // Push notifications are sent separately by the client via /api/notify,
    // so this function stays within Vercel's 10-second limit.
    return res.status(200).json({ success: true, num: record.num, year });
  } catch (err) {
    console.error('[save] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
