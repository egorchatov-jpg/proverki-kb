/**
 * pkb-v324: extend multi-user concurrency to ALL settings + filled checklists.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const indexPath = path.join(ROOT, 'index.html');
const swPath = path.join(ROOT, 'sw.js');

let t = fs.readFileSync(indexPath, 'utf8').replace(/\r\n/g, '\n');

if (!t.includes("var APP_BUILD = 'pkb-v323'")) {
  throw new Error('Expected APP_BUILD pkb-v323');
}
t = t.replace("var APP_BUILD = 'pkb-v323'", "var APP_BUILD = 'pkb-v324'");

// 1) Never invent settingsUpdatedAt on push
const oldPushTs = `  var gen = ++_settingsSyncGen;
  var updatedAt = appState.settingsUpdatedAt || Date.now();
  appState.settingsUpdatedAt = updatedAt;
  var settings = {`;

const newPushTs = `  var gen = ++_settingsSyncGen;
  var updatedAt = Number(appState.settingsUpdatedAt) || 0;
  if (!updatedAt) {
    // No base revision — pull master instead of inventing Date.now() (would wipe others).
    console.warn('[settings] push skipped: missing settingsUpdatedAt, pulling master');
    syncSettingsFromServer(function() {
      clearSettingsDirty();
      done(!!appState.settingsUpdatedAt);
    }, { force: true });
    return;
  }
  var settings = {`;

if (!t.includes(oldPushTs)) throw new Error('push ts block not found');
t = t.replace(oldPushTs, newPushTs);

// 2) Checklist apply/preserve by updatedAt
const oldApply = `function applyChecklistsMap(records, items) {
  if (!items || !records) return;
  records.forEach(function(r) {
    var key = recordChecklistKey(r);
    var cl = key && items[key];
    if (!cl || !cl.checklistFilled) return;
    r.checklistViolations = cl.checklistViolations || {};
    r.checklistQuestionTexts = cl.checklistQuestionTexts || {};
    r.checklistPassportId = cl.checklistPassportId || null;
    r.checklistFilled = true;
  });
}

function preserveLocalChecklists(serverRecords, localRecords) {
  var byKey = {};
  (localRecords || []).forEach(function(r) {
    if (!r.checklistFilled) return;
    var key = recordChecklistKey(r);
    if (key) byKey[key] = r;
  });
  (serverRecords || []).forEach(function(r) {
    var key = recordChecklistKey(r);
    var local = key && byKey[key];
    if (local && local.checklistFilled && !r.checklistFilled) {
      r.checklistViolations = local.checklistViolations || {};
      r.checklistQuestionTexts = local.checklistQuestionTexts || {};
      r.checklistPassportId = local.checklistPassportId || null;
      r.checklistFilled = true;
    }
  });
}`;

const newApply = `function applyChecklistsMap(records, items) {
  if (!items || !records) return;
  records.forEach(function(r) {
    var key = recordChecklistKey(r);
    var cl = key && items[key];
    if (!cl || !cl.checklistFilled) return;
    var srvAt = Number(cl.updatedAt) || 0;
    var locAt = Number(r.checklistUpdatedAt) || 0;
    // Keep newer local checklist (not yet confirmed) over older server copy.
    if (locAt > 0 && srvAt > 0 && locAt > srvAt) return;
    r.checklistViolations = cl.checklistViolations || {};
    r.checklistQuestionTexts = cl.checklistQuestionTexts || {};
    r.checklistPassportId = cl.checklistPassportId || null;
    r.checklistFilled = true;
    if (srvAt) r.checklistUpdatedAt = srvAt;
  });
}

function preserveLocalChecklists(serverRecords, localRecords) {
  var byKey = {};
  (localRecords || []).forEach(function(r) {
    if (!r.checklistFilled) return;
    var key = recordChecklistKey(r);
    if (key) byKey[key] = r;
  });
  (serverRecords || []).forEach(function(r) {
    var key = recordChecklistKey(r);
    var local = key && byKey[key];
    if (!local || !local.checklistFilled) return;
    var locAt = Number(local.checklistUpdatedAt) || 0;
    var srvAt = Number(r.checklistUpdatedAt) || 0;
    var serverEmpty = !r.checklistFilled;
    var localNewer = locAt > 0 && (srvAt === 0 || locAt > srvAt);
    if (serverEmpty || localNewer) {
      r.checklistViolations = local.checklistViolations || {};
      r.checklistQuestionTexts = local.checklistQuestionTexts || {};
      r.checklistPassportId = local.checklistPassportId || null;
      r.checklistFilled = true;
      if (locAt) r.checklistUpdatedAt = locAt;
    }
  });
}`;

if (!t.includes(oldApply)) throw new Error('applyChecklistsMap block not found');
t = t.replace(oldApply, newApply);

// 3) Inject checklistUpdatedAt base into field updates
const oldSaveField = `function saveRecordFieldUpdate(dateEntry, year, fields) {
  var rec = appState.db.find(function(r) { return r.dateEntry === dateEntry; });
  if (rec) {
    Object.keys(fields).forEach(function(k) { rec[k] = fields[k]; });
  }
  saveState();
  var item = {
    dateEntry: dateEntry, year: year, fields: fields, updatedAt: (rec && rec.updatedAt) || 0,`;

const newSaveField = `function saveRecordFieldUpdate(dateEntry, year, fields) {
  var rec = appState.db.find(function(r) { return r.dateEntry === dateEntry; });
  fields = fields || {};
  // Optimistic concurrency base for filled checklists (last known server revision).
  if (fields.checklistFilled && fields.checklistUpdatedAt == null) {
    fields.checklistUpdatedAt = Number(rec && rec.checklistUpdatedAt) || 0;
  }
  if (rec) {
    Object.keys(fields).forEach(function(k) { rec[k] = fields[k]; });
  }
  saveState();
  var item = {
    dateEntry: dateEntry, year: year, fields: fields, updatedAt: (rec && rec.updatedAt) || 0,`;

if (!t.includes(oldSaveField)) throw new Error('saveRecordFieldUpdate not found');
t = t.replace(oldSaveField, newSaveField);

// 4) On successful update/save apply checklistUpdatedAt; on checklist conflict apply server checklist
const oldConflict = `      if (res.status === 409 || d.conflict) {
        console.warn('[update-sync] конфликт — принимаем серверную версию');
        removeFromUpdateQueue(item.dateEntry);
        if (d.record) {
          var local = (appState.db || []).find(function(r) {
            return r.dateEntry === item.dateEntry || (d.record.checkId && r.checkId === d.record.checkId);
          });
          if (local) {
            Object.keys(d.record).forEach(function(k) { local[k] = d.record[k]; });
            saveState();
            refreshActiveRecordLists();
          }
        } else {
          loadFromServer(function() { refreshActiveRecordLists(); }, { forceFull: true });
        }
        updateSyncStatusFromQueues();
        resolve(false);
        return;
      }
      if (d.success) {
        removeFromUpdateQueue(item.dateEntry);
        var shas = getServerShas();
        delete shas['sha' + item.year];
        saveServerShas(shas);
        if (d.updatedAt) {
          var loc2 = (appState.db || []).find(function(r) { return r.dateEntry === item.dateEntry; });
          if (loc2) loc2.updatedAt = d.updatedAt;
          saveState();
        }`;

const newConflict = `      if (res.status === 409 || d.conflict) {
        console.warn('[update-sync] конфликт — принимаем серверную версию');
        removeFromUpdateQueue(item.dateEntry);
        var localC = (appState.db || []).find(function(r) {
          return r.dateEntry === item.dateEntry ||
            (d.record && d.record.checkId && r.checkId === d.record.checkId) ||
            (item.fields && item.fields.checkId && r.checkId === item.fields.checkId);
        });
        if (d.record && localC) {
          Object.keys(d.record).forEach(function(k) { localC[k] = d.record[k]; });
        }
        if (d.checklist && localC) {
          localC.checklistViolations = d.checklist.checklistViolations || {};
          localC.checklistQuestionTexts = d.checklist.checklistQuestionTexts || {};
          localC.checklistPassportId = d.checklist.checklistPassportId || null;
          localC.checklistFilled = !!d.checklist.checklistFilled;
          if (d.checklist.updatedAt) localC.checklistUpdatedAt = d.checklist.updatedAt;
        }
        if (d.record || d.checklist) {
          saveState();
          refreshActiveRecordLists();
        } else {
          loadFromServer(function() { refreshActiveRecordLists(); }, { forceFull: true });
        }
        updateSyncStatusFromQueues();
        resolve(false);
        return;
      }
      if (d.success) {
        removeFromUpdateQueue(item.dateEntry);
        var shas = getServerShas();
        delete shas['sha' + item.year];
        saveServerShas(shas);
        if (d.updatedAt || d.checklistUpdatedAt) {
          var loc2 = (appState.db || []).find(function(r) { return r.dateEntry === item.dateEntry; });
          if (loc2) {
            if (d.updatedAt) loc2.updatedAt = d.updatedAt;
            if (d.checklistUpdatedAt) loc2.checklistUpdatedAt = d.checklistUpdatedAt;
          }
          saveState();
        }`;

if (!t.includes(oldConflict)) throw new Error('update conflict block not found');
t = t.replace(oldConflict, newConflict);

const oldSaveOk = `        if (savedRec) {
          if (d.checkId) savedRec.checkId = d.checkId;
          if (d.num) savedRec.num = d.num;
          saveState();
        }`;

const newSaveOk = `        if (savedRec) {
          if (d.checkId) savedRec.checkId = d.checkId;
          if (d.num) savedRec.num = d.num;
          if (d.checklistUpdatedAt) savedRec.checklistUpdatedAt = d.checklistUpdatedAt;
          saveState();
        }`;

if (!t.includes(oldSaveOk)) throw new Error('save ok block not found');
t = t.replace(oldSaveOk, newSaveOk);

fs.writeFileSync(indexPath, Buffer.from(t, 'utf8'));

let sw = fs.readFileSync(swPath, 'utf8').replace(/\r\n/g, '\n');
if (!sw.includes("const STATIC_CACHE = 'pkb-static-v323'")) {
  throw new Error('Expected sw v323');
}
sw = sw
  .replace("const STATIC_CACHE = 'pkb-static-v323'", "const STATIC_CACHE = 'pkb-static-v324'")
  .replace("const API_CACHE = 'pkb-api-v323'", "const API_CACHE = 'pkb-api-v324'");
fs.writeFileSync(swPath, Buffer.from(sw, 'utf8'));

t = fs.readFileSync(indexPath, 'utf8');
if (!t.includes("var APP_BUILD = 'pkb-v324'")) throw new Error('build bump failed');
if (t.includes('appState.settingsUpdatedAt || Date.now()')) throw new Error('invent ts still present');
if (!t.includes('locAt > srvAt')) throw new Error('checklist apply compare missing');

console.log('OK: pkb-v324 all-settings + checklist concurrency');
