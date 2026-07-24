const fs = require('fs');

let html = fs.readFileSync('index.html', 'utf8').replace(/\r\n/g, '\n');
let sw = fs.readFileSync('sw.js', 'utf8');

function mustReplace(oldStr, newStr, label) {
  if (!html.includes(oldStr)) throw new Error('NOT FOUND: ' + label);
  html = html.split(oldStr).join(newStr);
}

mustReplace(
  `.detail-val.detail-val-editable {
  border: 2px solid var(--orange); cursor: pointer; background: #fff;
}`,
  `.detail-val.detail-val-editable {
  border: 2px solid var(--orange); cursor: pointer; background: #fff;
}
.detail-checklist-row { padding-top: 0; margin-top: -2px; align-items: center; }
#screen-detail .card-checklist-btn {
  appearance: none; -webkit-appearance: none;
  margin: 0; text-align: left; font-family: inherit;
  cursor: pointer; -webkit-tap-highlight-color: transparent;
  width: auto;
}`,
  'detail checklist row css'
);

mustReplace(
  `    row('\u041f\u0440\u043e\u0432\u0435\u0440\u044f\u0435\u043c\u044b\u0439 \u0431\u0430\u0440\u044c\u0435\u0440', r.barrier, '', editRecord) +
    row('\u0411\u0430\u0440\u044c\u0435\u0440 \u0432 \u041f\u041a', r.barrierInPK, '', editRecord) +`,
  `    row('\u041f\u0440\u043e\u0432\u0435\u0440\u044f\u0435\u043c\u044b\u0439 \u0431\u0430\u0440\u044c\u0435\u0440', r.barrier, '', editRecord) +
    (recordHasSavedChecklist(r)
      ? '<div class="detail-row detail-checklist-row">' +
          '<div class="detail-label field-label-spacer">\u041f\u0440\u043e\u0432\u0435\u0440\u044f\u0435\u043c\u044b\u0439 \u0431\u0430\u0440\u044c\u0435\u0440</div>' +
          '<button type="button" class="detail-val detail-val-editable card-checklist-btn" onclick="openRecordChecklistView(detailRecordForEdit)">\u0427\u0435\u043a-\u043b\u0438\u0441\u0442</button>' +
        '</div>'
      : '') +
    row('\u0411\u0430\u0440\u044c\u0435\u0440 \u0432 \u041f\u041a', r.barrierInPK, '', editRecord) +`,
  'detail checklist button row'
);

mustReplace(
  `var APP_BUILD = 'pkb-v271';`,
  `var APP_BUILD = 'pkb-v272';`,
  'APP_BUILD bump'
);

sw = sw.replace(/pkb-static-v271/g, 'pkb-static-v272');
sw = sw.replace(/pkb-api-v271/g, 'pkb-api-v272');

fs.writeFileSync('index.html', html, 'utf8');
fs.writeFileSync('sw.js', sw, 'utf8');
console.log('patch-v272-detail-checklist-btn OK -> pkb-v272');
