/**
 * Limita la promo «Pizzas básicas 11€ L-J» a BADALONA (quita Tiana).
 * Solo lectura por defecto. Con --apply escribe en Couch.
 *
 * Remoto:
 *   node scripts/remote-run-script.mjs fix-promo-11-badalona-only.mjs
 *   node scripts/remote-run-script.mjs fix-promo-11-badalona-only.mjs -- --apply
 */
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
dotenv.config({ path: path.join(root, '.env.development') });
dotenv.config({ path: path.join(root, '.env') });

const APPLY = process.argv.includes('--apply');

const PROMO_ID = 'promo-pizzas-basicas-11-lj';
const BADALONA_PDV_ID = 'wc-16361270-5794-4b95-89e5-644685f36e24';
const TIANA_PDV_ID = 'wc-ffdee346-8730-4aeb-961d-24832f17f1c1';

const req = {
  couchUser: process.env.COUCHDB_USER,
  couchPass: process.env.COUCHDB_PASSWORD,
  couchUrl: process.env.COUCHDB_URL || process.env.COUCHDB_HOST,
};

const { getCatalogDbName, getDocument, putDocument } = await import('../services/couchdb.js');

const db = getCatalogDbName();
const doc = await getDocument(req, db, PROMO_ID);
if (!doc || doc.type !== 'promotion') {
  console.error('No existe la promo', PROMO_ID);
  process.exit(1);
}

const before = {
  name: doc.name,
  status: doc.status,
  salesPointIds: doc.salesPointIds || [],
  fixedUnitPrice: doc.fixedUnitPrice,
  weekdays: doc.weekdays,
};
console.log('Antes:', JSON.stringify(before, null, 2));
console.log(`Objetivo: solo BADALONA (${BADALONA_PDV_ID}); excluye Tiana (${TIANA_PDV_ID})`);

if (!APPLY) {
  console.log('\nDry-run. Para aplicar: añade --apply');
  process.exit(0);
}

const next = {
  ...doc,
  salesPointIds: [BADALONA_PDV_ID],
  updatedAt: new Date().toISOString(),
};
const saved = await putDocument(req, db, PROMO_ID, next);
console.log('OK aplicado. rev=', saved.rev);
console.log('Después salesPointIds:', next.salesPointIds);
