const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/\r\n/g, '\n');

html = html.replace(
  `function getSettingsYears() {
  var ySet = {};
  ySet[String(new Date().getFullYear())] = true;
  (appState.db || []).forEach(function(r) { if (r.year) ySet[String(r.year)] = true; });
  return Object.keys(ySet).sort(function(a, b) { return +b - +a; });
}`,
  `function getSettingsYears() {
  var ySet = {};
  (appState.db || []).forEach(function(r) {
    if (r.year && r.dateCheck) ySet[String(r.year)] = true;
  });
  return Object.keys(ySet).sort(function(a, b) { return +b - +a; });
}`
);

html = html.replace("var APP_BUILD = 'pkb-v254';", "var APP_BUILD = 'pkb-v255';");

fs.writeFileSync(path.join(root, 'index.html'), Buffer.from(html.replace(/\n/g, '\r\n'), 'utf8'));
console.log('export years + pkb-v255');
