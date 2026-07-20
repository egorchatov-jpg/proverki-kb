/**
 * Load local env: .env.prod (shared secrets) then .env.local (dev overrides).
 * Timeweb/production injects env vars directly — dotenv is a no-op there.
 */
const path = require('path');

try {
  const dotenv = require('dotenv');
  const root = path.join(__dirname, '..');
  dotenv.config({ path: path.join(root, '.env.prod') });
  dotenv.config({ path: path.join(root, '.env.local'), override: true });
} catch (_) {}
