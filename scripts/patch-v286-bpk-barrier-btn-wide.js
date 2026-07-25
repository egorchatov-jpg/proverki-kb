const fs = require('fs');

let html = fs.readFileSync('index.html', 'utf8').replace(/\r\n/g, '\n');
let sw = fs.readFileSync('sw.js', 'utf8');

function mustReplace(oldStr, newStr, label) {
  if (!html.includes(oldStr)) throw new Error('NOT FOUND: ' + label);
  html = html.split(oldStr).join(newStr);
}

mustReplace(
  `.barriers-col-passport { width: 24%; }
.barriers-col-select  { width: 11%; }
.barriers-col-name    { width: 34%; }
.barriers-col-pk      { width: 13%; }
.barriers-col-show    { width: 18%; }`,
  `.barriers-col-passport { width: 22%; }
.barriers-col-select  { width: 9%; }
.barriers-col-name    { width: 46%; }
.barriers-col-pk      { width: 11%; }
.barriers-col-show    { width: 12%; }`,
  'barriers column widths wider name'
);

mustReplace(
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
  `.bpk-barrier-name-cell { padding: 4px 4px; vertical-align: middle; }
.bpk-barrier-name-btn {
  display: block; width: 100%; box-sizing: border-box;
  padding: 9px 12px;
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
}
.bpk-barrier-name-btn:active { opacity: 0.78; }`,
  'bpk barrier btn full cell width'
);

mustReplace(
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
  `  updateBarrierMinusBtnState();
  updateBarriersCheckboxCounts();
}

function updateBarriersCheckboxCounts() {`,
  'remove broken syncBpkBarrierButtonWidths'
);

mustReplace(
  `    var bpkList = document.getElementById('screen-barriers-list');
    if (bpkList && bpkList.classList.contains('active')) syncBpkBarrierButtonWidths();
  }, 150);
});`,
  `  }, 150);
});`,
  'remove resize sync barrier buttons'
);

mustReplace(
  `var APP_BUILD = 'pkb-v285';`,
  `var APP_BUILD = 'pkb-v286';`,
  'APP_BUILD bump'
);

sw = sw.replace(/pkb-static-v285/g, 'pkb-static-v286');
sw = sw.replace(/pkb-api-v285/g, 'pkb-api-v286');

fs.writeFileSync('index.html', html, 'utf8');
fs.writeFileSync('sw.js', sw, 'utf8');
console.log('patch-v286-bpk-barrier-btn-wide OK -> pkb-v286');
