/**
 * Delete an Excel file from GitHub data repo.
 * Usage: node scripts/delete-excel-file.js "Проверки КБ 2025.xlsx"
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env.prod') });
require('dotenv').config({ path: require('path').join(__dirname, '../.env.local') });

const { execSync } = require('child_process');

const fileName = process.argv[2] || 'Проверки КБ 2025.xlsx';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || (() => {
  try { return execSync('gh auth token', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch (_) { return ''; }
})();
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'egorchatov-jpg';
const GITHUB_REPO = process.env.GITHUB_DATA_REPO || 'proverki-kb-data';

if (!GITHUB_TOKEN) {
  console.error('GITHUB_TOKEN required');
  process.exit(1);
}

const GH_HEADERS = {
  Authorization: `token ${GITHUB_TOKEN}`,
  Accept: 'application/vnd.github.v3+json',
  'User-Agent': 'proverki-kb-delete-excel',
};

function ghApiUrl(path) {
  return `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodeURIComponent(path)}`;
}

(async () => {
  const get = await fetch(ghApiUrl(fileName), { headers: GH_HEADERS });
  if (get.status === 404) {
    console.log('Already deleted:', fileName);
    return;
  }
  if (!get.ok) throw new Error(`GET ${fileName}: HTTP ${get.status}`);
  const meta = await get.json();

  const del = await fetch(ghApiUrl(fileName), {
    method: 'DELETE',
    headers: { ...GH_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: `Delete test database ${fileName}`,
      sha: meta.sha,
    }),
  });
  if (!del.ok) throw new Error(`DELETE ${fileName}: HTTP ${del.status} — ${await del.text()}`);
  console.log('Deleted:', fileName);
})().catch(e => {
  console.error(e);
  process.exit(1);
});
