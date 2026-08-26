const { loadSettings, savePasswordHashes, passwordVersionFor } = require('../lib/settings-store');
const { hashPassword, verifyPassword } = require('../lib/password-hash');
const { createSession, setSessionCookie, getSession, clearSessionCookie } = require('../lib/auth-session');
const { flushDbPersist } = require('../lib/github-persist');

function identify(pin) {
  const settings = loadSettings();
  const pw = settings.passwords || {};
  const hashes = pw.hashes || { orgs: {} };
  if (process.env.SUPERUSER_PIN && (!hashes.superuser || !verifyPassword(process.env.SUPERUSER_PIN, hashes.superuser))) {
    hashes.superuser = hashPassword(process.env.SUPERUSER_PIN);
    // The superuser credential is fixed by server environment, not by the
    // settings UI. Rehashing it must not revoke existing superuser sessions.
    savePasswordHashes(hashes);
  }
  if (hashes.superuser && verifyPassword(pin, hashes.superuser)) return { role: 'superuser' };
  if (hashes.admin && verifyPassword(pin, hashes.admin)) return { role: 'admin' };
  if (hashes.inspector && verifyPassword(pin, hashes.inspector)) return { role: 'inspector' };
  for (const name of Object.keys(hashes.orgs || {})) if (verifyPassword(pin, hashes.orgs[name])) return { role: 'org', orgName: name };
  const newHashes = { superuser: hashes.superuser, admin: hashes.admin, inspector: hashes.inspector, orgs: Object.assign({}, hashes.orgs || {}) };
  let migrated = false;
  if (pw.admin && String(pin) === String(pw.admin)) { newHashes.admin = hashPassword(pin); migrated = true; }
  if (pw.inspector && String(pin) === String(pw.inspector)) { newHashes.inspector = hashPassword(pin); migrated = true; }
  const orgs = pw.orgs || {};
  for (const name of Object.keys(orgs)) if (orgs[name] && String(pin) === String(orgs[name])) { newHashes.orgs[name] = hashPassword(pin); migrated = true; if (migrated) savePasswordHashes(newHashes); return { role: 'org', orgName: name }; }
  if (migrated) savePasswordHashes(newHashes);
  if (newHashes.admin && verifyPassword(pin, newHashes.admin)) return { role: 'admin' };
  if (newHashes.inspector && verifyPassword(pin, newHashes.inspector)) return { role: 'inspector' };
  return null;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'GET') return res.status(200).json({ authenticated: !!getSession(req), user: getSession(req) });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const user = identify(req.body && req.body.pin);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  const settings = loadSettings();
  setSessionCookie(res, createSession(user.role, user.orgName, passwordVersionFor(user.role, user.orgName, settings.passwords)), req.secure || req.headers['x-forwarded-proto'] === 'https');
  // Persist synchronously before responding: sessions live in the same
  // ephemeral SQLite file as records/photos. Without this, a server
  // restart shortly after login (deploy, PM2 restart) would silently drop
  // the session row, and the client's still-valid cookie would start
  // getting 401s on the next write — looking like a wrong password even
  // though the password was correct.
  try {
    await flushDbPersist();
  } catch (persistErr) {
    console.warn('[auth] github persist failed:', persistErr.message);
  }
  return res.status(200).json({ success: true, user });
};
