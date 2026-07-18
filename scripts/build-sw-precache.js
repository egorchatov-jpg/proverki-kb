/**
 * Regenerate PASSPORT_PRECACHE list in sw.js from passports/ folder.
 * Usage: node scripts/build-sw-precache.js
 */
const fs = require('fs');
const path = require('path');

const SW = path.join(__dirname, '../sw.js');
const PASSPORTS = path.join(__dirname, '../passports');

function walk(dir, urlPrefix) {
  const out = [];
  fs.readdirSync(dir).forEach(function(name) {
    const full = path.join(dir, name);
    const url = urlPrefix + '/' + name;
    if (fs.statSync(full).isDirectory()) {
      out.push.apply(out, walk(full, url));
    } else {
      out.push(url);
    }
  });
  return out;
}

const passportUrls = walk(PASSPORTS, '/passports').sort();
let sw = fs.readFileSync(SW, 'utf8');
const block = 'const PASSPORT_PRECACHE = ' + JSON.stringify(passportUrls, null, 2) + ';';

if (/const PASSPORT_PRECACHE = \[[\s\S]*?\];/.test(sw)) {
  sw = sw.replace(/const PASSPORT_PRECACHE = \[[\s\S]*?\];/, block);
} else {
  sw = sw.replace(
    "const PRECACHE = ",
    block + '\n\nconst PRECACHE = '
  );
}

fs.writeFileSync(SW, sw);
console.log('Updated PASSPORT_PRECACHE:', passportUrls.length, 'files');
passportUrls.forEach(function(u) { console.log(' ', u); });
