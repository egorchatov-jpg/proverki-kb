/**
 * Unit checks for pkb-v323 settings concurrency (no DB required for validate*).
 */
const assert = require('assert');
const {
  validateMasterSettingsWrite,
  mergeBarriersConfigPreserveGoals,
  countBarrierGoals,
} = require('../lib/settings-store');

// Force non-local path: validateMasterSettingsWrite checks isLocalDev().
// In test we call validate with mocked — actually it uses runtime-env.
process.env.PKB_ENV = 'production';
process.env.DATABASE_PATH = '/tmp/proverki-not-dev.db';

// Re-require after env so isLocalDev is false
delete require.cache[require.resolve('../lib/runtime-env')];
delete require.cache[require.resolve('../lib/settings-store')];
const store = require('../lib/settings-store');

const current = {
  settingsUpdatedAt: 1000,
  methods: [{ name: 'A', show: true }],
  orgs: [{ name: 'O', show: true }],
  barriersConfig: {
    '2026': [{ name: 'B1', passport: 'p', inPK: true, show: true, goalPct: 90, stretchGoalPct: 95 }],
  },
  passwords: { admin: '5555', inspector: '2222', orgs: { O: '1234' } },
};

// Invented newer ts (old client bug) must reject
assert.strictEqual(
  store.validateMasterSettingsWrite(current, Object.assign({}, current, { settingsUpdatedAt: Date.now() })),
  'stale_client'
);

// Older ts must reject
assert.strictEqual(
  store.validateMasterSettingsWrite(current, Object.assign({}, current, { settingsUpdatedAt: 999 })),
  'stale_client'
);

// Exact ts but stripped goals must reject
const stripped = JSON.parse(JSON.stringify(current));
stripped.barriersConfig['2026'][0] = { name: 'B1', passport: 'p', inPK: true, show: true };
assert.strictEqual(store.validateMasterSettingsWrite(current, stripped), 'stripped_barrier_goals');

// Exact ts with goals OK
assert.strictEqual(store.validateMasterSettingsWrite(current, current), null);

// Merge preserves goals when incoming omits them
const merged = store.mergeBarriersConfigPreserveGoals(current.barriersConfig, {
  '2026': [{ name: 'B1', passport: 'p', inPK: true, show: true }],
});
assert.strictEqual(merged['2026'][0].goalPct, 90);
assert.strictEqual(merged['2026'][0].stretchGoalPct, 95);
assert.strictEqual(store.countBarrierGoals(merged), 1);

console.log('OK: settings concurrency unit checks passed');
