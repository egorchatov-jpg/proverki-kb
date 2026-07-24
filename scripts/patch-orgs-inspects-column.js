/**
 * Orgs screen: rename to «Организации», add «Проверяет» column, «Показать» label.
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

// Settings button + screen title
mustReplace(
  'settings orgs button',
  '<button class="settings-wide-btn" onclick="openOrgsScreen()">Проверяемые организации</button>',
  '<button class="settings-wide-btn" onclick="openOrgsScreen()">Организации</button>'
);

mustReplace(
  'screen-orgs title',
  '<div class="settings-screen-title">Проверяемые организации</div>\n  <div class="methods-table-wrap">\n    <table class="methods-table">\n      <thead>\n        <tr>\n          <th class="methods-th methods-th-cb-col" style="width:44px;">Выбрать<span class="methods-th-count methods-th-count-gray" id="orgs-count-sel">0</span></th>\n          <th class="methods-th methods-th-name methods-th-count-col">Организация<span class="methods-th-count methods-th-count-label" id="orgs-count-items">0</span></th>\n          <th class="methods-th methods-th-cb-col" style="width:74px;">Показывать<span class="methods-th-count methods-th-count-orange" id="orgs-count-show">0</span></th>',
  '<div class="settings-screen-title">Организации</div>\n  <div class="methods-table-wrap">\n    <table class="methods-table">\n      <thead>\n        <tr>\n          <th class="methods-th methods-th-cb-col" style="width:44px;">Выбрать<span class="methods-th-count methods-th-count-gray" id="orgs-count-sel">0</span></th>\n          <th class="methods-th methods-th-name methods-th-count-col">Организация<span class="methods-th-count methods-th-count-label" id="orgs-count-items">0</span></th>\n          <th class="methods-th methods-th-cb-col" style="width:74px;">Проверяет<span class="methods-th-count methods-th-count-gray" id="orgs-count-inspects">0</span></th>\n          <th class="methods-th methods-th-cb-col" style="width:74px;">Показать<span class="methods-th-count methods-th-count-orange" id="orgs-count-show">0</span></th>'
);

// CSS for inspects column (gray, like «Выбрать»)
mustReplace(
  'inspects cb css',
  '/* Right checkbox (Показывать) — fills ORANGE when checked */\n.method-square-cb {',
  '/* Orgs «Проверяет» — gray square */\n.method-org-inspects-cb {\n  width: 22px; height: 22px; margin: 0;\n  cursor: pointer; flex-shrink: 0;\n  accent-color: var(--gray-btn);\n}\n.is-not-ios .method-org-inspects-cb {\n  appearance: none; -webkit-appearance: none;\n  border-radius: 6px;\n  border: 2px solid #c8ccd4; background: #fff;\n  position: relative; transition: background 0.12s, border-color 0.12s;\n}\n.is-not-ios .method-org-inspects-cb:checked { background: var(--gray-btn); border-color: var(--gray-btn); }\n.is-not-ios .method-org-inspects-cb:checked::after {\n  content: \'\';\n  position: absolute;\n  top: 50%; left: 50%;\n  width: 5px; height: 9px;\n  border: 2.5px solid #fff; border-top: none; border-left: none;\n  transform: translate(-50%, -62%) rotate(45deg);\n}\n/* Right checkbox (Показать) — fills ORANGE when checked */\n.method-square-cb {'
);

// loadState: default inspects: true
t = t.replace(
  /return \{ name: n, show: true \}/g,
  'return { name: n, show: true, inspects: true }'
);

// mergeOrgs
mustReplace(
  'mergeOrgs string',
  "return loc && typeof loc !== 'string' ? { name: o, show: loc.show !== false } : { name: o, show: true };",
  "return loc && typeof loc !== 'string' ? { name: o, show: loc.show !== false, inspects: loc.inspects !== false } : { name: o, show: true, inspects: true };"
);
mustReplace(
  'mergeOrgs object',
  'return { name: o.name, show: loc.show !== undefined ? loc.show : (o.show !== false) };',
  'return { name: o.name, show: loc.show !== undefined ? loc.show : (o.show !== false), inspects: loc.inspects !== undefined ? (loc.inspects !== false) : (o.inspects !== false) };'
);
mustReplace(
  'mergeOrgs push string',
  "out.push(typeof o === 'string' ? { name: o, show: true } : Object.assign({}, o));",
  "out.push(typeof o === 'string' ? { name: o, show: true, inspects: true } : Object.assign({}, o));"
);

// snap / cancel orgs
mustReplace(
  'snapOrgsList',
  'function snapOrgsList() {\n  return (appState.orgs || []).map(function(o) {\n    return { name: o.name, show: o.show !== false };\n  });\n}',
  'function snapOrgsList() {\n  return (appState.orgs || []).map(function(o) {\n    return { name: o.name, show: o.show !== false, inspects: o.inspects !== false };\n  });\n}'
);

