#!/usr/bin/env node
/**
 * Soft-delete solicitudes de afiliado de Pol (pending/rejected/accepted opc.).
 * Por defecto dry-run. Con --apply escribe deletedAt.
 *
 *   node scripts/clear-pol-affiliate-requests.mjs
 *   node scripts/clear-pol-affiliate-requests.mjs --apply
 */
import dotenv from 'dotenv';

dotenv.config();

const APPLY = process.argv.includes('--apply');
const COUCH = process.env.COUCHDB_URL || 'http://127.0.0.1:5984';
const user = process.env.COUCHDB_USER;
const pass = process.env.COUCHDB_PASSWORD;
if (!user || !pass) {
  console.error('Faltan COUCHDB_USER / COUCHDB_PASSWORD');
  process.exit(1);
}
const auth = `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;

const POL_NEEDLES = [
  'pol',
  'munozluis.pol@gmail.com',
  'muñoz',
  'munoz',
];

function matchesPol(doc) {
  const hay = [doc.name, doc.email, doc.company, doc.phone, doc.message, doc.notes]
    .map((x) => String(x || '').toLowerCase())
    .join(' | ');
  return POL_NEEDLES.some((n) => hay.includes(n.toLowerCase()));
}

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

const data = await couch('/affiliates/_all_docs?include_docs=true');
const docs = (data.rows || [])
  .map((r) => r.doc)
  .filter((d) => d && d.type === 'affiliate' && !d.deletedAt && matchesPol(d));

console.log(`Modo: ${APPLY ? 'APPLY (soft-delete)' : 'DRY-RUN'}`);
console.log(`Encontradas ${docs.length} solicitud(es) de Pol (sin deletedAt):\n`);

if (docs.length === 0) {
  console.log('Nada que limpiar.');
  process.exit(0);
}

const now = new Date().toISOString();
for (const doc of docs) {
  console.log(
    JSON.stringify({
      id: doc._id,
      status: doc.status,
      name: doc.name,
      email: doc.email,
      company: doc.company,
      code: doc.affiliateCode,
      createdAt: doc.createdAt,
    }),
  );
  if (!APPLY) continue;
  await couch(`/affiliates/${encodeURIComponent(doc._id)}`, {
    method: 'PUT',
    body: JSON.stringify({
      ...doc,
      deletedAt: now,
      updatedAt: now,
      clearReason: 'uriel: limpia para reenviar por web',
    }),
  });
  console.log(`  → soft-deleted ${doc._id}`);
}

if (!APPLY) {
  console.log('\nSin cambios. Para aplicar: node scripts/clear-pol-affiliate-requests.mjs --apply');
} else {
  console.log(`\nListo: ${docs.length} solicitud(es) limpiadas. Pol puede volver a solicitar por la web.`);
}
