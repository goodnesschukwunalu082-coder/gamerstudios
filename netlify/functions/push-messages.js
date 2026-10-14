const crypto = require('node:crypto');
const webpush = require('web-push');

const jsonResponse = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body)
});

function hasValidWebhookSecret(event, expectedSecret) {
  const suppliedSecret = event.headers?.['x-gamer-studio-secret']
    || event.headers?.['X-Gamer-Studio-Secret']
    || '';
  const supplied = Buffer.from(suppliedSecret);
  const expected = Buffer.from(expectedSecret);
  return supplied.length === expected.length
    && supplied.length > 0
    && crypto.timingSafeEqual(supplied, expected);
}

function isUuid(value) {
  return typeof value === 'string'
    && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
}

async function supabaseRequest(path, serviceKey, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      ...(options.headers || {})
    }
  });
  if (!response.ok) {
    throw new Error(`Supabase push request returned ${response.status}.`);
  }
  return response;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  const {
    PUSH_WEBHOOK_SECRET,
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY,
    VAPID_SUBJECT
  } = process.env;
  if (
    !PUSH_WEBHOOK_SECRET
    || !SUPABASE_URL
    || !SUPABASE_SERVICE_ROLE_KEY
    || !VAPID_PUBLIC_KEY
    || !VAPID_PRIVATE_KEY
    || !VAPID_SUBJECT
  ) {
    console.error('Direct-message push is missing one or more required server environment variables.');
    return jsonResponse(503, { error: 'Phone notifications are not configured.' });
  }
  if (!hasValidWebhookSecret(event, PUSH_WEBHOOK_SECRET)) {
    return jsonResponse(401, { error: 'Unauthorized' });
  }

  let webhook;
  try {
    webhook = JSON.parse(event.body || '');
  } catch (error) {
    return jsonResponse(400, { error: 'Invalid webhook JSON.' });
  }
  const message = webhook?.record;
  if (
    webhook.type !== 'INSERT'
    || webhook.table !== 'direct_messages'
    || webhook.schema !== 'public'
    || !isUuid(message?.id)
    || !isUuid(message.sender_id)
    || !isUuid(message.recipient_id)
    || message.sender_id === message.recipient_id
  ) {
    return jsonResponse(400, { error: 'Invalid direct-message webhook event.' });
  }

  const supabaseBase = SUPABASE_URL.replace(/\/+$/, '');
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    const profileURL = new URL(`${supabaseBase}/rest/v1/profiles`);
    profileURL.searchParams.set('select', 'username');
    profileURL.searchParams.set('id', `eq.${message.sender_id}`);
    const subscriptionsURL = new URL(`${supabaseBase}/rest/v1/push_subscriptions`);
    subscriptionsURL.searchParams.set('select', 'endpoint,subscription');
    subscriptionsURL.searchParams.set('user_id', `eq.${message.recipient_id}`);

    const [profileResponse, subscriptionsResponse] = await Promise.all([
      supabaseRequest(profileURL, SUPABASE_SERVICE_ROLE_KEY),
      supabaseRequest(subscriptionsURL, SUPABASE_SERVICE_ROLE_KEY)
    ]);
    const [profiles, subscriptions] = await Promise.all([
      profileResponse.json(),
      subscriptionsResponse.json()
    ]);
    if (!Array.isArray(profiles) || !Array.isArray(subscriptions)) {
      throw new Error('Supabase returned an invalid push notification response.');
    }
    if (!subscriptions.length) return jsonResponse(200, { sent: 0 });

    const senderName = profiles[0]?.username || 'Gamer';
    const body = typeof message.content === 'string' && message.content.trim()
      ? message.content.trim().slice(0, 140)
      : message.voice_path
        ? 'Sent you a voice message'
        : message.media_type === 'video'
          ? 'Shared a video'
          : message.media_path
            ? 'Shared a photo'
            : 'Sent you a message';
    const payload = JSON.stringify({
      type: 'direct_message',
      messageId: message.id,
      senderId: message.sender_id,
      senderName,
      body
    });

    const results = await Promise.allSettled(subscriptions.map(async (entry) => {
      try {
        await webpush.sendNotification(entry.subscription, payload, {
          TTL: 60,
          urgency: 'high'
        });
        return true;
      } catch (error) {
        if (error.statusCode === 404 || error.statusCode === 410) {
          const deleteURL = new URL(`${supabaseBase}/rest/v1/push_subscriptions`);
          deleteURL.searchParams.set('endpoint', `eq.${entry.endpoint}`);
          await supabaseRequest(deleteURL, SUPABASE_SERVICE_ROLE_KEY, { method: 'DELETE' });
          return false;
        }
        console.error('Unable to send a phone notification:', error.statusCode || error.message);
        throw error;
      }
    }));
    const failures = results.filter((result) => result.status === 'rejected');
    if (failures.length) {
      return jsonResponse(502, {
        error: 'Some phone notifications could not be delivered.',
        sent: results.length - failures.length
      });
    }
    return jsonResponse(200, {
      sent: results.filter((result) => result.value).length
    });
  } catch (error) {
    console.error('Unable to process a direct-message push webhook:', error);
    return jsonResponse(502, { error: 'Phone notifications could not be delivered.' });
  }
};
