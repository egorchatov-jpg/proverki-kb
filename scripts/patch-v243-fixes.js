const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, '..', 'index.html');
const swPath = path.join(__dirname, '..', 'sw.js');

let html = fs.readFileSync(indexPath, 'utf8').replace(/\r\n/g, '\n');

function mustReplace(old, neu, label) {
  if (!html.includes(old)) {
    console.error('Missing block: ' + label);
    process.exit(1);
  }
  html = html.replace(old, neu);
}

mustReplace(
  '.card-checklist-question.violation { color: var(--red); font-weight: 600; }',
  '.card-checklist-question.violation { color: var(--red); }',
  'checklist violation weight'
);

mustReplace(
  "    return '<span class=\"checklist-desc-line\"><strong>' + escapeHtmlText(item.prefix) + '</strong> ' + escapeHtmlText(item.desc) + '</span>';",
  "    return '<span class=\"checklist-desc-line\"><span class=\"checklist-desc-code\">' + escapeHtmlText(item.prefix) + '</span> ' + escapeHtmlText(item.desc) + '</span>';",
  'checklist desc prefix not bold'
);

mustReplace(
  'function cardChecklistReadyForViolation() {\n  if (!cardData.checklistFilled || !cardData.descFromChecklist) return false;\n  return recordHasChecklistViolations(cardData);\n}',
  'function cardChecklistReadyForViolation() {\n  if (!cardData.checklistFilled || !cardData.descFromChecklist) return false;\n  if (cardData.works && cardData.works !== \'Нет\') return true;\n  return recordHasChecklistViolations(cardData);\n}',
  'checklist ready when works yes'
);

mustReplace(
  `function applyCardChecklist() {
  var violations = cardData.checklistViolations || {};
  var hasViol = Object.keys(violations).some(function(k) {
    return String(violations[k] || '').trim();
  });
  if (cardData.works === 'Нет' && !hasViol) {
    alert('Укажите нарушения: нажмите на пункт чек-листа и опишите нарушение');
    return;
  }
  cardData.checklistPassportId = _cardChecklistMatch ? _cardChecklistMatch.passportId : null;`,
  `function applyCardChecklist() {
  var violations = cardData.checklistViolations || {};
  var hasViol = Object.keys(violations).some(function(k) {
    return String(violations[k] || '').trim();
  });
  if (!cardEditRecord && cardData.works === 'Нет' && !hasViol) {
    alert('Укажите нарушения: нажмите на пункт чек-листа и опишите нарушение');
    return;
  }
  cardData.checklistPassportId = _cardChecklistMatch ? _cardChecklistMatch.passportId : null;`,
  'allow clearing checklist in edit'
);

mustReplace(
  '    row.appendChild(mainBtn);\n    row.appendChild(mubBtn);',
  '    row.appendChild(mubBtn);\n    row.appendChild(mainBtn);',
  'swap mub and barrier buttons'
);

mustReplace(
  `  loadState();
  if (needDataMigration) {
    migrateLocalPiiOnce();
    saveState();
  }
  renderLobby();
  initDateDrum();
  initBpkInputIOSFix();
  setTodayDate();
  loadPassportManifest();
  initIOSStandaloneFix();
  loadFromServer(function() {}); // independent of SW / push permission`,
  `  loadState();
  if (needDataMigration) {
    migrateLocalPiiOnce();
    saveState();
  }
  initDateDrum();
  initBpkInputIOSFix();
  setTodayDate();
  loadPassportManifest();
  initIOSStandaloneFix();
  syncSettingsFromServer(function() {
    refreshSettingsDependentUi();
    loadFromServer(function() {
      renderLobby();
    });
  });`,
  'sync settings on startup'
);

mustReplace(
  `function syncSettingsFromServer(callback) {
  var errEl = document.getElementById('pin-error');`,
  `function refreshSettingsDependentUi() {
  renderLobby();
  if (_passportActive && _passportActive.data) renderPassportDetailScreen();
  if (_bpkYear) {
    var bl = document.getElementById('screen-barriers-list');
    if (bl && bl.classList.contains('active')) renderBarriersTable(_bpkYear);
  }
}

function syncSettingsFromServer(callback) {
  var errEl = document.getElementById('pin-error');`,
  'refreshSettingsDependentUi helper'
);

html = html.replace("var APP_BUILD = 'pkb-v242';", "var APP_BUILD = 'pkb-v243';");
fs.writeFileSync(indexPath, html.replace(/\n/g, '\r\n'), 'utf8');

let sw = fs.readFileSync(swPath, 'utf8');
sw = sw.replace(/pkb-static-v242/g, 'pkb-static-v243');
sw = sw.replace(/pkb-api-v242/g, 'pkb-api-v243');
fs.writeFileSync(swPath, sw, 'utf8');

console.log('Patched index.html + sw.js -> pkb-v243');
