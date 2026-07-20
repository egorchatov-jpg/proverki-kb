const fs = require('fs');

let html = fs.readFileSync('index.html', 'utf8').replace(/\r\n/g, '\n');
let sw = fs.readFileSync('sw.js', 'utf8');

function rep(oldStr, newStr, label) {
  if (!html.includes(oldStr)) throw new Error('NOT FOUND: ' + label);
  html = html.split(oldStr).join(newStr);
}

html = html.replace(/var APP_BUILD = 'pkb-v246';/, "var APP_BUILD = 'pkb-v247';");
sw = sw.replace(/pkb-static-v246/g, 'pkb-static-v247').replace(/pkb-api-v246/g, 'pkb-api-v247');

// --- CSS ---
rep(
`.card-btn-cancel { background: var(--gray-btn-dark); }
.card-btn-submit { background: var(--orange); }`,
`.card-btn-cancel { background: var(--gray-btn-dark); }
.card-btn-delete { background: var(--red); }
.card-btn-submit { background: var(--orange); }`,
'css card-btn-delete'
);

rep(
`.card-checklist-btn:active { opacity: 0.8; }
.card-checklist-btn-required { box-shadow: 0 0 0 2px var(--red); }
.card-checklist-btn[hidden] { display: none !important; }`,
`.card-checklist-btn:active { opacity: 0.8; }
.card-checklist-btn[hidden] { display: none !important; }`,
'css remove checklist red outline'
);

rep(
`#overlay-restore-confirm .overlay-title { text-align: center; line-height: 1.4; }`,
`#overlay-restore-confirm .overlay-title { text-align: center; line-height: 1.4; }
#overlay-delete-record .overlay-title { text-align: center; line-height: 1.4; }`,
'css delete overlay title'
);

// --- Card bottom buttons ---
rep(
`  <div class="card-bottom">
    <button class="card-btn card-btn-cancel" onclick="cancelCard()">Отмена</button>
    <button class="card-btn card-btn-submit" id="btn-submit" disabled onclick="submitCard()">Готово</button>
  </div>
</div>

<!-- ===== НАЙТИ: СПИСОК ===== -->`,
`  <div class="card-bottom">
    <button type="button" class="card-btn card-btn-delete" id="btn-card-delete" hidden onclick="openDeleteRecordConfirm()">Удалить</button>
    <button class="card-btn card-btn-cancel" onclick="cancelCard()">Отмена</button>
    <button class="card-btn card-btn-submit" id="btn-submit" disabled onclick="submitCard()">Готово</button>
  </div>
</div>

<!-- ===== НАЙТИ: СПИСОК ===== -->`,
'html card bottom delete btn'
);

// --- Delete confirm overlay ---
rep(
`<!-- ===== OVERLAY: ПОДТВЕРЖДЕНИЕ ВОССТАНОВЛЕНИЯ ===== -->
<div class="overlay" id="overlay-restore-confirm">`,
`<!-- ===== OVERLAY: ПОДТВЕРЖДЕНИЕ УДАЛЕНИЯ ПРОВЕРКИ ===== -->
<div class="overlay" id="overlay-delete-record">
  <div class="overlay-box">
    <div class="overlay-title">Вы точно хотите удалить проверку?</div>
    <div class="overlay-btns">
      <button class="overlay-btn overlay-btn-cancel" onclick="closeDeleteRecordConfirm()">Нет</button>
      <button class="overlay-btn overlay-btn-apply" onclick="confirmDeleteRecord()">Да</button>
    </div>
  </div>
</div>

<!-- ===== OVERLAY: ПОДТВЕРЖДЕНИЕ ВОССТАНОВЛЕНИЯ ===== -->
<div class="overlay" id="overlay-restore-confirm">`,
'html delete overlay'
);

// --- checkIdBannerLabel ---
rep(
`function checkIdLabel(r) {
  return (r && r.checkId) ? String(r.checkId) : '—';
}`,
`function checkIdLabel(r) {
  return (r && r.checkId) ? String(r.checkId) : '—';
}

function checkIdBannerLabel(r) {
  var id = checkIdLabel(r);
  return id === '—' ? id : ('Проверка ' + id);
}`,
'js checkIdBannerLabel'
);

// --- openCardForEdit dimmed desc + bottom buttons ---
rep(
`    lockWorksCell();
    lockDescCell();
    updateCardDescEditable(false);
    if (r.works === 'Нет' && r.desc) {`,
`    lockWorksCell();
    lockDescCell();
    setDimmed('desc', true);
    updateCardDescEditable(false);
    if (r.works === 'Нет' && r.desc) {`,
'js openCardForEdit checklist dim desc'
);

