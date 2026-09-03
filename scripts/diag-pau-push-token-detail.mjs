/**
 * Solo lectura — detalle token Pau + createdAt vs updatedAt.
 */
const COUCH = process.env.COUCHDB_URL || 'http://127.0.0.1:5984';
const AUTH =
  'Basic ' +
  Buffer.from(
    `${process.env.COUCHDB_USER || 'vertialadmin'}:${process.env.COUCHDB_PASSWORD || 'uriel12345'}`,
  ).toString('base64');
const TOKEN_ID = 'native:13e49ef6-183a-4afa-a17b-7730917fe685:ios:4ddc9ba539e46d11';
const PAU = '13e49ef6-183a-4afa-a17b-7730917fe685';

async function couch(path) {
  const res = await fetch(`${COUCH}${path}`, {
    headers: { Authorization: AUTH, Accept: 'application/json' },
  });
  return res.json();
}

const token = await couch(`/push_subscriptions/${encodeURIComponent(TOKEN_ID)}`);
const all = await couch('/push_subscriptions/_all_docs?include_docs=true');
const pauAll = (all.rows || [])
  .map((r) => r.doc)
  .filter(Boolean)
  .filter((d) => String(d.userId || d.user_id || '').includes(PAU) || String(d._id || '').includes(PAU))
  .map((d) => ({
    id: d._id,
    type: d.type,
    platform: d.platform,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    lastSeenAt: d.lastSeenAt,
    deletedAt: d.deletedAt || null,
  }));

// web push?
const web = pauAll.filter((d) => /web|subscription/i.test(String(d.type || d.id)));

console.log(JSON.stringify({ tokenDoc: {
  id: token._id,
  type: token.type,
  platform: token.platform,
  userId: token.userId,
  createdAt: token.createdAt,
  updatedAt: token.updatedAt,
  lastSeenAt: token.lastSeenAt,
  lastSuccessAt: token.lastSuccessAt,
  lastErrorAt: token.lastErrorAt,
  lastError: token.lastError,
  enabled: token.enabled,
}, pauAll, webCount: web.length }, null, 2));
