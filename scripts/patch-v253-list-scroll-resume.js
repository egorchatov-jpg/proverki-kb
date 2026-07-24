/**
 * pkb-v253: preserve list scroll on app resume (visibility / iOS PWA rebuild).
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/\r\n/g, '\n');

if (!html.includes('var _listScrollCache')) {
  html = html.replace(
    'function scrollCheckListToEnd(screenId) {\n  requestAnimationFrame(function() {\n    var scr = document.getElementById(screenId);\n    if (!scr) return;\n    var wrap = scr.querySelector(\'.find-list-wrap\');\n    if (wrap) wrap.scrollTop = wrap.scrollHeight;\n  });\n}',
    `var _listScrollCache = {};
var LIST_SCROLL_SCREENS = ['screen-find', 'screen-corrective-list', 'screen-sokb-list'];

function getListScrollWrap(screenId) {
  var scr = document.getElementById(screenId);
  return scr ? scr.querySelector('.find-list-wrap') : null;
}

function saveListScrollPositions() {
  LIST_SCROLL_SCREENS.forEach(function(id) {
    var wrap = getListScrollWrap(id);
    if (wrap) _listScrollCache[id] = wrap.scrollTop;
  });
}

function restoreListScrollPosition(screenId) {
  var top = _listScrollCache[screenId];
  if (top == null) return;
  requestAnimationFrame(function() {
    var wrap = getListScrollWrap(screenId);
    if (wrap) wrap.scrollTop = top;
  });
}

function finishListScroll(screenId, preserveScroll) {
  if (preserveScroll) restoreListScrollPosition(screenId);
  else scrollCheckListToEnd(screenId);
}

function scrollCheckListToEnd(screenId) {
  requestAnimationFrame(function() {
    var scr = document.getElementById(screenId);
    if (!scr) return;
    var wrap = scr.querySelector('.find-list-wrap');
    if (wrap) wrap.scrollTop = wrap.scrollHeight;
  });
}`
  );
}

html = html.replace(
  'function rebuildIOSStandaloneScreen() {\n  if (!_isIOSStandalone) return;\n  var active = document.querySelector(\'.screen.active\');',
  'function rebuildIOSStandaloneScreen() {\n  if (!_isIOSStandalone) return;\n  saveListScrollPositions();\n  var active = document.querySelector(\'.screen.active\');'
);

html = html.replace(
  '  active.classList.add(\'active\');\n  syncScreenInert();\n}\n\nfunction fixIOSStandaloneAfterRotation()',
  `  active.classList.add('active');
  syncScreenInert();
  restoreListScrollPosition(active.id);
}

function fixIOSStandaloneAfterRotation()`
);

html = html.replace(
  `    if (document.hidden) {
      if (isSettingsDirty()) syncSettingsToServer();
      var activeScr = document.querySelector('.screen.active');
      if (activeScr && activeScr.id && activeScr.id !== 'screen-pin') {
        try { sessionStorage.setItem('pkb-active-screen', activeScr.id); } catch (_) {}
      }
    }
    if (!document.hidden) {
      scheduleIOSStandaloneOrientationFix();
      try {
        var savedScr = sessionStorage.getItem('pkb-active-screen');
        if (hasSession() && savedScr && document.getElementById(savedScr)) {
          showScreen(savedScr);
        }
      } catch (_) {}
      loadFromServer(function() {
        retryAllQueues();
        if (isSettingsDirty()) syncSettingsToServer();
        prefetchPassportAssets();
        loadPassportManifest();
      });`,
  `    if (document.hidden) {
      saveListScrollPositions();
      if (isSettingsDirty()) syncSettingsToServer();
      var activeScr = document.querySelector('.screen.active');
      if (activeScr && activeScr.id && activeScr.id !== 'screen-pin') {
        try { sessionStorage.setItem('pkb-active-screen', activeScr.id); } catch (_) {}
      }
    }
    if (!document.hidden) {
      try {
        var savedScr = sessionStorage.getItem('pkb-active-screen');
        if (hasSession() && savedScr && document.getElementById(savedScr)) {
          var currentScr = document.querySelector('.screen.active');
          if (!currentScr || currentScr.id !== savedScr) showScreen(savedScr);
        }
      } catch (_) {}
      loadFromServer(function() {
        retryAllQueues();
        if (isSettingsDirty()) syncSettingsToServer();
        prefetchPassportAssets();
        loadPassportManifest();
        var activeScr2 = document.querySelector('.screen.active');
        if (activeScr2 && LIST_SCROLL_SCREENS.indexOf(activeScr2.id) >= 0) {
          restoreListScrollPosition(activeScr2.id);
        }
      });`
);

html = html.replace(
  `          if (fs && fs.classList.contains('active')) applyFindFilters();
          var cs = document.getElementById('screen-corrective-list');
          if (cs && cs.classList.contains('active')) renderCorrectiveList();
          var ss = document.getElementById('screen-sokb-list');
          if (ss && ss.classList.contains('active')) renderSokbList();`,
  `          if (fs && fs.classList.contains('active')) applyFindFilters(true);
          var cs = document.getElementById('screen-corrective-list');
          if (cs && cs.classList.contains('active')) renderCorrectiveList(true);
          var ss = document.getElementById('screen-sokb-list');
          if (ss && ss.classList.contains('active')) renderSokbList(true);`
);

html = html.replace(
  'function applyFindFilters() {\n  var recs = appState.db.filter(function(r) {',
  'function applyFindFilters(preserveScroll) {\n  var recs = appState.db.filter(function(r) {'
);

html = html.replace(
  '  renderFindList(recs);\n  updateFilterIcons();\n}',
  '  renderFindList(recs, preserveScroll);\n  updateFilterIcons();\n}'
);

html = html.replace(
  'function renderFindList(records) {\n  var tbody = document.getElementById(\'find-tbody\');',
  'function renderFindList(records, preserveScroll) {\n  var tbody = document.getElementById(\'find-tbody\');'
);

html = html.replace(
  "  scrollCheckListToEnd('screen-find');\n}",
  "  finishListScroll('screen-find', preserveScroll);\n}"
);

html = html.replace(
  'function renderCorrectiveList() {\n  var violations = (appState.db || []).filter(isCorrectiveListRecord);',
  'function renderCorrectiveList(preserveScroll) {\n  var violations = (appState.db || []).filter(isCorrectiveListRecord);'
);

html = html.replace(
  "  scrollCheckListToEnd('screen-corrective-list');\n}",
  "  finishListScroll('screen-corrective-list', preserveScroll);\n}"
);

html = html.replace(
  'function renderSokbList() {\n  var violations = (appState.db || []).filter(isSokbListRecord);',
  'function renderSokbList(preserveScroll) {\n  var violations = (appState.db || []).filter(isSokbListRecord);'
);

html = html.replace(
  "  scrollCheckListToEnd('screen-sokb-list');\n}",
  "  finishListScroll('screen-sokb-list', preserveScroll);\n}"
);

// Second loadFromServer block (sync after save etc.)
html = html.replace(
  `        if (fs && fs.classList.contains('active')) applyFindFilters();
        if (cs && cs.classList.contains('active')) renderCorrectiveList();
        if (ss && ss.classList.contains('active')) renderSokbList();`,
  `        if (fs && fs.classList.contains('active')) applyFindFilters(true);
        if (cs && cs.classList.contains('active')) renderCorrectiveList(true);
        if (ss && ss.classList.contains('active')) renderSokbList(true);`
);

html = html.replace(/var APP_BUILD = 'pkb-v252';/, "var APP_BUILD = 'pkb-v253';");

fs.writeFileSync(path.join(root, 'index.html'), Buffer.from(html, 'utf8'));

let sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
sw = sw.replace(/pkb-static-v252/g, 'pkb-static-v253');
sw = sw.replace(/pkb-api-v252/g, 'pkb-api-v253');
fs.writeFileSync(path.join(root, 'sw.js'), sw);

console.log('pkb-v253: list scroll preserve on resume applied');
