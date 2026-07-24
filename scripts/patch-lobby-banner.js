const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const indexPath = path.join(root, 'index.html');
const swPath = path.join(root, 'sw.js');

let html = fs.readFileSync(indexPath, 'utf8').replace(/\r\n/g, '\n');

const oldBlock = `  var count = violations.length;
  if (_lobbyUiReady) {
    if (_lobbyViolCount !== count) {
      _lobbyViolCount = count;
      _showLobbyBanners(count);
    }
  } else {
    _lobbyViolCount = count;
    var noBanner = document.getElementById('no-violations-banner');
    var vBanner  = document.getElementById('violations-banner');
    if (noBanner) { noBanner.style.display = 'none'; noBanner.hidden = true; }
    if (vBanner)  { vBanner.style.display = 'none';  vBanner.hidden = true; }
  }`;

const newBlock = `  var count = violations.length;
  _lobbyViolCount = count;
  if (_lobbyUiReady) {
    _showLobbyBanners(count);
  } else {
    var noBanner = document.getElementById('no-violations-banner');
    var vBanner  = document.getElementById('violations-banner');
    if (noBanner) { noBanner.style.display = 'none'; noBanner.hidden = true; }
    if (vBanner)  { vBanner.style.display = 'none';  vBanner.hidden = true; }
  }`;

if (!html.includes(oldBlock)) {
  console.error('Could not find renderLobby banner block to patch');
  process.exit(1);
}

html = html.replace(oldBlock, newBlock);
html = html.replace("var APP_BUILD = 'pkb-v238';", "var APP_BUILD = 'pkb-v239';");
fs.writeFileSync(indexPath, html.replace(/\n/g, '\r\n'), 'utf8');

let sw = fs.readFileSync(swPath, 'utf8');
sw = sw.replace(/pkb-static-v238/g, 'pkb-static-v239');
sw = sw.replace(/pkb-api-v238/g, 'pkb-api-v239');
fs.writeFileSync(swPath, sw, 'utf8');

console.log('Patched lobby banner fix -> pkb-v239');
