#!/usr/bin/env node
/**
 * Enlaza el afiliado ACEPTADO de Pol (munozluis.com@…) con la cuenta trabajador (munozluis.pol@…).
 * Así puede: SaaS trabajador + panel afiliado (email/contraseña o código).
 *
 *   node scripts/fix-link-pol-affiliate-worker.mjs
 *   node scripts/fix-link-pol-affiliate-worker.mjs --apply
 */
import dotenv from 'dotenv';

dotenv.config();

const APPLY = process.argv.includes('--apply');
const WORKER_EMAIL = 'munozluis.pol@gmail.com';
const AFF_EMAIL = 'munozluis.com@gmail.com';
const ACCEPTED_ID = 'aff-3ec6a8d3-060b-417f-8445-1a12fac469df';

const COUCH = process.env.COUCHDB_URL || 'http://127.0.0.1:5984';
const user = process.env.COUCHDB_USER;
const pass = process.env.COUCHDB_PASSWORD;
if (!user || !pass) {
  console.error('Faltan COUCHDB_USER / COUCHDB_PASSWORD');
  process.exit(1);
}
const auth = `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;

async function couch(path, init = {}) {
  const res = await fetch(`${COUCH}${path}`, {
    ...init,
    headers: {
      Authorization: auth,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    throw new Error(`${init.method || 'GET'} ${path} → ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function allDocs(db) {
  const data = await couch(`/${db}/_all_docs?include_docs=true`);
  return (data.rows || []).map((r) => r.doc).filter(Boolean);
}

const [accounts, affiliates] = await Promise.all([
  allDocs('accounts'),
  allDocs('affiliates'),
]);

const account = accounts.find(
  (a) => !a.deletedAt && String(a.email || '').trim().toLowerCase() === WORKER_EMAIL,
);
const accepted = affiliates.find((d) => d._id === ACCEPTED_ID);
const rejectedOnWorker = affiliates.filter(
  (d) =>
    d.type === 'affiliate'
    && !d.deletedAt
    && String(d.email || '').trim().toLowerCase() === WORKER_EMAIL
    && d.status === 'rejected',
);

console.log(`Modo: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
console.log('Worker:', account ? { user_id: account.user_id, email: account.email, affiliateId: account.affiliateId } : null);
console.log('Accepted aff:', accepted
  ? { id: accepted._id, status: accepted.status, email: accepted.email, code: accepted.affiliateCode, deletedAt: accepted.deletedAt }
  : null);
console.log('Rejected on worker email:', rejectedOnWorker.map((d) => d._id));

if (!account || !accepted || accepted.deletedAt || accepted.status !== 'accepted') {
  console.error('Faltan cuenta o afiliado aceptado. Abort.');
  process.exit(1);
}

const now = new Date().toISOString();
const nextAff = {
  ...accepted,
  // Conservamos el email de solicitud; el acceso va por cuenta enlazada.
  linkedAccountUserId: account.user_id,
  portalAccessMode: 'account',
  updatedAt: now,
  linkNote: `uriel: enlace afiliado↔trabajador ${WORKER_EMAIL}`,
};

const nextAccount = {
  ...account,
  affiliateId: accepted._id,
  affiliateCode: accepted.affiliateCode || account.affiliateCode || '',
  updatedAt: now,
};

console.log('\nPlan:');
console.log('  - affiliate.linkedAccountUserId →', account.user_id);
console.log('  - account.affiliateId →', accepted._id, accepted.affiliateCode);
console.log('  - soft-delete rejected on worker email:', rejectedOnWorker.length);

if (!APPLY) {
  console.log('\nSin cambios. --apply para escribir.');
  process.exit(0);
}

await couch(`/affiliates/${encodeURIComponent(accepted._id)}`, {
  method: 'PUT',
  body: JSON.stringify(nextAff),
});
console.log('  ✓ afiliado enlazado');

await couch(`/accounts/${encodeURIComponent(account._id)}`, {
  method: 'PUT',
  body: JSON.stringify(nextAccount),
});
console.log('  ✓ cuenta actualizada');

for (const doc of rejectedOnWorker) {
  await couch(`/affiliates/${encodeURIComponent(doc._id)}`, {
    method: 'PUT',
    body: JSON.stringify({
      ...doc,
      deletedAt: now,
      updatedAt: now,
      clearReason: 'uriel: limpia rechazado; afiliado activo enlazado a cuenta trabajador',
    }),
  });
  console.log('  ✓ soft-delete', doc._id);
}

console.log('\nListo. Pol entra:');
console.log('  - Trabajador: login SaaS con', WORKER_EMAIL);
console.log('  - Afiliado: /panel-afiliado con', WORKER_EMAIL, '+ contraseña  OR  código', accepted.affiliateCode);
