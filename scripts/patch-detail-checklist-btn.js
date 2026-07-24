const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const indexPath = path.join(root, 'index.html');
const swPath = path.join(root, 'sw.js');

let html = fs.readFileSync(indexPath, 'utf8').replace(/\r\n/g, '\n');

const cssOld = `.detail-val-works-no { color: var(--red); font-weight: 700; }`;
const cssNew = `.detail-val-works-no { color: var(--red); font-weight: 700; }
.detail-checklist-row { padding-top: 0; margin-top: -2px; align-items: center; }
.detail-checklist-row .card-checklist-btn { flex: 1; }`;

if (!html.includes(cssOld)) {
  console.error('Could not find detail CSS anchor');
  process.exit(1);
}
html = html.replace(cssOld, cssNew);

const bodyOld = `    row('Проверяемый барьер', r.barrier, '', editRecord) +
    row('Барьер в ПК', r.barrierInPK, '', editRecord) +`;

const bodyNew = `    row('Проверяемый барьер', r.barrier, '', editRecord) +
    (recordHasSavedChecklist(r)
      ? '<div class="detail-row detail-checklist-row">' +
          '<div class="detail-label field-label-spacer">Проверяемый барьер</div>' +
          '<button type="button" class="card-checklist-btn" onclick="openRecordChecklistView(detailRecordForEdit)">Чек-лист</button>' +
        '</div>'
      : '') +
    row('Барьер в ПК', r.barrierInPK, '', editRecord) +`;

if (!html.includes(bodyOld)) {
  console.error('Could not find detail barrier row block');
  process.exit(1);
}
html = html.replace(bodyOld, bodyNew);

const checklistBlockOld = `    (showViolationDesc ? block('Описание нарушения', formatRecordDescHtml(r), editRecord) : '') +
    (recordHasSavedChecklist(r)
      ? '<div class="detail-block detail-block-navy" onclick="openRecordChecklistView(detailRecordForEdit)">' +
          '<div class="detail-block-label">Чек-лист</div>' +
          '<div class="detail-block-val">' + (recordHasChecklistViolations(r) ? 'Открыть (есть нарушения)' : 'Открыть') + '</div>' +
        '</div>'
      : '') +
    corrBlock +`;

const checklistBlockNew = `    (showViolationDesc ? block('Описание нарушения', formatRecordDescHtml(r), editRecord) : '') +
    corrBlock +`;

if (!html.includes(checklistBlockOld)) {
  console.error('Could not find detail checklist block to remove');
  process.exit(1);
}
html = html.replace(checklistBlockOld, checklistBlockNew);

html = html.replace("var APP_BUILD = 'pkb-v240';", "var APP_BUILD = 'pkb-v241';");
fs.writeFileSync(indexPath, html.replace(/\n/g, '\r\n'), 'utf8');

let sw = fs.readFileSync(swPath, 'utf8');
sw = sw.replace(/pkb-static-v240/g, 'pkb-static-v241');
sw = sw.replace(/pkb-api-v240/g, 'pkb-api-v241');
fs.writeFileSync(swPath, sw, 'utf8');

console.log('Detail checklist button under barrier -> pkb-v241');
