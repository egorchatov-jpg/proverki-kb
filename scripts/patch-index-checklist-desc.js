/**
 * Patch index.html: client-side checklist desc patch + prefer desc with codes.
 */
const fs = require('fs');
const path = require('path');

const INDEX = path.join(__dirname, '..', 'index.html');
let html = fs.readFileSync(INDEX, 'utf8').replace(/\r\n/g, '\n');

function mustReplace(oldStr, newStr, label) {
  if (!html.includes(oldStr)) throw new Error('Missing: ' + label);
  html = html.replace(oldStr, newStr);
}

mustReplace(
  "var APP_BUILD = 'pkb-v311';",
  "var APP_BUILD = 'pkb-v312';",
  'APP_BUILD'
);

mustReplace(
  `function formatRecordDescPlain(r) {
  if (!r) return '';
  if (recordHasChecklistViolations(r)) {
    return buildChecklistDescPlain(r.checklistViolations, r.checklistQuestionTexts || {});
  }
  return normalizeViolationDescText(r.desc);
}`,
  `function descHasChecklistCode(text) {
  return /[A-ZА-ЯЁ]{2,}\\.\\d/.test(String(text || ''));
}

function formatRecordDescPlain(r) {
  if (!r) return '';
  var plainDesc = normalizeViolationDescText(r.desc);
  if (plainDesc && descHasChecklistCode(plainDesc)) return plainDesc;
  if (recordHasChecklistViolations(r)) {
    return buildChecklistDescPlain(r.checklistViolations, r.checklistQuestionTexts || {});
  }
  return plainDesc;
}`,
  'formatRecordDescPlain'
);

mustReplace(
  `function formatRecordDescHtml(r) {
  if (!r) return '';
  if (recordHasChecklistViolations(r)) {
    return buildChecklistDescHtml(r.checklistViolations, r.checklistQuestionTexts || {});
  }
  var plain = normalizeViolationDescText(r.desc);
  if (!plain) return '';
  return esc(plain).replace(/\\n/g, '<br>');
}`,
  `function formatRecordDescHtml(r) {
  if (!r) return '';
  var plain = normalizeViolationDescText(r.desc);
  if (plain && descHasChecklistCode(plain)) {
    return esc(plain).replace(/\\n/g, '<br>');
  }
  if (recordHasChecklistViolations(r)) {
    return buildChecklistDescHtml(r.checklistViolations, r.checklistQuestionTexts || {});
  }
  if (!plain) return '';
  return esc(plain).replace(/\\n/g, '<br>');
}`,
  'formatRecordDescHtml'
);

const patchFn = `
var CHECKLIST_DESC_PATCH_VER = 1;

function applyChecklistDescPatch(onDone) {
  onDone = onDone || function() {};
  var doneVer = 0;
  try { doneVer = parseInt(localStorage.getItem('pkb-checklist-desc-patch') || '0', 10); } catch (_e) {}
  if (doneVer >= CHECKLIST_DESC_PATCH_VER) { onDone(false); return; }
  fetch('/data/checklist-desc-patch.json?v=' + APP_BUILD, { cache: 'no-store' })
    .then(function(r) { return r.ok ? r.json() : null; })
    .catch(function() { return null; })
    .then(function(patch) {
      if (!patch || !patch.items) { onDone(false); return; }
      var byId = {};
      (appState.db || []).forEach(function(r) { if (r.checkId) byId[r.checkId] = r; });
      var updated = 0;
      Object.keys(patch.items).forEach(function(checkId) {
        var item = patch.items[checkId];
        var rec = byId[checkId];
        if (!rec || !item) return;
        if (item.desc) rec.desc = item.desc;
        if (item.barrier) rec.barrier = item.barrier;
        if (item.checklistFilled) {
          rec.checklistFilled = true;
          rec.checklistViolations = item.checklistViolations || {};
          rec.checklistQuestionTexts = item.checklistQuestionTexts || {};
          rec.checklistPassportId = item.checklistPassportId || null;
        }
        updated++;
      });
      if (updated) {
        try { localStorage.setItem('pkb-checklist-desc-patch', String(CHECKLIST_DESC_PATCH_VER)); } catch (_e) {}
        saveState();
        console.log('[patch] checklist desc updated:', updated);
      }
      onDone(updated > 0);
    });
}
`;

mustReplace(
  'function recordHasChecklistViolations(r) {',
  patchFn + '\nfunction recordHasChecklistViolations(r) {',
  'insert patch fn'
);

mustReplace(
  `  loadState();
  if (migrateSamoproverkaToSamootsenka()) saveState();`,
  `  loadState();
  applyChecklistDescPatch(function(descPatched) {
    if (descPatched) renderLobby();
  });
  if (migrateSamoproverkaToSamootsenka()) saveState();`,
  'call patch on load'
);

fs.writeFileSync(INDEX, Buffer.from(html, 'utf8'));
console.log('OK: index.html patched (pkb-v312 checklist desc patch)');