rep(
`  updateCardChecklistButton();
  var titleEl = document.querySelector('#screen-card .card-title');
  if (titleEl) titleEl.textContent = 'Измените проведенную проверку ' + checkIdLabel(r);
  setCardSubtitle('');
  updateValidation();
  showScreen('screen-card');
}`,
`  updateCardChecklistButton();
  var titleEl = document.querySelector('#screen-card .card-title');
  if (titleEl) titleEl.textContent = 'Измените проведенную проверку ' + checkIdLabel(r);
  setCardSubtitle('');
  syncCardBottomButtons();
  updateValidation();
  showScreen('screen-card');
}`,
'js openCardForEdit sync bottom'
);

rep(
`  lockWorksCell();
  setCardChecklistButtonVisible(false);
  syncWorksCellState();
  updateValidation();
}`,
`  lockWorksCell();
  setCardChecklistButtonVisible(false);
  syncWorksCellState();
  syncCardBottomButtons();
  updateValidation();
}`,
'js resetCard sync bottom'
);

// --- remove red outline hint ---
rep(
`function updateCardChecklistButtonHint() {
  var btn = document.getElementById('btn-card-checklist');
  if (!btn) return;
  var need = cardUsesChecklistFlow() && !cardChecklistReadyForViolation();
  btn.classList.toggle('card-checklist-btn-required', need);
}`,
`function updateCardChecklistButtonHint() {
  /* red outline removed */
}`,
'js remove checklist hint'
);

// --- syncWorksCellState ---
rep(
`  if (!cardBarrierSelected()) {
    cardData.works = '';
    setWorksCellDisplay('Выбрать');
    lockWorksCell();`,
`  if (!cardBarrierSelected()) {
    cardData.works = '';
    setWorksCellDisplay('');
    lockWorksCell();`,
'js syncWorks no barrier'
);

rep(
`    if (!cardData.checklistFilled) {
      cardData.works = '';
      setWorksCellDisplay('Выбрать');
      setDimmed('desc', true);`,
`    if (!cardData.checklistFilled) {
      cardData.works = '';
      setWorksCellDisplay('');
      setDimmed('desc', true);`,
'js syncWorks checklist unfilled'
);

rep(
`    setWorksCellDisplay(cardData.works || 'Да');
    lockDescCell();
    setDimmed('desc', cardData.works !== 'Нет');
    return;`,
`    setWorksCellDisplay(cardData.works || 'Да');
    lockDescCell();
    setDimmed('desc', true);
    return;`,
'js syncWorks checklist filled dim desc'
);

// --- setWorksCellDisplay ---
rep(
`function setWorksCellDisplay(value) {
  var el = document.getElementById('val-works');
  var cw = document.getElementById('cell-works');
  if (cw) cw.classList.remove('field-cell-red');
  if (!el) return;
  if (value === 'Нет') {
    el.innerHTML = '<span class="field-val-works-no">Нет</span>';
  } else {
    el.textContent = value || 'Выбрать';
  }
}`,
`function setWorksCellDisplay(value) {
  var el = document.getElementById('val-works');
  var cw = document.getElementById('cell-works');
  if (cw) cw.classList.remove('field-cell-red');
  if (!el) return;
  if (value === 'Нет') {
    el.innerHTML = '<span class="field-val-works-no">Нет</span>';
    el.classList.remove('placeholder');
  } else if (value === 'Да') {
    el.textContent = 'Да';
    el.classList.remove('placeholder');
  } else {
    el.textContent = '—';
    el.classList.add('placeholder');
  }
}`,
'js setWorksCellDisplay dash'
);

// --- corrective / sokb banner ---
rep(
`    '<div class="corr-info-line"><b>' + esc(checkIdLabel(r)) + '</b></div>' +
    '<div class="corr-info-line">Дата: ' + esc(r.dateCheck||'') + ' | Метод: ' + esc(r.method||'') + '</div>' +
    '<div class="corr-info-line">Организация: ' + esc(r.org||'') + ' | Барьер: ' + esc(r.barrier||'') + '</div>' +
    (formatRecordDescPlain(r) ? '<div class="corr-info-line corr-info-desc">Описание: ' + formatRecordDescHtml(r) + '</div>' : '');
  renderSokbAttempts();`,
`    '<div class="corr-info-line"><b>' + esc(checkIdBannerLabel(r)) + '</b></div>' +
    '<div class="corr-info-line">Дата: ' + esc(r.dateCheck||'') + ' | Метод: ' + esc(r.method||'') + '</div>' +
    '<div class="corr-info-line">Организация: ' + esc(r.org||'') + ' | Барьер: ' + esc(r.barrier||'') + '</div>' +
    (formatRecordDescPlain(r) ? '<div class="corr-info-line corr-info-desc">Описание: ' + formatRecordDescHtml(r) + '</div>' : '');
  renderSokbAttempts();`,
'js sokb banner label'
);

