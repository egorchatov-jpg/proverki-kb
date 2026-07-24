/**
 * Orgs: mutual exclusive Проверяет/Проверяемая; hide inspecting orgs from password screen.
 */
const fs = require('fs');
const path = require('path');

const INDEX = path.join(__dirname, '..', 'index.html');
const SW = path.join(__dirname, '..', 'sw.js');

let t = fs.readFileSync(INDEX, 'utf8').replace(/\r\n/g, '\n');

function mustReplace(label, from, to) {
  if (!t.includes(from)) throw new Error('Missing: ' + label);
  t = t.replace(from, to);
}

mustReplace(
  'org password helpers',
  `function ensureOrgPasswords() {
  var pw = getPw();
  if (!pw.orgs) pw.orgs = {};
  (appState.orgs || []).forEach(function(o) {
    if (!pw.orgs[o.name]) pw.orgs[o.name] = '2222';
  });
}`,
  `function orgUsesInspectorPassword(o) {
  return !!(o && o.inspects === true);
}

function orgShowsInPasswordScreen(o) {
  return !orgUsesInspectorPassword(o);
}

function normalizeOrgRoleFlags(org) {
  if (!org) return org;
  if (org.inspects === true) org.show = false;
  else if (org.show !== false) org.inspects = false;
  return org;
}

/** Ensure every org has a password entry kept in memory (even inspecting orgs). */
function ensureOrgPasswords() {
  var pw = getPw();
  if (!pw.orgs) pw.orgs = {};
  (appState.orgs || []).forEach(function(o) {
    if (!pw.orgs[o.name]) pw.orgs[o.name] = '2222';
  });
}`
);

mustReplace(
  'loadState normalize org flags',
  `          appState.orgs = parsed.orgs.map(function(o) {
            return { name: o.name, show: o.show !== false, inspects: o.inspects === true };
          });`,
  `          appState.orgs = parsed.orgs.map(function(o) {
            return normalizeOrgRoleFlags({ name: o.name, show: o.show !== false, inspects: o.inspects === true });
          });`
);

mustReplace(
  'renderOrgsTable handlers',
  `    cbInspects.addEventListener('change', function() {
      (appState.orgs || [])[+this.dataset.idx].inspects = this.checked;
      saveState();
      markOrgsDirty();
      updateOrgsCheckboxCounts();
    });
    tdInspects.appendChild(cbInspects);
    var tdShow = document.createElement('td');
    tdShow.className = 'methods-td methods-td-cb';
    var cbShow = document.createElement('input');
    cbShow.type = 'checkbox'; cbShow.className = 'method-square-cb';
    cbShow.checked = (o.show !== false); cbShow.dataset.idx = idx;
    cbShow.addEventListener('change', function() {
      (appState.orgs || [])[+this.dataset.idx].show = this.checked;
      saveState();
      markOrgsDirty();
      updateOrgsCheckboxCounts();
    });`,
  `    cbInspects.addEventListener('change', function() {
      var org = (appState.orgs || [])[+this.dataset.idx];
      org.inspects = this.checked;
      if (this.checked) org.show = false;
      var row = this.closest('tr');
      if (row) {
        var showCb = row.querySelector('td:last-child .method-square-cb');
        if (showCb) showCb.checked = org.show !== false;
      }
      saveState();
      markOrgsDirty();
      updateOrgsCheckboxCounts();
    });
    tdInspects.appendChild(cbInspects);
    var tdShow = document.createElement('td');
    tdShow.className = 'methods-td methods-td-cb';
    var cbShow = document.createElement('input');
    cbShow.type = 'checkbox'; cbShow.className = 'method-square-cb';
    cbShow.checked = (o.show !== false); cbShow.dataset.idx = idx;
    cbShow.addEventListener('change', function() {
      var org = (appState.orgs || [])[+this.dataset.idx];
      org.show = this.checked;
      if (this.checked) org.inspects = false;
      var row = this.closest('tr');
      if (row) {
        var inspCb = row.querySelector('.method-org-inspects-cb');
        if (inspCb) inspCb.checked = org.inspects === true;
      }
      saveState();
      markOrgsDirty();
      updateOrgsCheckboxCounts();
    });`
);

mustReplace(
  'renderPasswordsScreen org filter',
  `  var orgs = (appState.orgs || []).slice().sort(function(a, b) {
    return a.name.localeCompare(b.name, 'ru');
  });
  orgs.forEach(function(o) {
    if (!pw.orgs) pw.orgs = {};
    var orgPw = pw.orgs[o.name] || '2222';`,
  `  var orgs = (appState.orgs || []).filter(orgShowsInPasswordScreen).slice().sort(function(a, b) {
    return a.name.localeCompare(b.name, 'ru');
  });
  orgs.forEach(function(o) {
    if (!pw.orgs) pw.orgs = {};
    var orgPw = pw.orgs[o.name] || '2222';`
);

mustReplace(
  'saveNewOrg normalize',
  `  appState.orgs.push({ name: name, show: true, inspects: false });
  // Generate unique password for the new org`,
  `  appState.orgs.push(normalizeOrgRoleFlags({ name: name, show: true, inspects: false }));
  // Generate unique password for the new org`
);

mustReplace('APP_BUILD', "var APP_BUILD = 'pkb-v259';", "var APP_BUILD = 'pkb-v260';");

fs.writeFileSync(INDEX, Buffer.from(t, 'utf8'));

let sw = fs.readFileSync(SW, 'utf8');
sw = sw.replace(/pkb-(static|api)-v259/g, 'pkb-$1-v260');
fs.writeFileSync(SW, sw, 'utf8');

console.log('patch-orgs-mutual-passwords OK → pkb-v260');
