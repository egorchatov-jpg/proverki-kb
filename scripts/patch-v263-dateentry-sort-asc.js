const fs = require('fs');

let html = fs.readFileSync('index.html', 'utf8').replace(/\r\n/g, '\n');
let sw = fs.readFileSync('sw.js', 'utf8');

function mustReplace(oldStr, newStr, label) {
  if (!html.includes(oldStr)) throw new Error('NOT FOUND: ' + label);
  html = html.split(oldStr).join(newStr);
}

mustReplace(
  'function sortByDateCheckAsc(recs) {\n  return recs.slice().sort(function(a, b) {\n    return dateNumFromStr(a.dateCheck) - dateNumFromStr(b.dateCheck);\n  });\n}',
  'function sortByDateCheckAsc(recs) {\n  return recs.slice().sort(cmpRecords);\n}',
  'sortByDateCheckAsc'
);

mustReplace(
  '  d = dateEntryToMs(a.dateEntry) - dateEntryToMs(b.dateEntry);',
  '  d = dateEntryToMs(a.dateEntry) - dateEntryToMs(b.dateEntry);',
  'cmpRecords dateEntry asc'
);

html = html.replace(/var APP_BUILD = 'pkb-v262';/, "var APP_BUILD = 'pkb-v263';");
sw = sw.replace(/pkb-static-v262/g, 'pkb-static-v263').replace(/pkb-api-v262/g, 'pkb-api-v263');

fs.writeFileSync('index.html', Buffer.from(html, 'utf8'));
fs.writeFileSync('sw.js', sw);
console.log('patch-v263-dateentry-sort-asc OK -> pkb-v263');
