const { deleteRecordsAfterCutoff } = require('../lib/records-store');

const DEFAULT_CUTOFF = '19.07.2026 17:00:00';

async function deleteRecordsAfter(cutoff, opts) {
  const dryRun = opts && opts.dryRun;
  return deleteRecordsAfterCutoff(cutoff || DEFAULT_CUTOFF, dryRun);
}

module.exports = {
  deleteRecordsAfter,
  DEFAULT_CUTOFF,
};
