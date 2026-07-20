const fs = require('fs');

let html = fs.readFileSync('index.html', 'utf8').replace(/\r\n/g, '\n');
let sw = fs.readFileSync('sw.js', 'utf8');

const oldMs = `// "DD.MM.YYYY, HH:MM:SS" → ms timestamp (0 if unparseable)
function dateEntryToMs(s) {
  if (!s) return 0;
  var m = String(s).match(/(\\d{1,2})\\.(\\d{1,2})\\.(\\d{4}),?\\s*(\\d{1,2}):(\\d{2}):(\\d{2})/);
  if (!m) return 0;
  return new Date(+m[3], +m[2]-1, +m[1], +m[4], +m[5], +m[6]).getTime();
}`;

const newMs = `function dateEntryPartsToMs(y, mo, d, h, mi, se) {
  return new Date(+y, +mo - 1, +d, +h, +mi, +se).getTime();
}

function excelSerialToDateTimeLocal(n) {
  var epoch = new Date(Date.UTC(1899, 11, 30));
  return new Date(epoch.getTime() + Math.round(+n * 86400000));
}

// dateEntry → ms (date + hours + minutes + seconds)
function dateEntryToMs(val) {
  if (val == null || val === '') return 0;
  if (val instanceof Date && !isNaN(val.getTime())) {
    return val.getTime();
  }
  if (typeof val === 'number' && val > 30000) {
    var dt = excelSerialToDateTimeLocal(val);
    return isNaN(dt.getTime()) ? 0 : dt.getTime();
  }
  var s = String(val).trim();
  var m = s.match(/(\\d{1,2})\\.(\\d{1,2})\\.(\\d{4}),?\\s*(\\d{1,2}):(\\d{2}):(\\d{2})/);
  if (m) return dateEntryPartsToMs(+m[3], +m[2], +m[1], +m[4], +m[5], +m[6]);
  m = s.match(/(\\d{1,2})\\.(\\d{1,2})\\.(\\d{4}),?\\s*(\\d{1,2}):(\\d{2})/);
  if (m) return dateEntryPartsToMs(+m[3], +m[2], +m[1], +m[4], +m[5], 0);
  m = s.match(/^(\\d{1,2})\\.(\\d{1,2})\\.(\\d{4})$/);
  if (m) return dateEntryPartsToMs(+m[3], +m[2], +m[1], 0, 0, 0);
  return 0;
}`;

if (!html.includes(oldMs)) throw new Error('dateEntryToMs block not found');
html = html.replace(oldMs, newMs);
html = html.replace(/var APP_BUILD = 'pkb-v248';/, "var APP_BUILD = 'pkb-v249';");
sw = sw.replace(/pkb-static-v248/g, 'pkb-static-v249').replace(/pkb-api-v248/g, 'pkb-api-v249');

fs.writeFileSync('index.html', Buffer.from(html, 'utf8'));
fs.writeFileSync('sw.js', sw);
console.log('pkb-v249 dateEntry sort patch applied');
