const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'egorchatov-jpg';
const GITHUB_REPO  = process.env.GITHUB_DATA_REPO || 'proverki-kb-data';
const FILE_PATH    = 'settings.json';
const API_URL      = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${FILE_PATH}`;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!GITHUB_TOKEN) return res.status(500).json({ error: 'GITHUB_TOKEN not configured' });

  // ── GET: return current settings ──────────────────────────────────────────
  if (req.method === 'GET') {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const r = await fetch(API_URL, {
        headers: {
          Authorization: `token ${GITHUB_TOKEN}`,
          Accept: 'application/vnd.github.raw',
          'User-Agent': 'proverki-kb',
        },
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (r.status === 404) return res.status(200).json({}); // file not created yet
      if (!r.ok) return res.status(502).json({ error: `GitHub HTTP ${r.status}` });
      const text = await r.text();
      return res.status(200).json(JSON.parse(text));
    } catch (e) {
      clearTimeout(timer);
      return res.status(500).json({ error: e.message });
    }
  }

  // ── PUT: save settings ────────────────────────────────────────────────────
  if (req.method === 'PUT') {
    // Fetch current SHA (needed for update; absent means create)
    let sha = null;
    try {
      const rSha = await fetch(API_URL, {
        headers: { Authorization: `token ${GITHUB_TOKEN}`, 'User-Agent': 'proverki-kb' },
      });
      if (rSha.ok) {
        const d = await rSha.json();
        sha = d.sha || null;
      }
    } catch (_) {}

    const content = Buffer.from(JSON.stringify(req.body, null, 2)).toString('base64');
    const body    = { message: 'Update app settings', content, ...(sha ? { sha } : {}) };

    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 9000);
    try {
      const rPut = await fetch(API_URL, {
        method: 'PUT',
        headers: {
          Authorization: `token ${GITHUB_TOKEN}`,
          'Content-Type': 'application/json',
          'User-Agent': 'proverki-kb',
        },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (!rPut.ok) {
        const err = await rPut.text();
        return res.status(502).json({ error: `GitHub HTTP ${rPut.status}: ${err}` });
      }
      return res.status(200).json({ success: true });
    } catch (e) {
      clearTimeout(timer);
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).end();
};
