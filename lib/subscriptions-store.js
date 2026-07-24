const { getDb, withTransaction } = require('./db');

function loadSubscriptions() {
  const db = getDb();
  const rows = db.prepare('SELECT json FROM push_subscriptions').all();
  const subscriptions = [];
  rows.forEach(function(row) {
    try {
      subscriptions.push(JSON.parse(row.json));
    } catch (_e) {}
  });
  return { subscriptions };
}

function upsertSubscription(subscription) {
  const db = getDb();
  db.prepare(`
    INSERT INTO push_subscriptions (endpoint, json, updated_at) VALUES (?, ?, unixepoch())
    ON CONFLICT(endpoint) DO UPDATE SET json = excluded.json, updated_at = unixepoch()
  `).run(subscription.endpoint, JSON.stringify(subscription));
  return loadSubscriptions();
}

function removeEndpoints(endpoints) {
  if (!endpoints || !endpoints.size) return;
  const db = getDb();
  const stmt = db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?');
  endpoints.forEach(function(ep) { stmt.run(ep); });
}

function importSubscriptions(list) {
  const db = getDb();
  db.exec('DELETE FROM push_subscriptions');
  const stmt = db.prepare(`
    INSERT INTO push_subscriptions (endpoint, json, updated_at) VALUES (?, ?, unixepoch())
  `);
  withTransaction(function() {
    (list || []).forEach(function(sub) {
      if (!sub || !sub.endpoint) return;
      stmt.run(sub.endpoint, JSON.stringify(sub));
    });
  });
}

module.exports = {
  loadSubscriptions,
  upsertSubscription,
  removeEndpoints,
  importSubscriptions,
};
