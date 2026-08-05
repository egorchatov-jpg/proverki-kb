/**
 * pkb-v326: fix idle list scroll jump on background poll / soft refresh.
 *
 * refreshActiveRecordLists() re-renders find/corrective/sokb with preserveScroll=true,
 * but _listScrollCache was only filled on app hide — so after ~90s poll the restore
 * was empty and the wiped list stayed at scrollTop=0.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const indexPath = path.join(ROOT, 'index.html');
const swPath = path.join(ROOT, 'sw.js');

let t = fs.readFileSync(indexPath, 'utf8').replace(/\r\n/g, '\n');

if (!t.includes("var APP_BUILD = 'pkb-v325'")) {
  throw new Error('Expected APP_BUILD pkb-v325');
}
t = t.replace("var APP_BUILD = 'pkb-v325'", "var APP_BUILD = 'pkb-v326'");

const oldRefresh = `function refreshActiveRecordLists() {
  renderLobby();
  var fs = document.getElementById('screen-find');
  if (fs && fs.classList.contains('active')) applyFindFilters(true);
  var cs = document.getElementById('screen-corrective-list');
  if (cs && cs.classList.contains('active')) renderCorrectiveList(true);
  var ss = document.getElementById('screen-sokb-list');
  if (ss && ss.classList.contains('active')) renderSokbList(true);
}`;

const newRefresh = `function refreshActiveRecordLists() {
  // Capture live scroll BEFORE innerHTML wipe — idle poll / sync refresh used to
  // restore from a stale/empty cache and jump lists to the top.
  saveListScrollPositions();
  renderLobby();
  var fs = document.getElementById('screen-find');
  if (fs && fs.classList.contains('active')) applyFindFilters(true);
  var cs = document.getElementById('screen-corrective-list');
  if (cs && cs.classList.contains('active')) renderCorrectiveList(true);
  var ss = document.getElementById('screen-sokb-list');
  if (ss && ss.classList.contains('active')) renderSokbList(true);
}`;

if (!t.includes(oldRefresh)) throw new Error('refreshActiveRecordLists not found');
t = t.replace(oldRefresh, newRefresh);

const oldRestore = `function restoreListScrollPosition(screenId) {
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
}`;

const newRestore = `function restoreListScrollPosition(screenId) {
  var top = _listScrollCache[screenId];
  if (top == null) return;
  // Double rAF: wait until table rows are laid out after innerHTML rebuild.
  requestAnimationFrame(function() {
    requestAnimationFrame(function() {
      var wrap = getListScrollWrap(screenId);
      if (wrap) wrap.scrollTop = top;
    });
  });
}

function captureListScrollBeforeRender(screenId) {
  var wrap = getListScrollWrap(screenId);
  if (wrap) _listScrollCache[screenId] = wrap.scrollTop;
}

function finishListScroll(screenId, preserveScroll) {
  if (preserveScroll) restoreListScrollPosition(screenId);
  else scrollCheckListToEnd(screenId);
}`;

if (!t.includes(oldRestore)) throw new Error('restoreListScrollPosition block not found');
t = t.replace(oldRestore, newRestore);

// Capture immediately before wipe in each list renderer when preserving.
const oldFind = `function renderFindList(records, preserveScroll) {
  var tbody = document.getElementById('find-tbody');
  tbody.innerHTML = '';`;
const newFind = `function renderFindList(records, preserveScroll) {
  if (preserveScroll) captureListScrollBeforeRender('screen-find');
  var tbody = document.getElementById('find-tbody');
  tbody.innerHTML = '';`;
if (!t.includes(oldFind)) throw new Error('renderFindList not found');
t = t.replace(oldFind, newFind);

const oldCorr = `function renderCorrectiveList(preserveScroll) {
  var violations = (appState.db || []).filter(isCorrectiveListRecord);`;
const newCorr = `function renderCorrectiveList(preserveScroll) {
  if (preserveScroll) captureListScrollBeforeRender('screen-corrective-list');
  var violations = (appState.db || []).filter(isCorrectiveListRecord);`;
if (!t.includes(oldCorr)) throw new Error('renderCorrectiveList not found');
t = t.replace(oldCorr, newCorr);

const oldSokb = `function renderSokbList(preserveScroll) {
  var violations = (appState.db || []).filter(isSokbListRecord);`;
const newSokb = `function renderSokbList(preserveScroll) {
  if (preserveScroll) captureListScrollBeforeRender('screen-sokb-list');
  var violations = (appState.db || []).filter(isSokbListRecord);`;
if (!t.includes(oldSokb)) throw new Error('renderSokbList not found');
t = t.replace(oldSokb, newSokb);

// Idle poll: when server reports unchanged, do not wipe/rebuild open lists.
const oldUnchanged = `    if (d.unchanged) {
      console.log('[server] без изменений, данные актуальны');
      try { appState.lastSyncedAt = Date.now(); } catch (_e) {}
      retryAllQueues();
      refreshActiveRecordLists();
      finish(true);
      return;
    }`;

const newUnchanged = `    if (d.unchanged) {
      console.log('[server] без изменений, данные актуальны');
      try { appState.lastSyncedAt = Date.now(); } catch (_e) {}
      retryAllQueues();
      // Keep open list scroll intact — no DOM rebuild when nothing changed.
      renderLobby();
      finish(true);
      return;
    }`;

if (!t.includes(oldUnchanged)) throw new Error('unchanged block not found');
t = t.replace(oldUnchanged, newUnchanged);

// Interval callback also re-refreshed after loadFromServer (which already refreshes
// on real data changes). Avoid a second wipe when poll completes.
const oldInterval = `  setInterval(function() {
    if (document.hidden || !hasSession()) return;
    clearApiCacheViaSw();
    // Background: conditional GET via year revisions (faster). Pull/resume stay forceFull.
    loadFromServer(function() {
      refreshActiveRecordLists();
    }, { forceFull: false });
  }, 90000);`;

const newInterval = `  setInterval(function() {
    if (document.hidden || !hasSession()) return;
    clearApiCacheViaSw();
    // Background: conditional GET via year revisions (faster). Pull/resume stay forceFull.
    // Do not refresh lists here — loadFromServer already updates on real changes;
    // a second refresh was wiping scroll after idle.
    loadFromServer(null, { forceFull: false });
  }, 90000);`;

if (!t.includes(oldInterval)) throw new Error('90s interval block not found');
t = t.replace(oldInterval, newInterval);

fs.writeFileSync(indexPath, Buffer.from(t, 'utf8'));

let sw = fs.readFileSync(swPath, 'utf8').replace(/\r\n/g, '\n');
if (!sw.includes("const STATIC_CACHE = 'pkb-static-v325'")) {
  throw new Error('Expected sw v325');
}
sw = sw
  .replace("const STATIC_CACHE = 'pkb-static-v325'", "const STATIC_CACHE = 'pkb-static-v326'")
  .replace("const API_CACHE = 'pkb-api-v325'", "const API_CACHE = 'pkb-api-v326'");
fs.writeFileSync(swPath, Buffer.from(sw, 'utf8'));

t = fs.readFileSync(indexPath, 'utf8');
if (!t.includes('Capture live scroll BEFORE')) throw new Error('refresh save missing');
if (!t.includes('captureListScrollBeforeRender')) throw new Error('capture helper missing');
if (!t.includes("var APP_BUILD = 'pkb-v326'")) throw new Error('build bump failed');
if (t.includes('loadFromServer(function() {\n      refreshActiveRecordLists();\n    }, { forceFull: false })')) {
  throw new Error('interval still double-refreshes');
}

console.log('OK: pkb-v326 list scroll jump fix');
