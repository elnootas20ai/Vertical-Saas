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

export function parseUberWebhookEvent(body) {
  const eventType = String(body?.event_type || '').trim();
  const orderId = String(body?.meta?.resource_id || body?.meta?.order_id || '').trim();
  const storeId = String(body?.meta?.user_id || body?.meta?.store_id || '').trim();
  const resourceHref = String(body?.resource_href || '').trim();
  const eventId = String(body?.event_id || '').trim();
  return { eventType, orderId, storeId, resourceHref, eventId };
}
