/**
 * Fix: desc locked on edit when record has no checklist (clearCardChecklistState wiped works).
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/\r\n/g, '\n');

if (!html.includes('function resetCardChecklistMetaOnly')) {
  html = html.replace(
    'function clearCardChecklistState() {\n  cardData.checklistViolations = null;\n  cardData.checklistFilled = false;\n  cardData.checklistPassportId = null;\n  cardData.worksLockedByChecklist = false;\n  cardData.descFromChecklist = false;\n  cardData.works = \'\';\n  _cardChecklistMatch = null;\n  setCardChecklistButtonLabel();\n}',
    'function resetCardChecklistMetaOnly() {\n  cardData.checklistViolations = null;\n  cardData.checklistFilled = false;\n  cardData.checklistPassportId = null;\n  cardData.worksLockedByChecklist = false;\n  cardData.descFromChecklist = false;\n  _cardChecklistMatch = null;\n  _cardChecklistQuestionTexts = {};\n  setCardChecklistButtonLabel();\n}\n\nfunction clearCardChecklistState() {\n  resetCardChecklistMetaOnly();\n  cardData.works = \'\';\n}'
  );
}

html = html.replace(
  '  } else {\n    clearCardChecklistState();\n  }\n  updateCardChecklistButton();',
  '  } else {\n    resetCardChecklistMetaOnly();\n    syncWorksCellState();\n  }\n  updateCardChecklistButton();'
);

html = html.replace(
  /var APP_BUILD = 'pkb-v\d+';/,
  "var APP_BUILD = 'pkb-v252';"
);

fs.writeFileSync(path.join(root, 'index.html'), Buffer.from(html, 'utf8'));

let sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
sw = sw.replace(/pkb-static-v\d+/g, 'pkb-static-v252');
sw = sw.replace(/pkb-api-v\d+/g, 'pkb-api-v252');
fs.writeFileSync(path.join(root, 'sw.js'), sw);

console.log('pkb-v252: desc edit fix applied');
