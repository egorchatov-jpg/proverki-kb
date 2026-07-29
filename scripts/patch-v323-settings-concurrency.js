/**
 * pkb-v323: fix multi-user settings wipe (barrier goals).
 *
 * Root cause: stale tab pushed full settings blob without goals, after bumping
 * settingsUpdatedAt=Date.now(), so server accepted it over newer master.
 *
 * Client fixes:
 * - markSettingsDirty does NOT bump settingsUpdatedAt (keep last server revision)
 * - syncSettingsOnAppOpen: PULL FIRST only (never push-before-pull stale blob)
 * - on successful PUT: apply returned settings / settingsUpdatedAt
 * - on 409: apply server settings (already did)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const indexPath = path.join(ROOT, 'index.html');
const swPath = path.join(ROOT, 'sw.js');

let t = fs.readFileSync(indexPath, 'utf8').replace(/\r\n/g, '\n');

if (!t.includes("var APP_BUILD = 'pkb-v322'")) {
  throw new Error('Expected APP_BUILD pkb-v322, got something else');
}
t = t.replace("var APP_BUILD = 'pkb-v322'", "var APP_BUILD = 'pkb-v323'");

const oldMark = `function markSettingsDirty() {
  // Session-only: dirty must not survive restarts/updates, otherwise stale
  // localStorage can overwrite master settings after redeploy.
  try { sessionStorage.setItem('pkb-settings-dirty', '1'); } catch(e) {}
  try { localStorage.removeItem('pkb-settings-dirty'); } catch(e) {}
  appState.settingsUpdatedAt = Date.now();
  saveState();
  scheduleSettingsSync();
}

/**
 * On every app open / resume: push pending local edits (if any), then force-pull
 * master settings from server — same idea as loadFromServer({ forceFull: true }).
 */
function syncSettingsOnAppOpen(callback) {
  function pullMaster() {
    syncSettingsFromServer(function() {
      refreshSettingsDependentUi();
      if (callback) callback();
    }, { force: true });
  }
  if (_settingsSyncTimer) {
    clearTimeout(_settingsSyncTimer);
    _settingsSyncTimer = null;
  }
  if (isLocalDevRuntime() || !isSettingsDirty()) {
    pullMaster();
    return;
  }
  syncSettingsToServer(function(ok) {
    if (ok || !isSettingsDirty()) {
      pullMaster();
      return;
    }
    // Push failed — keep local dirty edits, do not overwrite from server.
    syncSettingsFromServer(function() {
      refreshSettingsDependentUi();
      if (callback) callback();
    }, { force: false });
  });
}`;

const newMark = `function markSettingsDirty() {
  // Session-only: dirty must not survive restarts/updates, otherwise stale
  // localStorage can overwrite master settings after redeploy.
  // IMPORTANT: do NOT bump settingsUpdatedAt here — keep last server revision
  // so optimistic concurrency can reject stale multi-user overwrites.
  try { sessionStorage.setItem('pkb-settings-dirty', '1'); } catch(e) {}
  try { localStorage.removeItem('pkb-settings-dirty'); } catch(e) {}
  saveState();
  scheduleSettingsSync();
}

/**
 * On every app open / resume: force-pull master settings FIRST.
 * Never push-before-pull: a long-lived tab may hold stale barriersConfig
 * (e.g. without goals) and would wipe newer server settings.
 */
function syncSettingsOnAppOpen(callback) {
  if (_settingsSyncTimer) {
    clearTimeout(_settingsSyncTimer);
    _settingsSyncTimer = null;
  }
  syncSettingsFromServer(function() {
    refreshSettingsDependentUi();
    if (callback) callback();
  }, { force: true });
}`;

if (!t.includes(oldMark)) throw new Error('markSettingsDirty/syncSettingsOnAppOpen block not found');
t = t.replace(oldMark, newMark);

const oldSuccess = `    if (d && d.success && gen === _settingsSyncGen) {
      clearSettingsDirty();
      saveState();
      done(true);
      return;
    }
    done(false);
  })
  .catch(function(e) {
    console.warn('[settings] sync to server failed:', e.message);
    done(false);
  });
}`;

const newSuccess = `    if (d && d.success && gen === _settingsSyncGen) {
      if (d.settings) applyMasterSettingsPayload(d.settings);
      else if (d.settingsUpdatedAt) appState.settingsUpdatedAt = d.settingsUpdatedAt;
      clearSettingsDirty();
      saveState();
      done(true);
      return;
    }
    done(false);
  })
  .catch(function(e) {
    console.warn('[settings] sync to server failed:', e.message);
    done(false);
  });
}`;

if (!t.includes(oldSuccess)) throw new Error('syncSettingsToServer success block not found');
t = t.replace(oldSuccess, newSuccess);

// On hide: still try push dirty, but after open we always pull — OK.
// Visibility hide push with old ts will 409 if server moved ahead — good.

fs.writeFileSync(indexPath, Buffer.from(t, 'utf8'));

let sw = fs.readFileSync(swPath, 'utf8').replace(/\r\n/g, '\n');
if (!sw.includes("const STATIC_CACHE = 'pkb-static-v322'")) {
  throw new Error('Expected sw v322');
}
sw = sw
  .replace("const STATIC_CACHE = 'pkb-static-v322'", "const STATIC_CACHE = 'pkb-static-v323'")
  .replace("const API_CACHE = 'pkb-api-v322'", "const API_CACHE = 'pkb-api-v323'");
fs.writeFileSync(swPath, Buffer.from(sw, 'utf8'));

// sanity
t = fs.readFileSync(indexPath, 'utf8');
if (t.includes('appState.settingsUpdatedAt = Date.now();\n  saveState();\n  scheduleSettingsSync')) {
  throw new Error('timestamp bump still in markSettingsDirty');
}
if (t.includes('Never push-before-pull') === false) throw new Error('pull-first comment missing');
if (!t.includes("var APP_BUILD = 'pkb-v323'")) throw new Error('build bump failed');

console.log('OK: pkb-v323 multi-user settings concurrency fix');
