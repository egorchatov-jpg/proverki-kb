const fs = require('fs');

let html = fs.readFileSync('index.html', 'utf8').replace(/\r\n/g, '\n');
let sw = fs.readFileSync('sw.js', 'utf8');

function mustReplace(oldStr, newStr, label) {
  if (!html.includes(oldStr)) throw new Error('NOT FOUND: ' + label);
  html = html.split(oldStr).join(newStr);
}

mustReplace(
  `<button type="button" class="field-cell card-checklist-btn" id="btn-card-checklist" onclick="openCardChecklistScreen()">`,
  `<button type="button" class="card-checklist-btn" id="btn-card-checklist" onclick="openCardChecklistScreen()">`,
  'remove field-cell from checklist btn'
);

mustReplace(
  `#screen-card .card-checklist-btn {
  appearance: none; -webkit-appearance: none;
  margin: 0; text-align: left; font-family: inherit;
  cursor: pointer; -webkit-tap-highlight-color: transparent;
}
#screen-card .card-checklist-btn:active { border-color: var(--orange); }`,
  `#screen-card .card-checklist-btn {
  flex: 1 1 0; min-width: 0; box-sizing: border-box;
  min-height: 36px; padding: 6px 10px;
  border: none; border-radius: 10px;
  background: var(--orange); color: #fff;
  font-size: 13px; font-weight: 700; cursor: pointer;
  box-shadow: var(--btn-shadow);
  display: flex; align-items: center; justify-content: center;
  appearance: none; -webkit-appearance: none;
  margin: 0; font-family: inherit;
  -webkit-tap-highlight-color: transparent;
  transition: opacity 0.15s;
}
#screen-card .card-checklist-btn:active { opacity: 0.8; }`,
  'card checklist btn layout like field-cell'
);

mustReplace(
  `.detail-checklist-row { padding-top: 0; margin-top: -2px; align-items: center; }
#screen-detail .card-checklist-btn {
  appearance: none; -webkit-appearance: none;
  margin: 0; text-align: left; font-family: inherit;
  cursor: pointer; -webkit-tap-highlight-color: transparent;
  width: auto;
}`,
  `.detail-checklist-row { padding-top: 0; margin-top: -2px; align-items: center; }
#screen-detail .card-checklist-btn {
  flex: 1 1 0; min-width: 0; box-sizing: border-box;
  min-height: 36px; padding: 6px 10px;
  border: none; border-radius: 10px;
  background: var(--orange); color: #fff;
  font-size: 13px; font-weight: 700; cursor: pointer;
  box-shadow: var(--btn-shadow);
  display: flex; align-items: center; justify-content: center;
  appearance: none; -webkit-appearance: none;
  margin: 0; font-family: inherit;
  -webkit-tap-highlight-color: transparent;
  transition: opacity 0.15s;
}
#screen-detail .card-checklist-btn:active { opacity: 0.8; }`,
  'detail checklist btn orange same width'
);

mustReplace(
  `          '<button type="button" class="detail-val detail-val-editable card-checklist-btn" onclick="openRecordChecklistView(detailRecordForEdit)">`,
  `          '<button type="button" class="card-checklist-btn" onclick="openRecordChecklistView(detailRecordForEdit)">`,
  'detail checklist btn classes'
);

mustReplace(
  `var APP_BUILD = 'pkb-v272';`,
  `var APP_BUILD = 'pkb-v273';`,
  'APP_BUILD bump'
);

sw = sw.replace(/pkb-static-v272/g, 'pkb-static-v273');
sw = sw.replace(/pkb-api-v272/g, 'pkb-api-v273');

fs.writeFileSync('index.html', html, 'utf8');
fs.writeFileSync('sw.js', sw, 'utf8');
console.log('patch-v273-checklist-btn-layout OK -> pkb-v273');
