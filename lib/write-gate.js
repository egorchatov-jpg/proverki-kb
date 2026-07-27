/**
 * Gate mutating APIs until production DB has records (after successful bootstrap/pull).
 */
const { isLocalDev } = require('./runtime-env');
const { countAllRecords } = require('./records-store');

let _writesAllowed = false;
let _bootstrapComplete = false;

function setBootstrapComplete(ok, recordCount) {
  _bootstrapComplete = true;
  _writesAllowed = !!ok && (isLocalDev() || (Number(recordCount) || 0) > 0);
}

function allowWrites() {
  _writesAllowed = true;
  _bootstrapComplete = true;
}

function areWritesAllowed() {
  if (isLocalDev()) return true;
  if (!_bootstrapComplete) return false;
  if (_writesAllowed) return true;
  try {
    const n = countAllRecords();
    if (n > 0) {
      _writesAllowed = true;
      return true;
    }
  } catch (_e) { /* ignore */ }
  return false;
}

function assertWritesAllowed(res) {
  if (areWritesAllowed()) return true;
  res.status(503).json({
    error: 'Database not ready',
    reason: 'bootstrap_incomplete_or_empty',
  });
  return false;
}

module.exports = {
  setBootstrapComplete,
  allowWrites,
  areWritesAllowed,
  assertWritesAllowed,
};
