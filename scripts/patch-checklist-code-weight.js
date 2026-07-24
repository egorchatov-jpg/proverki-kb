const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, '..', 'index.html');
const swPath = path.join(__dirname, '..', 'sw.js');

let html = fs.readFileSync(indexPath, 'utf8').replace(/\r\n/g, '\n');

function mustReplace(old, neu, label) {
  if (!html.includes(old)) {
    console.error('Missing: ' + label);
    process.exit(1);
  }
  html = html.replace(old, neu);
}

mustReplace(
  '#val-desc .checklist-desc-line:last-child { margin-bottom: 0; }',
  `#val-desc .checklist-desc-line:last-child { margin-bottom: 0; }
.checklist-desc-code, .checklist-question-code { font-weight: 400; }
.card-checklist-question.violation .checklist-question-code,
.card-checklist-question.violation .checklist-question-text { font-weight: 400; }`,
  'checklist code css'
);

mustReplace(
  `function extractQuestionCodePrefix(questionText) {
  var m = String(questionText || '').match(/^([^\\s]+)/);
  if (!m) return '';
  var code = m[1];
  if (code.charAt(code.length - 1) !== '.') code += '.';
  return code;
}`,
  `function extractQuestionCodePrefix(questionText) {
  var s = String(questionText || '').trim();
  if (!s) return '';
  var m = s.match(/^([A-Za-z\u0410-\u042F\u0430-\u044F\u0401\u04510-9]+(?:\\.[A-Za-z\u0410-\u042F\u0430-\u044F\u0401\u04510-9]+)*\\.?)\\s*/);
  if (!m) m = s.match(/^([^\\s]+)/);
  if (!m) return '';
  var code = m[1];
  if (code.charAt(code.length - 1) !== '.') code += '.';
  return code;
}

function splitQuestionCodeAndText(questionText) {
  var code = extractQuestionCodePrefix(questionText);
  var rest = String(questionText || '').trim();
  if (code && rest.indexOf(code) === 0) rest = rest.slice(code.length).replace(/^\\s+/, '');
  return { code: code, rest: rest };
}

function stripLeadingQuestionCode(text, code) {
  var s = String(text || '').trim();
  if (!code || !s) return s;
  if (s.indexOf(code) === 0) return s.slice(code.length).replace(/^\\s+/, '');
  return s;
}

function fillChecklistQuestionText(container, text, appendixIdSet, returnScreen) {
  var parts = splitQuestionCodeAndText(text);
  container.textContent = '';
  if (parts.code) {
    var codeEl = document.createElement('span');
    codeEl.className = 'checklist-question-code';
    codeEl.textContent = parts.code;
    container.appendChild(codeEl);
    if (parts.rest) {
      container.appendChild(document.createTextNode(' '));
      var restEl = document.createElement('span');
      restEl.className = 'checklist-question-text';
      fillPassportTextWithAppendixLinks(restEl, parts.rest, appendixIdSet, returnScreen);
      container.appendChild(restEl);
    }
    return;
  }
  fillPassportTextWithAppendixLinks(container, text, appendixIdSet, returnScreen);
}`,
  'question code helpers'
);

mustReplace(
  `    var qText = (questionTexts && questionTexts[k]) || k;
    items.push({ key: k, desc: desc, prefix: extractQuestionCodePrefix(qText) });
  });
  if (!items.length) return '';
  items.sort(function(a, b) { return a.key.localeCompare(b.key, 'ru'); });
  return items.map(function(item) {
    return item.prefix + ' ' + item.desc;
  }).join(';\\n\\n');
}`,
  `    var qText = (questionTexts && questionTexts[k]) || k;
    var parts = splitQuestionCodeAndText(qText);
    items.push({
      key: k,
      desc: stripLeadingQuestionCode(desc, parts.code),
      prefix: parts.code
    });
  });
  if (!items.length) return '';
  items.sort(function(a, b) { return a.key.localeCompare(b.key, 'ru'); });
  return items.map(function(item) {
    return (item.prefix ? item.prefix + ' ' : '') + item.desc;
  }).join(';\\n\\n');
}`,
  'buildChecklistDescPlain'
);

mustReplace(
  `    var qText = (questionTexts && questionTexts[k]) || k;
    items.push({ key: k, desc: desc, prefix: extractQuestionCodePrefix(qText) });
  });
  if (!items.length) return '';
  items.sort(function(a, b) { return a.key.localeCompare(b.key, 'ru'); });
  return items.map(function(item) {
    return '<span class="checklist-desc-line"><span class="checklist-desc-code">' + escapeHtmlText(item.prefix) + '</span> ' + escapeHtmlText(item.desc) + '</span>';
  }).join('<br><br>');
}`,
  `    var qText = (questionTexts && questionTexts[k]) || k;
    var parts = splitQuestionCodeAndText(qText);
    items.push({
      key: k,
      desc: stripLeadingQuestionCode(desc, parts.code),
      prefix: parts.code
    });
  });
  if (!items.length) return '';
  items.sort(function(a, b) { return a.key.localeCompare(b.key, 'ru'); });
  return items.map(function(item) {
    var codeHtml = item.prefix
      ? '<span class="checklist-desc-code">' + escapeHtmlText(item.prefix) + '</span> '
      : '';
    return '<span class="checklist-desc-line">' + codeHtml + escapeHtmlText(item.desc) + '</span>';
  }).join('<br><br>');
}`,
  'buildChecklistDescHtml'
);

mustReplace(
  `      fillPassportTextWithAppendixLinks(qEl, _cardChecklistQuestionTexts[qKey] || q, appendixIdSet, 'screen-card-checklist');`,
  `      fillChecklistQuestionText(qEl, _cardChecklistQuestionTexts[qKey] || q, appendixIdSet, 'screen-card-checklist');`,
  'card checklist question fill'
);

html = html.replace("var APP_BUILD = 'pkb-v244';", "var APP_BUILD = 'pkb-v245';");
fs.writeFileSync(indexPath, html.replace(/\n/g, '\r\n'), 'utf8');

let sw = fs.readFileSync(swPath, 'utf8');
sw = sw.replace(/pkb-static-v244/g, 'pkb-static-v245');
sw = sw.replace(/pkb-api-v244/g, 'pkb-api-v245');
fs.writeFileSync(swPath, sw, 'utf8');

console.log('Checklist full question code styling -> pkb-v245');
