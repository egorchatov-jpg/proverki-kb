const fs = require('fs');
const p = 'index.html';
let t = fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const oldStr = "respInput.placeholder = 'Ответственный';";
const newStr = "respInput.placeholder = 'Ответственный департамент, организация';";
if (!t.includes(oldStr)) {
  console.error('anchor not found');
  process.exit(1);
}
t = t.replace(oldStr, newStr);
fs.writeFileSync(p, Buffer.from(t.replace(/\n/g, '\r\n'), 'utf8'));
console.log('ok');
