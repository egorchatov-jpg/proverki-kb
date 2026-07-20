/**
 * Пакетный релиз на production (ветка master).
 * Push в master — вы сами запускаете деплой в панели Timeweb.
 *
 * Usage:
 *   node scripts/release-prod.js
 *   node scripts/release-prod.js --dry-run
 */
const { execSync } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PROD_BRANCH = 'master';
const DEV_BRANCH = 'develop';
const dryRun = process.argv.includes('--dry-run');

function run(cmd, inherit) {
  return execSync(cmd, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
  });
}

function runOut(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: 'utf8' }).trim();
}

function fail(msg) {
  console.error('\n✗ ' + msg);
  process.exit(1);
}

function step(msg) {
  console.log('\n→ ' + msg);
}

try {
  const branch = runOut('git rev-parse --abbrev-ref HEAD');
  if (branch !== DEV_BRANCH) {
    fail('Переключитесь на ветку develop (сейчас: ' + branch + ').\n  git checkout develop');
  }

  const dirty = runOut('git status --porcelain --untracked-files=no');
  if (dirty) {
    fail('Есть незакоммиченные изменения. Закоммитьте или спрячьте их перед релизом.');
  }

  step('git fetch origin');
  if (!dryRun) run('git fetch origin', true);

  step('Проверка develop относительно origin/develop');
  try {
    const behind = runOut('git rev-list --count HEAD..origin/' + DEV_BRANCH);
    const ahead = runOut('git rev-list --count origin/' + DEV_BRANCH + '..HEAD');
    if (+behind) console.log('  Локальный develop отстаёт от origin на ' + behind + ' коммит(ов).');
    if (+ahead) console.log('  Локальный develop впереди origin на ' + ahead + ' коммит(ов).');
  } catch (_) {
    console.log('  origin/develop ещё нет — будет создан при push.');
  }

  const developHead = runOut('git rev-parse HEAD');
  let masterHead = '';
  try {
    masterHead = runOut('git rev-parse origin/' + PROD_BRANCH);
  } catch (_) {
    masterHead = runOut('git rev-parse ' + PROD_BRANCH);
  }

  if (developHead === masterHead) {
    fail('Нечего выпускать: develop и ' + PROD_BRANCH + ' указывают на один коммит.');
  }

  const log = runOut('git log --oneline ' + PROD_BRANCH + '..HEAD');
  console.log('\nКоммиты для релиза (' + PROD_BRANCH + '..develop):');
  console.log(log || '(нет)');

  if (dryRun) {
    console.log('\n[dry-run] merge develop → ' + PROD_BRANCH + ' и push не выполнялись.');
    process.exit(0);
  }

  step('git checkout ' + PROD_BRANCH);
  run('git checkout ' + PROD_BRANCH, true);
  run('git pull origin ' + PROD_BRANCH, true);

  step('git merge develop --no-ff');
  const mergeMsg = 'Release: merge develop into ' + PROD_BRANCH;
  run('git merge develop --no-ff -m "' + mergeMsg + '"', true);

  step('git push origin ' + PROD_BRANCH);
  run('git push origin ' + PROD_BRANCH, true);

  step('git checkout ' + DEV_BRANCH);
  run('git checkout ' + DEV_BRANCH, true);

  const build = (() => {
    try {
      const html = require('fs').readFileSync(path.join(ROOT, 'index.html'), 'utf8');
      const m = html.match(/var APP_BUILD = '(pkb-v\d+)'/);
      return m ? m[1] : '?';
    } catch (_) {
      return '?';
    }
  })();

  console.log('\n✓ Ветка ' + PROD_BRANCH + ' обновлена на GitHub (' + build + ').');
  console.log('\n--- Деплой на Timeweb (вручную) ---');
  console.log('1. Timeweb Cloud → App Platform → ваше приложение «Проверки КБ»');
  console.log('2. Убедитесь, что автодеплой при push выключён (см. docs/release-workflow.md).');
  console.log('3. Раздел «Деплой» / Deployments → «Запустить деплой» / Redeploy');
  console.log('   Ветка: master, последний коммит.');
  console.log('4. После деплоя: https://kbcheck.webtm.ru/health → { ok: true }');
  console.log('5. Сообщите пользователям: перезапустить PWA или обновить страницу (' + build + ').');
  console.log('');
} catch (e) {
  fail((e.stderr || e.stdout || e.message || String(e)).trim());
}
