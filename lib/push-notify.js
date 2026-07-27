const webpush = require('web-push');
const { loadSubscriptions, removeEndpoints } = require('./subscriptions-store');

const VAPID_PUBLIC  = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:egorchatov@gmail.com';

function buildViolationPayload(record) {
  return {
    title: '⚠ Нарушение КБ',
    body: [
      record.org || '',
      record.barrier ? 'Барьер: ' + record.barrier : '',
      record.desc || '',
    ].filter(Boolean).join('\n'),
    tag: 'violation-' + (record.id || record.checkId || Date.now()),
  };
}

async function sendPushPayload(payload, senderEndpoint, options) {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    return { sent: 0, total: 0, reason: 'VAPID not configured' };
  }

  const data = loadSubscriptions();
  const subs = data.subscriptions || [];
  if (subs.length === 0) {
    return { sent: 0, total: 0, reason: 'No subscribers' };
  }

  const recipients = senderEndpoint
    ? subs.filter(sub => sub.endpoint !== senderEndpoint)
    : subs;

  if (recipients.length === 0) {
    return { sent: 0, total: 0, reason: 'No recipients after excluding sender' };
  }

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
  const pushOptions = Object.assign({ urgency: 'high', TTL: 86400 }, options || {});
  const results = await Promise.allSettled(
    recipients.map(sub => webpush.sendNotification(sub, JSON.stringify(payload), pushOptions))
  );

  const sent = results.filter(r => r.status === 'fulfilled').length;

  const deadEndpoints = new Set(
    recipients
      .filter((_, i) => {
        const r = results[i];
        return r.status === 'rejected' &&
          r.reason && (r.reason.statusCode === 410 || r.reason.statusCode === 404);
      })
      .map(s => s.endpoint)
  );

  if (deadEndpoints.size > 0) {
    removeEndpoints(deadEndpoints);
  }

  return { sent, total: recipients.length };
}

async function sendViolationPush(record, senderEndpoint) {
  if (!record || record.works !== 'Нет') {
    return { sent: 0, total: 0, reason: 'No violation' };
  }
  const payload = buildViolationPayload(record);
  const result = await sendPushPayload(payload, senderEndpoint);
  console.log(`[push] violation sent ${result.sent}/${result.total}`);
  return result;
}

/**
 * Silent sync ping — wakes other devices without a violation alert.
 * SW must treat type=sync / silent=true as data-only (no user-visible banner when possible).
 */
async function sendRecordsChangedPush(senderEndpoint) {
  const payload = {
    type: 'sync',
    silent: true,
    title: '',
    body: '',
    tag: 'records-sync',
  };
  const result = await sendPushPayload(payload, senderEndpoint, { urgency: 'normal', TTL: 60 });
  if (result.sent) console.log(`[push] records-sync sent ${result.sent}/${result.total}`);
  return result;
}

module.exports = {
  sendViolationPush,
  sendRecordsChangedPush,
  buildViolationPayload,
};
