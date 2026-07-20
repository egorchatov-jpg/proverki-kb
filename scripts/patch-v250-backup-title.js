const fs = require('fs');

let html = fs.readFileSync('index.html', 'utf8').replace(/\r\n/g, '\n');
let sw = fs.readFileSync('sw.js', 'utf8');

const oldTitle = '<div class="settings-screen-title">Резервные копии</div>';
const newTitle = '<div class="settings-screen-title">Резервные копии базы данных</div>';

// Only screen title inside restore-points screen, not settings button
const screenBlock = '<div class="screen" id="screen-restore-points">\n  <div class="settings-screen-title">Резервные копии</div>';
const screenBlockNew = '<div class="screen" id="screen-restore-points">\n  <div class="settings-screen-title">Резервные копии базы данных</div>';

if (!html.includes(screenBlock)) throw new Error('screen title not found');
html = html.replace(screenBlock, screenBlockNew);

html = html.replace(/var APP_BUILD = 'pkb-v249';/, "var APP_BUILD = 'pkb-v250';");
sw = sw.replace(/pkb-static-v249/g, 'pkb-static-v250').replace(/pkb-api-v249/g, 'pkb-api-v250');

fs.writeFileSync('index.html', Buffer.from(html, 'utf8'));
fs.writeFileSync('sw.js', sw);
console.log('pkb-v250: backup screen title updated');
