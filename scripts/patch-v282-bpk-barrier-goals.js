const fs = require('fs');

let html = fs.readFileSync('index.html', 'utf8').replace(/\r\n/g, '\n');
let sw = fs.readFileSync('sw.js', 'utf8');

function mustReplace(oldStr, newStr, label) {
  if (!html.includes(oldStr)) throw new Error('NOT FOUND: ' + label);
  html = html.split(oldStr).join(newStr);
}

mustReplace(
  `.bpk-empty-passport-row .methods-td-cb { text-align: center; }`,
  `.bpk-empty-passport-row .methods-td-cb { text-align: center; }
.bpk-barrier-name-cell { padding: 4px 6px; vertical-align: middle; }
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
.bpk-barrier-name-btn:active { opacity: 0.78; }
.bpk-goals-hint {
  text-align: center; font-size: 12px; font-weight: 500;
  color: var(--text2); padding: 0 14px 12px; line-height: 1.35;
}
#overlay-bpk-goals .bpk-goals-body { padding: 4px 0 8px; }
#overlay-bpk-goals .bpk-goal-row { padding: 6px 0; }
#overlay-bpk-goals .bpk-goal-input {
  flex: 1 1 0; min-width: 0; text-align: center;
  font-family: inherit; cursor: text;
}
#overlay-bpk-goals .detail-val.bpk-goal-input:focus {
  outline: none; border-color: var(--orange);
}`,
  'bpk barrier name btn css'
);

mustReplace(
  `      <button class="method-sq-btn plus" onclick="openBpkAddChoiceOverlay()">
        <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" width="22" height="22"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      </button>
    </div>
  </div>
  <div id="barrier-new-row" style="display:none;" class="method-new-row">`,
  `      <button class="method-sq-btn plus" onclick="openBpkAddChoiceOverlay()">
        <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" width="22" height="22"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      </button>
    </div>
    <p class="bpk-goals-hint">Нажмите на барьер и установите цели по работоспособности барьеров</p>
  </div>
  <div id="barrier-new-row" style="display:none;" class="method-new-row">`,
  'barriers list hint text'
);

mustReplace(
  `<div class="overlay" id="overlay-bpk-input">
  <div class="overlay-box">`,
  `<div class="overlay" id="overlay-bpk-goals">
  <div class="overlay-box">
    <div class="overlay-title">Установите цели по работоспособности</div>
    <div class="bpk-goals-body" id="bpk-goals-body">
      <div class="detail-row bpk-goal-row">
        <div class="detail-label">Цель, %</div>
        <input class="detail-val bpk-goal-input" id="bpk-goal-target" type="text" inputmode="decimal" autocomplete="off">
      </div>
      <div class="detail-row bpk-goal-row">
        <div class="detail-label">Напряженная цель, %</div>
        <input class="detail-val bpk-goal-input" id="bpk-goal-stretch" type="text" inputmode="decimal" autocomplete="off">
      </div>
    </div>
    <div class="overlay-btns">
      <button type="button" class="overlay-btn overlay-btn-cancel" onclick="closeBpkGoalsOverlay()">Отмена</button>
      <button type="button" class="overlay-btn overlay-btn-apply" onclick="applyBpkGoalsOverlay()">Применить</button>
    </div>
  </div>
</div>

<div class="overlay" id="overlay-bpk-input">
  <div class="overlay-box">`,
  'overlay bpk goals html'
);

mustReplace(
  `        return {
          name: b.name,
          passport: lb.passport !== undefined ? lb.passport : (b.passport || ''),
          inPK: !!lb.inPK,
          show: lb.show !== undefined ? (lb.show !== false) : (b.show !== false)
        };`,
  `        return mergeBarrierEntryFields(b, lb);`,
  'mergeBarriersConfig preferLocal'
);

mustReplace(
  `      return {
        name: b.name,
        passport: b.passport !== undefined ? b.passport : (lb.passport || ''),
        inPK: !!b.inPK,
        show: b.show !== undefined ? (b.show !== false) : (lb.show !== false)
      };`,
  `      return mergeBarrierEntryFields(b, lb, true);`,
  'mergeBarriersConfig preferServer'
);

