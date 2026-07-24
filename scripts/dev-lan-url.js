/**
 * Print LAN URLs for testing from iPhone / other devices on same Wi-Fi.
 * Usage: node scripts/dev-lan-url.js
 */
const os = require('os');

const PORT = Number(process.env.PORT || 3000);

function lanAddresses() {
  const out = [];
  const nets = os.networkInterfaces();
  Object.keys(nets).forEach(function(name) {
    (nets[name] || []).forEach(function(net) {
      if (net.family !== 'IPv4' && net.family !== 4) return;
      if (net.internal) return;
      if (!net.address) return;
      out.push({ name: name, address: net.address });
    });
  });
  return out;
}

const addrs = lanAddresses();
const home = addrs.filter(function(a) { return /^192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[0-1])\./.test(a.address); });

console.log('');
console.log('=== Proverki KB — test from iPhone (same Wi-Fi) ===');
console.log('');
console.log('1. npm start must be running on this PC');
console.log('2. Open Safari on iPhone:');
console.log('');

if (!home.length) {
  console.log('   (no LAN IPv4 found — check Wi-Fi connection)');
} else {
  home.forEach(function(a) {
    console.log('   http://' + a.address + ':' + PORT + '   [' + a.name + ']');
  });
}

console.log('');
console.log('Local PC: http://localhost:' + PORT);
console.log('Data repo: proverki-kb-data-dev (test Excel)');
console.log('');
