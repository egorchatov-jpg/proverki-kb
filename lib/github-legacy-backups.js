/**
 * Remove legacy Excel snapshot backups from GitHub data repo (pre-SQLite).
 */
const {
  githubToken,
  ghGetMeta,
  ghListDir,
  ghDelete,
} = require('./github-api');

const MANIFEST_PATH = 'backups/manifest.json';
const SNAPSHOTS_PREFIX = 'backups/snapshots/';

async function purgeGithubLegacyExcelBackups() {
  const token = githubToken();
  if (!token) {
    return { skipped: true, reason: 'no_github_token' };
  }

  let deletedFiles = 0;
  let deletedSnapshots = 0;

  const snapshotDirs = await ghListDir('backups/snapshots', token);
  for (const dir of snapshotDirs) {
    if (dir.type !== 'dir' || !dir.name) continue;
    const dirPath = SNAPSHOTS_PREFIX + dir.name;
    const files = await ghListDir(dirPath, token);
    let hadExcel = false;
    for (const file of files) {
      if (file.type !== 'file' || !file.sha || !file.name) continue;
      const isExcel = file.name.endsWith('.xlsx');
      const isLegacyJson = file.name === 'settings.json' || file.name === 'checklists.json';
      if (!isExcel && !isLegacyJson && file.name !== 'manifest.json') continue;
      if (isExcel) hadExcel = true;
      await ghDelete(`${dirPath}/${file.name}`, file.sha,
        `Remove legacy Excel backup file ${dir.name}/${file.name}`, token);
      deletedFiles++;
    }
    if (hadExcel) deletedSnapshots++;
  }

  const manifestMeta = await ghGetMeta(MANIFEST_PATH, token);
  if (manifestMeta && manifestMeta.sha) {
    try {
      const { ghGetRaw } = require('./github-api');
      const raw = await ghGetRaw(MANIFEST_PATH, token);
      const parsed = raw ? JSON.parse(raw) : null;
      const isLegacyExcelManifest = parsed && parsed.format !== 'sqlite';
      if (isLegacyExcelManifest) {
        await ghDelete(MANIFEST_PATH, manifestMeta.sha, 'Remove legacy Excel backups manifest', token);
        deletedFiles++;
      }
    } catch (_e) {
      /* keep sqlite manifest */
    }
  }

  return { deletedFiles, deletedSnapshots };
}

module.exports = {
  purgeGithubLegacyExcelBackups,
};
