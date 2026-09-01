/**
 * Push nativo en pantalla de bloqueo (app en segundo plano / móvil bloqueado).
 * - iOS: APNs alert + sonido (banner en lock screen)
 * - Android: FCM high priority + notification (lock screen)
 *
 * Tokens en CouchDB `push_subscriptions` type `native_push_token`.
 */
import crypto from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import apn from '@parse/node-apn';
import { GoogleAuth } from 'google-auth-library';
import { couchRequest, getCouchConfig } from './couchdb.js';
import { couchJson } from './couchResponse.js';

const PUSH_DB = 'push_subscriptions';
const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

let apnProvider = null;
let apnLogged = false;
let fcmLogged = false;
let fcmAuth = null;
let fcmProjectId = '';


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

/**
 * Credenciales FCM HTTP v1 (cuenta de servicio Firebase).
 * Env:
 *   FCM_SERVICE_ACCOUNT_PATH=/ruta/firebase-adminsdk.json
 *   FCM_SERVICE_ACCOUNT_JSON=<json completo o base64>
 *   FCM_PROJECT_ID= opcional (si no viene en el JSON)
 */
function loadFcmServiceAccount() {
  const path = String(process.env.FCM_SERVICE_ACCOUNT_PATH || process.env.FIREBASE_SERVICE_ACCOUNT_PATH || '').trim();
  const raw = String(process.env.FCM_SERVICE_ACCOUNT_JSON || process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();

  let parsed = null;
  if (path && existsSync(path)) {
    try {
      parsed = JSON.parse(readFileSync(path, 'utf8'));
    } catch {
      parsed = null;
    }
  } else if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      try {
        parsed = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
      } catch {
        parsed = null;
      }
    }
  }

  if (!parsed || typeof parsed !== 'object') return null;
  const projectId = String(
    process.env.FCM_PROJECT_ID
      || process.env.FIREBASE_PROJECT_ID
      || parsed.project_id
      || '',
  ).trim();
  if (!projectId || !parsed.client_email || !parsed.private_key) return null;
  return { credentials: parsed, projectId };
}

function getFcmV1Client() {
  const loaded = loadFcmServiceAccount();
  if (!loaded) return null;
  if (!fcmAuth) {
    fcmAuth = new GoogleAuth({
      credentials: loaded.credentials,
      scopes: [FCM_SCOPE],
    });
    fcmProjectId = loaded.projectId;
  }
  return { auth: fcmAuth, projectId: fcmProjectId || loaded.projectId };
}

export function isNativePushConfigured() {
  return Boolean(getApnProvider() || getFcmV1Client() || getFcmServerKey());
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
 * FCM HTTP v1 (recomendado) + fallback legacy Server key.
 * Banner en bloqueo / bandeja (priority high + canal vertial_alerts).
 */
async function sendFcmToTokens(req, userId, tokens, payload) {
  if (tokens.length === 0) return { sent: 0, failed: 0 };

  const v1 = getFcmV1Client();
  if (v1) return sendFcmV1ToTokens(req, userId, tokens, payload, v1);

  const serverKey = getFcmServerKey();
  if (!serverKey) return { sent: 0, failed: 0 };
  return sendFcmLegacyToTokens(req, userId, tokens, payload, serverKey);
}

async function sendFcmV1ToTokens(req, userId, tokens, payload, { auth, projectId }) {
  if (!fcmLogged) {
    fcmLogged = true;
    console.log('[NativePush] FCM v1 listo (lock screen Android, project=%s)', projectId);
  }

  let accessToken;
  try {
    const client = await auth.getClient();
    const tok = await client.getAccessToken();
    accessToken = tok?.token || tok;
  } catch (err) {
    console.warn('[NativePush] FCM v1 token OAuth falló:', err?.message || err);
    return { sent: 0, failed: tokens.length };
  }
  if (!accessToken) return { sent: 0, failed: tokens.length };

  const data = stringData(payload.data);
  const url = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`;
  let sent = 0;
  let failed = 0;

  for (const doc of tokens) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            token: doc.token,
            notification: {
              title: payload.title || 'Vertial',
              body: payload.body || '',
            },
            data: {
              ...data,
              route: data.route || '/saas/alerts',
            },
            android: {
              priority: 'HIGH',
              collapseKey: String(payload.collapseId || data.notificationId || 'vertial').slice(0, 64),
              notification: {
                channelId: 'vertial_alerts',
                sound: 'default',
                defaultVibrateTimings: true,
                visibility: 'PUBLIC',
              },
            },
          },
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.name) {
        sent += 1;
      } else {
        failed += 1;
        const errCode = body.error?.details?.[0]?.errorCode
          || body.error?.status
          || '';
        if (
          String(errCode).includes('UNREGISTERED')
          || String(errCode).includes('NOT_FOUND')
          || String(body.error?.message || '').includes('Requested entity was not found')
        ) {
          await deleteNativeToken(req, userId, doc.platform, doc.token).catch(() => {});
        }
      }
    } catch {
      failed += 1;
    }
  }

  return { sent, failed };
}

/** @deprecated Legacy HTTP; solo si FIREBASE_SERVER_KEY está definida. */
async function sendFcmLegacyToTokens(req, userId, tokens, payload, serverKey) {
  if (!fcmLogged) {
    fcmLogged = true;
    console.log('[NativePush] FCM legacy listo (lock screen Android)');
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
          notification: {
            title: payload.title || 'Vertial',
            body: payload.body || '',
            sound: 'default',
            visibility: 'public',
            android_channel_id: 'vertial_alerts',
          },
          data: {
            ...data,
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
