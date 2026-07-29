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

function countNamedList(list) {
  if (!Array.isArray(list)) return 0;
  let n = 0;
  list.forEach(function(item) {
    if (!item) return;
    if (typeof item === 'string') {
      if (item.trim()) n += 1;
      return;
    }
    if (item.name) n += 1;
  });
  return n;
}

function barrierHasGoal(b) {
  if (!b) return false;
  if (b.goalPct != null && b.goalPct !== '') return true;
  if (b.stretchGoalPct != null && b.stretchGoalPct !== '') return true;
  return false;
}

function countBarrierGoals(cfg) {
  let n = 0;
  Object.keys(cfg || {}).forEach(function(y) {
    (cfg[y] || []).forEach(function(b) {
      if (barrierHasGoal(b)) n += 1;
    });
  });
  return n;
}

function countBarriersTotal(cfg) {
  let n = 0;
  Object.keys(cfg || {}).forEach(function(y) {
    n += (cfg[y] || []).length;
  });
  return n;
}

function countCustomPassports(cp) {
  let n = 0;
  Object.keys(cp || {}).forEach(function(y) {
    const list = cp[y];
    if (Array.isArray(list)) n += list.length;
  });
  return n;
}

function isCatastrophicShrink(curCount, inCount) {
  if (curCount < 4) return false;
  if (inCount <= 0) return false; // empty handled by dedicated rejects
  return inCount < Math.ceil(curCount * 0.5);
}

/**
 * Preserve goalPct/stretchGoalPct from current when incoming omits them for the same barrier.
 */
function mergeBarriersConfigPreserveGoals(currentCfg, incomingCfg) {
  if (!incomingCfg || typeof incomingCfg !== 'object') return currentCfg || {};
  if (!currentCfg || typeof currentCfg !== 'object') return incomingCfg;
  const out = {};
  Object.keys(incomingCfg).forEach(function(year) {
    const incomingList = incomingCfg[year] || [];
    const currentList = currentCfg[year] || [];
    const curByName = {};
    currentList.forEach(function(b) {
      if (b && b.name) curByName[b.name] = b;
    });
    out[year] = incomingList.map(function(b) {
      if (!b || !b.name) return b;
      const cur = curByName[b.name];
      if (!cur) return b;
      const next = Object.assign({}, b);
      if (!barrierHasGoal(next) && barrierHasGoal(cur)) {
        if (cur.goalPct != null && cur.goalPct !== '') next.goalPct = cur.goalPct;
        if (cur.stretchGoalPct != null && cur.stretchGoalPct !== '') next.stretchGoalPct = cur.stretchGoalPct;
      }
      return next;
    });
  });
  Object.keys(currentCfg).forEach(function(year) {
    if (out[year] === undefined) out[year] = currentCfg[year];
  });
  return out;
}

function mergeCustomPassportsPreserve(currentCp, incomingCp) {
  if (!incomingCp || typeof incomingCp !== 'object') return currentCp || {};
  if (!currentCp || typeof currentCp !== 'object') return incomingCp;
  if (countKeys(incomingCp) === 0 && countKeys(currentCp) > 0) return currentCp;
  const out = Object.assign({}, incomingCp);
  Object.keys(currentCp).forEach(function(year) {
    if (out[year] === undefined) out[year] = currentCp[year];
  });
  return out;
}

function mergeBarriersPKPreserve(currentPk, incomingPk) {
  if (!incomingPk || typeof incomingPk !== 'object') return currentPk || {};
  if (!currentPk || typeof currentPk !== 'object') return incomingPk;
  if (countKeys(incomingPk) === 0 && countKeys(currentPk) > 0) return currentPk;
  const out = Object.assign({}, incomingPk);
  Object.keys(currentPk).forEach(function(year) {
    if (out[year] === undefined) out[year] = currentPk[year];
  });
  return out;
}

function mergePasswordsPreserve(currentPw, incomingPw) {
  const cur = currentPw || {};
  const inc = incomingPw || {};
  const out = Object.assign({}, inc);
  if (!out.admin && cur.admin) out.admin = cur.admin;
  if (!out.inspector && cur.inspector) out.inspector = cur.inspector;
  const curOrgs = cur.orgs || {};
  const inOrgs = inc.orgs && typeof inc.orgs === 'object' ? Object.assign({}, inc.orgs) : {};
  if (countKeys(inOrgs) === 0 && countKeys(curOrgs) > 0) {
    out.orgs = Object.assign({}, curOrgs);
  } else {
    Object.keys(curOrgs).forEach(function(name) {
      if (inOrgs[name] === undefined || inOrgs[name] === '') inOrgs[name] = curOrgs[name];
    });
    out.orgs = inOrgs;
  }
  return out;
}

function mergeUsedPasswordsPreserve(currentUsed, incomingUsed) {
  const a = Array.isArray(currentUsed) ? currentUsed : [];
  const b = Array.isArray(incomingUsed) ? incomingUsed : [];
  if (!b.length && a.length) return a.slice();
  const seen = {};
  const out = [];
  a.concat(b).forEach(function(p) {
    const s = String(p || '');
    if (!s || seen[s]) return;
    seen[s] = 1;
    out.push(s);
  });
  return out.length ? out : b;
}

