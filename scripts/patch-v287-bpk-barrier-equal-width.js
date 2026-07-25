const fs = require('fs');

let html = fs.readFileSync('index.html', 'utf8').replace(/\r\n/g, '\n');
let sw = fs.readFileSync('sw.js', 'utf8');

function mustReplace(oldStr, newStr, label) {
  if (!html.includes(oldStr)) throw new Error('NOT FOUND: ' + label);
  html = html.split(oldStr).join(newStr);
}

mustReplace(
  `.bpk-barrier-name-cell { padding: 4px 4px; vertical-align: middle; }
.bpk-barrier-name-btn {
  display: block; width: 100%; box-sizing: border-box;
  padding: 9px 12px;`,
  `.bpk-barrier-name-cell { padding: 4px 4px; vertical-align: middle; text-align: center; }
.bpk-barrier-name-btn {
  display: inline-block; box-sizing: border-box;
  padding: 9px 12px;`,
  'bpk barrier btn inline-block'
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

var _bpkBarrierMeasureProbe = null;

function getBpkBarrierMeasureProbe() {
  if (_bpkBarrierMeasureProbe) return _bpkBarrierMeasureProbe;
  var probe = document.createElement('button');
  probe.type = 'button';
  probe.className = 'bpk-barrier-name-btn';
  probe.style.position = 'absolute';
  probe.style.left = '-9999px';
  probe.style.top = '0';
  probe.style.visibility = 'hidden';
  probe.style.pointerEvents = 'none';
  probe.style.width = 'auto';
  probe.style.minWidth = '0';
  probe.style.maxWidth = 'none';
  document.body.appendChild(probe);
  _bpkBarrierMeasureProbe = probe;
  return probe;
}

function syncBpkBarrierButtonWidths() {
  var btns = document.querySelectorAll('#barriers-tbody .bpk-barrier-name-btn');
  if (!btns.length) return;
  var probe = getBpkBarrierMeasureProbe();
  var maxW = 0;
  btns.forEach(function(btn) {
    probe.textContent = btn.textContent || '';
    maxW = Math.max(maxW, probe.offsetWidth, probe.scrollWidth);
  });
  maxW = Math.ceil(maxW);
  if (!maxW) return;
  var w = maxW + 'px';
  btns.forEach(function(btn) {
    btn.style.width = w;
    btn.style.minWidth = w;
    btn.style.maxWidth = w;
  });
  var col = document.querySelector('#screen-barriers-list col.barriers-col-name');
  if (col) col.style.width = Math.ceil(maxW + 12) + 'px';
}

function updateBarriersCheckboxCounts() {`,
  'syncBpkBarrierButtonWidths with probe'
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
  `var APP_BUILD = 'pkb-v286';`,
  `var APP_BUILD = 'pkb-v287';`,
  'APP_BUILD bump'
);

sw = sw.replace(/pkb-static-v286/g, 'pkb-static-v287');
sw = sw.replace(/pkb-api-v286/g, 'pkb-api-v287');

fs.writeFileSync('index.html', html, 'utf8');
fs.writeFileSync('sw.js', sw, 'utf8');
console.log('patch-v287-bpk-barrier-equal-width OK -> pkb-v287');
