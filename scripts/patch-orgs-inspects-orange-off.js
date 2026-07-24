/**
 * «Проверяет»: orange checkboxes, default off (inspects: false).
 */
const fs = require('fs');
const path = require('path');

const INDEX = path.join(__dirname, '..', 'index.html');
const SW = path.join(__dirname, '..', 'sw.js');

let t = fs.readFileSync(INDEX, 'utf8').replace(/\r\n/g, '\n');

function mustReplace(label, from, to) {
  if (!t.includes(from)) throw new Error('Missing: ' + label);
  t = t.replace(from, to);
}

// Remove gray inspects CSS — reuse method-square-cb (orange)
mustReplace(
  'remove gray inspects css',
  `/* Orgs «Проверяет» — gray square */
.method-org-inspects-cb {
  width: 22px; height: 22px; margin: 0;
  cursor: pointer; flex-shrink: 0;
  accent-color: var(--gray-btn);
}
.is-not-ios .method-org-inspects-cb {
  appearance: none; -webkit-appearance: none;
  border-radius: 6px;
  border: 2px solid #c8ccd4; background: #fff;
  position: relative; transition: background 0.12s, border-color 0.12s;
}
.is-not-ios .method-org-inspects-cb:checked { background: var(--gray-btn); border-color: var(--gray-btn); }
.is-not-ios .method-org-inspects-cb:checked::after {
  content: '';
  position: absolute;
  top: 50%; left: 50%;
  width: 5px; height: 9px;
  border: 2.5px solid #fff; border-top: none; border-left: none;
  transform: translate(-50%, -62%) rotate(45deg);
}
`,
  ''
);

// Orange counter in header
mustReplace(
  'inspects header counter',
  'Проверяет<span class="methods-th-count methods-th-count-gray" id="orgs-count-inspects">0</span>',
  'Проверяет<span class="methods-th-count methods-th-count-orange" id="orgs-count-inspects">0</span>'
);

// Default inspects: false
t = t.replace(/inspects: true/g, 'inspects: false');

// Checked only when explicitly true
t = t.replace(/inspects !== false/g, 'inspects === true');

// loadState: normalize object orgs
mustReplace(
  'loadState org objects',
  "} else { appState.orgs = parsed.orgs; }",
  "} else {\n          appState.orgs = parsed.orgs.map(function(o) {\n            return { name: o.name, show: o.show !== false, inspects: o.inspects === true };\n          });\n        }"
);

// render: orange checkbox class
mustReplace(
  'render inspects cb class',
  "cbInspects.type = 'checkbox'; cbInspects.className = 'method-org-inspects-cb';",
  "cbInspects.type = 'checkbox'; cbInspects.className = 'method-square-cb method-org-inspects-cb';"
);

mustReplace('APP_BUILD', "var APP_BUILD = 'pkb-v256';", "var APP_BUILD = 'pkb-v257';");

fs.writeFileSync(INDEX, Buffer.from(t, 'utf8'));

let sw = fs.readFileSync(SW, 'utf8');
sw = sw.replace(/pkb-(static|api)-v256/g, 'pkb-$1-v257');
fs.writeFileSync(SW, sw, 'utf8');

console.log('patch-orgs-inspects-orange-off OK → pkb-v257');
