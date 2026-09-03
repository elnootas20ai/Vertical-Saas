/**
 * Solo lectura — ¿salió campana + push del cierre Tiana de hoy?
 */
const COUCH = process.env.COUCHDB_URL || 'http://127.0.0.1:5984';
const AUTH =
  'Basic ' +
  Buffer.from(
    `${process.env.COUCHDB_USER || 'vertialadmin'}:${process.env.COUCHDB_PASSWORD || 'uriel12345'}`,
  ).toString('base64');

const SESSION_ID = 'tpvreg-43c5fa0f-2635-4b3f-9fa3-bf00b3552307';
const DEDUP = `ceo-close-digest:${SESSION_ID}`;
const DIS = 'ed846f31-aee7-4568-ac03-fa25ff3ad773';

async function couch(path) {
  const res = await fetch(`${COUCH}${path}`, {
    headers: { Authorization: AUTH, Accept: 'application/json' },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path}: ${data.reason || data.error || res.status}`);
  return data;
}

function money(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

const session = await couch(`/bbddsaas-delivery/${encodeURIComponent(SESSION_ID)}`);
const biz = await couch(`/businesses/${encodeURIComponent(DIS)}`).catch(() => null);

const ownerId = String(biz?.owner_user_id || '').trim();
const adminIds = (biz?.members || [])
  .filter((m) => {
    const r = String(m.role || '').toLowerCase();
    return r === 'admin' || r === 'administrador' || r === 'owner';
  })
  .map((m) => String(m.user_id || '').trim())
  .filter(Boolean);

const expectedRecipients = [...new Set([ownerId, ...adminIds].filter(Boolean))];

const notifPrefix = `notification:positive:${DEDUP}:`;
const allNotifs = await couch('/notifications/_all_docs?include_docs=true');
const related = (allNotifs.rows || [])
  .map((r) => r.doc)
  .filter(Boolean)
  .filter((d) => {
    const id = String(d._id || '');
    if (id.startsWith(notifPrefix)) return true;
    if (String(d.dedupKey || '') === DEDUP) return true;
    if (String(d.metadata?.sessionId || '') === SESSION_ID) return true;
    const msg = String(d.message || d.body || '');
    const title = String(d.title || '');
    const created = String(d.createdAt || d.created_at || '');
    const isToday =
      created.startsWith('2026-09-03') || created.includes('2026-09-03');
    if (
      isToday &&
      (/TIANA/i.test(title) || /TIANA/i.test(msg) || /Cierre OK · TIANA/i.test(title))
    ) {
      return true;
    }
    return false;
  });

// Also scan by id pattern via all_docs keys
const byId = (allNotifs.rows || [])
  .map((r) => r.doc)
  .filter(Boolean)
  .filter((d) => String(d._id || '').includes(SESSION_ID) || String(d._id || '').includes(DEDUP));

const merged = new Map();
for (const d of [...related, ...byId]) merged.set(d._id, d);

// Push subscriptions for recipients
const pushDbCandidates = ['push_subscriptions', 'push-subscriptions', 'bbddsaas-push', 'accounts'];
const pushInfo = {};
for (const uid of expectedRecipients) {
  pushInfo[uid] = { checked: [] };
}

// Try find push endpoints in accounts or dedicated docs
let pushDocs = [];
try {
  const acc = await couch('/accounts/_all_docs?include_docs=true');
  pushDocs = (acc.rows || [])
    .map((r) => r.doc)
    .filter(Boolean)
    .filter((d) => {
      const uid = String(d.user_id || d.userId || d._id || '').replace(/^account:/, '');
      return expectedRecipients.includes(uid) || expectedRecipients.some((id) => String(d._id).includes(id));
    })
    .map((d) => ({
      id: d._id,
      user: d.user_id || d.userId,
      push: d.pushSubscriptions || d.push_subscriptions || d.deviceTokens || d.fcmTokens || null,
      hasExpo: Boolean(d.expoPushToken || d.expo_push_token),
      expo: d.expoPushToken || d.expo_push_token || null,
    }));
} catch (e) {
  pushDocs = [{ error: String(e.message || e) }];
}

// Also look for notification docs created near close time with ceo_daily_digest
const closeAt = new Date(session.closedAt).getTime();
const nearClose = (allNotifs.rows || [])
  .map((r) => r.doc)
  .filter(Boolean)
  .filter((d) => {
    const cat = String(d.category || d.metadata?.ruleId || '');
    if (cat !== 'ceo_daily_digest') return false;
    const t = new Date(d.createdAt || d.created_at || 0).getTime();
    if (!t) return false;
    return Math.abs(t - closeAt) < 10 * 60 * 1000; // ±10 min
  })
  .map((d) => ({
    id: d._id,
    user: d.user_id || d.userId,
    title: d.title,
    messagePreview: String(d.message || '').slice(0, 220),
    createdAt: d.createdAt || d.created_at,
    dedupKey: d.dedupKey,
    route: d.route,
    read: d.read || d.readAt || null,
    pushSent: d.pushSent ?? d.metadata?.pushSent ?? null,
  }));

console.log(
  JSON.stringify(
    {
      mode: 'READ_ONLY',
      session: {
        id: SESSION_ID,
        status: session.status,
        closedAt: session.closedAt,
        difference: money(session.difference),
        name: session.pointOfSaleName || session.salesPointName,
      },
      expectedTitle:
        Math.abs(money(session.difference)) >= 0.01
          ? 'Cierre con descuadre · TIANA'
          : 'Cierre OK · TIANA',
      expectedDedup: DEDUP,
      business: biz ? { id: DIS, name: biz.name, ownerId } : null,
      expectedRecipients,
      notifsForSession: [...merged.values()].map((d) => ({
        id: d._id,
        user: d.user_id || d.userId,
        title: d.title,
        category: d.category,
        createdAt: d.createdAt || d.created_at,
        dedupKey: d.dedupKey,
        messagePreview: String(d.message || '').slice(0, 280),
      })),
      nearCloseCeoDigests: nearClose,
      accountPushHints: pushDocs,
    },
    null,
    2,
  ),
);
