const XLSX     = require('xlsx');
const webpush  = require('web-push');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'egorchatov-jpg';
const GITHUB_REPO  = process.env.GITHUB_DATA_REPO || 'proverki-kb-data';
const SUBS_FILE    = 'subscriptions.json';

const VAPID_PUBLIC  = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:egorchatov@gmail.com';

// A→Q column order matching the Excel template
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
  { h: 'Описание нарушения',                      k: 'desc'            },
  { h: 'Нарушение допустил',                      k: 'violator'        },
  { h: 'Корректирующие мероприятия',              k: 'corrective'      },
  { h: 'Выполнение корректирующих мероприятий',   k: 'correctiveDone'  },
  { h: 'Мероприятия по оспариванию в СОКБ',       k: 'contestMeasures' },
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

async function ghGet(fileName) {
  const r = await fetch(ghApiUrl(fileName), { headers: GH_HEADERS });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GitHub GET "${fileName}": HTTP ${r.status}`);
  return r.json();
}

async function ghPut(fileName, base64Content, sha, message) {
  const body = { message, content: base64Content };
  if (sha) body.sha = sha;
  const r = await fetch(ghApiUrl(fileName), {
    method: 'PUT',
    headers: { ...GH_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`GitHub PUT "${fileName}": HTTP ${r.status} — ${await r.text()}`);
  return r.json();
}

function buildEmptyWorkbook() {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([COLUMNS.map(c => c.h)]);
  ws['!cols'] = COLUMNS.map((_, i) => ({
    wch: [4, 12, 18, 14, 18, 24, 24, 18, 20, 10, 20, 40, 18, 30, 30, 30, 24][i] || 15,
  }));
  XLSX.utils.book_append_sheet(wb, ws, 'Проверки');
  return wb;
}

async function sendPushToAll(record) {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return;

  const subsFile = await ghGet(SUBS_FILE);
  if (!subsFile || !subsFile.content) return;

  let data;
  try {
    const txt = Buffer.from(subsFile.content.replace(/\n/g, ''), 'base64').toString('utf8');
    data = JSON.parse(txt);
  } catch (e) { return; }

  const subs = data.subscriptions || [];
  if (subs.length === 0) return;

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

  const payload = JSON.stringify({
    title: '⚠ Нарушение КБ',
    body: [
      record.org || '',
      record.barrier ? 'Барьер: ' + record.barrier : '',
      record.desc || '',
    ].filter(Boolean).join('\n'),
    tag: 'violation-' + (record.id || Date.now()),
  });

  const results = await Promise.allSettled(
    subs.map(sub => webpush.sendNotification(sub, payload))
  );

  // Remove dead subscriptions (410 Gone = unsubscribed)
  const alive = subs.filter((_, i) => {
    const r = results[i];
    if (r.status === 'rejected') {
      const code = r.reason && r.reason.statusCode;
      return code !== 410 && code !== 404;
    }
    return true;
  });

  if (alive.length !== subs.length) {
    data.subscriptions = alive;
    const b64 = Buffer.from(JSON.stringify(data, null, 2), 'utf8').toString('base64');
    await ghPut(SUBS_FILE, b64, subsFile.sha, 'Remove expired push subscriptions').catch(() => {});
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!GITHUB_TOKEN) return res.status(500).json({ error: 'GITHUB_TOKEN not configured' });

  try {
    const { record } = req.body || {};
    if (!record) return res.status(400).json({ error: 'Missing record' });

    // Year from dateCheck (DD.MM.YYYY) or current year
    const year = record.dateCheck
      ? record.dateCheck.split('.')[2]
      : String(new Date().getFullYear());
    const fileName = `Проверки КБ ${year}.xlsx`;

    // Auto-fill entry date
    if (!record.dateEntry) {
      const now = new Date();
      const d = String(now.getDate()).padStart(2, '0');
      const m = String(now.getMonth() + 1).padStart(2, '0');
      record.dateEntry = `${d}.${m}.${now.getFullYear()}`;
    }

    // Load existing Excel from GitHub
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
    const dataRowCount = Math.max(0, rows.length - 1);
    record.num = dataRowCount + 1;

    // Append row
    XLSX.utils.sheet_add_aoa(ws, [COLUMNS.map(c => record[c.k] ?? '')], {
      origin: { r: rows.length, c: 0 },
    });

    const b64 = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }).toString('base64');
    await ghPut(fileName, b64, existing ? existing.sha : undefined,
      `Проверка №${record.num} (${year}) — ${record.org || ''}`);

    // Send Web Push to all subscribers if this is a violation
    if (record.works === 'Нет') {
      sendPushToAll(record).catch(e => console.warn('[push] send error:', e.message));
    }

    return res.status(200).json({ success: true, num: record.num, year });
  } catch (err) {
    console.error('[save] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
