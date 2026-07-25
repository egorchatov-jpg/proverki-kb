const fs = require('fs');

let html = fs.readFileSync('index.html', 'utf8').replace(/\r\n/g, '\n');
let sw = fs.readFileSync('sw.js', 'utf8');

function mustReplace(oldStr, newStr, label) {
  if (!html.includes(oldStr)) throw new Error('NOT FOUND: ' + label);
  html = html.split(oldStr).join(newStr);
}

mustReplace(
  `.barriers-col-passport { width: 30%; }
.barriers-col-select  { width: 15%; }
.barriers-col-name    { width: 20%; }
.barriers-col-pk      { width: 15%; }
.barriers-col-show    { width: 20%; }`,
  `.barriers-col-passport { width: 24%; }
.barriers-col-select  { width: 11%; }
.barriers-col-name    { width: 34%; }
.barriers-col-pk      { width: 13%; }
.barriers-col-show    { width: 18%; }`,
  'barriers column widths'
);

mustReplace(
  `.bpk-barrier-name-cell { padding: 4px 6px; vertical-align: middle; }
.bpk-barrier-name-btn {
  display: block; width: 100%; box-sizing: border-box;
  padding: 8px 10px;
  background: var(--navy); color: #fff;
  font-size: 13px; font-weight: 600; line-height: 1.3;
  text-align: center;
  border: none; border-radius: 999px;
  cursor: pointer;
  box-shadow: var(--btn-shadow);
  transition: opacity 0.15s;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  font-family: inherit;
  -webkit-tap-highlight-color: transparent;
}
.bpk-barrier-name-btn:active { opacity: 0.78; }`,
  `.bpk-barrier-name-cell { padding: 4px 6px; vertical-align: middle; text-align: center; }
.bpk-barrier-name-btn {
  display: inline-block; box-sizing: border-box;
  padding: 8px 14px;
  background: var(--navy); color: #fff;
  font-size: 13px; font-weight: 600; line-height: 1.3;
  text-align: center;
  border: none; border-radius: 999px;
  cursor: pointer;
  box-shadow: var(--btn-shadow);
  transition: opacity 0.15s;
  white-space: nowrap;
  font-family: inherit;
  -webkit-tap-highlight-color: transparent;
  max-width: 100%;
}
.bpk-barrier-name-btn:active { opacity: 0.78; }`,
  'bpk barrier btn css'
);

mustReplace(
  `#overlay-bpk-goals .bpk-goals-body { padding: 4px 0 8px; }`,
  `#overlay-bpk-goals .overlay-title.bpk-goals-heading { margin-bottom: 8px; }
#overlay-bpk-goals .overlay-title.bpk-goals-barrier-name { margin-top: 0; margin-bottom: 16px; }
#overlay-bpk-goals .bpk-goals-body { padding: 4px 0 8px; }`,
  'overlay goals barrier name css'
);

mustReplace(
  `    <div class="overlay-title">Установите цели по работоспособности</div>
    <div class="bpk-goals-body" id="bpk-goals-body">`,
  `    <div class="overlay-title bpk-goals-heading">Установите цели по работоспособности</div>
    <div class="overlay-title bpk-goals-barrier-name" id="bpk-goals-barrier-name"></div>
    <div class="bpk-goals-body" id="bpk-goals-body">`,
  'overlay goals barrier name html'
);

mustReplace(
  `  updateBarrierMinusBtnState();
  updateBarriersCheckboxCounts();
}

function updateBarriersCheckboxCounts() {`,
  `  updateBarrierMinusBtnState();
  updateBarriersCheckboxCounts();
  syncBpkBarrierButtonWidths();
}

function syncBpkBarrierButtonWidths() {
  var btns = document.querySelectorAll('#barriers-tbody .bpk-barrier-name-btn');
  if (!btns.length) return;
  btns.forEach(function(btn) {
    btn.style.width = 'auto';
    btn.style.minWidth = '0';
    btn.style.maxWidth = 'none';
  });
  var maxW = 0;
  btns.forEach(function(btn) {
    maxW = Math.max(maxW, btn.offsetWidth, btn.scrollWidth);
  });
  maxW = Math.ceil(maxW) + 4;
  if (!maxW) return;
  var w = maxW + 'px';
  btns.forEach(function(btn) {
    btn.style.width = w;
    btn.style.minWidth = w;
    btn.style.maxWidth = w;
  });
  var col = document.querySelector('#screen-barriers-list col.barriers-col-name');
  if (col) col.style.width = Math.ceil(maxW + 16) + 'px';
}

function updateBarriersCheckboxCounts() {`,
  'syncBpkBarrierButtonWidths fn'
);

mustReplace(
  `  if (targetInp) targetInp.value = formatBarrierGoalDisplay(b.goalPct);
  if (stretchInp) stretchInp.value = formatBarrierGoalDisplay(b.stretchGoalPct);
  document.getElementById('overlay-bpk-goals').classList.add('active');`,
  `  if (targetInp) targetInp.value = formatBarrierGoalDisplay(b.goalPct);
  if (stretchInp) stretchInp.value = formatBarrierGoalDisplay(b.stretchGoalPct);
  var nameEl = document.getElementById('bpk-goals-barrier-name');
  if (nameEl) nameEl.textContent = b.name || '';
  document.getElementById('overlay-bpk-goals').classList.add('active');`,
  'openBpkGoalsOverlay barrier name'
);

mustReplace(
  `    var cardScreen = document.getElementById('screen-card');
    if (cardScreen && cardScreen.classList.contains('active')) syncCardFieldLabelWidths();
  }, 150);
});`,
  `    var cardScreen = document.getElementById('screen-card');
    if (cardScreen && cardScreen.classList.contains('active')) syncCardFieldLabelWidths();
    var bpkList = document.getElementById('screen-barriers-list');
    if (bpkList && bpkList.classList.contains('active')) syncBpkBarrierButtonWidths();
  }, 150);
});`,
  'resize sync barrier buttons'
);

mustReplace(
  `var APP_BUILD = 'pkb-v283';`,
  `var APP_BUILD = 'pkb-v284';`,
  'APP_BUILD bump'
);

sw = sw.replace(/pkb-static-v283/g, 'pkb-static-v284');
sw = sw.replace(/pkb-api-v283/g, 'pkb-api-v284');

fs.writeFileSync('index.html', html, 'utf8');
fs.writeFileSync('sw.js', sw, 'utf8');
console.log('patch-v284-bpk-barrier-btn-width OK -> pkb-v284');
