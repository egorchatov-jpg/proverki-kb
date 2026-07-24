/**
 * Copy production Excel (and checklists) into proverki-kb-data-dev.
 * Preserves raw dateCheck / dateEntry cell values as in production.
 *
 * Usage:
 *   node scripts/copy-records-to-dev.js --all
 *   node scripts/copy-records-to-dev.js --date 24.07.2026
 */
require('../lib/load-env');

const { execSync } = require('child_process');
const XLSX = require('xlsx');
const {
  COLUMNS, COL, buildColIdx, sortAndRenumberSheet, ensureCheckIdColumn, normalizeDateStr,
} = require('../api/excel-utils');

const PROD_REPO = process.env.PROD_DATA_REPO || 'proverki-kb-data';
const DEV_REPO = process.env.GITHUB_DATA_REPO || 'proverki-kb-data-dev';
const OWNER = process.env.GITHUB_OWNER || 'egorchatov-jpg';
const EXCEL_FILE = 'Проверки КБ 2026.xlsx';
const CHECKLISTS_FILE = 'checklists.json';
const SETTINGS_FILE = 'settings.json';
const MSK = 'Europe/Moscow';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const COPY_ALL = args.includes('--all');
const dateArg = args.find((a, i) => args[i - 1] === '--date');

function resolveToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN.trim();
  try {
    return execSync('gh auth token', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch (_) {
    return '';
  }
}

function todayMsk() {
  if (dateArg) return normalizeDateStr(dateArg);
  const parts = new Intl.DateTimeFormat('ru-RU', {
    timeZone: MSK,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(new Date());
  const d = Object.fromEntries(parts.filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
  return `${d.day}.${d.month}.${d.year}`;
}

function ghHeaders(token) {
  return {
    Authorization: `token ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'proverki-kb-copy-to-dev',
  };
}

function ghUrl(repo, path) {
  return `https://api.github.com/repos/${OWNER}/${repo}/contents/${encodeURIComponent(path)}`;
}

async function ghGet(token, repo, path) {
  const r = await fetch(ghUrl(repo, path), { headers: ghHeaders(token) });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GET ${repo}/${path}: HTTP ${r.status}`);
  return r.json();
}

async function ghPut(token, repo, path, buf, sha, message) {
  const body = {
    message,
    content: Buffer.from(buf).toString('base64'),
    ...(sha ? { sha } : {}),
  };
  const r = await fetch(ghUrl(repo, path), {
    method: 'PUT',
    headers: { ...ghHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`PUT ${repo}/${path}: HTTP ${r.status} — ${text}`);
  }
  return r.json();
}

function normHeader(h) {
  return String(h || '').trim().replace(/\s+/g, ' ');
}

function headerToKey(h) {
  const n = normHeader(h);
  if (!n) return null;
  const exact = COLUMNS.find(c => c.h === n);
  if (exact) return exact.k;
  const lower = n.toLowerCase();
  if (lower.includes('корректиру') && lower.includes('мероприят') && !lower.includes('выполнение')) return 'corrective';
  if (lower.includes('выполнение') && lower.includes('корректиру')) return null;
  if (lower.includes('оспаривание') && lower.includes('сокб')) return 'contestMeasures';
  if (lower.includes('обоснование') && lower.includes('сокб')) return 'contestMeasures';
  if (lower.includes('дата') && lower.includes('внесен')) return 'dateEntry';
  if (lower.includes('дата') && lower.includes('проверк')) return 'dateCheck';
  if (lower.includes('id') && lower.includes('проверк')) return 'checkId';
  if (n === '№') return 'num';
  return null;
}

function buildColMap(headerRow) {
  const keyToIdx = {};
  headerRow.forEach((h, i) => {
    const k = headerToKey(h);
    if (k && keyToIdx[k] === undefined) keyToIdx[k] = i;
  });
  return keyToIdx;
}

function readRawRows(b64) {
  const buf = Buffer.from(String(b64).replace(/\n/g, ''), 'base64');
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
}

function rowDateCheck(row, colMap) {
  const idx = colMap.dateCheck;
  if (idx === undefined) return '';
  return normalizeDateStr(row[idx]);
}

function rowHasData(row, colMap) {
  return !!rowDateCheck(row, colMap);
}

function mapRowToHeader(srcRow, srcHeader, dstHeader) {
  const srcMap = buildColMap(srcHeader.map(normHeader));
  const dstMap = buildColMap(dstHeader.map(normHeader));
  const out = new Array(dstHeader.length).fill('');
  COLUMNS.forEach(function(c) {
    const si = srcMap[c.k];
    const di = dstMap[c.k];
    if (si === undefined || di === undefined) return;
    const val = srcRow[si];
    out[di] = val === undefined || val === null ? '' : val;
  });
  return out;
}

function rowsToWorkbookBuffer(rows) {
  let merged = ensureCheckIdColumn(rows);
  merged = sortAndRenumberSheet(merged);
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(merged);
  ws['!cols'] = COLUMNS.map((_, i) => ({
    wch: [4, 12, 12, 18, 14, 18, 24, 24, 18, 20, 10, 20, 18, 40, 30, 30][i] || 15,
  }));
  XLSX.utils.book_append_sheet(wb, ws, 'Проверки');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', cellDates: true });
}

function parseChecklists(meta) {
  if (!meta || !meta.content) return { items: {} };
  try {
    const data = JSON.parse(Buffer.from(meta.content.replace(/\n/g, ''), 'base64').toString('utf8'));
    if (!data.items || typeof data.items !== 'object') data.items = {};
    return data;
  } catch (_) {
    return { items: {} };
  }
}

async function main() {
  const token = resolveToken();
  if (!token) {
    console.error('GITHUB_TOKEN not found');
    process.exit(1);
  }

  const targetDate = todayMsk();
  console.log(COPY_ALL
    ? 'Copy ALL production records (raw dates preserved)'
    : `Copy records dateCheck=${targetDate} (raw dates preserved)`);
  console.log(`  from: ${OWNER}/${PROD_REPO}`);
  console.log(`  to:   ${OWNER}/${DEV_REPO}`);

  const prodMeta = await ghGet(token, PROD_REPO, EXCEL_FILE);
  if (!prodMeta || !prodMeta.content) throw new Error('Production Excel not found');

  const prodRows = readRawRows(prodMeta.content);
  if (!prodRows.length) throw new Error('Production Excel is empty');

  const prodHeader = prodRows[0].map(h => String(h || '').trim());
  const prodMap = buildColMap(prodHeader.map(normHeader));

  let srcRows;
  if (COPY_ALL) {
    srcRows = prodRows.slice(1).filter(function(row) { return rowHasData(row, prodMap); });
    console.log(`Production: ${srcRows.length} records (all)`);
  } else {
    srcRows = prodRows.slice(1).filter(function(row) {
      return rowDateCheck(row, prodMap) === targetDate;
    });
    console.log(`Production: ${prodRows.length - 1} total rows, ${srcRows.length} for ${targetDate}`);
  }

  if (!srcRows.length) {
    console.log('Nothing to copy.');
    return;
  }

  const devMeta = await ghGet(token, DEV_REPO, EXCEL_FILE);
  const devHeader = COLUMNS.map(c => c.h);

  let merged;
  if (COPY_ALL) {
    const mapped = srcRows.map(function(row) {
      return mapRowToHeader(row, prodHeader, devHeader);
    });
    merged = [devHeader, ...mapped];
  } else {
    let devRows = devMeta && devMeta.content
      ? readRawRows(devMeta.content)
      : [devHeader];
    if (!devRows.length) devRows = [devHeader];
    devRows = ensureCheckIdColumn(devRows);
    const curHeader = devRows[0].map(h => String(h || '').trim());
    const devMap = buildColMap(curHeader.map(normHeader));
    const kept = devRows.slice(1).filter(function(row) {
      return rowDateCheck(row, devMap) !== targetDate;
    });
    const mapped = srcRows.map(function(row) {
      return mapRowToHeader(row, prodHeader, curHeader);
    });
    merged = [curHeader, ...kept, ...mapped];
  }

  const xlsxBuf = rowsToWorkbookBuffer(merged);

  const prodCl = parseChecklists(await ghGet(token, PROD_REPO, CHECKLISTS_FILE));
  const devClMeta = await ghGet(token, DEV_REPO, CHECKLISTS_FILE);
  let devCl;
  if (COPY_ALL) {
    devCl = { items: Object.assign({}, prodCl.items || {}) };
  } else {
    devCl = parseChecklists(devClMeta);
    srcRows.forEach(function(row) {
      const idIdx = prodMap.checkId;
      const deIdx = prodMap.dateEntry;
      const key = (idIdx !== undefined && String(row[idIdx] || '').trim())
        || (deIdx !== undefined && String(row[deIdx] || '').trim())
        || '';
      if (key && prodCl.items[key]) devCl.items[key] = prodCl.items[key];
    });
  }

  const clCount = Object.keys(devCl.items || {}).length;

  let settingsCopied = false;
  if (COPY_ALL) {
    const prodSettings = await ghGet(token, PROD_REPO, SETTINGS_FILE);
    if (!prodSettings || !prodSettings.content) {
      console.warn('Production settings.json not found — skip');
    } else {
      const settingsBuf = Buffer.from(prodSettings.content.replace(/\n/g, ''), 'base64');
      if (DRY_RUN) {
        console.log('[dry-run] Would copy settings.json from production');
      } else {
        const devSettingsMeta = await ghGet(token, DEV_REPO, SETTINGS_FILE);
        await ghPut(
          token, DEV_REPO, SETTINGS_FILE, settingsBuf, devSettingsMeta && devSettingsMeta.sha,
          'Copy settings.json from production (full mirror)'
        );
        settingsCopied = true;
        console.log('Dev settings.json updated from production');
      }
    }
  }

  if (DRY_RUN) {
    console.log(`[dry-run] Would write ${srcRows.length} rows, ${clCount} checklists`);
    return;
  }

  await ghPut(
    token, DEV_REPO, EXCEL_FILE, xlsxBuf, devMeta && devMeta.sha,
    COPY_ALL
      ? `Copy all ${srcRows.length} records from production (raw dates)`
      : `Copy ${srcRows.length} records for ${targetDate} from production (raw dates)`
  );
  console.log(`Dev Excel updated: ${srcRows.length} records`);

  const clBuf = Buffer.from(JSON.stringify(devCl, null, 2), 'utf8');
  await ghPut(
    token, DEV_REPO, CHECKLISTS_FILE, clBuf, devClMeta && devClMeta.sha,
    COPY_ALL ? 'Copy all checklists from production' : `Copy checklists for ${targetDate} from production`
  );
  console.log(`Dev checklists updated: ${clCount} item(s)`);
  if (COPY_ALL && settingsCopied) {
    console.log('Dev mirrors production: settings + Excel + checklists');
  }
  console.log('Done. Refresh http://localhost:3000 (Ctrl+Shift+R).');
  console.log('If overlays still show test orgs/barriers: DevTools → Application → Clear site data.');
}

main().catch(function(e) {
  console.error(e.message || e);
  process.exit(1);
});
