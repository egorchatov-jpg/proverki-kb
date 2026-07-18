/**
 * Generate passports/manifest.json and keep SW cache version in sync.
 * Usage: node scripts/build-sw-precache.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PASSPORTS = path.join(ROOT, 'passports');
const MANIFEST_OUT = path.join(PASSPORTS, 'manifest.json');
const SW = path.join(ROOT, 'sw.js');

function walk(dir, urlPrefix) {
  const out = [];
  fs.readdirSync(dir).forEach(function(name) {
    if (name === 'manifest.json') return;
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

const assets = walk(PASSPORTS, '/passports').sort();
const passports = [];

fs.readdirSync(PASSPORTS).forEach(function(name) {
  if (!name.endsWith('.json') || name === 'manifest.json') return;
  const full = path.join(PASSPORTS, name);
  try {
    const data = JSON.parse(fs.readFileSync(full, 'utf8'));
    if (!data.id) return;
    passports.push({
      id: data.id,
      label: data.settingsLabel || ('Паспорт ' + data.id.toUpperCase().replace('-', ' ') + '.'),
    });
  } catch (e) {
    console.warn('Skip passport json:', name, e.message);
  }
});

passports.sort(function(a, b) { return a.label.localeCompare(b.label, 'ru'); });

const manifest = {
  version: 1,
  generatedAt: new Date().toISOString(),
  passports: passports,
  assets: assets,
};

fs.writeFileSync(MANIFEST_OUT, JSON.stringify(manifest, null, 2), 'utf8');
console.log('Written', MANIFEST_OUT);
console.log('Passports:', passports.length, '| Assets:', assets.length);
