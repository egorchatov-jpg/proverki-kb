/**
 * Card: «Проверяющая организация» + session-based field rules.
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

// HTML: field between method and org
mustReplace(
  'html inspectorOrg field',
  `      <div class="field-wrap">
        <div class="field-label" id="lbl-method">Метод проверки</div>
        <div class="field-cell" id="cell-method" onclick="openDrumMethod()">
          <span class="placeholder" id="val-method">Выбрать</span>
        </div>
      </div>

      <div class="field-wrap">
        <div class="field-label">Проверяемая организация</div>`,
  `      <div class="field-wrap">
        <div class="field-label" id="lbl-method">Метод проверки</div>
        <div class="field-cell" id="cell-method" onclick="openDrumMethod()">
          <span class="placeholder" id="val-method">Выбрать</span>
        </div>
      </div>

      <div class="field-wrap">
        <div class="field-label" id="lbl-inspectorOrg">Проверяющая организация</div>
        <div class="field-cell" id="cell-inspectorOrg" onclick="openDrumInspectorOrg()">
          <span class="placeholder" id="val-inspectorOrg">—</span>
        </div>
      </div>

      <div class="field-wrap">
        <div class="field-label" id="lbl-org">Проверяемая организация</div>`
);

mustReplace(
  'html org label id',
  `<div class="field-label" id="lbl-org">Проверяемая организация</div>
        <div class="field-cell" id="cell-org" onclick="openDrumOrg()">`,
  `<div class="field-label" id="lbl-org">Проверяемая организация</div>
        <div class="field-cell" id="cell-org" onclick="openDrumOrg()">`
);

// canEnterNewCheck: org password can enter new check
mustReplace(
  'canEnterNewCheck',
  `function canEnterNewCheck() {
  return _sessionAccess.superuser || _sessionAccess.admin || _sessionAccess.inspector;
}`,
  `function canEnterNewCheck() {
  return _sessionAccess.superuser || _sessionAccess.admin || _sessionAccess.inspector || hasAnyOrgSession();
}`
);

// Session helpers + card field sync (before CARD section helpers)
mustReplace(
  'card session helpers',
  `// ===== CARD =====
function setTodayDate() {`,
  `// ===== CARD =====
function getActiveOrgSessionName() {
  var o = _sessionAccess.orgs || {};
  for (var k in o) { if (o[k]) return k; }
  return null;
}

function isOrgSession() {
  return !!getActiveOrgSessionName();
}

function isStaffSession() {
  return _sessionAccess.superuser || _sessionAccess.admin || _sessionAccess.inspector;
}

function methodDisablesInspectorOrg(method) {
  return method === 'ОСИР' || method === 'ЦРПО';
}

function getInspectingOrgsList() {
  return (appState.orgs || []).filter(function(o) { return o.inspects === true; })
    .map(function(o) { return o.name; })
    .sort(function(a, b) { return a.localeCompare(b, 'ru'); });
}

function syncInspectorOrgCellState() {
  if (isOrgSession()) return;
  if (methodDisablesInspectorOrg(cardData.method)) {
    cardData.inspectorOrg = '';
    setCardVal('inspectorOrg', '—', false);
    setDimmed('inspectorOrg', true);
  } else {
    setDimmed('inspectorOrg', false);
    if (cardData.inspectorOrg) {
      setCardVal('inspectorOrg', cardData.inspectorOrg, false);
    } else {
      setCardVal('inspectorOrg', '—', false);
    }
  }
}

function applyCardSessionFields() {
  if (cardEditRecord) {
    syncInspectorOrgCellState();
    return;
  }
  if (isOrgSession()) {
    var orgName = getActiveOrgSessionName();
    cardData.method = 'Самооценка';
    cardData.inspectorOrg = orgName;
    cardData.org = orgName;
    setCardVal('method', 'Самооценка', false);
    setCardVal('inspectorOrg', orgName, false);
    setCardVal('org', orgName, false);
    setDimmed('method', true);
    setDimmed('inspectorOrg', true);
    setDimmed('org', true);
    return;
  }
  setDimmed('method', false);
  setDimmed('org', false);
  syncInspectorOrgCellState();
}

function isInspectorOrgSatisfied() {
  if (isOrgSession()) return true;
  if (methodDisablesInspectorOrg(cardData.method)) return true;
  return !!(cardData.inspectorOrg && String(cardData.inspectorOrg).trim());
}

function setTodayDate() {`
);

mustReplace(
  'openCard apply session',
  `function openCard() {
  cardEditRecord = null;
  resetCard();
  setCardScreenMode(false);
  showScreen('screen-card');
}`,
  `function openCard() {
  cardEditRecord = null;
  resetCard();
  applyCardSessionFields();
  setCardScreenMode(false);
  showScreen('screen-card');
}`
);

mustReplace(
  'openCardForEdit inspectorOrg',
  `  cardData = {
    dateCheck: r.dateCheck || '',
    method: r.method || '',
    org: r.org || '',
    obj: r.obj || '',
    barrier: r.barrier || '',
    works: r.works || '',
    desc: r.desc || ''
  };
  setCardVal('date', r.dateCheck || '—', !r.dateCheck);
  setCardVal('method', r.method || 'Выбрать', !r.method);
  setCardVal('org', r.org || 'Выбрать', !r.org);`,
  `  cardData = {
    dateCheck: r.dateCheck || '',
    method: r.method || '',
    inspectorOrg: r.inspector || '',
    org: r.org || '',
    obj: r.obj || '',
    barrier: r.barrier || '',
    works: r.works || '',
    desc: r.desc || ''
  };
  setCardVal('date', r.dateCheck || '—', !r.dateCheck);
  setCardVal('method', r.method || 'Выбрать', !r.method);
  setCardVal('inspectorOrg', r.inspector || '—', !r.inspector);
  setCardVal('org', r.org || 'Выбрать', !r.org);
  setDimmed('method', false);
  setDimmed('org', false);`
);

mustReplace(
  'openCardForEdit sync inspector',
  `  updateCardChecklistButton();
  var titleEl = document.querySelector('#screen-card .card-title');`,
  `  updateCardChecklistButton();
  syncInspectorOrgCellState();
  var titleEl = document.querySelector('#screen-card .card-title');`
);

mustReplace(
  'resetCard inspectorOrg',
  `  ['method','org','obj','barrier','works','desc'].forEach(function(k) {
    var isPick = k === 'method' || k === 'org' || k === 'barrier' || k === 'works';
    setCardVal(k, isPick ? 'Выбрать' : '—', isPick);
  });`,
  `  ['method','inspectorOrg','org','obj','barrier','works','desc'].forEach(function(k) {
    var isPick = k === 'method' || k === 'org' || k === 'barrier' || k === 'works';
    setCardVal(k, k === 'inspectorOrg' ? '—' : (isPick ? 'Выбрать' : '—'), isPick);
  });
  setDimmed('method', false);
  setDimmed('inspectorOrg', false);
  setDimmed('org', false);`
);

mustReplace(
  'updateValidation inspectorOrg',
  `function updateValidation() {
  var required = ['dateCheck','method','org','obj','barrier','works'];
  var ok = required.every(function(k) {
    return cardData[k] && cardData[k].trim && cardData[k].trim() !== '' || (cardData[k] && typeof cardData[k] === 'string' && cardData[k] !== '');
  });`,
  `function updateValidation() {
  var required = ['dateCheck','method','org','obj','barrier','works'];
  var ok = required.every(function(k) {
    return cardData[k] && cardData[k].trim && cardData[k].trim() !== '' || (cardData[k] && typeof cardData[k] === 'string' && cardData[k] !== '');
  });
  ok = ok && isInspectorOrgSatisfied();`
);

mustReplace(
  'submitCardEdit inspector',
  `    inspector: '',`,
  `    inspector: cardData.inspectorOrg || '',`
);

mustReplace(
  'submitCard inspector',
  `  var year = cardData.dateCheck ? cardData.dateCheck.split('.')[2] : new Date().getFullYear();
  cardData.year = year;`,
  `  var year = cardData.dateCheck ? cardData.dateCheck.split('.')[2] : new Date().getFullYear();
  cardData.year = year;
  cardData.inspector = cardData.inspectorOrg || '';`
);

mustReplace(
  'openDrumMethod guard + sync',
  `function openDrumMethod() {
  var visibleMethods = sortMethodsForDrum((appState.methods || DEFAULT_METHODS)`,
  `function openDrumMethod() {
  if (isOrgSession()) return;
  var visibleMethods = sortMethodsForDrum((appState.methods || DEFAULT_METHODS)`
);

mustReplace(
  'openDrumMethod callback sync',
  `    cardData.method = d['method'].getValue();
    document.getElementById('val-method').textContent = cardData.method;
    document.getElementById('val-method').classList.remove('placeholder');
    updateValidation();
  });
}

function openDrumOrg() {`,
  `    cardData.method = d['method'].getValue();
    document.getElementById('val-method').textContent = cardData.method;
    document.getElementById('val-method').classList.remove('placeholder');
    syncInspectorOrgCellState();
    updateValidation();
  });
}

function openDrumInspectorOrg() {
  if (isOrgSession()) return;
  if (methodDisablesInspectorOrg(cardData.method)) return;
  var orgs = getInspectingOrgsList();
  if (!orgs.length) {
    alert('Нет проверяющих организаций. Отметьте их в настройках «Организации», столбец «Проверяет».');
    return;
  }
  var cur = cardData.inspectorOrg && orgs.indexOf(cardData.inspectorOrg) >= 0 ? cardData.inspectorOrg : orgs[0];
  openDrumOverlay('Выберите проверяющую организацию', [
    { id: 'inspectorOrg', items: orgs, value: cur, fullWidth: true, widthFactor: 0.8, leftAlign: true }
  ], function(d) {
    cardData.inspectorOrg = d['inspectorOrg'].getValue();
    setCardVal('inspectorOrg', cardData.inspectorOrg, false);
    updateValidation();
  });
}

function openDrumOrg() {
  if (isOrgSession()) return;`
);

mustReplace('APP_BUILD', "var APP_BUILD = 'pkb-v258';", "var APP_BUILD = 'pkb-v259';");

fs.writeFileSync(INDEX, Buffer.from(t, 'utf8'));

let sw = fs.readFileSync(SW, 'utf8');
sw = sw.replace(/pkb-(static|api)-v258/g, 'pkb-$1-v259');
fs.writeFileSync(SW, sw, 'utf8');

console.log('patch-card-inspector-org OK → pkb-v259');
