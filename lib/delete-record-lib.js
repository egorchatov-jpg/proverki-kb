const { deleteRecordByKey } = require('../lib/records-store');

async function deleteRecord(record) {
  return deleteRecordByKey(record);
}

module.exports = { deleteRecord };