mustReplace(
  'cancelOrgsChanges',
  "    appState.orgs = snap.map(function(o) {\n      return { name: o.name, show: o.show !== false };\n    });",
  "    appState.orgs = snap.map(function(o) {\n      return { name: o.name, show: o.show !== false, inspects: o.inspects !== false };\n    });"
);

// renderOrgsTable + counts
mustReplace(
  'renderOrgsTable show td',
  "    var tdShow = document.createElement('td');\n    tdShow.className = 'methods-td methods-td-cb';\n    var cbShow = document.createElement('input');\n    cbShow.type = 'checkbox'; cbShow.className = 'method-square-cb';\n    cbShow.checked = (o.show !== false); cbShow.dataset.idx = idx;\n    cbShow.addEventListener('change', function() {\n      (appState.orgs || [])[+this.dataset.idx].show = this.checked;\n      saveState();\n      markOrgsDirty();\n      updateOrgsCheckboxCounts();\n    });\n    tdShow.appendChild(cbShow);\n    tr.appendChild(tdSel); tr.appendChild(tdName); tr.appendChild(tdShow);",
  "    var tdInspects = document.createElement('td');\n    tdInspects.className = 'methods-td methods-td-cb';\n    var cbInspects = document.createElement('input');\n    cbInspects.type = 'checkbox'; cbInspects.className = 'method-org-inspects-cb';\n    cbInspects.checked = (o.inspects !== false); cbInspects.dataset.idx = idx;\n    cbInspects.addEventListener('change', function() {\n      (appState.orgs || [])[+this.dataset.idx].inspects = this.checked;\n      saveState();\n      markOrgsDirty();\n      updateOrgsCheckboxCounts();\n    });\n    tdInspects.appendChild(cbInspects);\n    var tdShow = document.createElement('td');\n    tdShow.className = 'methods-td methods-td-cb';\n    var cbShow = document.createElement('input');\n    cbShow.type = 'checkbox'; cbShow.className = 'method-square-cb';\n    cbShow.checked = (o.show !== false); cbShow.dataset.idx = idx;\n    cbShow.addEventListener('change', function() {\n      (appState.orgs || [])[+this.dataset.idx].show = this.checked;\n      saveState();\n      markOrgsDirty();\n      updateOrgsCheckboxCounts();\n    });\n    tdShow.appendChild(cbShow);\n    tr.appendChild(tdSel); tr.appendChild(tdName); tr.appendChild(tdInspects); tr.appendChild(tdShow);"
);

mustReplace(
  'updateOrgsCheckboxCounts',
  "function updateOrgsCheckboxCounts() {\n  var sel = document.querySelectorAll('#orgs-tbody .method-circle-cb:checked').length;\n  var show = document.querySelectorAll('#orgs-tbody .method-square-cb:checked').length;\n  var items = document.querySelectorAll('#orgs-tbody tr').length;\n  var elSel = document.getElementById('orgs-count-sel');\n  var elShow = document.getElementById('orgs-count-show');\n  var elItems = document.getElementById('orgs-count-items');\n  if (elSel) elSel.textContent = sel;\n  if (elShow) elShow.textContent = show;\n  if (elItems) elItems.textContent = items;\n}",
  "function updateOrgsCheckboxCounts() {\n  var sel = document.querySelectorAll('#orgs-tbody .method-circle-cb:checked').length;\n  var inspects = document.querySelectorAll('#orgs-tbody .method-org-inspects-cb:checked').length;\n  var show = document.querySelectorAll('#orgs-tbody .method-square-cb:checked').length;\n  var items = document.querySelectorAll('#orgs-tbody tr').length;\n  var elSel = document.getElementById('orgs-count-sel');\n  var elInspects = document.getElementById('orgs-count-inspects');\n  var elShow = document.getElementById('orgs-count-show');\n  var elItems = document.getElementById('orgs-count-items');\n  if (elSel) elSel.textContent = sel;\n  if (elInspects) elInspects.textContent = inspects;\n  if (elShow) elShow.textContent = show;\n  if (elItems) elItems.textContent = items;\n}"
);

mustReplace(
  'saveNewOrg push',
  "  appState.orgs.push({ name: name, show: true });",
  "  appState.orgs.push({ name: name, show: true, inspects: true });"
);

// bump build
mustReplace('APP_BUILD', "var APP_BUILD = 'pkb-v255';", "var APP_BUILD = 'pkb-v256';");

fs.writeFileSync(INDEX, Buffer.from(t, 'utf8'));

let sw = fs.readFileSync(SW, 'utf8');
sw = sw.replace(/pkb-(static|api)-v255/g, 'pkb-$1-v256');
fs.writeFileSync(SW, sw, 'utf8');

console.log('patch-orgs-inspects-column OK → pkb-v256');