mustReplace(
  `function mergeBarriersConfig(server, local, preferLocal) {`,
  `function barrierGoalPctValue(entry) {
  if (!entry || entry.goalPct == null || entry.goalPct === '') return '';
  return entry.goalPct;
}
function barrierStretchGoalPctValue(entry) {
  if (!entry || entry.stretchGoalPct == null || entry.stretchGoalPct === '') return '';
  return entry.stretchGoalPct;
}
function mergeBarrierEntryFields(serverEntry, localEntry, preferServerFields) {
  var base = preferServerFields ? serverEntry : localEntry;
  var other = preferServerFields ? localEntry : serverEntry;
  return {
    name: serverEntry.name,
    passport: base.passport !== undefined ? base.passport : (other.passport || ''),
    inPK: preferServerFields ? !!serverEntry.inPK : !!localEntry.inPK,
    show: preferServerFields
      ? (serverEntry.show !== undefined ? (serverEntry.show !== false) : (localEntry.show !== false))
      : (localEntry.show !== undefined ? (localEntry.show !== false) : (serverEntry.show !== false)),
    goalPct: preferServerFields
      ? barrierGoalPctValue(serverEntry) || barrierGoalPctValue(localEntry)
      : barrierGoalPctValue(localEntry) || barrierGoalPctValue(serverEntry),
    stretchGoalPct: preferServerFields
      ? barrierStretchGoalPctValue(serverEntry) || barrierStretchGoalPctValue(localEntry)
      : barrierStretchGoalPctValue(localEntry) || barrierStretchGoalPctValue(serverEntry)
  };
}
function mergeBarriersConfig(server, local, preferLocal) {`,
  'mergeBarrierEntryFields helper'
);

mustReplace(
  `    return { name: b.name, passport: b.passport || '', inPK: !!b.inPK, show: b.show !== false };
  });
}`,
  `    return {
      name: b.name,
      passport: b.passport || '',
      inPK: !!b.inPK,
      show: b.show !== false,
      goalPct: barrierGoalPctValue(b),
      stretchGoalPct: barrierStretchGoalPctValue(b)
    };
  });
}`,
  'snapBarriersYearList goals'
);

mustReplace(
  `        inPK: !!b.inPK,
        show: b.show !== false
      };
    }).sort(function(a, b) { return String(a.name).localeCompare(String(b.name), 'ru'); });`,
  `        inPK: !!b.inPK,
        show: b.show !== false,
        goalPct: barrierGoalPctValue(b),
        stretchGoalPct: barrierStretchGoalPctValue(b)
      };
    }).sort(function(a, b) { return String(a.name).localeCompare(String(b.name), 'ru'); });`,
  'barriersConfigSnapForCompare goals'
);

mustReplace(
  `      return {
        name: b.name,
        passport: b.passport || '',
        inPK: !!b.inPK,
        show: b.show !== false
      };
    });
  });
  return out;
}

function getBarriersForYear(year) {`,
  `      var item = {
        name: b.name,
        passport: b.passport || '',
        inPK: !!b.inPK,
        show: b.show !== false
      };
      var gp = barrierGoalPctValue(b);
      var sg = barrierStretchGoalPctValue(b);
      if (gp !== '') item.goalPct = gp;
      if (sg !== '') item.stretchGoalPct = sg;
      return item;
    });
  });
  return out;
}

function getBarriersForYear(year) {`,
  'normalizeBarriersConfigForSave goals'
);

mustReplace(
  `        inPK: prev ? !!prev.inPK : false,
        show: prev ? (prev.show !== false) : true
      });`,
  `        inPK: prev ? !!prev.inPK : false,
        show: prev ? (prev.show !== false) : true,
        goalPct: prev ? barrierGoalPctValue(prev) : '',
        stretchGoalPct: prev ? barrierStretchGoalPctValue(prev) : ''
      });`,
  'buildBarriersFromCatalog preserve goals'
);

mustReplace(
  `          inPK: !!b.inPK,
          show: b.show !== false
        });`,
  `          inPK: !!b.inPK,
          show: b.show !== false,
          goalPct: barrierGoalPctValue(b),
          stretchGoalPct: barrierStretchGoalPctValue(b)
        });`,
  'buildBarriersFromCatalog custom barriers goals'
);

