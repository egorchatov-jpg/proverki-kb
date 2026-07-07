const XLSX = require('xlsx');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'egorchatov-jpg';
const GITHUB_REPO  = process.env.GITHUB_DATA_REPO || 'proverki-kb-data';
const FILE_NAME    = 'Проверки КБ 2026.xlsx';

// Swap 1-based column indices 12 and 13 (0-based: 11 and 12)
const COL_A = 11;
const COL_B = 12;

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

    const range = XLSX.utils.decode_range(ws['!ref']);
    const maxRow = range.e.r;

    // Swap entire columns COL_A and COL_B for all rows
    for (let r = 0; r <= maxRow; r++) {
      const addrA = XLSX.utils.encode_cell({ r, c: COL_A });
      const addrB = XLSX.utils.encode_cell({ r, c: COL_B });
      const cellA = ws[addrA];
      const cellB = ws[addrB];
      if (cellA) ws[addrB] = cellA; else delete ws[addrB];
      if (cellB) ws[addrA] = cellB; else delete ws[addrA];
    }

    // Swap column widths if defined
    if (ws['!cols']) {
      const cols = ws['!cols'];
      const tmp = cols[COL_A];
      cols[COL_A] = cols[COL_B];
      cols[COL_B] = tmp;
    }

    const b64 = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }).toString('base64');
    const putRes = await fetch(apiUrl(FILE_NAME), {
      method: 'PUT',
      headers: { ...GH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Swap columns 12-13: Нарушение допустил ↔ Описание нарушения',
        content: b64,
        sha: fileInfo.sha,
      }),
    });

    if (!putRes.ok) {
      const text = await putRes.text().catch(() => '');
      return res.status(500).json({ error: `GitHub PUT failed: ${putRes.status} — ${text}` });
    }

    return res.status(200).json({ success: true, swapped: [COL_A + 1, COL_B + 1] });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
