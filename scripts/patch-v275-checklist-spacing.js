const fs = require('fs');

let html = fs.readFileSync('index.html', 'utf8').replace(/\r\n/g, '\n');
let sw = fs.readFileSync('sw.js', 'utf8');

function mustReplace(oldStr, newStr, label) {
  if (!html.includes(oldStr)) throw new Error('NOT FOUND: ' + label);
  html = html.split(oldStr).join(newStr);
}

mustReplace(
  `#field-wrap-barrier { align-items: flex-start; }
#field-wrap-barrier > .field-label { align-self: center; }
.field-wrap-checklist { display: none; }
#field-wrap-checklist-btn:not([hidden]) { display: flex; }
#field-wrap-checklist-btn[hidden] { display: none !important; }
.field-label-spacer { visibility: hidden; pointer-events: none; }`,
  `#field-wrap-barrier { align-items: flex-start; }
#field-wrap-barrier > .field-label { align-self: flex-start; margin-top: 10px; }
#field-wrap-barrier .field-barrier-col {
  flex: 1 1 0; min-width: 0;
  display: flex; flex-direction: column; gap: 8px;
}
.field-label-spacer { visibility: hidden; pointer-events: none; }`,
  'barrier column css'
);

mustReplace(
  `  box-shadow: var(--btn-shadow);
  display: flex; align-items: center; justify-content: center;
  appearance: none; -webkit-appearance: none;
  margin: 0; font-family: inherit;
  -webkit-tap-highlight-color: transparent;
  transition: opacity 0.15s;
}
#screen-card .card-checklist-btn:active { opacity: 0.8; }`,
  `  box-shadow: none;
  display: flex; align-items: center; justify-content: center;
  appearance: none; -webkit-appearance: none;
  margin: 0; font-family: inherit;
  -webkit-tap-highlight-color: transparent;
  transition: opacity 0.15s;
}
#screen-card .card-checklist-btn:active { opacity: 0.8; }`,
  'remove checklist btn shadow on card'
);

mustReplace(
  `.detail-checklist-row { padding-top: 0; margin-top: -2px; align-items: center; }`,
  `.detail-checklist-row { align-items: center; }`,
  'detail checklist normal row spacing'
);

mustReplace(
  `      <div class="field-wrap" id="field-wrap-barrier">
        <div class="field-label">Проверяемый барьер</div>
        <div class="field-cell" id="cell-barrier" onclick="openDrumBarrier()">
          <span class="placeholder" id="val-barrier">Выбрать</span>
        </div>
      </div>
      <div class="field-wrap field-wrap-checklist" id="field-wrap-checklist-btn" hidden>
        <div class="field-label field-label-spacer">Проверяемый барьер</div>
        <button type="button" class="card-checklist-btn" id="btn-card-checklist" onclick="openCardChecklistScreen()">Заполнить чек-лист</button>
      </div>`,
  `      <div class="field-wrap" id="field-wrap-barrier">
        <div class="field-label">Проверяемый барьер</div>
        <div class="field-barrier-col">
          <div class="field-cell" id="cell-barrier" onclick="openDrumBarrier()">
            <span class="placeholder" id="val-barrier">Выбрать</span>
          </div>
          <button type="button" class="card-checklist-btn" id="btn-card-checklist" hidden onclick="openCardChecklistScreen()">Заполнить чек-лист</button>
        </div>
      </div>`,
  'nest checklist button under barrier cell'
);

mustReplace(
  `function setCardChecklistButtonVisible(visible) {
  var wrap = document.getElementById('field-wrap-checklist-btn');
  if (wrap) wrap.hidden = !visible;
  setCardChecklistButtonLabel();
  if (visible) requestAnimationFrame(syncCardFieldLabelWidths);
}`,
  `function setCardChecklistButtonVisible(visible) {
  var btn = document.getElementById('btn-card-checklist');
  if (btn) btn.hidden = !visible;
  setCardChecklistButtonLabel();
}`,
  'toggle checklist btn not wrap'
);

mustReplace(
  `var APP_BUILD = 'pkb-v274';`,
  `var APP_BUILD = 'pkb-v275';`,
  'APP_BUILD bump'
);

sw = sw.replace(/pkb-static-v274/g, 'pkb-static-v275');
sw = sw.replace(/pkb-api-v274/g, 'pkb-api-v275');

fs.writeFileSync('index.html', html, 'utf8');
fs.writeFileSync('sw.js', sw, 'utf8');
console.log('patch-v275-checklist-spacing OK -> pkb-v275');
