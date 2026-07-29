/**
 * Unit checks for pkb-v324: all-settings guards + checklist concurrency.
 */
process.env.PKB_ENV = 'production';
process.env.DATABASE_PATH = '/tmp/proverki-not-dev.db';

delete require.cache[require.resolve('../lib/runtime-env')];
delete require.cache[require.resolve('../lib/settings-store')];

const assert = require('assert');
const store = require('../lib/settings-store');

const current = {
  settingsUpdatedAt: 1000,
  methods: [
    { name: 'M1', show: true },
    { name: 'M2', show: true },
    { name: 'M3', show: true },
    { name: 'M4', show: true },
  ],
  orgs: [
    { name: 'O1', show: true },
    { name: 'O2', show: true },
    { name: 'O3', show: true },
    { name: 'O4', show: true },
  ],
  barriersConfig: {
    '2026': [
      { name: 'B1', passport: 'p', inPK: true, show: true, goalPct: 90, stretchGoalPct: 95 },
      { name: 'B2', passport: 'p', inPK: true, show: true, goalPct: 80 },
      { name: 'B3', passport: 'p', inPK: false, show: true },
      { name: 'B4', passport: 'p', inPK: false, show: true },
    ],
  },
  barriersCustomPassports: { '2026': ['Custom A', 'Custom B'] },
  barriersPK: { '2026': ['B1'] },
  passwords: { admin: '5555', inspector: '2222', orgs: { O1: '1', O2: '2', O3: '3', O4: '4' } },
  usedPasswords: ['1111', '3333', '5555'],
};

assert.strictEqual(store.validateMasterSettingsWrite(current, Object.assign({}, current, { settingsUpdatedAt: 999 })), 'stale_client');
assert.strictEqual(store.validateMasterSettingsWrite(current, current), null);

const noMethods = JSON.parse(JSON.stringify(current));
noMethods.methods = [];
assert.strictEqual(store.validateMasterSettingsWrite(current, noMethods), 'empty_methods');

const shrunkMethods = JSON.parse(JSON.stringify(current));
shrunkMethods.methods = [{ name: 'M1', show: true }];
assert.strictEqual(store.validateMasterSettingsWrite(current, shrunkMethods), 'shrunk_methods');

const noCp = JSON.parse(JSON.stringify(current));
noCp.barriersCustomPassports = {};
assert.strictEqual(store.validateMasterSettingsWrite(current, noCp), 'empty_custom_passports');

const strippedGoals = JSON.parse(JSON.stringify(current));
strippedGoals.barriersConfig['2026'].forEach(function(b) {
  delete b.goalPct;
  delete b.stretchGoalPct;
});
assert.strictEqual(store.validateMasterSettingsWrite(current, strippedGoals), 'stripped_barrier_goals');

const partial = JSON.parse(JSON.stringify(current));
delete partial.barriersCustomPassports;
delete partial.usedPasswords;
const merged = store.mergeSettingsPreserveAll(current, partial);
assert.ok(merged.barriersCustomPassports['2026']);
assert.ok(merged.usedPasswords.length >= 3);
assert.strictEqual(merged.barriersConfig['2026'][0].goalPct, 90);

console.log('OK: v324 settings unit checks');