mustReplace(
  `        inPK: !!b.inPK,
        show: b.show !== false
      };
    });
  } catch (e) {}`,
  `        inPK: !!b.inPK,
        show: b.show !== false,
        goalPct: b.goalPct != null ? b.goalPct : '',
        stretchGoalPct: b.stretchGoalPct != null ? b.stretchGoalPct : ''
      };
    });
  } catch (e) {}`,
  'cancelBarriersListChanges goals'
);

mustReplace(
  `  var tdName = document.createElement('td');
  tdName.className = 'methods-td methods-td-name'; tdName.textContent = b.name;
  var tdPK = document.createElement('td');`,
  `  var tdName = document.createElement('td');
  tdName.className = 'methods-td methods-td-name bpk-barrier-name-cell';
  var nameBtn = document.createElement('button');
  nameBtn.type = 'button';
  nameBtn.className = 'bpk-barrier-name-btn';
  nameBtn.textContent = b.name;
  nameBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    openBpkGoalsOverlay(year, idx);
  });
  tdName.appendChild(nameBtn);
  var tdPK = document.createElement('td');`,
  'appendBarrierRow name button'
);

mustReplace(
  `var _bpkNameMode = '';
var _bpkBarrierPassport = '';
var _bpkChoiceOverlayH = 0;`,
  `var _bpkNameMode = '';
var _bpkBarrierPassport = '';
var _bpkChoiceOverlayH = 0;
var _bpkGoalsIdx = null;

function formatBarrierGoalDisplay(val) {
  if (val == null || val === '') return '';
  return String(val);
}

function parseBarrierGoalPct(val) {
  var s = String(val || '').trim().replace(',', '.');
  if (!s) return '';
  var n = parseFloat(s);
  if (isNaN(n) || n < 0 || n > 100) return false;
  return n;
}

function syncBpkGoalsOverlayLabelWidths() {
  syncRecordFieldLabelWidths(document.getElementById('bpk-goals-body'), '.detail-row .detail-label');
}

function openBpkGoalsOverlay(year, idx) {
  var list = getBarriersForYear(year);
  var b = list[idx];
  if (!b) return;
  _bpkGoalsIdx = idx;
  var targetInp = document.getElementById('bpk-goal-target');
  var stretchInp = document.getElementById('bpk-goal-stretch');
  if (targetInp) targetInp.value = formatBarrierGoalDisplay(b.goalPct);
  if (stretchInp) stretchInp.value = formatBarrierGoalDisplay(b.stretchGoalPct);
  document.getElementById('overlay-bpk-goals').classList.add('active');
  requestAnimationFrame(syncBpkGoalsOverlayLabelWidths);
}

function closeBpkGoalsOverlay() {
  document.getElementById('overlay-bpk-goals').classList.remove('active');
  _bpkGoalsIdx = null;
}

function applyBpkGoalsOverlay() {
  if (_bpkGoalsIdx == null || !_bpkYear) {
    closeBpkGoalsOverlay();
    return;
  }
  var targetInp = document.getElementById('bpk-goal-target');
  var stretchInp = document.getElementById('bpk-goal-stretch');
  var goal = parseBarrierGoalPct(targetInp ? targetInp.value : '');
  var stretch = parseBarrierGoalPct(stretchInp ? stretchInp.value : '');
  if (goal === false || stretch === false) return;
  var b = getBarriersForYear(_bpkYear)[_bpkGoalsIdx];
  if (b) {
    b.goalPct = goal === '' ? '' : goal;
    b.stretchGoalPct = stretch === '' ? '' : stretch;
    saveState();
    markBarriersDirty();
  }
  closeBpkGoalsOverlay();
}`,
  'bpk goals overlay js'
);

mustReplace(
  `var APP_BUILD = 'pkb-v281';`,
  `var APP_BUILD = 'pkb-v282';`,
  'APP_BUILD bump'
);

sw = sw.replace(/pkb-static-v281/g, 'pkb-static-v282');
sw = sw.replace(/pkb-api-v281/g, 'pkb-api-v282');

fs.writeFileSync('index.html', html, 'utf8');
fs.writeFileSync('sw.js', sw, 'utf8');
console.log('patch-v282-bpk-barrier-goals OK -> pkb-v282');
