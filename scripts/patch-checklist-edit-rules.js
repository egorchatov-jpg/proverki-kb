const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const indexPath = path.join(root, 'index.html');
const swPath = path.join(root, 'sw.js');

let html = fs.readFileSync(indexPath, 'utf8').replace(/\r\n/g, '\n');

function mustReplace(old, neu, label) {
  if (!html.includes(old)) {
    console.error('Missing block: ' + label);
    process.exit(1);
  }
  html = html.replace(old, neu);
}

// Spacing: same gap as other card rows
mustReplace(
  '.field-wrap-checklist { padding-top: 0; margin-top: -2px; display: none; }',
  '.field-wrap-checklist { display: none; }',
  'checklist row spacing'
);

mustReplace(
  `.detail-val-works-no { color: var(--red); font-weight: 700; }
.detail-checklist-row { padding-top: 0; margin-top: -2px; align-items: center; }
.detail-checklist-row .card-checklist-btn { flex: 1; }
.detail-back {`,
  `.detail-val-works-no { color: var(--red); font-weight: 700; }
.detail-back {`,
  'remove detail checklist css'
);

// Remove checklist button from detail view
mustReplace(
  `    row('Проверяемый барьер', r.barrier, '', editRecord) +
    (recordHasSavedChecklist(r)
      ? '<div class="detail-row detail-checklist-row">' +
          '<div class="detail-label field-label-spacer">Проверяемый барьер</div>' +
          '<button type="button" class="card-checklist-btn" onclick="openRecordChecklistView(detailRecordForEdit)">Чек-лист</button>' +
        '</div>'
      : '') +
    row('Барьер в ПК', r.barrierInPK, '', editRecord) +`,
  `    row('Проверяемый барьер', r.barrier, '', editRecord) +
    row('Барьер в ПК', r.barrierInPK, '', editRecord) +`,
  'remove detail checklist button'
);

// openCardForEdit: use checklistFilled, not checklistViolations
mustReplace(
  `  setDimmed('desc', r.works !== 'Нет');
  updateCardDescEditable(!r.checklistViolations);
  if (r.checklistViolations) {
    cardData.checklistViolations = Object.assign({}, r.checklistViolations);
    cardData.checklistFilled = true;
    cardData.checklistPassportId = r.checklistPassportId || null;
    cardData.worksLockedByChecklist = true;
    cardData.descFromChecklist = true;
    _cardChecklistQuestionTexts = r.checklistQuestionTexts ? Object.assign({}, r.checklistQuestionTexts) : {};
    lockWorksCell();
    lockDescCell();
    if (r.works === 'Нет' && r.desc) {
      var descEl = document.getElementById('val-desc');
      if (descEl) {
        descEl.innerHTML = buildChecklistDescHtml(cardData.checklistViolations, _cardChecklistQuestionTexts);
        descEl.classList.remove('placeholder');
      }
    }
    setCardChecklistButtonLabel();
  } else {
    clearCardChecklistState();
  }`,
  `  setDimmed('desc', r.works !== 'Нет');
  updateCardDescEditable(true);
  if (r.checklistFilled) {
    cardData.checklistViolations = Object.assign({}, r.checklistViolations || {});
    cardData.checklistFilled = true;
    cardData.checklistPassportId = r.checklistPassportId || null;
    cardData.worksLockedByChecklist = true;
    cardData.descFromChecklist = true;
    _cardChecklistQuestionTexts = r.checklistQuestionTexts ? Object.assign({}, r.checklistQuestionTexts) : {};
    lockWorksCell();
    lockDescCell();
    updateCardDescEditable(false);
    if (r.works === 'Нет' && r.desc) {
      var descEl = document.getElementById('val-desc');
      if (descEl) {
        descEl.innerHTML = buildChecklistDescHtml(cardData.checklistViolations, _cardChecklistQuestionTexts);
        descEl.classList.remove('placeholder');
      }
    }
    setCardChecklistButtonLabel();
  } else {
    clearCardChecklistState();
    setDimmed('desc', r.works !== 'Нет');
  }`,
  'openCardForEdit checklistFilled'
);

// cardUsesChecklistFlow helper before cardBarrierHasChecklist
mustReplace(
  `function cardBarrierHasChecklist() {
  return !!_cardChecklistMatch;
}`,
  `function cardUsesChecklistFlow() {
  if (cardEditRecord && !cardEditRecord.checklistFilled) return false;
  return cardBarrierHasChecklist();
}

function cardBarrierHasChecklist() {
  return !!_cardChecklistMatch;
}`,
  'cardUsesChecklistFlow helper'
);

