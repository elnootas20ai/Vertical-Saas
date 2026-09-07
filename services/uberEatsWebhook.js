import crypto from 'crypto';
import { getUberEatsClientSecret } from './uberEatsOAuth.js';

export { fetchUberOrderDetails } from './uberEatsApi.js';

/**
 * Verifica X-Uber-Signature (HMAC-SHA256 hex lowercase del body crudo + client secret).
 */
export function verifyUberWebhookSignature(rawBody, signatureHeader) {
  const secret = getUberEatsClientSecret();
  const sig = String(signatureHeader || '').trim().toLowerCase();
  if (!secret || !sig) return false;
  const body = typeof rawBody === 'string' ? rawBody : String(rawBody || '');
  const digest = crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex');
  try {
    const a = Buffer.from(digest, 'utf8');
    const b = Buffer.from(sig, 'utf8');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function webhookTokenSignature(encodedPayload, secret) {
  return crypto.createHmac('sha256', secret).update(encodedPayload, 'utf8').digest('base64url');
}

export function issueUberWebhookAccessToken(expiresInSeconds = 3600) {
  const secret = getUberEatsClientSecret();
  if (!secret) throw new Error('Falta UBER_EATS_CLIENT_SECRET');
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    aud: 'vertial-uber-webhook',
    iat: now,
    exp: now + Math.max(60, Number(expiresInSeconds) || 3600),
  }), 'utf8').toString('base64url');
  return `${payload}.${webhookTokenSignature(payload, secret)}`;
}

export function verifyUberWebhookAccessToken(token) {
  const secret = getUberEatsClientSecret();
  const value = String(token || '').trim();
  if (!secret || !value.includes('.')) return false;
  const [encodedPayload, providedSignature, ...extra] = value.split('.');
  if (!encodedPayload || !providedSignature || extra.length) return false;
  const expectedSignature = webhookTokenSignature(encodedPayload, secret);
  try {
    const expected = Buffer.from(expectedSignature, 'utf8');
    const provided = Buffer.from(providedSignature, 'utf8');
    if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) return false;
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    return payload?.aud === 'vertial-uber-webhook'
      && Number(payload?.exp || 0) > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export function parseUberWebhookEvent(body) {
  const eventType = String(body?.event_type || '').trim();
  const orderId = String(body?.meta?.resource_id || body?.meta?.order_id || '').trim();
  const storeId = String(
    body?.store_id
    || body?.meta?.user_id
    || body?.meta?.store_id
    || '',
  ).trim();
  const resourceHref = String(body?.resource_href || '').trim();
  const eventId = String(
    body?.event_id
    || body?.webhook_meta?.webhook_msg_uuid
    || '',
  ).trim();
  return { eventType, orderId, storeId, resourceHref, eventId };
}
