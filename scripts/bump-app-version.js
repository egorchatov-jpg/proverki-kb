/**
 * Bump user-facing APP_VERSION and internal APP_BUILD / sw cache for next release.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const INDEX = path.join(ROOT, 'index.html');
const SW = path.join(ROOT, 'sw.js');

function bumpAppVersion(current) {
  const n = Math.round(parseFloat(current) * 100) + 1;
  return (n / 100).toFixed(2);
}

function bumpBuildTag(tag) {
  const m = String(tag).match(/^pkb-v(\d+)$/);
  if (!m) throw new Error('Unexpected APP_BUILD: ' + tag);
  return 'pkb-v' + (parseInt(m[1], 10) + 1);
}

function bumpReleaseVersions() {
  let html = fs.readFileSync(INDEX, 'utf8').replace(/\r\n/g, '\n');
  const verMatch = html.match(/var APP_VERSION = '([\d.]+)';/);
  const buildMatch = html.match(/var APP_BUILD = '(pkb-v\d+)';/);
  if (!verMatch || !buildMatch) {
    throw new Error('APP_VERSION or APP_BUILD not found in index.html');
  }

  const nextVersion = bumpAppVersion(verMatch[1]);
  const nextBuild = bumpBuildTag(buildMatch[1]);

  html = html.replace(/var APP_VERSION = '[\d.]+';/, "var APP_VERSION = '" + nextVersion + "';");
  html = html.replace(/var APP_BUILD = 'pkb-v\d+';/, "var APP_BUILD = '" + nextBuild + "';");
  fs.writeFileSync(INDEX, Buffer.from(html, 'utf8'));

  let sw = fs.readFileSync(SW, 'utf8');
  const buildNum = nextBuild.replace('pkb-v', '');
  sw = sw.replace(/pkb-static-v\d+/g, 'pkb-static-v' + buildNum);
  sw = sw.replace(/pkb-api-v\d+/g, 'pkb-api-v' + buildNum);
  fs.writeFileSync(SW, sw);

  return { nextVersion, nextBuild };
}

module.exports = { bumpReleaseVersions, bumpAppVersion, bumpBuildTag };
