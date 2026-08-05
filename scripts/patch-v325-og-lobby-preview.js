/**
 * pkb-v325: link preview shows lobby (OG image), not iOS install screenshot.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const indexPath = path.join(ROOT, 'index.html');
const swPath = path.join(ROOT, 'sw.js');

let t = fs.readFileSync(indexPath, 'utf8').replace(/\r\n/g, '\n');

if (!t.includes("var APP_BUILD = 'pkb-v324'")) {
  throw new Error('Expected APP_BUILD pkb-v324, got something else');
}
t = t.replace("var APP_BUILD = 'pkb-v324'", "var APP_BUILD = 'pkb-v325'");

const oldHead = `<title>Проверки КБ</title>
<link rel="manifest" href="/manifest.json">
<link rel="icon" type="image/png" href="/favicon.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">`;

const newHead = `<title>Проверки КБ</title>
<meta name="description" content="База данных проверок объектов капитального строительства">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Проверки КБ">
<meta property="og:title" content="Проверки КБ">
<meta property="og:description" content="База данных проверок объектов капитального строительства">
<meta property="og:url" content="https://proverkikb.tw1.ru/">
<meta property="og:image" content="https://proverkikb.tw1.ru/og-image.jpg">
<meta property="og:image:type" content="image/jpeg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Главный экран приложения Проверки КБ">
<meta property="og:locale" content="ru_RU">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Проверки КБ">
<meta name="twitter:description" content="База данных проверок объектов капитального строительства">
<meta name="twitter:image" content="https://proverkikb.tw1.ru/og-image.jpg">
<link rel="manifest" href="/manifest.json">
<link rel="icon" type="image/png" href="/favicon.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">`;

if (!t.includes(oldHead)) throw new Error('head title block not found');
t = t.replace(oldHead, newHead);

// Do not put install screenshots in initial HTML — messengers scrape first large <img>.
const oldIosImg = `<img class="passport-appendix-page-img" id="install-ios-img" src="/install-ios.jpg" alt="">`;
const newIosImg = `<img class="passport-appendix-page-img" id="install-ios-img" alt="" decoding="async">`;
const oldAndImg = `<img class="passport-appendix-page-img" id="install-android-img" src="/install-android.jpg" alt="">`;
const newAndImg = `<img class="passport-appendix-page-img" id="install-android-img" alt="" decoding="async">`;

if (!t.includes(oldIosImg)) throw new Error('ios install img not found');
if (!t.includes(oldAndImg)) throw new Error('android install img not found');
t = t.replace(oldIosImg, newIosImg);
t = t.replace(oldAndImg, newAndImg);

fs.writeFileSync(indexPath, Buffer.from(t, 'utf8'));

let sw = fs.readFileSync(swPath, 'utf8').replace(/\r\n/g, '\n');
if (!sw.includes("const STATIC_CACHE = 'pkb-static-v324'")) {
  throw new Error('Expected sw v324');
}
sw = sw
  .replace("const STATIC_CACHE = 'pkb-static-v324'", "const STATIC_CACHE = 'pkb-static-v325'")
  .replace("const API_CACHE = 'pkb-api-v324'", "const API_CACHE = 'pkb-api-v325'");
fs.writeFileSync(swPath, Buffer.from(sw, 'utf8'));

// Sanity
t = fs.readFileSync(indexPath, 'utf8');
if (!t.includes('og:image') || !t.includes('/og-image.jpg')) throw new Error('og tags missing');
if (t.includes('src="/install-ios.jpg"')) throw new Error('install-ios still has static src');
if (!t.includes("var APP_BUILD = 'pkb-v325'")) throw new Error('build bump failed');

console.log('OK: pkb-v325 Open Graph lobby preview');
