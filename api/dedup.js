const XLSX = require('xlsx');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'egorchatov-jpg';
const GITHUB_REPO  = process.env.GITHUB_DATA_REPO || 'proverki-kb-data';
const FILE_NAME    = 'Проверки КБ 2026.xlsx';

const GH_HEADERS = {
  Authorization: `token ${GITHUB_TOKEN}`,
  Accept: 'application/vnd.github.v3+json',
  'User-Agent': 'proverki-kb',
};

function apiUrl(f) {
  return `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodeURIComponent(f)}`;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!GITHUB_TOKEN) return res.status(500).json({ error: 'GITHUB_TOKEN not configured' });

  try {
    const getRes = await fetch(apiUrl(FILE_NAME), { headers: GH_HEADERS });
    if (!getRes.ok) return res.status(500).json({ error: `GET failed: ${getRes.status}` });
    const fileInfo = await getRes.json();

    const buf = Buffer.from(fileInfo.content.replace(/\n/g, ''), 'base64');
    const wb  = XLSX.read(buf, { type: 'buffer' });
    const ws  = wb.Sheets[wb.SheetNames[0]];
    const allRows = XLSX.utils.sheet_to_json(ws, { header: 1 });
    const header  = allRows[0];
    const data    = allRows.slice(1);

    // Keep first occurrence of each fingerprint (dateCheck|org|method|barrier = cols 1,5,3,8)
    const seen   = new Set();
    const deduped = data.filter(row => {
      const key = [String(row[1]||''), String(row[5]||''), String(row[3]||''), String(row[8]||'')].join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const removed = data.length - deduped.length;
    if (removed === 0) return res.status(200).json({ message: 'No duplicates found', removed: 0 });

    // Renumber and rebuild
    deduped.forEach((row, i) => { row[0] = i + 1; });
    const newWs = XLSX.utils.aoa_to_sheet([header, ...deduped]);
    newWs['!cols'] = ws['!cols'];
    wb.Sheets[wb.SheetNames[0]] = newWs;

    const b64 = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }).toString('base64');
    const putRes = await fetch(apiUrl(FILE_NAME), {
      method: 'PUT',
      headers: { ...GH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `Remove ${removed} duplicate record(s)`,
        content: b64,
        sha: fileInfo.sha,
      }),
    });

    if (!putRes.ok) {
      const text = await putRes.text().catch(() => '');
      return res.status(500).json({ error: `PUT failed: ${putRes.status} — ${text}` });
    }

    return res.status(200).json({ success: true, removed });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
