const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/\r\n/g, '\n');

const oldStr = "    if (cardData.worksLockedByChecklist) lockWorksCell(); else unlockWorksCell();";
const newStr = "    if (cardData.worksLockedByChecklist || cardUsesChecklistFlow()) lockWorksCell(); else unlockWorksCell();";

if (!html.includes(oldStr)) {
  console.error('anchor not found');
  process.exit(1);
}

html = html.replace(oldStr, newStr);
fs.writeFileSync(path.join(root, 'index.html'), Buffer.from(html.replace(/\n/g, '\r\n'), 'utf8'));
console.log('fixed works cell dimmed state after checklist cancel');
