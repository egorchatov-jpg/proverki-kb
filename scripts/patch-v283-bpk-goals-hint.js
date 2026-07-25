const fs = require('fs');

let html = fs.readFileSync('index.html', 'utf8').replace(/\r\n/g, '\n');
let sw = fs.readFileSync('sw.js', 'utf8');

function mustReplace(oldStr, newStr, label) {
  if (!html.includes(oldStr)) throw new Error('NOT FOUND: ' + label);
  html = html.split(oldStr).join(newStr);
}

mustReplace(
  'Нажмите на барьер и установите цели по работоспособности барьеров',
  'Нажмите на барьер и установите цели по работоспособности',
  'bpk goals hint text'
);

mustReplace(
  `var APP_BUILD = 'pkb-v282';`,
  `var APP_BUILD = 'pkb-v283';`,
  'APP_BUILD bump'
);

sw = sw.replace(/pkb-static-v282/g, 'pkb-static-v283');
sw = sw.replace(/pkb-api-v282/g, 'pkb-api-v283');

fs.writeFileSync('index.html', html, 'utf8');
fs.writeFileSync('sw.js', sw, 'utf8');
console.log('patch-v283-bpk-goals-hint OK -> pkb-v283');
