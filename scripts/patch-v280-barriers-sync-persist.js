const fs = require('fs');

let html = fs.readFileSync('index.html', 'utf8').replace(/\r\n/g, '\n');
let sw = fs.readFileSync('sw.js', 'utf8');

function mustReplace(oldStr, newStr, label) {
  if (!html.includes(oldStr)) throw new Error('NOT FOUND: ' + label);
  html = html.split(oldStr).join(newStr);
}

mustReplace(
  `function snapBarriersYearList() {
  if (!_bpkYear) return [];
  return getBarriersForYear(_bpkYear).map(function(b) {
    return { name: b.name, passport: b.passport || '', inPK: !!b.inPK, show: b.show !== false };
  });
}`,
  `function snapBarriersYearList() {
  if (!_bpkYear) return [];
  return getBarriersForYear(_bpkYear).map(function(b) {
    return { name: b.name, passport: b.passport || '', inPK: !!b.inPK, show: b.show !== false };
  });
}

function barriersConfigSnapForCompare(cfg) {
  var out = {};
  Object.keys(cfg || {}).sort().forEach(function(y) {
    out[y] = (cfg[y] || []).map(function(b) {
      return {
        name: b.name,
        passport: b.passport || '',
        inPK: !!b.inPK,
        show: b.show !== false
      };
    }).sort(function(a, b) { return String(a.name).localeCompare(String(b.name), 'ru'); });
  });
  return JSON.stringify(out);
}`,
  'barriersConfigSnapForCompare helper'
);

mustReplace(
  `      if (data.barriersConfig || data.barriersPK) {
        if (preferLocal) {
          appState.barriersConfig = mergeBarriersConfig(data.barriersConfig || {}, localBarriersConfig, true);
        } else if (data.barriersConfig) {
          appState.barriersConfig = {};
          Object.keys(data.barriersConfig).forEach(function(y) {
            appState.barriersConfig[y] = (data.barriersConfig[y] || []).map(function(b) {
              return Object.assign({}, b);
            });
          });
        }
        applyBarriersPKToConfig(data.barriersPK, appState.barriersConfig);
      }`,
  `      if (data.barriersConfig || data.barriersPK || (localBarriersConfig && Object.keys(localBarriersConfig).length)) {
        var serverBarriersConfig = data.barriersConfig || {};
        appState.barriersConfig = mergeBarriersConfig(serverBarriersConfig, localBarriersConfig, true);
        applyBarriersPKToConfig(data.barriersPK, appState.barriersConfig);
        if (barriersConfigSnapForCompare(appState.barriersConfig) !== barriersConfigSnapForCompare(serverBarriersConfig)) {
          markSettingsDirty();
        }
      }`,
  'syncSettingsFromServer barriers merge'
);

mustReplace(
  `var APP_BUILD = 'pkb-v279';`,
  `var APP_BUILD = 'pkb-v280';`,
  'APP_BUILD bump'
);

sw = sw.replace(/pkb-static-v279/g, 'pkb-static-v280');
sw = sw.replace(/pkb-api-v279/g, 'pkb-api-v280');

fs.writeFileSync('index.html', html, 'utf8');
fs.writeFileSync('sw.js', sw, 'utf8');
console.log('patch-v280-barriers-sync-persist OK -> pkb-v280');
