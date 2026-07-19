require('dotenv').config({ path: require('path').join(__dirname, '../.env.prod') });
const { execSync } = require('child_process');
const token = process.env.GITHUB_TOKEN || (() => {
  try { return execSync('gh auth token', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch (_) { return ''; }
})();
const owner = process.env.GITHUB_OWNER || 'egorchatov-jpg';
const repo = process.env.GITHUB_DATA_REPO || 'proverki-kb-data';

async function main() {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/subscriptions.json`;
  const r = await fetch(url, {
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github.raw',
      'User-Agent': 'proverki-kb',
    },
  });
  if (!r.ok) { console.log('subscriptions.json:', r.status, await r.text()); return; }
  const raw = await r.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch (_) {
    data = JSON.parse(Buffer.from(raw.replace(/\n/g, ''), 'base64').toString('utf8'));
  }
  const subs = data.subscriptions || [];
  console.log('Total subscriptions:', subs.length);
  subs.forEach((s, i) => {
    const ep = s.endpoint || '';
    console.log(i + 1 + '.', ep.slice(0, 60) + '...' + ep.slice(-25));
  });
}
main().catch(e => console.error(e.message));
