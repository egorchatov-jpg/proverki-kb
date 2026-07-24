const fs = require('fs');

let html = fs.readFileSync('index.html', 'utf8').replace(/\r\n/g, '\n');
let sw = fs.readFileSync('sw.js', 'utf8');

function mustReplace(oldStr, newStr, label) {
  if (!html.includes(oldStr)) throw new Error('NOT FOUND: ' + label);
  html = html.split(oldStr).join(newStr);
}

mustReplace(
  `function syncCardFieldLabelWidths() {
  syncRecordFieldLabelWidths(
    document.querySelector('#screen-card .card-grid'),
    '.field-wrap:not(.field-block):not(.field-wrap-checklist) .field-label'
  );
}`,
  `function syncCardFieldLabelWidths() {
  syncRecordFieldLabelWidths(
    document.querySelector('#screen-card .card-grid'),
    '.field-wrap:not(.field-block) .field-label'
  );
}`,
  'include checklist spacer in label sync'
);

mustReplace(
  `function setCardChecklistButtonVisible(visible) {
  var wrap = document.getElementById('field-wrap-checklist-btn');
  if (wrap) wrap.hidden = !visible;
  setCardChecklistButtonLabel();
}`,
  `function setCardChecklistButtonVisible(visible) {
  var wrap = document.getElementById('field-wrap-checklist-btn');
  if (wrap) wrap.hidden = !visible;
  setCardChecklistButtonLabel();
  if (visible) requestAnimationFrame(syncCardFieldLabelWidths);
}`,
  'resync labels when checklist row shown'
);

mustReplace(
  `var APP_BUILD = 'pkb-v273';`,
  `var APP_BUILD = 'pkb-v274';`,
  'APP_BUILD bump'
);

sw = sw.replace(/pkb-static-v273/g, 'pkb-static-v274');
sw = sw.replace(/pkb-api-v273/g, 'pkb-api-v274');

fs.writeFileSync('index.html', html, 'utf8');
fs.writeFileSync('sw.js', sw, 'utf8');
console.log('patch-v274-checklist-btn-width OK -> pkb-v274');
