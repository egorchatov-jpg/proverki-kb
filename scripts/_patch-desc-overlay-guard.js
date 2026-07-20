const fs = require('fs');
let t = fs.readFileSync('index.html', 'utf8').replace(/\r\n/g, '\n');
const old = `function openDescOverlay() {
  if (cardData.descFromChecklist) return;
  if (cardUsesChecklistFlow() && cardData.works === 'Нет') return;`;
const neu = `function openDescOverlay() {
  if (cardData.descFromChecklist) return;
  if (cardUsesChecklistFlow() && cardData.works === 'Нет') return;
  if (!cardUsesChecklistFlow() && cardData.works !== 'Нет') return;`;
if (!t.includes(old)) throw new Error('NOT FOUND');
t = t.replace(old, neu);
fs.writeFileSync('index.html', Buffer.from(t, 'utf8'));
console.log('ok');