rep(
`    '<div class="corr-info-line"><b>' + esc(checkIdLabel(r)) + '</b></div>' +
    '<div class="corr-info-line">Дата: ' + esc(r.dateCheck||'') + ' | Метод: ' + esc(r.method||'') + '</div>' +
    '<div class="corr-info-line">Организация: ' + esc(r.org||'') + ' | Барьер: ' + esc(r.barrier||'') + '</div>' +
    (formatRecordDescPlain(r) ? '<div class="corr-info-line corr-info-desc">Описание: ' + formatRecordDescHtml(r) + '</div>' : '');
  renderCorrMeasures();`,
`    '<div class="corr-info-line"><b>' + esc(checkIdBannerLabel(r)) + '</b></div>' +
    '<div class="corr-info-line">Дата: ' + esc(r.dateCheck||'') + ' | Метод: ' + esc(r.method||'') + '</div>' +
    '<div class="corr-info-line">Организация: ' + esc(r.org||'') + ' | Барьер: ' + esc(r.barrier||'') + '</div>' +
    (formatRecordDescPlain(r) ? '<div class="corr-info-line corr-info-desc">Описание: ' + formatRecordDescHtml(r) + '</div>' : '');
  renderCorrMeasures();`,
'js corrective banner label'
);

// --- delete record helpers ---
rep(
`function cancelCard() {
  var titleEl = document.querySelector('#screen-card .card-title');
  if (titleEl) titleEl.textContent = 'Внесите результат проведенной проверки';
  setCardSubtitle('');
  if (cardEditRecord) {`,
`function syncCardBottomButtons() {
  var del = document.getElementById('btn-card-delete');
  if (del) del.hidden = !cardEditRecord;
}

function openDeleteRecordConfirm() {
  if (!cardEditRecord) return;
  document.getElementById('overlay-delete-record').classList.add('active');
}

function closeDeleteRecordConfirm() {
  document.getElementById('overlay-delete-record').classList.remove('active');
}

function confirmDeleteRecord() {
  if (!cardEditRecord) return;
  closeDeleteRecordConfirm();
  deleteRecordFromApp(cardEditRecord);
}

function deleteRecordFromApp(r) {
  if (!r) return;
  var year = r.year || (r.dateCheck ? r.dateCheck.split('.')[2] : String(new Date().getFullYear()));
  appState.db = appState.db.filter(function(x) {
    if (r.checkId && x.checkId === r.checkId) return false;
    if (r.dateEntry && x.dateEntry === r.dateEntry) return false;
    return true;
  });
  renumberDb();
  saveState();
  if (r.id) removeFromSyncQueue(r.id);
  removeFromUpdateQueue(r.dateEntry);
  var shas = getServerShas();
  delete shas['sha' + year];
  saveServerShas(shas);
  cardEditRecord = null;
  syncCardBottomButtons();
  applyFindFilters();
  renderCorrectiveList();
  renderLobby();
  goLobby();
  fetch('/api/delete-record', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      record: {
        checkId: r.checkId || '',
        dateEntry: r.dateEntry,
        year: year,
        dateCheck: r.dateCheck || '',
        method: r.method || '',
        org: r.org || '',
        barrier: r.barrier || ''
      }
    })
  }).then(function(res) { return res.json(); }).then(function(d) {
    if (d.success) {
      console.log('[delete] removed from server:', r.checkId || r.dateEntry);
    } else {
      console.warn('[delete] server error:', d.error || 'unknown');
    }
  }).catch(function(e) {
    console.warn('[delete] request failed:', e.message || e);
  });
}

function cancelCard() {
  var titleEl = document.querySelector('#screen-card .card-title');
  if (titleEl) titleEl.textContent = 'Внесите результат проведенной проверки';
  setCardSubtitle('');
  if (cardEditRecord) {`,
'js delete record functions'
);

rep(
`  if (cardEditRecord) {
    var rec = cardEditRecord;
    var src = detailSource;
    cardEditRecord = null;
    openDetail(rec, src);
    return;
  }`,
`  if (cardEditRecord) {
    var rec = cardEditRecord;
    var src = detailSource;
    cardEditRecord = null;
    syncCardBottomButtons();
    openDetail(rec, src);
    return;
  }`,
'js cancelCard sync bottom'
);

// openCardForEdit setWorksCellDisplay for edit without checklist still uses works value
rep(
`  setWorksCellDisplay(r.works || 'Выбрать');`,
`  setWorksCellDisplay(r.works || '');`,
'js openCardForEdit works display'
);

rep(
`  setWorksCellDisplay('Выбрать');
  setDimmed('desc', true);
  updateCardDescEditable(true);
  lockWorksCell();`,
`  setWorksCellDisplay('');
  setDimmed('desc', true);
  updateCardDescEditable(true);
  lockWorksCell();`,
'js resetCard works display'
);

fs.writeFileSync('index.html', Buffer.from(html, 'utf8'));
fs.writeFileSync('sw.js', sw);
console.log('pkb-v247 patch applied');
