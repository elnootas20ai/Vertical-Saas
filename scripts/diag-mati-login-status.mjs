/**
 * Solo lectura: estado de login de mati.vertial / Matias.
 */
const COUCH = process.env.COUCH_URL || 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from(
  `${process.env.COUCHDB_USER || 'vertialadmin'}:${process.env.COUCHDB_PASSWORD || 'uriel12345'}`,
).toString('base64');

async function couch(path) {
  const res = await fetch(`${COUCH}${path}`, {
    headers: { Authorization: AUTH, Accept: 'application/json' },
  });
  const data = await res.json();
  return { status: res.status, data };
}

function pickAccount(d) {
  if (!d || d.error) return d;
  return {
    _id: d._id,
    userId: d.userId || d.user_id,
    email: d.email,
    name: d.fullName || d.name,
    accountType: d.accountType,
    emailVerified: d.emailVerified,
    blocked: d.blocked,
    disabled: d.disabled,
    deletedAt: d.deletedAt || d.deleted_at || null,
    suspendedAt: d.suspendedAt || null,
    forceFreshLogin: d.forceFreshLogin,
    mustResetPassword: d.mustResetPassword,
    passwordHashPresent: Boolean(d.passwordHash || d.password || d.password_hash),
    hasApple: Boolean(d.appleSub || d.appleUserId),
    hasGoogle: Boolean(d.googleSub || d.googleId),
    invitedBy: d.invitedBy || null,
    businessName: d.businessName || null,
    subscriptionStatus: d.subscriptionStatus || d.subscription?.status || null,
    planId: d.planId || d.subscription?.planId || null,
    lastLoginAt: d.lastLoginAt || d.last_login_at || null,
    createdAt: d.createdAt || d.created_at || null,
    loginErrorHint: d.loginBlockedReason || d.blockReason || null,
  };
}

const needles = ['mati.vertial', 'mati@', 'matias'];
const MATI_UID = 'f9e580d9-ca94-4b95-8c83-45f785a190f2';

const byId = await couch(`/accounts/account:${MATI_UID}`);
console.log('by_known_uid', JSON.stringify({ http: byId.status, ...pickAccount(byId.data) }, null, 2));

const all = await couch('/accounts/_all_docs?include_docs=true');
const hits = [];
for (const row of all.data.rows || []) {
  const d = row.doc;
  if (!d) continue;
  const blob = `${d.email || ''} ${d.fullName || ''} ${d.name || ''} ${d.userId || ''}`.toLowerCase();
  if (needles.some((n) => blob.includes(n)) || String(d.userId || '') === MATI_UID) {
    hits.push(pickAccount(d));
  }
}
console.log('hits', JSON.stringify(hits, null, 2));

// Buscar también en users si existe
const dbs = await couch('/_all_dbs');
const userDbs = (dbs.data || []).filter((n) => /account|user|auth/i.test(String(n)));
console.log('relevant_dbs', userDbs);
