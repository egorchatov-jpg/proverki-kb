/**
 * Shared auth for destructive/admin API routes.
 */
function getAdminSecret() {
  return String(process.env.CRON_SECRET || process.env.RELOAD_DB_SECRET || process.env.ADMIN_API_SECRET || '').trim();
}

function bearerToken(req) {
  return String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
}

function isAdminAuthorized(req) {
  const secret = getAdminSecret();
  if (!secret) return false;
  return bearerToken(req) === secret;
}

function requireAdmin(req, res) {
  if (isAdminAuthorized(req)) return true;
  res.status(403).json({ error: 'Forbidden' });
  return false;
}

module.exports = {
  getAdminSecret,
  bearerToken,
  isAdminAuthorized,
  requireAdmin,
};
