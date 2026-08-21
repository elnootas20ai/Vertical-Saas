#!/usr/bin/env node
/**
 * Solo lectura: diagnostica acceso portal afiliado por email.
 *   node scripts/diag-affiliate-portal-login.mjs --email=x@y.com
 */
import dotenv from 'dotenv';

dotenv.config();

const emailArg = process.argv.find((a) => a.startsWith('--email='));
const email = String(emailArg?.slice('--email='.length) || process.argv[2] || '')
  .trim()
  .toLowerCase();
if (!email) {
  console.error('Uso: node scripts/diag-affiliate-portal-login.mjs --email=alguien@mail.com');
  process.exit(1);
}

const COUCH = process.env.COUCHDB_URL || 'http://127.0.0.1:5984';
const user = process.env.COUCHDB_USER;
const pass = process.env.COUCHDB_PASSWORD;
if (!user || !pass) {
  console.error('Faltan COUCHDB_USER / COUCHDB_PASSWORD');
  process.exit(1);
}
const auth = `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;

async function allDocs(db) {
  const res = await fetch(`${COUCH}/${db}/_all_docs?include_docs=true`, {
    headers: { Authorization: auth },
  });
  if (!res.ok) throw new Error(`${db} ${res.status}`);
  const data = await res.json();
  return (data.rows || []).map((r) => r.doc).filter(Boolean);
}

const [accounts, affiliates] = await Promise.all([
  allDocs('accounts'),
  allDocs('affiliates'),
]);

const account = accounts.find(
  (a) => !a.deletedAt && String(a.email || '').trim().toLowerCase() === email,
);
const affByEmail = affiliates.filter(
  (d) =>
    d.type === 'affiliate'
    && String(d.email || '').trim().toLowerCase() === email,
);

console.log('=== ACCOUNT ===');
if (!account) {
  console.log('NO hay cuenta Vertial con ese email');
} else {
  console.log(
    JSON.stringify(
      {
        user_id: account.user_id,
        email: account.email,
        accountType: account.accountType,
        role: account.role,
        status: account.status,
        hasPasswordHash: Boolean(account.passwordHash),
        invitedBy: account.invitedBy || null,
        linkedBusinessId: account.linkedBusinessId || null,
        affiliateId: account.affiliateId || null,
        affiliateCode: account.affiliateCode || null,
        lockUntil: account.lockUntil || null,
        emailVerified: account.emailVerified,
      },
      null,
      2,
    ),
  );
}

console.log('\n=== AFFILIATES (mismo email, todos) ===');
for (const d of affByEmail) {
  console.log(
    JSON.stringify(
      {
        id: d._id,
        deletedAt: d.deletedAt || null,
        status: d.status,
        name: d.name,
        email: d.email,
        affiliateCode: d.affiliateCode,
        referralCode: d.referralCode,
        linkedAccountUserId: d.linkedAccountUserId || null,
        portalAccessMode: d.portalAccessMode || null,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
      },
      null,
      2,
    ),
  );
}

const live = affByEmail.filter((d) => !d.deletedAt);
const accepted = live.find((d) => d.status === 'accepted');
console.log('\n=== PORTAL LOGIN CHECK ===');
console.log(
  JSON.stringify(
    {
      hasAccount: Boolean(account),
      hasPassword: Boolean(account?.passwordHash),
      liveAffiliates: live.length,
      acceptedAffiliate: accepted
        ? { id: accepted._id, code: accepted.affiliateCode, status: accepted.status }
        : null,
      wouldBlockReason: !account
        ? 'no_account'
        : !account.passwordHash
          ? 'no_password'
          : !accepted
            ? 'no_accepted_affiliate'
            : 'ok_if_password_matches',
    },
    null,
    2,
  ),
);
