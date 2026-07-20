/**
 * Create GitHub repo proverki-kb-data-dev and seed a safe test Excel database.
 *
 * Usage:
 *   node scripts/setup-dev-data-repo.js [--force]
 *
 * Also writes/updates .env.local with GITHUB_DATA_REPO=proverki-kb-data-dev.
 */
require('../lib/load-env');

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const XLSX = require('xlsx');
const { COLUMNS } = require('../api/excel-utils');

const ROOT = path.join(__dirname, '..');
const DEV_REPO = process.env.DEV_DATA_REPO || 'proverki-kb-data-dev';
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'egorchatov-jpg';
const EXCEL_FILE = 'Проверки КБ 2026.xlsx';
const FORCE = process.argv.includes('--force');

function resolveGithubToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN.trim();
  try {
    return execSync('gh auth token', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch (_) {
    return '';
  }
}

function ghApiUrl(filePath) {
  return `https://api.github.com/repos/${GITHUB_OWNER}/${DEV_REPO}/contents/${encodeURIComponent(filePath)}`;
}

function ghHeaders(token) {
  return {
    Authorization: `token ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'proverki-kb-setup-dev',
  };
}

function buildEmptyWorkbook() {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([COLUMNS.map(c => c.h)]);
  ws['!cols'] = COLUMNS.map((_, i) => ({
    wch: [4, 12, 12, 18, 14, 18, 24, 24, 18, 20, 10, 20, 18, 40, 30, 30][i] || 15,
  }));
  XLSX.utils.book_append_sheet(wb, ws, 'Проверки');
  return wb;
}

const DEV_SETTINGS = {
  methods: [
    { name: 'Тест — осмотр', show: true },
    { name: 'Тест — самопроверка', show: true },
    { name: 'Тест — прочее', show: true, fixed: true },
  ],
  orgs: [
    { name: 'Тестовая организация А', show: true },
    { name: 'Тестовая организация Б', show: true },
  ],
  barriersConfig: {
    2026: [
      { name: 'Тестовый барьер 1', inPK: true, show: true, passport: 'TEST-001' },
      { name: 'Тестовый барьер 2', inPK: false, show: true, passport: 'TEST-002' },
    ],
  },
  passwords: { admin: '3333', inspector: '1111', orgs: {} },
  usedPasswords: ['1111', '3333'],
};

const DEV_CHECKLISTS = { items: {} };

const SEED_FILES = [
  {
    path: EXCEL_FILE,
    message: 'Init test Excel database (empty)',
    build: () => XLSX.write(buildEmptyWorkbook(), { type: 'buffer', bookType: 'xlsx' }),
    isBinary: true,
  },
  {
    path: 'settings.json',
    message: 'Init test settings (synthetic orgs/barriers)',
    build: () => Buffer.from(JSON.stringify(DEV_SETTINGS, null, 2), 'utf8'),
  },
  {
    path: 'checklists.json',
    message: 'Init empty checklists',
    build: () => Buffer.from(JSON.stringify(DEV_CHECKLISTS, null, 2), 'utf8'),
  },
  {
    path: 'README.md',
    message: 'Init dev data repo readme',
    build: () => Buffer.from([
      '# proverki-kb-data-dev',
      '',
      'Тестовая база для локальной разработки **Проверки КБ**.',
      '',
      '- Excel без боевых записей',
      '- Синтетические организации и барьеры',
      '- Не используется на production (kbcheck.webtm.ru)',
      '',
      'Инициализация: `npm run setup:dev-data` в репозитории proverki-kb.',
      '',
    ].join('\n'), 'utf8'),
  },
];

async function ghGet(token, filePath) {
  const r = await fetch(ghApiUrl(filePath), { headers: ghHeaders(token) });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GitHub GET "${filePath}": HTTP ${r.status}`);
  return r.json();
}

async function ghPut(token, filePath, contentBuf, sha, message) {
  const body = {
    message,
    content: contentBuf.toString('base64'),
    ...(sha ? { sha } : {}),
  };
  const r = await fetch(ghApiUrl(filePath), {
    method: 'PUT',
    headers: { ...ghHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`GitHub PUT "${filePath}": HTTP ${r.status} — ${text}`);
  }
  return r.json();
}

function ensureRepoExists() {
  try {
    execSync(`gh repo view ${GITHUB_OWNER}/${DEV_REPO}`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    console.log(`Repo ${GITHUB_OWNER}/${DEV_REPO} already exists`);
    return;
  } catch (_) {}

  console.log(`Creating private repo ${GITHUB_OWNER}/${DEV_REPO}...`);
  execSync(
    `gh repo create ${DEV_REPO} --private --description "Test Excel DB for proverki-kb local development"`,
    { stdio: 'inherit' }
  );
}

async function seedFile(token, spec) {
  const existing = await ghGet(token, spec.path);
  if (existing && !FORCE) {
    console.log(`  skip ${spec.path} (exists, use --force to overwrite)`);
    return;
  }
  const buf = spec.build();
  await ghPut(token, spec.path, buf, existing && existing.sha, spec.message);
  console.log(`  ${existing ? 'updated' : 'created'} ${spec.path}`);
}

function parseEnvLines(text) {
  return text.split(/\r?\n/);
}

function upsertEnvKey(lines, key, value) {
  const re = new RegExp(`^${key}=`);
  let found = false;
  const out = lines.map(function(line) {
    if (re.test(line)) {
      found = true;
      return `${key}=${value}`;
    }
    return line;
  });
  if (!found) out.push(`${key}=${value}`);
  return out;
}

function writeEnvLocal(token) {
  const envLocal = path.join(ROOT, '.env.local');
  const envProd = path.join(ROOT, '.env.prod');
  let lines = ['# Local dev — test data repo (auto-generated by setup-dev-data-repo.js)'];

  if (fs.existsSync(envLocal)) {
    lines = parseEnvLines(fs.readFileSync(envLocal, 'utf8'));
  } else if (fs.existsSync(envProd)) {
    lines = parseEnvLines(fs.readFileSync(envProd, 'utf8'))
      .filter(function(line) { return line.trim() && !line.trim().startsWith('#'); });
  }

  lines = upsertEnvKey(lines, 'GITHUB_DATA_REPO', DEV_REPO);
  lines = upsertEnvKey(lines, 'ENABLE_BACKUP_CRON', '0');
  lines = upsertEnvKey(lines, 'GITHUB_OWNER', GITHUB_OWNER);
  if (token && !lines.some(function(l) { return /^GITHUB_TOKEN=/.test(l); })) {
    lines = upsertEnvKey(lines, 'GITHUB_TOKEN', token);
  }

  fs.writeFileSync(envLocal, lines.join('\n') + '\n', 'utf8');
  console.log(`Wrote ${envLocal}`);
  console.log(`  GITHUB_DATA_REPO=${DEV_REPO}`);
  console.log('  ENABLE_BACKUP_CRON=0');
}

async function main() {
  const token = resolveGithubToken();
  if (!token) {
    console.error('GITHUB_TOKEN not found. Set in .env.prod or run: gh auth login');
    process.exit(1);
  }

  ensureRepoExists();

  console.log('Seeding files...');
  for (const spec of SEED_FILES) {
    await seedFile(token, spec);
  }

  writeEnvLocal(token);

  console.log('');
  console.log('Done. Restart local server: npm start');
  console.log(`Test data repo: https://github.com/${GITHUB_OWNER}/${DEV_REPO}`);
}

main().catch(function(err) {
  console.error(err.message || err);
  process.exit(1);
});
