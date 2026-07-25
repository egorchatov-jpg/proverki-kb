/**
 * Distinguish local dev runtime from Timeweb production.
 */
const path = require('path');

function databasePathEnv() {
  return (process.env.DATABASE_PATH || process.env.SQLITE_PATH || '').trim();
}

function isLocalDev() {
  const env = (process.env.PKB_ENV || '').trim().toLowerCase();
  if (env === 'local' || env === 'development' || env === 'dev') return true;
  if (env === 'production' || env === 'prod') return false;

  const db = databasePathEnv().replace(/\\/g, '/');
  if (/proverki-dev\.db$/i.test(db)) return true;
  if (/\/data\/proverki-dev\.db$/i.test(db)) return true;

  return false;
}

module.exports = {
  isLocalDev,
  databasePathEnv,
};
