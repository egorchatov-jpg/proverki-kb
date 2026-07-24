const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, '..', 'index.html');
const swPath = path.join(__dirname, '..', 'sw.js');

let html = fs.readFileSync(indexPath, 'utf8').replace(/\r\n/g, '\n');

function mustReplace(old, neu, label) {
  if (!html.includes(old)) {
    console.error('Missing: ' + label);
    process.exit(1);
  }
  html = html.replace(old, neu);
}

mustReplace(
  `  setWorksCellDisplay('Выбрать');
  setDimmed('desc', true);
  updateCardDescEditable(true);
  unlockWorksCell();
  setCardChecklistButtonVisible(false);
  updateValidation();
}`,
  `  setWorksCellDisplay('Выбрать');
  setDimmed('desc', true);
  updateCardDescEditable(true);
  lockWorksCell();
  setCardChecklistButtonVisible(false);
  syncWorksCellState();
  updateValidation();
}`,
  'resetCard lock works'
);

mustReplace(
  `  var need = cardData.works === 'Нет' && cardUsesChecklistFlow() && !cardChecklistReadyForViolation();`,
  `  var need = cardUsesChecklistFlow() && !cardChecklistReadyForViolation();`,
  'checklist button hint'
);

mustReplace(
  `  if (cardData.works === 'Нет') {
    if (cardUsesChecklistFlow()) {
      ok = ok && cardChecklistReadyForViolation();
    } else {
      ok = ok && cardData.desc && String(cardData.desc).trim() !== '';
    }
  }`,
  `  if (cardUsesChecklistFlow()) {
    ok = ok && cardChecklistReadyForViolation();
  } else if (cardData.works === 'Нет') {
    ok = ok && cardData.desc && String(cardData.desc).trim() !== '';
  }`,
  'validation checklist first'
);

mustReplace(
  `    if (cardData.works === 'Нет' && cardUsesChecklistFlow() && !cardChecklistReadyForViolation()) {
      el.textContent = cardData.checklistFilled ? 'Укажите нарушения в чек-листе' : 'Заполните чек-лист';`,
  `    if (cardUsesChecklistFlow() && !cardChecklistReadyForViolation()) {
      el.textContent = cardData.checklistFilled ? 'Укажите нарушения в чек-листе' : 'Заполните чек-лист';`,
  'validation message'
);

mustReplace(
  `function clearCardChecklistState() {
  cardData.checklistViolations = null;
  cardData.checklistFilled = false;
  cardData.checklistPassportId = null;
  cardData.worksLockedByChecklist = false;
  cardData.descFromChecklist = false;
  _cardChecklistMatch = null;
  unlockWorksCell();
  unlockDescCell();
  updateCardDescEditable(true);
  setCardChecklistButtonLabel();
}`,
  `function clearCardChecklistState() {
  cardData.checklistViolations = null;
  cardData.checklistFilled = false;
  cardData.checklistPassportId = null;
  cardData.worksLockedByChecklist = false;
  cardData.descFromChecklist = false;
  cardData.works = '';
  _cardChecklistMatch = null;
  setCardChecklistButtonLabel();
}`,
  'clearCardChecklistState'
);

mustReplace(
  `function unlockWorksCell() {
  var cell = document.getElementById('cell-works');
  if (cell) {
    cell.classList.remove('dimmed');
    cell.setAttribute('onclick', 'openDrumWorks()');
  }
}`,
  `function syncWorksCellState() {
  if (!cardBarrierSelected()) {
    cardData.works = '';
    setWorksCellDisplay('Выбрать');
    lockWorksCell();
    setDimmed('desc', true);
    lockDescCell();
    updateCardDescEditable(false);
    return;
  }
  if (cardUsesChecklistFlow()) {
    lockWorksCell();
    updateCardDescEditable(false);
    if (!cardData.checklistFilled) {
      cardData.works = '';
      setWorksCellDisplay('Выбрать');
      setDimmed('desc', true);
      lockDescCell();
      var emptyDesc = document.getElementById('val-desc');
      if (emptyDesc) { emptyDesc.textContent = '—'; emptyDesc.classList.add('placeholder'); }
      return;
    }
    setWorksCellDisplay(cardData.works || 'Да');
    lockDescCell();
    setDimmed('desc', cardData.works !== 'Нет');
    return;
  }
  cardData.worksLockedByChecklist = false;
  cardData.descFromChecklist = false;
  unlockWorksCell();
  setDimmed('desc', cardData.works !== 'Нет');
  if (cardData.works === 'Нет') {
    unlockDescCell();
    updateCardDescEditable(true);
  } else {
    unlockDescCell();
    updateCardDescEditable(true);
  }
}

function unlockWorksCell() {
  var cell = document.getElementById('cell-works');
  if (cell) {
    cell.classList.remove('dimmed');
    cell.setAttribute('onclick', 'openDrumWorks()');
  }
}`,
  'syncWorksCellState'
);

