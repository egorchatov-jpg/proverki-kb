const fs = require('fs');

let html = fs.readFileSync('index.html', 'utf8').replace(/\r\n/g, '\n');
let sw = fs.readFileSync('sw.js', 'utf8');

function rep(oldStr, newStr, label) {
  if (!html.includes(oldStr)) throw new Error('NOT FOUND: ' + label);
  html = html.split(oldStr).join(newStr);
}

html = html.replace(/var APP_BUILD = 'pkb-v247';/, "var APP_BUILD = 'pkb-v248';");
sw = sw.replace(/pkb-static-v247/g, 'pkb-static-v248').replace(/pkb-api-v247/g, 'pkb-api-v248');

rep(
`.card-btn-delete { background: var(--red); }
.card-btn-submit { background: var(--orange); }`,
`.card-btn-delete { background: var(--red); }
#screen-card:not(.card-mode-edit) #btn-card-delete { display: none !important; }
.card-btn-submit { background: var(--orange); }`,
'css hide delete in entry mode'
);

rep(
`function openCard() {
  cardEditRecord = null;
  resetCard();
  showScreen('screen-card');
}`,
`function openCard() {
  cardEditRecord = null;
  resetCard();
  setCardScreenMode(false);
  showScreen('screen-card');
}`,
'js openCard mode'
);

rep(
`  setWorksCellDisplay(r.works || '');
  setCardVal('desc', r.desc || '—', !r.desc);
  setDimmed('desc', r.works !== 'Нет');
  updateCardDescEditable(true);
  if (r.checklistFilled) {`,
`  setWorksCellDisplay(r.works || '');
  setCardVal('desc', r.desc || '—', !r.desc);
  if (r.checklistFilled) {`,
'js openCardForEdit remove early desc editable'
);

rep(
`  } else {
    clearCardChecklistState();
    setDimmed('desc', r.works !== 'Нет');
  }
  updateCardChecklistButton();
  var titleEl = document.querySelector('#screen-card .card-title');
  if (titleEl) titleEl.textContent = 'Измените проведенную проверку ' + checkIdLabel(r);
  setCardSubtitle('');
  syncCardBottomButtons();`,
`  } else {
    clearCardChecklistState();
  }
  updateCardChecklistButton();
  var titleEl = document.querySelector('#screen-card .card-title');
  if (titleEl) titleEl.textContent = 'Измените проведенную проверку ' + checkIdLabel(r);
  setCardSubtitle('');
  setCardScreenMode(true);`,
'js openCardForEdit mode'
);

rep(
`function syncCardBottomButtons() {
  var del = document.getElementById('btn-card-delete');
  if (del) del.hidden = !cardEditRecord;
}`,
`function setCardScreenMode(edit) {
  var screen = document.getElementById('screen-card');
  if (screen) screen.classList.toggle('card-mode-edit', !!edit);
  syncCardBottomButtons();
}

function syncCardBottomButtons() {
  var del = document.getElementById('btn-card-delete');
  if (del) del.hidden = !cardEditRecord;
}`,
'js setCardScreenMode'
);

rep(
`  cardEditRecord = null;
  syncCardBottomButtons();
  applyFindFilters();`,
`  cardEditRecord = null;
  setCardScreenMode(false);
  applyFindFilters();`,
'js deleteRecordFromApp mode'
);

rep(
`    cardEditRecord = null;
    syncCardBottomButtons();
    openDetail(rec, src);`,
`    cardEditRecord = null;
    setCardScreenMode(false);
    openDetail(rec, src);`,
'js cancelCard edit mode'
);

rep(
`  setWorksCellDisplay('');
  setDimmed('desc', true);
  updateCardDescEditable(true);
  lockWorksCell();`,
`  setWorksCellDisplay('');
  setDimmed('desc', true);
  lockDescCell();
  updateCardDescEditable(false);
  lockWorksCell();`,
'js resetCard lock desc'
);

rep(
`  cardData.worksLockedByChecklist = false;
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
}`,
`  cardData.worksLockedByChecklist = false;
  cardData.descFromChecklist = false;
  unlockWorksCell();
  var broken = cardData.works === 'Нет';
  setDimmed('desc', !broken);
  if (broken) {
    unlockDescCell();
    updateCardDescEditable(true);
  } else {
    lockDescCell();
    updateCardDescEditable(false);
  }
}`,
'js syncWorksCellState manual desc lock'
);

rep(
`    setDimmed('desc', !broken);
    if (!broken) {
      cardData.desc = '';
      document.getElementById('val-desc').textContent = '—';
      document.getElementById('val-desc').classList.add('placeholder');
    } else {
      unlockDescCell();
      updateCardDescEditable(true);
    }`,
`    setDimmed('desc', !broken);
    if (!broken) {
      cardData.desc = '';
      document.getElementById('val-desc').textContent = '—';
      document.getElementById('val-desc').classList.add('placeholder');
      lockDescCell();
      updateCardDescEditable(false);
    } else {
      unlockDescCell();
      updateCardDescEditable(true);
    }`,
'js openDrumWorks lock desc when Da'
);

rep(
`    } else {
      var el3 = document.getElementById('val-desc');
      if (el3) {
        el3.textContent = cardData.desc || '—';
        if (cardData.desc) el3.classList.remove('placeholder'); else el3.classList.add('placeholder');
      }
      setDimmed('desc', cardData.works !== 'Нет');
      updateCardDescEditable(true);
    }`,
`    } else {
      var el3 = document.getElementById('val-desc');
      if (el3) {
        el3.textContent = cardData.desc || '—';
        if (cardData.desc) el3.classList.remove('placeholder'); else el3.classList.add('placeholder');
      }
      var brokenCancel = cardData.works === 'Нет';
      setDimmed('desc', !brokenCancel);
      if (brokenCancel) {
        unlockDescCell();
        updateCardDescEditable(true);
      } else {
        lockDescCell();
        updateCardDescEditable(false);
      }
    }`,
'js cancelCardChecklist manual desc'
);

fs.writeFileSync('index.html', Buffer.from(html, 'utf8'));
fs.writeFileSync('sw.js', sw);
console.log('pkb-v248 patch applied');
