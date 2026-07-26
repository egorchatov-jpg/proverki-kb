/**
 * Export client-format records snapshot for offline/fallback restore.
 * Usage: node scripts/export-records-snapshot.js [--db=path]
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DB_ARG = process.argv.find(function(a) { return a.startsWith('--db='); });
const DB_PATH = DB_ARG
  ? (path.isAbsolute(DB_ARG.slice(5)) ? DB_ARG.slice(5) : path.join(ROOT, DB_ARG.slice(5)))
  : path.join(ROOT, 'data', 'proverki-dev.db');

process.env.DATABASE_PATH = DB_PATH;
delete require.cache[require.resolve('../lib/db')];
delete require.cache[require.resolve('../lib/records-store')];

const { listAllRecords } = require('../lib/records-store');
const { getDb } = require('../lib/db');

getDb();
const records = listAllRecords();
const outPath = path.join(ROOT, 'data', 'records-snapshot.json');
const payload = {
  exportedAt: new Date().toISOString(),
  count: records.length,
  records: records,
};
fs.writeFileSync(outPath, JSON.stringify(payload));
console.log('OK:', outPath, '(' + records.length + ' records)');
