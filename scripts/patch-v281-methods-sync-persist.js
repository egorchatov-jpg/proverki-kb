const fs = require('fs');

let html = fs.readFileSync('index.html', 'utf8').replace(/\r\n/g, '\n');
let sw = fs.readFileSync('sw.js', 'utf8');

function mustReplace(oldStr, newStr, label) {
  if (!html.includes(oldStr)) throw new Error('NOT FOUND: ' + label);
  html = html.split(oldStr).join(newStr);
}

mustReplace(
  `function mergeMethods(server, local) {
  if (!server || !server.length) return local || DEFAULT_METHODS;
  local = local || [];
  var localMap = {};
  local.forEach(function(m) { if (m && m.name) localMap[m.name] = m; });
  var out = server.map(function(m) {
    var loc = localMap[m.name];
    if (!loc) return Object.assign({}, m);
    return { name: m.name, show: loc.show !== undefined ? loc.show : (m.show !== false), fixed: m.fixed || loc.fixed };
  });
  local.forEach(function(m) {
    if (m && m.name && !out.some(function(x) { return x.name === m.name; })) out.push(Object.assign({}, m));
  });
  return out;
}`,
  `function mergeMethods(server, local) {
  if (!server || !server.length) return local || DEFAULT_METHODS;
  local = local || [];
  var localMap = {};
  local.forEach(function(m) { if (m && m.name) localMap[m.name] = m; });
  var out = server.map(function(m) {
    var loc = localMap[m.name];
    if (!loc) return Object.assign({}, m);
    return { name: m.name, show: loc.show !== undefined ? loc.show : (m.show !== false), fixed: m.fixed || loc.fixed };
  });
  local.forEach(function(m) {
    if (m && m.name && !out.some(function(x) { return x.name === m.name; })) out.push(Object.assign({}, m));
  });
  return out;
}

function methodsSnapForCompare(list) {
  return JSON.stringify((list || []).map(function(m) {
    return { name: m.name, show: m.show !== false, fixed: !!m.fixed };
  }).sort(function(a, b) { return String(a.name).localeCompare(String(b.name), 'ru'); }));
}`,
  'methodsSnapForCompare helper'
);

mustReplace(
  `      if (data.methods && data.methods.length) {
        data.methods = data.methods.map(function(m) {
          var copy = Object.assign({}, m);
          if (copy.name) copy.name = renameSamoproverkaText(copy.name);
          return copy;
        });
        appState.methods = preferLocal
          ? mergeMethods(data.methods, localMethods)
          : data.methods.map(function(m) { return Object.assign({}, m); });
      }`,
  `      if (data.methods && data.methods.length) {
        var serverMethods = data.methods.map(function(m) {
          var copy = Object.assign({}, m);
          if (copy.name) copy.name = renameSamoproverkaText(copy.name);
          return copy;
        });
        appState.methods = mergeMethods(serverMethods, localMethods);
        if (methodsSnapForCompare(appState.methods) !== methodsSnapForCompare(serverMethods)) {
          markSettingsDirty();
        }
      } else if (localMethods && localMethods.length) {
        appState.methods = localMethods.map(function(m) { return Object.assign({}, m); });
        markSettingsDirty();
      }`,
  'syncSettingsFromServer methods merge'
);

mustReplace(
  `      if (!preferLocal) {
        appState.barriersCustomPassports = data.barriersCustomPassports || {};
      } else if (data.barriersCustomPassports) {
        appState.barriersCustomPassports = Object.assign({}, data.barriersCustomPassports, appState.barriersCustomPassports || {});
      }`,
  `      var serverCustomPassports = data.barriersCustomPassports || {};
      var localCustomPassports = appState.barriersCustomPassports || {};
      appState.barriersCustomPassports = Object.assign({}, serverCustomPassports, localCustomPassports);
      if (JSON.stringify(appState.barriersCustomPassports) !== JSON.stringify(serverCustomPassports)) {
        markSettingsDirty();
      }`,
  'syncSettingsFromServer custom passports merge'
);

mustReplace(
  `var APP_BUILD = 'pkb-v280';`,
  `var APP_BUILD = 'pkb-v281';`,
  'APP_BUILD bump'
);

sw = sw.replace(/pkb-static-v280/g, 'pkb-static-v281');
sw = sw.replace(/pkb-api-v280/g, 'pkb-api-v281');

fs.writeFileSync('index.html', html, 'utf8');
fs.writeFileSync('sw.js', sw, 'utf8');
console.log('patch-v281-methods-sync-persist OK -> pkb-v281');
