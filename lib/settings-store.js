const { getDb } = require('./db');
const { syncBarrierInPk } = require('./records-store');
const { isLocalDev } = require('./runtime-env');

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

function isDefaultAdminPin(pin) {
  return String(pin || '') === '3333';
}

function isDefaultInspectorPin(pin) {
  return String(pin || '') === '1111';
}

function countKeys(obj) {
  return obj && typeof obj === 'object' ? Object.keys(obj).length : 0;
}

/**
 * Master (production) settings are absolute source of truth.
 * Reject stale/default/empty overwrites that would wipe live config.
 * Local-dev saves are unrestricted.
 */
function validateMasterSettingsWrite(current, incoming) {
  if (isLocalDev()) return null;

  const clientTs = Number(incoming && incoming.settingsUpdatedAt) || 0;
  const serverTs = Number(current && current.settingsUpdatedAt) || 0;

  if (serverTs > 0 && clientTs > 0 && clientTs < serverTs) {
    return 'stale_client';
  }
  if (serverTs > 0 && clientTs === 0) {
    return 'missing_timestamp';
  }

  const curPw = (current && current.passwords) || {};
  const inPw = (incoming && incoming.passwords) || {};
  if (curPw.admin && !isDefaultAdminPin(curPw.admin) && isDefaultAdminPin(inPw.admin)) {
    return 'default_admin_password';
  }
  if (curPw.inspector && !isDefaultInspectorPin(curPw.inspector) && isDefaultInspectorPin(inPw.inspector)) {
    return 'default_inspector_password';
  }

  const curOrgsPw = countKeys(curPw.orgs);
  const inOrgsPw = countKeys(inPw.orgs);
  if (curOrgsPw >= 3 && inOrgsPw === 0) {
    return 'empty_org_passwords';
  }

  if ((current.methods || []).length > 0 && !(incoming.methods && incoming.methods.length)) {
    return 'empty_methods';
  }
  if ((current.orgs || []).length > 0 && !(incoming.orgs && incoming.orgs.length)) {
    return 'empty_orgs';
  }

  if (countKeys(current.barriersConfig) >= 1 && countKeys(incoming.barriersConfig) === 0) {
    return 'empty_barriers';
  }

  return null;
}

function saveSettings(data) {
  const db = getDb();
  const current = loadSettings();
  const payload = Object.assign({}, data || {});
  const rejectReason = validateMasterSettingsWrite(current, payload);
  if (rejectReason) {
    console.warn('[settings] rejected master write:', rejectReason);
    return { rejected: true, reason: rejectReason, settings: current, excelSync: null };
  }

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
  return { excelSync: excelSync, rejected: false, settings: payload };
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
  validateMasterSettingsWrite,
  EMPTY_SETTINGS,
};
