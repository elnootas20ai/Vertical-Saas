#!/usr/bin/env node
/**
 * Lista afiliados (solo lectura) para localizar códigos de test/demo.
 */
import dotenv from 'dotenv';

dotenv.config();

const COUCH = process.env.COUCHDB_URL || 'http://127.0.0.1:5984';
const user = process.env.COUCHDB_USER;
const pass = process.env.COUCHDB_PASSWORD;
if (!user || !pass) {
  console.error('Faltan COUCHDB_USER / COUCHDB_PASSWORD');
  process.exit(1);
}
const auth = `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;

const res = await fetch(`${COUCH}/affiliates/_all_docs?include_docs=true`, {
  headers: { Authorization: auth },
});
if (!res.ok) {
  console.error('Couch error', res.status, await res.text());
  process.exit(1);
}
const data = await res.json();
const rows = (data.rows || [])
  .map((r) => r.doc)
  .filter((d) => d && d.type === 'affiliate' && !d.deletedAt);

const interesting = rows.filter((d) =>
  /test|apple|demo|partner/i.test(
    [d.affiliateCode, d.referralCode, d.name, d.email, d.company, d.notes, d.message].join(' '),
  ),
);

console.log(`TOTAL=${rows.length} ACCEPTED=${rows.filter((d) => d.status === 'accepted').length}`);
console.log('--- INTERESTING ---');
const list = interesting.length
  ? interesting
  : rows.filter((d) => d.status === 'accepted').slice(0, 20);
for (const d of list) {
  console.log(
    JSON.stringify({
      code: d.affiliateCode,
      ref: d.referralCode,
      status: d.status,
      name: d.name,
      email: d.email,
      kyc: d.kyc?.status || null,
      contract: Boolean(d.contractAcceptedAt),
      notes: String(d.notes || '').slice(0, 80),
    }),
  );
}
