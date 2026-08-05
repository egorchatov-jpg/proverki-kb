/**
 * pkb-v328: only "Просрочено" is red in corrective list; other status cells default style.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const indexPath = path.join(ROOT, 'index.html');
const swPath = path.join(ROOT, 'sw.js');

let t = fs.readFileSync(indexPath, 'utf8').replace(/\r\n/g, '\n');

if (!t.includes("var APP_BUILD = 'pkb-v327'")) {
  throw new Error('Expected APP_BUILD pkb-v327');
}
t = t.replace("var APP_BUILD = 'pkb-v327'", "var APP_BUILD = 'pkb-v328'");

const oldCss = `/* Beat .find-table td { color:#1a2035 } — status cell classes alone lose specificity */
.find-table td.corr-status-none    { color: var(--red);   font-size: 11px; }
.find-table td.corr-status-entered { color: var(--navy);  font-size: 11px; }
.find-table td.corr-status-overdue { color: var(--red);   font-size: 11px; font-weight: 600; }
.find-table td.corr-status-done    { color: var(--green); font-size: 11px; }
.find-table td.corr-status-na      { color: var(--text2); font-size: 11px; }
#screen-sokb-list .th-col-btn.active { color: var(--navy); }
.find-table td.sokb-status-process { color: var(--navy);  font-size: 11px; font-weight: 400; }
.find-table td.sokb-status-success { color: var(--green); font-size: 11px; font-weight: 400; }
.find-table td.sokb-status-fail    { color: var(--red);   font-size: 11px; font-weight: 400; }`;

const newCss = `/* Only overdue label is colored; other corr status cells keep .find-table td defaults */
.find-table td.corr-status-overdue { color: var(--red); font-size: 11px; font-weight: 600; }
#screen-sokb-list .th-col-btn.active { color: var(--navy); }
.sokb-status-process { color: var(--navy);  font-size: 11px; font-weight: 400; }
.sokb-status-success { color: var(--green); font-size: 11px; font-weight: 400; }
.sokb-status-fail    { color: var(--red);   font-size: 11px; font-weight: 400; }`;

if (!t.includes(oldCss)) throw new Error('status CSS block not found');
t = t.replace(oldCss, newCss);

fs.writeFileSync(indexPath, Buffer.from(t, 'utf8'));

let sw = fs.readFileSync(swPath, 'utf8').replace(/\r\n/g, '\n');
if (!sw.includes("const STATIC_CACHE = 'pkb-static-v327'")) {
  throw new Error('Expected sw v327');
}
sw = sw
  .replace("const STATIC_CACHE = 'pkb-static-v327'", "const STATIC_CACHE = 'pkb-static-v328'")
  .replace("const API_CACHE = 'pkb-api-v327'", "const API_CACHE = 'pkb-api-v328'");
fs.writeFileSync(swPath, Buffer.from(sw, 'utf8'));

console.log('OK: pkb-v328 overdue-only red');
