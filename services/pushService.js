/**
 * Push Service — Web Push (VAPID) para notificaciones cuando la app está cerrada.
 *
 * Las suscripciones push se almacenan en CouchDB en la colección `push_subscriptions`.
 * Cada documento tiene la forma:
 *   { _id: `push:${userId}:${endpointHash}`, type: 'push_subscription', userId, subscription, createdAt }
 */
import webPush from 'web-push';
import { couchRequest, getCouchConfig } from './couchdb.js';
import crypto from 'node:crypto';

const PUSH_DB = 'push_subscriptions';

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || '';
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || '';
const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@udar.app';

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
    const existing = await couchRequest(req, `/${PUSH_DB}/${encodeURIComponent(id)}`);
    rev = existing._rev;
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

  await couchRequest(req, `/${PUSH_DB}/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(doc),
    headers: { 'Content-Type': 'application/json' },
  });
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
    const existing = await couchRequest(req, `/${PUSH_DB}/${encodeURIComponent(id)}`);
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
    const result = await couchRequest(req, `/${PUSH_DB}/_find`, {
      method: 'POST',
      body: JSON.stringify({
        selector: { type: 'push_subscription', userId },
        limit: 50,
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    return (result.docs || []).map((d) => d.subscription).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Envía una notificación push a todos los dispositivos suscritos de un usuario.
 * Llama sin await desde el controlador para no bloquear la respuesta HTTP.
 *
 * @param {object|null} req
 * @param {string} userId
 * @param {{ title: string; body: string; data?: Record<string, unknown> }} payload
 */
export async function sendPushToUser(req, userId, payload) {
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
          // Suscripción expirada — limpiar
          await deleteSubscription(req, userId, sub.endpoint).catch(() => {});
        }
        throw err;
      }),
    ),
  );

  const failed = results.filter((r) => r.status === 'rejected').length;
  if (failed > 0) {
    console.warn(`[Push] ${failed}/${subscriptions.length} envíos fallaron para userId=${userId}`);
  }
}

export { vapidPublicKey as VAPID_PUBLIC_KEY };
