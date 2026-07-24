const fs = require('fs');

let html = fs.readFileSync('index.html', 'utf8').replace(/\r\n/g, '\n');
let sw = fs.readFileSync('sw.js', 'utf8');

function mustReplace(oldStr, newStr, label) {
  if (!html.includes(oldStr)) throw new Error('NOT FOUND: ' + label);
  html = html.split(oldStr).join(newStr);
}

mustReplace(
  `      // Migrate old 2-item org list to DEFAULT_ORGS
      if (appState.orgs.length <= 2 ||
          appState.orgs.some(function(o) { return (o.name||o).indexOf('\u00ab') >= 0; })) {
        appState.orgs = DEFAULT_ORGS.map(function(n) { return { name: n, show: true, inspects: false }; });
      }`,
  `      // Migrate legacy org names with guillemets to DEFAULT_ORGS
      if (appState.orgs.some(function(o) { return (o.name||o).indexOf('\u00ab') >= 0; })) {
        appState.orgs = DEFAULT_ORGS.map(function(n) { return { name: n, show: true, inspects: false }; });
      }`,
  'loadState org migration'
);

mustReplace(
  `function snapOrgsList() {
  return (appState.orgs || []).map(function(o) {
    return { name: o.name, show: o.show !== false, inspects: o.inspects === true };
  });
}`,
  `function snapOrgsList() {
  return (appState.orgs || []).map(function(o) {
    return { name: o.name, show: o.show !== false, inspects: o.inspects === true };
  });
}

function orgsSnapForCompare(list) {
  return JSON.stringify((list || []).map(function(o) {
    if (typeof o === 'string') return { name: o, show: true, inspects: false };
    return { name: o.name, show: o.show !== false, inspects: o.inspects === true };
  }).sort(function(a, b) { return String(a.name).localeCompare(String(b.name), 'ru'); }));
}`,
  'orgsSnapForCompare helper'
);

mustReplace(
  `      if (data.orgs && data.orgs.length) {
        var serverOrgs = data.orgs;
        if (typeof serverOrgs[0] === 'string') {
          serverOrgs = serverOrgs.map(function(n) { return { name: n, show: true, inspects: false }; });
        }
        if (!preferLocal && (serverOrgs.length <= 2 ||
            serverOrgs.some(function(o) { return (o.name||o).indexOf('\u00ab') >= 0; }))) {
          serverOrgs = DEFAULT_ORGS.map(function(n) { return { name: n, show: true, inspects: false }; });
        }
        appState.orgs = preferLocal
          ? mergeOrgs(serverOrgs, localOrgs)
          : serverOrgs.map(function(o) { return Object.assign({}, o); });
      }`,
  `      if (data.orgs && data.orgs.length) {
        var serverOrgs = data.orgs;
        if (typeof serverOrgs[0] === 'string') {
          serverOrgs = serverOrgs.map(function(n) { return { name: n, show: true, inspects: false }; });
        }
        if (serverOrgs.some(function(o) { return (o.name||o).indexOf('\u00ab') >= 0; })) {
          serverOrgs = DEFAULT_ORGS.map(function(n) { return { name: n, show: true, inspects: false }; });
        }
        var serverOrgsSnap = orgsSnapForCompare(serverOrgs);
        appState.orgs = mergeOrgs(serverOrgs, localOrgs);
        if (orgsSnapForCompare(appState.orgs) !== serverOrgsSnap) markSettingsDirty();
      } else if (localOrgs && localOrgs.length) {
        appState.orgs = (localOrgs || []).map(function(o) {
          return normalizeOrgRoleFlags(Object.assign({}, typeof o === 'string' ? { name: o, show: true, inspects: false } : o));
        });
        markSettingsDirty();
      }`,
  'syncSettingsFromServer org merge'
);

mustReplace(
  `      if (!preferLocal) clearSettingsDirty();
      saveState();`,
  `      if (!isSettingsDirty()) clearSettingsDirty();
      saveState();`,
  'clearSettingsDirty only when clean'
);

mustReplace(
  `    orgs:          appState.orgs          || [],`,
  `    orgs:          (appState.orgs || []).map(function(o) {
      return normalizeOrgRoleFlags(Object.assign({}, o));
    }),`,
  'normalize orgs on server push'
);

mustReplace(
  `  var finishUpdate = function() {
    activateWaitingSw();`,
  `  var finishUpdate = function() {
    if (isSettingsDirty()) syncSettingsToServer();
    activateWaitingSw();`,
  'flush settings before app update reload'
);

mustReplace(
  `var APP_BUILD = 'pkb-v269';`,
  `var APP_BUILD = 'pkb-v270';`,
  'APP_BUILD bump'
);

sw = sw.replace(/pkb-static-v269/g, 'pkb-static-v270');
sw = sw.replace(/pkb-api-v269/g, 'pkb-api-v270');

fs.writeFileSync('index.html', html, 'utf8');
fs.writeFileSync('sw.js', sw, 'utf8');
console.log('patch-v270-orgs-sync-persist OK -> pkb-v270');