/**
 * Fill omitted top-level keys and preserve critical nested fields so a partial
 * client payload cannot silently drop methods/orgs/passwords/custom passports/goals.
 */
function mergeSettingsPreserveAll(current, incoming) {
  const cur = current || {};
  const out = Object.assign({}, incoming || {});
  Object.keys(EMPTY_SETTINGS).forEach(function(k) {
    if (out[k] === undefined || out[k] === null) out[k] = cur[k];
  });
  if (out.settingsUpdatedAt === undefined && cur.settingsUpdatedAt != null) {
    out.settingsUpdatedAt = cur.settingsUpdatedAt;
  }
  out.barriersConfig = mergeBarriersConfigPreserveGoals(cur.barriersConfig, out.barriersConfig);
  out.barriersCustomPassports = mergeCustomPassportsPreserve(
    cur.barriersCustomPassports,
    out.barriersCustomPassports
  );
  out.barriersPK = mergeBarriersPKPreserve(cur.barriersPK, out.barriersPK);
  out.passwords = mergePasswordsPreserve(cur.passwords, out.passwords);
  out.usedPasswords = mergeUsedPasswordsPreserve(cur.usedPasswords, out.usedPasswords);
  if ((!out.methods || !out.methods.length) && (cur.methods || []).length) out.methods = cur.methods;
  if ((!out.orgs || !out.orgs.length) && (cur.orgs || []).length) out.orgs = cur.orgs;
  if ((!out.barriers || !out.barriers.length) && (cur.barriers || []).length) out.barriers = cur.barriers;
  return out;
}

/**
 * Master (production) settings are absolute source of truth.
 * Reject stale/default/empty/catastrophic overwrites that would wipe live config.
 * Applies to ALL settings surfaces (methods, orgs, passwords, barriers, custom passports).
 */
function validateMasterSettingsWrite(current, incoming) {
  if (isLocalDev()) return null;

  const clientTs = Number(incoming && incoming.settingsUpdatedAt) || 0;
  const serverTs = Number(current && current.settingsUpdatedAt) || 0;

  // Optimistic concurrency: client must push based on the exact server revision.
  if (serverTs > 0 && clientTs !== serverTs) {
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
  if (isCatastrophicShrink(curOrgsPw, inOrgsPw)) {
    return 'shrunk_org_passwords';
  }

  const curMethods = countNamedList(current.methods);
  const inMethods = countNamedList(incoming.methods);
  if (curMethods > 0 && inMethods === 0) {
    return 'empty_methods';
  }
  if (isCatastrophicShrink(curMethods, inMethods)) {
    return 'shrunk_methods';
  }

  const curOrgs = countNamedList(current.orgs);
  const inOrgs = countNamedList(incoming.orgs);
  if (curOrgs > 0 && inOrgs === 0) {
    return 'empty_orgs';
  }
  if (isCatastrophicShrink(curOrgs, inOrgs)) {
    return 'shrunk_orgs';
  }

  if (countKeys(current.barriersConfig) >= 1 && countKeys(incoming.barriersConfig) === 0) {
    return 'empty_barriers';
  }

  const curBarriers = countBarriersTotal(current.barriersConfig);
  const inBarriers = countBarriersTotal(incoming.barriersConfig);
  if (isCatastrophicShrink(curBarriers, inBarriers)) {
    return 'shrunk_barriers';
  }

  const curGoals = countBarrierGoals(current.barriersConfig);
  const inGoals = countBarrierGoals(incoming.barriersConfig);
  if (curGoals > 0 && inGoals === 0) {
    return 'stripped_barrier_goals';
  }

  const curCpKeys = countKeys(current.barriersCustomPassports);
  const inCpKeys = countKeys(incoming.barriersCustomPassports);
  if (curCpKeys > 0 && inCpKeys === 0) {
    return 'empty_custom_passports';
  }
  const curCp = countCustomPassports(current.barriersCustomPassports);
  const inCp = countCustomPassports(incoming.barriersCustomPassports);
  if (isCatastrophicShrink(curCp, inCp)) {
    return 'shrunk_custom_passports';
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

  const merged = mergeSettingsPreserveAll(current, payload);
  merged.settingsUpdatedAt = Date.now();
  const json = JSON.stringify(merged);
  db.prepare(`
    INSERT INTO app_settings (id, json, updated_at) VALUES (1, ?, unixepoch())
    ON CONFLICT(id) DO UPDATE SET json = excluded.json, updated_at = unixepoch()
  `).run(json);
  let excelSync = null;
  if (merged.barriersConfig) {
    excelSync = syncBarrierInPk(merged.barriersConfig);
  }
  return { excelSync: excelSync, rejected: false, settings: merged };
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
  mergeBarriersConfigPreserveGoals,
  mergeSettingsPreserveAll,
  countBarrierGoals,
  EMPTY_SETTINGS,
};
