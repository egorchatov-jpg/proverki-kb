const fs = require('fs');

let html = fs.readFileSync('index.html', 'utf8').replace(/\r\n/g, '\n');
let sw = fs.readFileSync('sw.js', 'utf8');

function mustReplace(oldStr, newStr, label) {
  if (!html.includes(oldStr)) throw new Error('NOT FOUND: ' + label);
  html = html.split(oldStr).join(newStr);
}

mustReplace(
  `#screen-card .field-wrap {
  flex-direction: row; align-items: center; gap: 8px; padding: 4px 0;
}
#screen-card .field-wrap:not(.field-block):not(.field-wrap-checklist) {
  display: grid;
  grid-template-columns: 44% 51%;
  align-items: center;
}
#screen-card .field-wrap.field-block {
  flex-direction: column; align-items: stretch;
  display: flex;
}
#screen-card .field-label {
  width: 44%; flex-shrink: 0; font-size: 13px; font-weight: 500;
  line-height: 1.3; padding-left: 0;
}
#screen-card .field-wrap:not(.field-block):not(.field-wrap-checklist) .field-label {
  width: auto; max-width: 100%;
}
#screen-card .field-wrap.field-block .field-label {
  width: auto; margin-bottom: 4px;
}
#screen-card .field-cell {
  flex: 1; min-height: 36px; padding: 6px 10px; font-size: 13px;
  border: 2px solid var(--orange); border-radius: 10px;
  box-shadow: none; font-weight: 500;
}
#screen-card .field-wrap:not(.field-block):not(.field-wrap-checklist) .field-cell {
  flex: none; width: 100%; max-width: 100%; min-width: 0; box-sizing: border-box;
}`,
  `#screen-card .field-wrap {
  flex-direction: row; align-items: center; gap: 8px; padding: 4px 0;
}
#screen-card .field-wrap.field-block {
  flex-direction: column; align-items: stretch;
}
#screen-card .field-label {
  flex: 0 0 auto; width: auto; white-space: nowrap;
  font-size: 13px; font-weight: 500;
  line-height: 1.3; padding-left: 0;
}
#screen-card .field-wrap.field-block .field-label {
  width: auto; white-space: normal; margin-bottom: 4px;
}
#screen-card .field-cell {
  flex: 1 1 0; min-width: 0; min-height: 36px; padding: 6px 10px; font-size: 13px;
  border: 2px solid var(--orange); border-radius: 10px;
  box-shadow: none; font-weight: 500; box-sizing: border-box;
}`,
  'card field css'
);

mustReplace(
  `.detail-row {
  display: grid;
  grid-template-columns: 44% 51%;
  gap: 8px;
  align-items: center;
  padding: 4px 0;
}
.detail-label { font-size: 13px; color: var(--text2); font-weight: 500; width: auto; max-width: 100%; flex-shrink: 0; line-height: 1.3; }
.detail-val {
  font-size: 13px; color: #1a2035; font-weight: 500;
  width: 100%; max-width: 100%; min-width: 0; box-sizing: border-box;
  line-height: 1.3;`,
  `.detail-row { display: flex; align-items: center; gap: 8px; padding: 4px 0; }
.detail-label {
  flex: 0 0 auto; width: auto; white-space: nowrap;
  font-size: 13px; color: var(--text2); font-weight: 500; line-height: 1.3;
}
.detail-val {
  font-size: 13px; color: #1a2035; font-weight: 500;
  flex: 1 1 0; min-width: 0; box-sizing: border-box;
  line-height: 1.3;`,
  'detail row css'
);

mustReplace(
  '// ===== DETAIL =====\nvar detailRecordForEdit = null;',
  `function syncRecordFieldLabelWidths(root, selector) {
  if (!root) return;
  var labels = root.querySelectorAll(selector);
  if (!labels.length) return;
  labels.forEach(function(el) { el.style.width = ''; });
  var maxW = 0;
  labels.forEach(function(el) {
    maxW = Math.max(maxW, el.scrollWidth);
  });
  if (!maxW) return;
  var w = Math.ceil(maxW) + 'px';
  labels.forEach(function(el) { el.style.width = w; });
}

function syncCardFieldLabelWidths() {
  syncRecordFieldLabelWidths(
    document.querySelector('#screen-card .card-grid'),
    '.field-wrap:not(.field-block):not(.field-wrap-checklist) .field-label'
  );
}

function syncDetailFieldLabelWidths() {
  syncRecordFieldLabelWidths(document.getElementById('detail-body'), '.detail-row .detail-label');
}

// ===== DETAIL =====
var detailRecordForEdit = null;`,
  'label width sync helpers'
);

mustReplace(
  `  setCardScreenMode(false);
  showScreen('screen-card');
}

function openRecordEditPIN() {`,
  `  setCardScreenMode(false);
  showScreen('screen-card');
  requestAnimationFrame(syncCardFieldLabelWidths);
}

function openRecordEditPIN() {`,
  'openCard sync labels'
);

mustReplace(
  `  updateValidation();
  showScreen('screen-card');
}

function setCardScreenMode(edit) {`,
  `  updateValidation();
  showScreen('screen-card');
  requestAnimationFrame(syncCardFieldLabelWidths);
}

function setCardScreenMode(edit) {`,
  'openCardForEdit sync labels'
);

mustReplace(
  `  document.getElementById('detail-scroll').scrollTop = 0;
  showScreen('screen-detail');
}

// ===== DRUM PICKER =====`,
  `  document.getElementById('detail-scroll').scrollTop = 0;
  showScreen('screen-detail');
  requestAnimationFrame(syncDetailFieldLabelWidths);
}

// ===== DRUM PICKER =====`,
  'openDetail sync labels'
);

mustReplace(
  `var APP_BUILD = 'pkb-v268';`,
  `var APP_BUILD = 'pkb-v269';`,
  'APP_BUILD bump'
);

sw = sw.replace(/pkb-static-v268/g, 'pkb-static-v269');
sw = sw.replace(/pkb-api-v268/g, 'pkb-api-v269');

fs.writeFileSync('index.html', html, 'utf8');
fs.writeFileSync('sw.js', sw, 'utf8');
console.log('patch-v269-label-width-auto OK -> pkb-v269');
