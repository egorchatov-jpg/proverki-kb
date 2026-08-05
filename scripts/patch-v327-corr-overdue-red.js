/**
 * pkb-v327: overdue "Просрочено" in corrective list — red text (beat .find-table td color).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const indexPath = path.join(ROOT, 'index.html');
const swPath = path.join(ROOT, 'sw.js');

let t = fs.readFileSync(indexPath, 'utf8').replace(/\r\n/g, '\n');

if (!t.includes("var APP_BUILD = 'pkb-v326'")) {
  throw new Error('Expected APP_BUILD pkb-v326');
}
t = t.replace("var APP_BUILD = 'pkb-v326'", "var APP_BUILD = 'pkb-v327'");

const oldCss = `.corr-status-none    { color: var(--red);   font-size: 11px; }
.corr-status-entered { color: var(--navy);  font-size: 11px; }
.corr-status-overdue { color: var(--red); font-size: 11px; }
.corr-status-done    { color: var(--green); font-size: 11px; }
.corr-status-na      { color: var(--text2); font-size: 11px; }
#screen-sokb-list .th-col-btn.active { color: var(--navy); }
.sokb-status-process { color: var(--navy);  font-size: 11px; font-weight: 400; }
.sokb-status-success { color: var(--green); font-size: 11px; font-weight: 400; }
.sokb-status-fail    { color: var(--red);   font-size: 11px; font-weight: 400; }`;

const newCss = `/* Beat .find-table td { color:#1a2035 } — status cell classes alone lose specificity */
.find-table td.corr-status-none    { color: var(--red);   font-size: 11px; }
.find-table td.corr-status-entered { color: var(--navy);  font-size: 11px; }
.find-table td.corr-status-overdue { color: var(--red);   font-size: 11px; font-weight: 600; }
.find-table td.corr-status-done    { color: var(--green); font-size: 11px; }
.find-table td.corr-status-na      { color: var(--text2); font-size: 11px; }
#screen-sokb-list .th-col-btn.active { color: var(--navy); }
.find-table td.sokb-status-process { color: var(--navy);  font-size: 11px; font-weight: 400; }
.find-table td.sokb-status-success { color: var(--green); font-size: 11px; font-weight: 400; }
.find-table td.sokb-status-fail    { color: var(--red);   font-size: 11px; font-weight: 400; }`;

if (!t.includes(oldCss)) throw new Error('corr-status CSS block not found');
t = t.replace(oldCss, newCss);

fs.writeFileSync(indexPath, Buffer.from(t, 'utf8'));

let sw = fs.readFileSync(swPath, 'utf8').replace(/\r\n/g, '\n');
if (!sw.includes("const STATIC_CACHE = 'pkb-static-v326'")) {
  throw new Error('Expected sw v326');
}
sw = sw
  .replace("const STATIC_CACHE = 'pkb-static-v326'", "const STATIC_CACHE = 'pkb-static-v327'")
  .replace("const API_CACHE = 'pkb-api-v326'", "const API_CACHE = 'pkb-api-v327'");
fs.writeFileSync(swPath, Buffer.from(sw, 'utf8'));

t = fs.readFileSync(indexPath, 'utf8');
if (!t.includes('td.corr-status-overdue')) throw new Error('overdue selector missing');
if (!t.includes("var APP_BUILD = 'pkb-v327'")) throw new Error('build bump failed');

console.log('OK: pkb-v327 overdue status red text');
