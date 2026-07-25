const { getDb } = require('./db');
const { syncBarrierInPk } = require('./records-store');

const EMPTY_SETTINGS = {
  methods: [],
  orgs: [],
  barriers: [],
  barriersPK: {},
  barriersConfig: {},
  barriersCustomPassports: {},
  passwords: { admin: '3333', inspector: '1111', orgs: {} },
  usedPasswords: ['1111', '3333'],
};

function loadSettings() {
  const db = getDb();
  const row = db.prepare('SELECT json FROM app_settings WHERE id = 1').get();
  if (!row || !row.json) return Object.assign({}, EMPTY_SETTINGS);
  try {
    return Object.assign({}, EMPTY_SETTINGS, JSON.parse(row.json));
  } catch (_e) {
    return Object.assign({}, EMPTY_SETTINGS);
  }
}

function saveSettings(data) {
  const db = getDb();
  const payload = Object.assign({}, data);
  const clientTs = Number(payload.settingsUpdatedAt) || 0;
  payload.settingsUpdatedAt = Math.max(clientTs, Date.now());
  const json = JSON.stringify(payload);
  db.prepare(`
    INSERT INTO app_settings (id, json, updated_at) VALUES (1, ?, unixepoch())
    ON CONFLICT(id) DO UPDATE SET json = excluded.json, updated_at = unixepoch()
  `).run(json);
  let excelSync = null;
  if (payload.barriersConfig) {
    excelSync = syncBarrierInPk(payload.barriersConfig);
  }
  return { excelSync };
}

function importSettings(data) {
  const db = getDb();
  const json = JSON.stringify(data);
  db.prepare(`
    INSERT INTO app_settings (id, json, updated_at) VALUES (1, ?, unixepoch())
    ON CONFLICT(id) DO UPDATE SET json = excluded.json, updated_at = unixepoch()
  `).run(json);
}

module.exports = {
  loadSettings,
  saveSettings,
  importSettings,
  EMPTY_SETTINGS,
};
