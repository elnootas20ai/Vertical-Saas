/**
 * Push Service — Web Push (VAPID) + push nativo iOS (APNs).
 *
 * CouchDB `push_subscriptions`:
 *   Web:    { type: 'push_subscription', userId, subscription }
 *   Nativo: { type: 'native_push_token', userId, platform, token }
 */
import webPush from 'web-push';
import { couchRequest, getCouchConfig } from './couchdb.js';
import crypto from 'node:crypto';
import { shouldSendMobilePush } from './pushAlertPolicy.js';
import { sendNativePushToUser, saveNativeToken, deleteNativeToken } from './nativePushService.js';
import { couchJson } from './couchResponse.js';

export { saveNativeToken, deleteNativeToken };

const PUSH_DB = 'push_subscriptions';

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || '';
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || '';
const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@vertialapp.com';

if (vapidPublicKey && vapidPrivateKey) {
  webPush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  console.log('[Push] VAPID configurado correctamente');
} else {
  console.warn('[Push] VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY no configuradas — Web Push desactivado');
}

/**
 * Hash corto del endpoint para usar como sufijo de _id.
 * @param {string} endpoint
 */
function hashEndpoint(endpoint) {
  return crypto.createHash('sha1').update(endpoint).digest('hex').slice(0, 16);
}

/**
 * Asegura que la base de datos PUSH_DB existe en CouchDB.
 * @param {object|null} req
 */
async function ensurePushDB(req) {
  const cfg = getCouchConfig(req);
  if (!cfg.baseUrl) return;
  const auth = cfg.username
    ? `Basic ${Buffer.from(`${cfg.username}:${cfg.password}`).toString('base64')}`
    : undefined;

  await fetch(`${cfg.baseUrl}/${PUSH_DB}`, {
    method: 'PUT',
    headers: { ...(auth ? { Authorization: auth } : {}) },
  }).catch(() => {});
}

/**
 * Guarda o actualiza una suscripción push para un usuario.
 * @param {object|null} req
 * @param {string} userId
 * @param {PushSubscriptionJSON} subscription
 */
export async function saveSubscription(req, userId, subscription) {
  await ensurePushDB(req);
  const hash = hashEndpoint(subscription.endpoint);
  const id = `push:${userId}:${hash}`;

  let rev;
  try {
    const existingRes = await couchRequest(req, `/${PUSH_DB}/${encodeURIComponent(id)}`);
    if (existingRes.ok) {
      const existing = await couchJson(existingRes);
      rev = existing?._rev;
    }
  } catch {
    // Documento nuevo
  }

  const doc = {
    _id: id,
    ...(rev ? { _rev: rev } : {}),
    type: 'push_subscription',
    userId,
    subscription,
    createdAt: new Date().toISOString(),
  };

  const putRes = await couchRequest(req, `/${PUSH_DB}/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(doc),
    headers: { 'Content-Type': 'application/json' },
  });
  if (!putRes.ok) {
    const errBody = await putRes.text().catch(() => '');
    throw new Error(`No se pudo guardar suscripción push (${putRes.status}): ${errBody.slice(0, 200)}`);
  }
}

/**
 * Elimina una suscripción push de un usuario.
 * @param {object|null} req
 * @param {string} userId
 * @param {string} endpoint
 */
export async function deleteSubscription(req, userId, endpoint) {
  const hash = hashEndpoint(endpoint);
  const id = `push:${userId}:${hash}`;
  try {
    const existingRes = await couchRequest(req, `/${PUSH_DB}/${encodeURIComponent(id)}`);
    if (!existingRes.ok) return;
    const existing = await couchJson(existingRes);
    if (!existing?._rev) return;
    await couchRequest(req, `/${PUSH_DB}/${encodeURIComponent(id)}?rev=${existing._rev}`, {
      method: 'DELETE',
    });
  } catch {
    // Ya no existía
  }
}

/**
 * Obtiene todas las suscripciones push de un usuario.
 * @param {object|null} req
 * @param {string} userId
 * @returns {Promise<PushSubscriptionJSON[]>}
 */
async function getSubscriptionsForUser(req, userId) {
  await ensurePushDB(req);
  try {
    const resultRes = await couchRequest(req, `/${PUSH_DB}/_find`, {
      method: 'POST',
      body: JSON.stringify({
        selector: { type: 'push_subscription', userId },
        limit: 50,
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    if (!resultRes.ok) return [];
    const result = await couchJson(resultRes);
    return (result?.docs || []).map((d) => d.subscription).filter(Boolean);
  } catch {
    return [];
  }
}

async function sendWebPushToUser(req, userId, payload) {
  if (!vapidPublicKey || !vapidPrivateKey) return;

  const subscriptions = await getSubscriptionsForUser(req, userId);
  if (subscriptions.length === 0) return;

  const notification = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    data: payload.data || {},
  });

  const results = await Promise.allSettled(
    subscriptions.map((sub) =>
      webPush.sendNotification(sub, notification).catch(async (err) => {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await deleteSubscription(req, userId, sub.endpoint).catch(() => {});
        }
        throw err;
      }),
    ),
  );

  const failed = results.filter((r) => r.status === 'rejected').length;
  if (failed > 0) {
    console.warn(`[Push] Web ${failed}/${subscriptions.length} fallaron para userId=${userId}`);
  }
}

/**
 * Envía push web y nativo (iOS APNs) según política de alertas.
 *
 * - Con ruleId/category: solo whitelist + plan (pushAlertPolicy) → iPhone con sonido.
 * - Sin contexto de regla (avisos puntuales): web + nativo siempre.
 *
 * @param {object|null} req
 * @param {string} userId
 * @param {{ title: string; body: string; data?: Record<string, unknown>; sound?: string; badge?: number; collapseId?: string }} payload
 * @param {{ ruleId?: string; category?: string; channels?: string[] }} [options]
 */
export async function sendPushToUser(req, userId, payload, options = {}) {
  const { ruleId, category, channels = ['push'] } = options;
  const hasRuleContext = Boolean(ruleId || category);

  if (hasRuleContext) {
    const allowed = await shouldSendMobilePush(req, { userId, ruleId, category, channels });
    if (!allowed) return;
  }

  // APNs/FCM: data solo strings
  const rawData = payload.data && typeof payload.data === 'object' ? payload.data : {};
  const data = {};
  for (const [k, v] of Object.entries(rawData)) {
    if (v == null) continue;
    data[k] = typeof v === 'string' ? v : String(v);
  }

  const nativePayload = {
    ...payload,
    data,
    sound: payload.sound || 'default',
    collapseId: payload.collapseId || data.notificationId || undefined,
  };

  await Promise.all([
    sendWebPushToUser(req, userId, { ...payload, data }),
    sendNativePushToUser(req, userId, nativePayload),
  ]);
}

export { vapidPublicKey as VAPID_PUBLIC_KEY };