mustReplace(
  `function updateCardChecklistButton() {
  if (!cardBarrierSelected()) {
    setCardChecklistButtonVisible(false);
    _cardChecklistMatch = null;
    return;
  }`,
  `function updateCardChecklistButton() {
  if (!cardBarrierSelected()) {
    setCardChecklistButtonVisible(false);
    _cardChecklistMatch = null;
    syncWorksCellState();
    return;
  }`,
  'updateCardChecklistButton no barrier'
);

mustReplace(
  `  if (cardEditRecord && !cardEditRecord.checklistFilled) {
    setCardChecklistButtonVisible(false);
    _cardChecklistMatch = null;
    return;
  }`,
  `  if (cardEditRecord && !cardEditRecord.checklistFilled) {
    setCardChecklistButtonVisible(false);
    _cardChecklistMatch = null;
    syncWorksCellState();
    return;
  }`,
  'updateCardChecklistButton edit manual'
);

mustReplace(
  `  matchPromise.then(function(match) {
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
  `  matchPromise.then(function(match) {
    var ok = !!match;
    _cardChecklistMatch = ok ? match : null;
    setCardChecklistButtonVisible(ok);
    syncWorksCellState();
    updateValidation();
  });
}`,
  'updateCardChecklistButton callback'
);

mustReplace(
  `  setCardChecklistButtonLabel();
  updateValidation();
}`,
  `  setCardChecklistButtonLabel();
  syncWorksCellState();
  updateValidation();
}`,
  'applyChecklistToCardFields validation'
);

mustReplace(
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
  `function applyCardChecklist() {
  var violations = cardData.checklistViolations || {};
  cardData.checklistPassportId = _cardChecklistMatch ? _cardChecklistMatch.passportId : null;`,
  'applyCardChecklist no alert'
);

mustReplace(
  `function openDrumWorks() {
  if (cardData.worksLockedByChecklist) return;
  openDrumOverlay('Барьер работоспособен', [
    { id: 'works', items: ['Да','Нет'], value: cardData.works || 'Да', minWidth: 200 }
  ], function(d) {
    var newWorks = d['works'].getValue();
    var broken = newWorks === 'Нет';
    if (broken && cardUsesChecklistFlow()) {
      openCardChecklistScreen();
      cardData.works = 'Нет';
      setWorksCellDisplay('Нет');
      setDimmed('desc', true);
      lockDescCell();
      updateCardDescEditable(false);
      updateValidation();
      return;
    }
    cardData.works = newWorks;
    setWorksCellDisplay(cardData.works);
    setDimmed('desc', !broken);
    if (!broken) {
      cardData.desc = '';
      document.getElementById('val-desc').textContent = '—';
      document.getElementById('val-desc').classList.add('placeholder');
    }
    updateValidation();
  });
}`,
  `function openDrumWorks() {
  if (cardData.worksLockedByChecklist || cardUsesChecklistFlow() || !cardBarrierSelected()) return;
  openDrumOverlay('Барьер работоспособен', [
    { id: 'works', items: ['Да','Нет'], value: cardData.works || 'Да', minWidth: 200 }
  ], function(d) {
    var newWorks = d['works'].getValue();
    var broken = newWorks === 'Нет';
    cardData.works = newWorks;
    setWorksCellDisplay(cardData.works);
    setDimmed('desc', !broken);
    if (!broken) {
      cardData.desc = '';
      document.getElementById('val-desc').textContent = '—';
      document.getElementById('val-desc').classList.add('placeholder');
    } else {
      unlockDescCell();
      updateCardDescEditable(true);
    }
    updateValidation();
  });
}`,
  'openDrumWorks simplified'
);

html = html.replace("var APP_BUILD = 'pkb-v245';", "var APP_BUILD = 'pkb-v246';");
fs.writeFileSync(indexPath, html.replace(/\n/g, '\r\n'), 'utf8');

let sw = fs.readFileSync(swPath, 'utf8');
sw = sw.replace(/pkb-static-v245/g, 'pkb-static-v246');
sw = sw.replace(/pkb-api-v245/g, 'pkb-api-v246');
fs.writeFileSync(swPath, sw, 'utf8');

console.log('Works cell checklist flow -> pkb-v246');
