/**
 * Creates timeweb-upload.env for Timeweb "Upload from file".
 * Uses: gh auth token (GitHub), existing VAPID public key from index.html,
 * regenerates VAPID key pair if private key unavailable from Vercel pull.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const webpush = require('web-push');

const root = path.join(__dirname, '..');
const indexPath = path.join(root, 'index.html');
const outPath = path.join(root, 'timeweb-upload.env');
const dotEnvPath = path.join(root, '.env.timeweb-upload');

function ghToken() {
  try {
    return execSync('gh auth token', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch (e) {
    throw new Error('gh auth token failed — run: gh auth login');
  }
}

function readPublicFromIndex() {
  const html = fs.readFileSync(indexPath, 'utf8');
  const m = html.match(/var VAPID_PUBLIC_KEY = '([^']+)'/);
  return m ? m[1] : '';
}

function patchIndexPublicKey(publicKey) {
  let html = fs.readFileSync(indexPath, 'utf8').replace(/\r\n/g, '\n');
  const old = /var VAPID_PUBLIC_KEY = '[^']*';/;
  if (!old.test(html)) throw new Error('VAPID_PUBLIC_KEY line not found in index.html');
  html = html.replace(old, "var VAPID_PUBLIC_KEY = '" + publicKey + "';");
  fs.writeFileSync(indexPath, Buffer.from(html, 'utf8'));
}

const pulled = path.join(root, 'timeweb.env');
let vapidPublic = readPublicFromIndex();
let vapidPrivate = '';

if (fs.existsSync(pulled)) {
  const txt = fs.readFileSync(pulled, 'utf8');
  txt.split(/\r?\n/).forEach(function(line) {
    if (line.startsWith('VAPID_PRIVATE_KEY=')) {
      vapidPrivate = line.slice('VAPID_PRIVATE_KEY='.length).trim().replace(/^"|"$/g, '');
    }
    if (line.startsWith('VAPID_PUBLIC_KEY=')) {
      const v = line.slice('VAPID_PUBLIC_KEY='.length).trim().replace(/^"|"$/g, '');
      if (v) vapidPublic = v;
    }
  });
}

if (!vapidPrivate || vapidPrivate.length < 20) {
  const keys = webpush.generateVAPIDKeys();
  vapidPublic = keys.publicKey;
  vapidPrivate = keys.privateKey;
  patchIndexPublicKey(vapidPublic);
  console.log('Generated new VAPID key pair and updated index.html');
} else {
  console.log('Using VAPID keys from timeweb.env');
}

const githubToken = ghToken();
const lines = [
  'GITHUB_TOKEN=' + githubToken,
  'GITHUB_OWNER=egorchatov-jpg',
  'GITHUB_DATA_REPO=proverki-kb-data',
  'VAPID_PUBLIC_KEY=' + vapidPublic,
  'VAPID_PRIVATE_KEY=' + vapidPrivate,
  'VAPID_SUBJECT=mailto:egorchatov@gmail.com',
  'ENABLE_BACKUP_CRON=1',
  '',
].join('\n');

fs.writeFileSync(outPath, lines, 'utf8');
fs.writeFileSync(dotEnvPath, lines, 'utf8');

console.log('Created:', outPath);
console.log('Copy for Timeweb upload (must be named .env):', dotEnvPath);
console.log('GITHUB_TOKEN: OK (' + githubToken.length + ' chars)');
console.log('VAPID_PUBLIC_KEY: OK (' + vapidPublic.length + ' chars)');
console.log('VAPID_PRIVATE_KEY: OK (' + vapidPrivate.length + ' chars)');
