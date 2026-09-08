const webpush = require('web-push');
const { loadSubscriptions, removeEndpoints } = require('./subscriptions-store');

const VAPID_PUBLIC  = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:egorchatov@gmail.com';

// Best practice: transient failures include 429 (rate limit — retry after
// Retry-After), 408/425 and the 5xx family. 404/410 are terminal (subscription
// gone). Anything else is non-retryable (e.g. 413 payload too large).
const RETRYABLE_STATUS_CODES = [408, 425, 429, 500, 502, 503, 504];
const MAX_RETRY_DELAY_MS = 30000;
// Debounce window for the silent "records changed" sync hint: during mass entry
// we only need one refresh signal after the burst, not one per saved record.
const RECORDS_SYNC_DEBOUNCE_MS = 1500;

// Outbound pushes are serialized through a single chain (concurrency 1). This
// smooths bursts (mass entry fires many pushes in a second) so the push
// services are not hammered with N requests at once, which is what triggers
// 429s and silently dropped notifications. Each queued message still fans out
// to all recipients; only whole messages are spaced apart.
let _pushChain = Promise.resolve();

// Silent sync coalescing state: at most one real send, ~1.5s after the burst
// quietens down (trailing edge), using the most recent sender endpoint.
let _recordsSyncTimer = null;
let _recordsSyncSender = null;

function enqueuePush(fn) {
  const run = _pushChain.then(function() { return fn(); });
  _pushChain = run.catch(function() { /* keep the chain alive */ });
  return run;
}

function isSameDay(timestamp1, timestamp2) {
  const d1 = new Date(timestamp1);
  const d2 = new Date(timestamp2);
  return d1.getFullYear() === d2.getFullYear() &&
         d1.getMonth() === d2.getMonth() &&
         d1.getDate() === d2.getDate();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function sendWithRetry(sub, payload, pushOptions, startTime) {
  const MAX_RETRIES = 5;
  let attempt = 0;
  
  while (attempt <= MAX_RETRIES) {
    try {
      await webpush.sendNotification(sub, JSON.stringify(payload), pushOptions);
      return { success: true, attempt };
    } catch (err) {
      const statusCode = err.statusCode;
      
      if (statusCode === 410 || statusCode === 404) {
        return { success: false, dead: true, attempt };
      }
      
      if (!RETRYABLE_STATUS_CODES.includes(statusCode)) {
        return { success: false, error: err, attempt };
      }
      
      if (attempt === MAX_RETRIES) {
        return { success: false, error: err, attempt };
      }
      
      if (!isSameDay(startTime, Date.now())) {
        return { success: false, error: err, attempt, reason: 'exceeded_day_limit' };
      }
      
      // 429: the push service asks us to wait — honour Retry-After if present
      // (spec-required), otherwise fall back to exponential backoff.
      let delay;
      if (statusCode === 429 && err && err.headers) {
        const ra = err.headers['retry-after'] || err.headers['Retry-After'];
        const secs = parseInt(ra, 10);
        if (!isNaN(secs) && secs >= 0) {
          delay = Math.min(secs * 1000, MAX_RETRY_DELAY_MS);
        }
      }
      if (delay == null) {
        delay = Math.min(Math.pow(2, attempt) * 1000, MAX_RETRY_DELAY_MS);
      }
      await sleep(delay);
      attempt++;
    }
  }
  
  return { success: false, error: new Error('max retries exceeded'), attempt };
}

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
  const startTime = Date.now();
  
  const results = await Promise.allSettled(
    recipients.map(async (sub) => {
      return await sendWithRetry(sub, payload, pushOptions, startTime);
    })
  );

  const sent = results.filter(r => r.status === 'fulfilled' && r.value.success).length;

  const deadEndpoints = new Set(
    recipients
      .filter((_, i) => {
        const r = results[i];
        return r.status === 'fulfilled' && r.value.dead;
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
  // Serialized through the queue: every violation is its own banner, but bursts
  // are spaced so the push service does not rate-limit (429) us into dropping.
  return enqueuePush(function() {
    return sendPushPayload(payload, senderEndpoint);
  }).then(function(result) {
    console.log(`[push] violation sent ${result.sent}/${result.total}`);
    return result;
  });
}

/**
 * Silent sync ping — wakes other devices without a violation alert.
 * Debounced (trailing edge): mass entry produces many saves in a row, but only
 * one "refresh your data" signal is needed after the burst, so we do not hammer
 * the push service with one message per saved record.
 * SW must treat type=sync / silent=true as data-only (no user-visible banner when possible).
 */
async function sendRecordsChangedPush(senderEndpoint) {
  _recordsSyncSender = senderEndpoint || null;
  if (_recordsSyncTimer) clearTimeout(_recordsSyncTimer);
  _recordsSyncTimer = setTimeout(function() {
    _recordsSyncTimer = null;
    enqueuePush(function() {
      return doRecordsChangedPush(_recordsSyncSender);
    });
  }, RECORDS_SYNC_DEBOUNCE_MS);
  return { sent: 0, total: 0, reason: 'debounced' };
}

async function doRecordsChangedPush(senderEndpoint) {
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
