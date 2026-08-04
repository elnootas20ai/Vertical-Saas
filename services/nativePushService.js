/**
 * Push nativo en pantalla de bloqueo (app en segundo plano / móvil bloqueado).
 * - iOS: APNs alert + sonido (banner en lock screen)
 * - Android: FCM high priority + notification (lock screen)
 *
 * Tokens en CouchDB `push_subscriptions` type `native_push_token`.
 */
import crypto from 'node:crypto';
import apn from '@parse/node-apn';
import { couchRequest, getCouchConfig } from './couchdb.js';
import { couchJson } from './couchResponse.js';

const PUSH_DB = 'push_subscriptions';

let apnProvider = null;
let apnLogged = false;
let fcmLogged = false;

function hashToken(token) {
  return crypto.createHash('sha1').update(String(token)).digest('hex').slice(0, 16);
}

function stringData(data) {
  const out = {};
  if (!data || typeof data !== 'object') return out;
  for (const [k, v] of Object.entries(data)) {
    if (v == null) continue;
    out[k] = typeof v === 'string' ? v : String(v);
  }
  return out;
}

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

function getApnProvider() {
  if (apnProvider) return apnProvider;

  const keyId = process.env.APNS_KEY_ID || '';
  const teamId = process.env.APNS_TEAM_ID || '';
  const keyPath = process.env.APNS_KEY_PATH || '';
  const keyContent = process.env.APNS_KEY_CONTENT || '';

  if (!keyId || !teamId || (!keyPath && !keyContent)) {
    return null;
  }

  const token = keyContent
    ? { key: Buffer.from(keyContent, 'base64'), keyId, teamId }
    : { key: keyPath, keyId, teamId };

  apnProvider = new apn.Provider({
    token,
    production: process.env.APNS_PRODUCTION === 'true',
  });

  if (!apnLogged) {
    apnLogged = true;
    console.log('[NativePush] APNs listo (lock screen iOS, production=%s)', process.env.APNS_PRODUCTION === 'true');
  }
  return apnProvider;
}

function getFcmServerKey() {
  return String(process.env.FIREBASE_SERVER_KEY || process.env.FCM_SERVER_KEY || '').trim();
}

export function isNativePushConfigured() {
  return Boolean(getApnProvider() || getFcmServerKey());
}

/**
 * Guarda token nativo de un dispositivo.
 */
