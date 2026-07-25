const fs = require('fs');

let html = fs.readFileSync('index.html', 'utf8').replace(/\r\n/g, '\n');
let sw = fs.readFileSync('sw.js', 'utf8');

function mustReplace(oldStr, newStr, label) {
  if (!html.includes(oldStr)) throw new Error('NOT FOUND: ' + label);
  html = html.split(oldStr).join(newStr);
}

const descBlockOld =
  `(formatRecordDescPlain(r) ? '<div class="corr-info-line corr-info-desc">\u041e\u043f\u0438\u0441\u0430\u043d\u0438\u0435: ' + formatRecordDescHtml(r) + '</div>' : '');`;
const descBlockNew =
  `(formatRecordDescPlain(r) ? '<div class="corr-info-line corr-info-desc"><span class="corr-info-desc-label">\u041e\u043f\u0438\u0441\u0430\u043d\u0438\u0435:</span><div class="corr-info-desc-body">' + formatRecordDescHtml(r) + '</div></div>' : '');`;

mustReplace(descBlockOld, descBlockNew, 'desc block html');

mustReplace(
  `.corr-info-line { color: #1a2035; }
.corr-info-desc { color: #1a2035; }`,
  `.corr-info-line { color: #1a2035; }
.corr-info-desc { color: #1a2035; }
.corr-info-desc-label { display: block; }
.corr-info-desc-body { display: block; }`,
  'desc label css'
);

mustReplace(
  `var APP_BUILD = 'pkb-v277';`,
  `var APP_BUILD = 'pkb-v278';`,
  'APP_BUILD bump'
);

sw = sw.replace(/pkb-static-v277/g, 'pkb-static-v278');
sw = sw.replace(/pkb-api-v277/g, 'pkb-api-v278');

fs.writeFileSync('index.html', html, 'utf8');
fs.writeFileSync('sw.js', sw, 'utf8');
console.log('patch-v278-corr-desc-newline OK -> pkb-v278');
