require('dotenv').config({ path: require('path').join(__dirname, '../.env.prod') });
require('dotenv').config({ path: require('path').join(__dirname, '../.env.local') });
require('dotenv').config({ path: require('path').join(__dirname, '../.env.timeweb-upload') });

const { purgeGithubLegacyExcelBackups } = require('../lib/github-legacy-backups');

purgeGithubLegacyExcelBackups()
  .then(function(r) { console.log(JSON.stringify(r, null, 2)); })
  .catch(function(e) { console.error(e.message); process.exit(1); });
