const XLSX = require('xlsx');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'egorchatov-jpg';
const GITHUB_REPO  = process.env.GITHUB_DATA_REPO || 'proverki-kb-data';

const OLD_HEADER = 'Мероприятия по оспариванию в СОКБ';
const NEW_HEADER = 'Обоснование для оспаривания в СОКБ';
const FILE_NAME  = 'Проверки КБ 2026.xlsx';

const GH_HEADERS = {
  Authorization: `token ${GITHUB_TOKEN}`,
  Accept: 'application/vnd.github.v3+json',
  'User-Agent': 'proverki-kb',
};

function apiUrl(fileName) {
  return `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodeURIComponent(fileName)}`;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!GITHUB_TOKEN) return res.status(500).json({ error: 'GITHUB_TOKEN not configured' });

  try {
    const getRes = await fetch(apiUrl(FILE_NAME), { headers: GH_HEADERS });
    if (!getRes.ok) return res.status(500).json({ error: `GitHub GET failed: ${getRes.status}` });
    const fileInfo = await getRes.json();

    const buf = Buffer.from(fileInfo.content.replace(/\n/g, ''), 'base64');
    const wb = XLSX.read(buf, { type: 'buffer', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];

    // Find and rename the header cell in row 0
    const range = XLSX.utils.decode_range(ws['!ref']);
    let renamed = false;
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r: 0, c });
      if (ws[addr] && ws[addr].v === OLD_HEADER) {
        ws[addr].v = NEW_HEADER;
        ws[addr].w = NEW_HEADER;
        renamed = true;
        break;
      }
    }

    if (!renamed) {
      return res.status(200).json({ message: 'Header not found or already renamed', renamed: false });
    }

    const b64 = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }).toString('base64');
    const putRes = await fetch(apiUrl(FILE_NAME), {
      method: 'PUT',
      headers: { ...GH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Rename column: Мероприятия → Обоснование для оспаривания в СОКБ',
        content: b64,
        sha: fileInfo.sha,
      }),
    });

    if (!putRes.ok) {
      const text = await putRes.text().catch(() => '');
      return res.status(500).json({ error: `GitHub PUT failed: ${putRes.status} — ${text}` });
    }

    return res.status(200).json({ success: true, renamed: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
