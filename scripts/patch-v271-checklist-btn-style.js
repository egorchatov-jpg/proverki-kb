const fs = require('fs');

let html = fs.readFileSync('index.html', 'utf8').replace(/\r\n/g, '\n');
let sw = fs.readFileSync('sw.js', 'utf8');

function mustReplace(oldStr, newStr, label) {
  if (!html.includes(oldStr)) throw new Error('NOT FOUND: ' + label);
  html = html.split(oldStr).join(newStr);
}

mustReplace(
  `<button type="button" class="card-checklist-btn" id="btn-card-checklist" onclick="openCardChecklistScreen()">`,
  `<button type="button" class="field-cell card-checklist-btn" id="btn-card-checklist" onclick="openCardChecklistScreen()">`,
  'checklist button field-cell class'
);

mustReplace(
  `.card-checklist-btn {
  width: 100%; min-height: 36px; padding: 6px 10px;
  border: none; border-radius: 10px;
  background: var(--orange); color: #fff;
  font-size: 13px; font-weight: 700; cursor: pointer;
  box-shadow: var(--btn-shadow); transition: opacity 0.15s;
  -webkit-tap-highlight-color: transparent;
}
.card-checklist-btn:active { opacity: 0.8; }`,
  `#screen-card .card-checklist-btn {
  appearance: none; -webkit-appearance: none;
  margin: 0; text-align: left; font-family: inherit;
  cursor: pointer; -webkit-tap-highlight-color: transparent;
}
#screen-card .card-checklist-btn:active { border-color: var(--orange); }`,
  'checklist button css match field-cell'
);

mustReplace(
  `var APP_BUILD = 'pkb-v270';`,
  `var APP_BUILD = 'pkb-v271';`,
  'APP_BUILD bump'
);

sw = sw.replace(/pkb-static-v270/g, 'pkb-static-v271');
sw = sw.replace(/pkb-api-v270/g, 'pkb-api-v271');

fs.writeFileSync('index.html', html, 'utf8');
fs.writeFileSync('sw.js', sw, 'utf8');
console.log('patch-v271-checklist-btn-style OK -> pkb-v271');
