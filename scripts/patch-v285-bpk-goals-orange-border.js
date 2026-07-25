const fs = require('fs');

let html = fs.readFileSync('index.html', 'utf8').replace(/\r\n/g, '\n');
let sw = fs.readFileSync('sw.js', 'utf8');

function mustReplace(oldStr, newStr, label) {
  if (!html.includes(oldStr)) throw new Error('NOT FOUND: ' + label);
  html = html.split(oldStr).join(newStr);
}

mustReplace(
  `#overlay-bpk-goals .bpk-goal-input {
  flex: 1 1 0; min-width: 0; text-align: center;
  font-family: inherit; cursor: text;
}
#overlay-bpk-goals .detail-val.bpk-goal-input:focus {
  outline: none; border-color: var(--orange);
}`,
  `#overlay-bpk-goals .bpk-goal-input {
  flex: 1 1 0; min-width: 0; text-align: center;
  font-family: inherit; cursor: text;
  border: 2px solid var(--orange);
}
#overlay-bpk-goals .detail-val.bpk-goal-input:focus {
  outline: none; border-color: var(--orange);
}`,
  'bpk goal input orange border'
);

mustReplace(
  `var APP_BUILD = 'pkb-v284';`,
  `var APP_BUILD = 'pkb-v285';`,
  'APP_BUILD bump'
);

sw = sw.replace(/pkb-static-v284/g, 'pkb-static-v285');
sw = sw.replace(/pkb-api-v284/g, 'pkb-api-v285');

fs.writeFileSync('index.html', html, 'utf8');
fs.writeFileSync('sw.js', sw, 'utf8');
console.log('patch-v285-bpk-goals-orange-border OK -> pkb-v285');
