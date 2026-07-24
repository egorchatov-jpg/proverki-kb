const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const indexPath = path.join(root, 'index.html');
const swPath = path.join(root, 'sw.js');

let html = fs.readFileSync(indexPath, 'utf8').replace(/\r\n/g, '\n');

html = html.replace('    _setLobbyUiReady();\n', '');

const oldLobby = `// ===== LOBBY =====
var _lobbyViolCount = -1;
var _lobbyUiReady = false;

function _showLobbyBanners(count) {
  var noBanner = document.getElementById('no-violations-banner');
  var vBanner  = document.getElementById('violations-banner');
  if (!noBanner || !vBanner) return;
  if (count === 0) {
    noBanner.style.display = 'flex';
    noBanner.hidden = false;
    vBanner.style.display = 'none';
    vBanner.hidden = true;
  } else {
    noBanner.style.display = 'none';
    noBanner.hidden = true;
    vBanner.style.display = 'flex';
    vBanner.hidden = false;
  }
}

function _setLobbyUiReady() {
  if (_lobbyUiReady) return;
  _lobbyUiReady = true;
  renderLobby();
}

function renderLobby() {
  var today = todayStr();
  var violations = appState.db.filter(function(r) {
    return r.dateEntry.startsWith(today) && r.works === 'Нет';
  });

  var content = document.getElementById('lobby-content');
  content.querySelectorAll('.violation-card').forEach(function(el){ el.remove(); });

  var count = violations.length;
  _lobbyViolCount = count;
  if (_lobbyUiReady) {
    _showLobbyBanners(count);
  } else {
    var noBanner = document.getElementById('no-violations-banner');
    var vBanner  = document.getElementById('violations-banner');
    if (noBanner) { noBanner.style.display = 'none'; noBanner.hidden = true; }
    if (vBanner)  { vBanner.style.display = 'none';  vBanner.hidden = true; }
  }`;

const newLobby = `// ===== LOBBY =====
function _showLobbyBanners(count) {
  var noBanner = document.getElementById('no-violations-banner');
  var vBanner  = document.getElementById('violations-banner');
  if (!noBanner || !vBanner) return;
  if (count === 0) {
    noBanner.style.display = 'flex';
    noBanner.hidden = false;
    vBanner.style.display = 'none';
    vBanner.hidden = true;
  } else {
    noBanner.style.display = 'none';
    noBanner.hidden = true;
    vBanner.style.display = 'flex';
    vBanner.hidden = false;
  }
}

function renderLobby() {
  var today = todayStr();
  var violations = appState.db.filter(function(r) {
    return r.dateEntry.startsWith(today) && r.works === 'Нет';
  });

  var content = document.getElementById('lobby-content');
  content.querySelectorAll('.violation-card').forEach(function(el){ el.remove(); });

  var count = violations.length;
  _showLobbyBanners(count);`;

if (!html.includes(oldLobby)) {
  console.error('Could not find lobby block to patch');
  process.exit(1);
}

html = html.replace(oldLobby, newLobby);
html = html.replace("var APP_BUILD = 'pkb-v239';", "var APP_BUILD = 'pkb-v240';");
fs.writeFileSync(indexPath, html.replace(/\n/g, '\r\n'), 'utf8');

let sw = fs.readFileSync(swPath, 'utf8');
sw = sw.replace(/pkb-static-v239/g, 'pkb-static-v240');
sw = sw.replace(/pkb-api-v239/g, 'pkb-api-v240');
fs.writeFileSync(swPath, sw, 'utf8');

console.log('Lobby banners synced with cards -> pkb-v240');
