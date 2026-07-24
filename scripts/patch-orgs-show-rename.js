const fs = require('fs');
const path = require('path');

const INDEX = path.join(__dirname, '..', 'index.html');
const SW = path.join(__dirname, '..', 'sw.js');

let t = fs.readFileSync(INDEX, 'utf8').replace(/\r\n/g, '\n');

const from = '<th class="methods-th methods-th-cb-col" style="width:74px;">Показать<span class="methods-th-count methods-th-count-orange" id="orgs-count-show">0</span></th>';
const to = '<th class="methods-th methods-th-cb-col" style="width:74px;">Проверяемая<span class="methods-th-count methods-th-count-orange" id="orgs-count-show">0</span></th>';

if (!t.includes(from)) throw new Error('orgs column header not found');
t = t.replace(from, to);

t = t.replace("var APP_BUILD = 'pkb-v257';", "var APP_BUILD = 'pkb-v258';");

fs.writeFileSync(INDEX, Buffer.from(t, 'utf8'));

let sw = fs.readFileSync(SW, 'utf8');
sw = sw.replace(/pkb-(static|api)-v257/g, 'pkb-$1-v258');
fs.writeFileSync(SW, sw, 'utf8');

console.log('patch-orgs-show-rename OK → pkb-v258');