mustReplace(
  `  if (cardData.works === 'Нет') {
    if (cardBarrierHasChecklist()) {
      ok = ok && cardChecklistReadyForViolation();
    } else {
      ok = ok && cardData.desc && String(cardData.desc).trim() !== '';
    }
  }`,
  `  if (cardData.works === 'Нет') {
    if (cardUsesChecklistFlow()) {
      ok = ok && cardChecklistReadyForViolation();
    } else {
      ok = ok && cardData.desc && String(cardData.desc).trim() !== '';
    }
  }`,
  'validation checklist flow'
);

mustReplace(
  `    if (cardData.works === 'Нет' && cardBarrierHasChecklist() && !cardChecklistReadyForViolation()) {
      el.textContent = cardData.checklistFilled ? 'Укажите нарушения в чек-листе' : 'Заполните чек-лист';`,
  `    if (cardData.works === 'Нет' && cardUsesChecklistFlow() && !cardChecklistReadyForViolation()) {
      el.textContent = cardData.checklistFilled ? 'Укажите нарушения в чек-листе' : 'Заполните чек-лист';`,
  'validation message checklist flow'
);

mustReplace(
  `  var need = cardData.works === 'Нет' && cardBarrierHasChecklist() && !cardChecklistReadyForViolation();`,
  `  var need = cardData.works === 'Нет' && cardUsesChecklistFlow() && !cardChecklistReadyForViolation();`,
  'checklist button hint'
);

mustReplace(
  `function setCardChecklistButtonLabel() {
  var btn = document.getElementById('btn-card-checklist');
  if (!btn) return;
  btn.textContent = cardData.checklistFilled ? 'Чек-лист' : 'Заполнить чек-лист';
}`,
  `function setCardChecklistButtonLabel() {
  var btn = document.getElementById('btn-card-checklist');
  if (!btn) return;
  if (cardEditRecord) {
    btn.textContent = 'Чек-лист';
  } else {
    btn.textContent = cardData.checklistFilled ? 'Чек-лист' : 'Заполнить чек-лист';
  }
}`,
  'edit mode button label'
);

mustReplace(
  `function updateCardChecklistButton() {
  if (!cardBarrierSelected()) {
    setCardChecklistButtonVisible(false);
    _cardChecklistMatch = null;
    return;
  }
  var barrier = String(cardData.barrier || '').trim();
  findPassportBarrierForName(barrier).then(function(match) {
    var ok = !!(match && passportBarrierHasChecklistQuestions(match.barrier));
    _cardChecklistMatch = ok ? match : null;
    setCardChecklistButtonVisible(ok);
  });
}`,
  `function updateCardChecklistButton() {
  if (!cardBarrierSelected()) {
    setCardChecklistButtonVisible(false);
    _cardChecklistMatch = null;
    return;
  }
  if (cardEditRecord && !cardEditRecord.checklistFilled) {
    setCardChecklistButtonVisible(false);
    _cardChecklistMatch = null;
    return;
  }
  var barrier = String(cardData.barrier || '').trim();
  var matchPromise = (cardEditRecord && cardEditRecord.checklistFilled)
    ? loadChecklistMatchForRecord(cardEditRecord)
    : findPassportBarrierForName(barrier).then(function(match) {
        return (match && passportBarrierHasChecklistQuestions(match.barrier)) ? match : null;
      });
  matchPromise.then(function(match) {
    var ok = !!match;
    _cardChecklistMatch = ok ? match : null;
    setCardChecklistButtonVisible(ok);
    if (cardEditRecord && cardEditRecord.checklistFilled && ok) {
      lockWorksCell();
      lockDescCell();
      updateCardDescEditable(false);
    }
  });
}`,
  'updateCardChecklistButton edit logic'
);

mustReplace(
  `    if (broken && cardBarrierHasChecklist()) {
      openCardChecklistScreen();`,
  `    if (broken && cardUsesChecklistFlow()) {
      openCardChecklistScreen();`,
  'openDrumWorks checklist flow'
);

html = html.replace("var APP_BUILD = 'pkb-v241';", "var APP_BUILD = 'pkb-v242';");
fs.writeFileSync(indexPath, html.replace(/\n/g, '\r\n'), 'utf8');

let sw = fs.readFileSync(swPath, 'utf8');
sw = sw.replace(/pkb-static-v241/g, 'pkb-static-v242');
sw = sw.replace(/pkb-api-v241/g, 'pkb-api-v242');
fs.writeFileSync(swPath, sw, 'utf8');

console.log('Checklist UI rules updated -> pkb-v242');
