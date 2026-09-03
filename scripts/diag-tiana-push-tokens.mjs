/**
 * Solo lectura — tokens nativos Pau + notif cierre Tiana.
 */
const COUCH = process.env.COUCHDB_URL || 'http://127.0.0.1:5984';
const AUTH =
  'Basic ' +
  Buffer.from(
    `${process.env.COUCHDB_USER || 'vertialadmin'}:${process.env.COUCHDB_PASSWORD || 'uriel12345'}`,
  ).toString('base64');
const PAU = '13e49ef6-183a-4afa-a17b-7730917fe685';
const NOTIF_ID =
  'notification:positive:ceo-close-digest:tpvreg-43c5fa0f-2635-4b3f-9fa3-bf00b3552307:13e49ef6-183a-4afa-a17b-7730917fe685';

async function couch(path) {
  const res = await fetch(`${COUCH}${path}`, {
    headers: { Authorization: AUTH, Accept: 'application/json' },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path}: ${data.reason || data.error || res.status}`);
  return data;
}

const notif = await couch(`/notifications/${encodeURIComponent(NOTIF_ID)}`);
const pushDb = await couch('/push_subscriptions/_all_docs?include_docs=true');
const tokens = (pushDb.rows || [])
  .map((r) => r.doc)
  .filter(Boolean)
  .filter((d) => String(d.userId || d.user_id || '') === PAU)
  .map((d) => ({
    id: d._id,
    type: d.type,
    platform: d.platform,
    updatedAt: d.updatedAt || d.createdAt,
    tokenTail: String(d.token || d.deviceToken || '').slice(-12),
    tokenLen: String(d.token || d.deviceToken || '').length,
    enabled: d.enabled !== false && !d.disabled,
  }));

console.log(
  JSON.stringify(
    {
      notif: {
        id: notif._id,
        title: notif.title,
        createdAt: notif.createdAt,
        user: notif.user_id || notif.userId,
        category: notif.category,
        messageLines: String(notif.message || '').split('\n').slice(0, 14),
      },
      pauNativeTokens: tokens,
      tokenCount: tokens.length,
    },
    null,
    2,
  ),
);