export async function saveNativeToken(req, userId, device) {
  const { platform, token, bundleId } = device || {};
  if (!userId || !platform || !token) return;

  await ensurePushDB(req);
  const hash = hashToken(token);
  const id = `native:${userId}:${platform}:${hash}`;

  let rev;
  let createdAt;
  try {
    const existingRes = await couchRequest(req, `/${PUSH_DB}/${encodeURIComponent(id)}`);
    if (existingRes.ok) {
      const existing = await couchJson(existingRes);
      rev = existing?._rev;
      createdAt = existing?.createdAt;
    }
  } catch {
    /* nuevo */
  }

  const now = new Date().toISOString();
  const doc = {
    _id: id,
    ...(rev ? { _rev: rev } : {}),
    type: 'native_push_token',
    userId,
    platform,
    token,
    bundleId: bundleId || process.env.APNS_BUNDLE_ID || 'com.vertial.app',
    createdAt: createdAt || now,
    updatedAt: now,
  };

  const putRes = await couchRequest(req, `/${PUSH_DB}/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(doc),
    headers: { 'Content-Type': 'application/json' },
  });
  if (!putRes.ok) {
    const errBody = await putRes.text().catch(() => '');
    throw new Error(`No se pudo guardar token nativo (${putRes.status}): ${errBody.slice(0, 200)}`);
  }
}

export async function deleteNativeToken(req, userId, platform, token) {
  if (!userId || !platform || !token) return;
  const id = `native:${userId}:${platform}:${hashToken(token)}`;
  try {
    const existingRes = await couchRequest(req, `/${PUSH_DB}/${encodeURIComponent(id)}`);
    if (!existingRes.ok) return;
    const existing = await couchJson(existingRes);
    if (!existing?._rev) return;
    await couchRequest(req, `/${PUSH_DB}/${encodeURIComponent(id)}?rev=${existing._rev}`, {
      method: 'DELETE',
    });
  } catch {
    /* ya no existía */
  }
}

async function getNativeTokensForUser(req, userId, platform = null) {
  await ensurePushDB(req);
  try {
    const selector = platform
      ? { type: 'native_push_token', userId, platform }
      : { type: 'native_push_token', userId };
    const resultRes = await couchRequest(req, `/${PUSH_DB}/_find`, {
      method: 'POST',
      body: JSON.stringify({ selector, limit: 20 }),
      headers: { 'Content-Type': 'application/json' },
    });
    if (!resultRes.ok) return [];
    const result = await couchJson(resultRes);
    return (result?.docs || []).filter((d) => d.token);
  } catch {
    return [];
  }
}

async function sendApnsToTokens(req, userId, tokens, payload) {
  const provider = getApnProvider();
  if (!provider || tokens.length === 0) return { sent: 0, failed: 0 };

  const data = stringData(payload.data);
  const note = new apn.Notification();
  note.topic = process.env.APNS_BUNDLE_ID || tokens[0]?.bundleId || 'com.vertial.app';
  // alert = visible en pantalla de bloqueo / centro de notificaciones
  note.pushType = 'alert';
  note.priority = 10;
  note.alert = {
    title: payload.title || 'Vertial',
    body: payload.body || '',
  };
  note.sound = payload.sound || 'default';
  note.badge = payload.badge != null ? payload.badge : 1;
  // No silencioso: tiene que despertar el lock screen
  note.contentAvailable = false;
  note.mutableContent = false;
  note.payload = data;
  const collapseId = String(payload.collapseId || data.notificationId || '').slice(0, 64);
  if (collapseId) note.collapseId = collapseId;

  let sent = 0;
  let failed = 0;

  for (const doc of tokens) {
    try {
      const result = await provider.send(note, doc.token);
      const bad = [...(result.failed || [])];
      if (bad.length === 0) {
        sent += 1;
      } else {
        failed += 1;
        for (const f of bad) {
          const reason = f.response?.reason || f.status;
          if (reason === 'BadDeviceToken' || reason === 'Unregistered') {
            await deleteNativeToken(req, userId, doc.platform, doc.token).catch(() => {});
          }
        }
      }
    } catch {
      failed += 1;
    }
  }

  return { sent, failed };
}

/**
 * FCM legacy HTTP — aviso visible en lock screen Android (priority high).
 */
async function sendFcmToTokens(req, userId, tokens, payload) {
  const serverKey = getFcmServerKey();
  if (!serverKey || tokens.length === 0) return { sent: 0, failed: 0 };

  if (!fcmLogged) {
    fcmLogged = true;
    console.log('[NativePush] FCM listo (lock screen Android)');
  }

  const data = stringData(payload.data);
  let sent = 0;
  let failed = 0;

  for (const doc of tokens) {
    try {
      const res = await fetch('https://fcm.googleapis.com/fcm/send', {
        method: 'POST',
        headers: {
          Authorization: `key=${serverKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: doc.token,
          priority: 'high',
          // notification = banner en bloqueo / bandeja (no solo data silenciosa)
          notification: {
            title: payload.title || 'Vertial',
            body: payload.body || '',
            sound: 'default',
            // visible en pantalla de bloqueo
            visibility: 'public',
            android_channel_id: 'vertial_alerts',
          },
          data: {
            ...data,
            // Capacitor / plugin: ruta al tocar
            route: data.route || '/saas/alerts',
            click_action: 'OPEN_URI',
          },
          android: {
            priority: 'high',
            collapse_key: String(payload.collapseId || data.notificationId || 'vertial').slice(0, 64),
          },
        }),
      });

      const body = await res.json().catch(() => ({}));
      if (res.ok && body.success >= 1) {
        sent += 1;
      } else {
        failed += 1;
        const err = body.results?.[0]?.error;
        if (err === 'NotRegistered' || err === 'InvalidRegistration') {
          await deleteNativeToken(req, userId, doc.platform, doc.token).catch(() => {});
        }
      }
    } catch {
      failed += 1;
    }
  }

  return { sent, failed };
}

/**
 * Envía push nativo para que salga con el móvil bloqueado (iOS APNs + Android FCM).
 */
export async function sendNativePushToUser(req, userId, payload) {
  const [iosTokens, androidTokens] = await Promise.all([
    getNativeTokensForUser(req, userId, 'ios'),
    getNativeTokensForUser(req, userId, 'android'),
  ]);

  const [ios, android] = await Promise.all([
    sendApnsToTokens(req, userId, iosTokens, payload),
    sendFcmToTokens(req, userId, androidTokens, payload),
  ]);

  const sent = ios.sent + android.sent;
  const failed = ios.failed + android.failed;

  if (failed > 0) {
    console.warn(
      `[NativePush] ${failed} fallos (ios ${ios.failed}, android ${android.failed}) userId=${userId}`,
    );
  }

  return { sent, failed, ios, android };
}
