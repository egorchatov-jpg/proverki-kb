const crypto = require('crypto');
const { getDb } = require('./db');

const COOKIE = 'pkb_session';
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function init() {
  getDb().exec('CREATE TABLE IF NOT EXISTS auth_sessions (token_hash TEXT PRIMARY KEY, role TEXT NOT NULL, org_name TEXT, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL DEFAULT (unixepoch()))');
}

function parseCookies(req) {
  const out = {};
  String(req.headers.cookie || '').split(';').forEach(function(part) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

function createSession(role, orgName) {
  init();
  const token = crypto.randomBytes(32).toString('base64url');
  getDb().prepare('INSERT INTO auth_sessions (token_hash, role, org_name, expires_at) VALUES (?, ?, ?, ?)')
    .run(hash(token), role, orgName || null, Date.now() + TTL_MS);
  return token;
}

function getSession(req) {
  init();
  const token = parseCookies(req)[COOKIE];
  if (!token) return null;
  const row = getDb().prepare('SELECT role, org_name, expires_at FROM auth_sessions WHERE token_hash = ?').get(hash(token));
  if (!row) return null;
  if (Number(row.expires_at) <= Date.now()) {
    getDb().prepare('DELETE FROM auth_sessions WHERE token_hash = ?').run(hash(token));
    return null;
  }
  return { role: row.role, orgName: row.org_name || null };
}

function setSessionCookie(res, token, secure) {
  res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${Math.floor(TTL_MS / 1000)}; HttpOnly;${secure ? ' Secure;' : ''} SameSite=Lax`);
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);
}

function requireSession(req, res, roles) {
  const session = getSession(req);
  if (!session && process.env.AUTH_ENFORCE !== '1') return { role: 'legacy' };
  if (!session || (roles && roles.indexOf(session.role) < 0)) {
    res.status(401).json({ error: 'Authentication required' });
    return null;
  }
  return session;
}

module.exports = { COOKIE, init, createSession, getSession, setSessionCookie, clearSessionCookie, requireSession };
