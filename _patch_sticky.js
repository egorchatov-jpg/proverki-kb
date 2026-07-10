// Patch: z-index for sticky thead + backFromBarriersList function
var fs = require('fs');
var path = require('path');

var filePath = path.join(__dirname, 'index.html');
var t = fs.readFileSync(filePath, 'utf8');

var orig = t;

// 1. Add z-index:2 to .methods-th (sticky header fix)
var before1 = 'position: sticky; top: 0; background: var(--bg); white-space: nowrap;';
var after1  = 'position: sticky; top: 0; z-index: 2; background: var(--bg); white-space: nowrap;';
if (t.includes(before1)) { t = t.replace(before1, after1); console.log('OK: z-index added'); }
else { console.error('MISS: z-index target not found'); }

// 2. Replace barriers "Назад" button onclick → backFromBarriersList()
// Target: the screen-back-btn inside screen-barriers-list footer
var before2 = "onclick=\"showScreen('screen-barriers-years')\">";
var after2  = "onclick=\"backFromBarriersList()\">";
var count2 = (t.match(/onclick="showScreen\('screen-barriers-years'\)"/g) || []).length;
console.log('occurrences of target onclick:', count2);
if (count2 === 1) {
  t = t.replace(before2, after2);
  console.log('OK: barriers back button changed');
} else {
  console.error('MISS or AMBIGUOUS: expected 1 occurrence, got ' + count2);
}

// 3. Insert backFromBarriersList function after saveNewBarrier closing brace
// saveNewBarrier ends with: renderBarriersTable(_bpkYear);\n}
// followed by: \n\nfunction successExit
var anchor = 'function successExit()';
var insertPos = t.indexOf(anchor);
if (insertPos >= 0) {
  var newFunc = '\nfunction backFromBarriersList() {\n' +
    '  if (_bpkYear && appState.barriersConfig && appState.barriersConfig[_bpkYear]) {\n' +
    '    appState.barriersConfig[_bpkYear].sort(function(a, b) {\n' +
    '      return a.name.localeCompare(b.name, \'ru\');\n' +
    '    });\n' +
    '    saveState();\n' +
    '  }\n' +
    '  showScreen(\'screen-barriers-years\');\n' +
    '}\n\n';
  t = t.slice(0, insertPos) + newFunc + t.slice(insertPos);
  console.log('OK: backFromBarriersList inserted');
} else {
  console.error('MISS: anchor for function insert not found');
}

if (t !== orig) {
  fs.writeFileSync(filePath, Buffer.from(t, 'utf8'));
  console.log('Saved OK');
} else {
  console.error('No changes made!');
}
