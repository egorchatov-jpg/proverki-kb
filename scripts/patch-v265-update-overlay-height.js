const fs = require('fs');

let html = fs.readFileSync('index.html', 'utf8').replace(/\r\n/g, '\n');
let sw = fs.readFileSync('sw.js', 'utf8');

function mustReplace(oldStr, newStr, label) {
  if (!html.includes(oldStr)) throw new Error('NOT FOUND: ' + label);
  html = html.split(oldStr).join(newStr);
}

mustReplace(
  `#overlay-app-update { z-index: 10050; }
#overlay-app-update .overlay-box {
  display: flex; flex-direction: column; align-items: center;
  min-height: 220px; padding-bottom: 28px;
}
#overlay-app-update .overlay-title { text-align: center; margin-bottom: auto; padding-top: 8px; }
.overlay-app-update-footer {
  width: 100%; display: flex; justify-content: center; padding-top: 32px;
}
.overlay-app-update-footer .overlay-btn {
  flex: 0 0 auto; min-width: 220px; max-width: 320px; width: 72%;
}`,
  `#overlay-app-update { z-index: 10050; }
#overlay-app-update .overlay-title { text-align: center; line-height: 1.4; }
#overlay-app-update .overlay-btns { justify-content: center; }
#overlay-app-update .overlay-btn { flex: 0 0 auto; width: calc(50% - 5px); }`,
  'app-update overlay css'
);

mustReplace(
  `    <div class="overlay-app-update-footer">
      <button type="button" class="overlay-btn overlay-btn-apply" onclick="applyAppUpdate()">Обновить</button>
    </div>`,
  `    <div class="overlay-btns">
      <button type="button" class="overlay-btn overlay-btn-apply" onclick="applyAppUpdate()">Обновить</button>
    </div>`,
  'app-update overlay html'
);

html = html.replace(/var APP_BUILD = 'pkb-v264';/, "var APP_BUILD = 'pkb-v265';");
sw = sw.replace(/pkb-static-v264/g, 'pkb-static-v265').replace(/pkb-api-v264/g, 'pkb-api-v265');

fs.writeFileSync('index.html', Buffer.from(html, 'utf8'));
fs.writeFileSync('sw.js', sw);
console.log('patch-v265-update-overlay-height OK -> pkb-v265');
