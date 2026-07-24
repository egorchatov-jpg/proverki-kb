const fs = require('fs');

let html = fs.readFileSync('index.html', 'utf8').replace(/\r\n/g, '\n');
let sw = fs.readFileSync('sw.js', 'utf8');

function mustReplace(oldStr, newStr, label) {
  if (!html.includes(oldStr)) throw new Error('NOT FOUND: ' + label);
  html = html.split(oldStr).join(newStr);
}

mustReplace(
  `<span class="placeholder" id="val-inspectorOrg">\u2014</span>`,
  `<span class="placeholder" id="val-inspectorOrg">\u0412\u044b\u0431\u0440\u0430\u0442\u044c</span>`,
  'html inspectorOrg placeholder'
);

mustReplace(
  `      setCardVal('inspectorOrg', '\u2014', false);
    }
  }
}

function applyCardSessionFields() {`,
  `      setCardVal('inspectorOrg', '\u0412\u044b\u0431\u0440\u0430\u0442\u044c', true);
    }
  }
}

function applyCardSessionFields() {`,
  'syncInspectorOrgCellState empty'
);

mustReplace(
  `  setCardVal('inspectorOrg', r.inspector || '\u2014', !r.inspector);`,
  `  setCardVal('inspectorOrg', r.inspector || '\u0412\u044b\u0431\u0440\u0430\u0442\u044c', !r.inspector);`,
  'openCardForEdit inspectorOrg'
);

mustReplace(
  `    var isPick = k === 'method' || k === 'org' || k === 'barrier' || k === 'works';
    setCardVal(k, k === 'inspectorOrg' ? '\u2014' : (isPick ? '\u0412\u044b\u0431\u0440\u0430\u0442\u044c' : '\u2014'), isPick);`,
  `    var isPick = k === 'method' || k === 'org' || k === 'barrier' || k === 'works' || k === 'inspectorOrg';
    setCardVal(k, isPick ? '\u0412\u044b\u0431\u0440\u0430\u0442\u044c' : '\u2014', isPick);`,
  'resetCard inspectorOrg pick'
);

mustReplace(
  `var APP_BUILD = 'pkb-v275';`,
  `var APP_BUILD = 'pkb-v276';`,
  'APP_BUILD bump'
);

sw = sw.replace(/pkb-static-v275/g, 'pkb-static-v276');
sw = sw.replace(/pkb-api-v275/g, 'pkb-api-v276');

fs.writeFileSync('index.html', html, 'utf8');
fs.writeFileSync('sw.js', sw, 'utf8');
console.log('patch-v276-inspector-org-vybrat OK -> pkb-v276');
