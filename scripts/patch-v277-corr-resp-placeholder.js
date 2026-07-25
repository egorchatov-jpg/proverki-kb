const fs = require('fs');

let html = fs.readFileSync('index.html', 'utf8').replace(/\r\n/g, '\n');
let sw = fs.readFileSync('sw.js', 'utf8');

const oldStr = "\u041e\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0435\u043d\u043d\u044b\u0439 \u0434\u0435\u043f\u0430\u0440\u0442\u0430\u043c\u0435\u043d\u0442, \u043e\u0440\u0433\u0430\u043d\u0438\u0437\u0430\u0446\u0438\u044f";
const newStr = "\u041e\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0435\u043d\u043d\u044b\u0439 \u0434\u0435\u043f\u0430\u0440\u0442\u0430\u043c\u0435\u043d\u0442 \u043e\u0440\u0433\u0430\u043d\u0438\u0437\u0430\u0446\u0438\u044f";

if (!html.includes(oldStr)) throw new Error('placeholder text not found');
html = html.split(oldStr).join(newStr);

html = html.replace("var APP_BUILD = 'pkb-v276';", "var APP_BUILD = 'pkb-v277';");
sw = sw.replace(/pkb-static-v276/g, 'pkb-static-v277');
sw = sw.replace(/pkb-api-v276/g, 'pkb-api-v277');

fs.writeFileSync('index.html', html, 'utf8');
fs.writeFileSync('sw.js', sw, 'utf8');
console.log('patch-v277-corr-resp-placeholder OK -> pkb-v277');
