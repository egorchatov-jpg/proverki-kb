/**
 * pkb-v251: APP_VERSION label in settings + bump build cache.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/\r\n/g, '\n');

if (!html.includes('var APP_VERSION =')) {
  html = html.replace(
    /var APP_BUILD = 'pkb-v250';/,
    "var APP_BUILD = 'pkb-v251';\nvar APP_VERSION = '1.01';"
  );
} else {
  html = html.replace(/var APP_BUILD = 'pkb-v\d+';/, "var APP_BUILD = 'pkb-v251';");
}

if (!html.includes('.settings-app-version')) {
  html = html.replace(
    '.settings-footer {\n  display: flex; justify-content: center; align-items: center; gap: 10px;\n  padding: 10px 14px;\n  padding-bottom: max(12px, env(safe-area-inset-bottom));\n  flex-shrink: 0;\n}',
    '.settings-footer {\n  display: flex; justify-content: center; align-items: center; gap: 10px;\n  padding: 10px 14px;\n  padding-bottom: max(12px, env(safe-area-inset-bottom));\n  flex-shrink: 0;\n}\n.settings-app-version {\n  flex-shrink: 0;\n  font-size: 12px; font-weight: 500; color: var(--text3);\n  text-align: center; line-height: 1.35;\n  padding: 0 16px 6px;\n  user-select: none;\n}'
  );
}

if (!html.includes('id="settings-app-version"')) {
  html = html.replace(
    '    <button class="settings-wide-btn" onclick="openRestorePointsScreen()">Резервные копии</button>\n  </div>\n  <div class="settings-footer">',
    '    <button class="settings-wide-btn" onclick="openRestorePointsScreen()">Резервные копии</button>\n  </div>\n  <div class="settings-app-version" id="settings-app-version"></div>\n  <div class="settings-footer">'
  );
}

if (!html.includes('function renderAppVersionLabel')) {
  html = html.replace(
    'var APP_BUILD = \'pkb-v251\';\nvar APP_VERSION = \'1.01\';',
    "var APP_BUILD = 'pkb-v251';\nvar APP_VERSION = '1.01';\nfunction renderAppVersionLabel() {\n  var el = document.getElementById('settings-app-version');\n  if (el) el.textContent = 'Версия приложения ' + APP_VERSION;\n}"
  );
}

html = html.replace(
  '  ensureAppBuildFresh();\n  updateLobbyInstallButton();',
  '  ensureAppBuildFresh();\n  renderAppVersionLabel();\n  updateLobbyInstallButton();'
);

fs.writeFileSync(path.join(root, 'index.html'), Buffer.from(html, 'utf8'));

let sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
sw = sw.replace(/pkb-static-v\d+/g, 'pkb-static-v251');
sw = sw.replace(/pkb-api-v\d+/g, 'pkb-api-v251');
fs.writeFileSync(path.join(root, 'sw.js'), sw);

console.log('pkb-v251: APP_VERSION 1.01 + settings label applied');
