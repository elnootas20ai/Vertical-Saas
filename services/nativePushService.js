/**
 * Envío de push nativo (APNs) para iOS/Android.
 * Tokens en CouchDB `push_subscriptions` con type `native_push_token`.
 */
import crypto from 'node:crypto';
import apn from '@parse/node-apn';
import { couchRequest, getCouchConfig } from './couchdb.js';

const PUSH_DB = 'push_subscriptions';

let apnProvider = null;

function hashToken(token) {
  return crypto.createHash('sha1').update(String(token)).digest('hex').slice(0, 16);
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

  console.log('[NativePush] APNs provider listo (production=%s)', process.env.APNS_PRODUCTION === 'true');
  return apnProvider;
}

export function isNativePushConfigured() {
  return Boolean(getApnProvider());
}

/**
 * Guarda token nativo de un dispositivo.
 * @param {object|null} req
 * @param {string} userId
 * @param {{ platform: string; token: string; bundleId?: string }} device
 */
export async function saveNativeToken(req, userId, device) {
  const { platform, token, bundleId } = device || {};
  if (!userId || !platform || !token) return;

  await ensurePushDB(req);
  const hash = hashToken(token);
  const id = `native:${userId}:${platform}:${hash}`;

  let rev;
  try {
    const existing = await couchRequest(req, `/${PUSH_DB}/${encodeURIComponent(id)}`);
    rev = existing._rev;
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
    createdAt: rev ? undefined : now,
    updatedAt: now,
  };
  if (!doc.createdAt) delete doc.createdAt;

  await couchRequest(req, `/${PUSH_DB}/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(doc),
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Elimina token nativo (logout o token inválido).
 */
export async function deleteNativeToken(req, userId, platform, token) {
  if (!userId || !platform || !token) return;
  const id = `native:${userId}:${platform}:${hashToken(token)}`;
  try {
    const existing = await couchRequest(req, `/${PUSH_DB}/${encodeURIComponent(id)}`);
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
    const result = await couchRequest(req, `/${PUSH_DB}/_find`, {
      method: 'POST',
      body: JSON.stringify({ selector, limit: 20 }),
      headers: { 'Content-Type': 'application/json' },
    });
    return (result.docs || []).filter((d) => d.token);
  } catch {
    return [];
  }
}

/**
 * Envía push APNs a dispositivos iOS del usuario.
 */
export async function sendNativePushToUser(req, userId, payload) {
  const provider = getApnProvider();
  if (!provider) return { sent: 0, failed: 0 };

  const tokens = await getNativeTokensForUser(req, userId, 'ios');
  if (tokens.length === 0) return { sent: 0, failed: 0 };

  const note = new apn.Notification();
  note.topic = process.env.APNS_BUNDLE_ID || tokens[0]?.bundleId || 'com.vertial.app';
  note.alert = { title: payload.title || 'Vertial', body: payload.body || '' };
  note.sound = 'default';
  note.payload = payload.data || {};
  note.badge = payload.badge ?? undefined;

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

  if (failed > 0) {
    console.warn(`[NativePush] ${failed}/${tokens.length} envíos fallaron para userId=${userId}`);
  }

  return { sent, failed };
}
