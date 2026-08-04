/**
 * Solo lectura: promo pizzas 11€ L-J y PDVs Badalona/Tiana.
 * Remoto: node scripts/remote-run-script.mjs diag-promo-11-tiana.mjs
 */
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
dotenv.config({ path: path.join(root, '.env.development') });
dotenv.config({ path: path.join(root, '.env') });

const req = {
  couchUser: process.env.COUCHDB_USER,
  couchPass: process.env.COUCHDB_PASSWORD,
  couchUrl: process.env.COUCHDB_URL || process.env.COUCHDB_HOST,
};

const {
  getCatalogDbName,
  getWorkCentersDbName,
  getAllDocuments,
} = await import('../services/couchdb.js');

const catalogDb = getCatalogDbName();
const spDb = getWorkCentersDbName();
const catalog = await getAllDocuments(req, catalogDb);
const salesPoints = await getAllDocuments(req, spDb);

const promos = catalog.filter((d) => d?.type === 'promotion' && !d?.deletedAt);
const hit = promos.filter((p) => {
  const blob = `${p.name || ''} ${p.description || ''} ${p.fixedUnitPrice || ''} ${p.discountValue || ''}`;
  return (
    Number(p.fixedUnitPrice) === 11
    || Number(p.discountValue) === 11
    || /11\s*€|11 euro|lunes|jueves|l-j|pizzas b[aá]sic/i.test(blob)
    || p.promoType === 'fixed_unit_price'
  );
});

console.log(`Catalog DB: ${catalogDb} | SalesPoints DB: ${spDb}`);
console.log(`Promos totales: ${promos.length} | Candidatas 11€/fixed_unit: ${hit.length}\n`);

for (const p of hit) {
  console.log(JSON.stringify({
    id: p._id,
    name: p.name,
    status: p.status,
    promoType: p.promoType || p.typeKey,
    fixedUnitPrice: p.fixedUnitPrice,
    discountValue: p.discountValue,
    weekdays: p.weekdays,
    applyMode: p.applyMode,
    salesPointIds: p.salesPointIds || null,
    excludeSalesPointIds: p.excludeSalesPointIds || null,
    user_id: p.user_id,
    productMatch: p.productMatch,
    startDate: p.startDate,
    endDate: p.endDate,
  }, null, 2));
  console.log('---');
}

const named = salesPoints.filter(
  (d) => d
    && !d.deletedAt
    && /tiana|badalona|modomio/i.test(String(d.name || '')),
);
console.log(`\nDocs name match (any type): ${named.length}`);
for (const d of named) {
  console.log(JSON.stringify({
    id: d._id,
    type: d.type,
    name: d.name,
    active: d.active,
    business_id: d.business_id || d.businessId,
    user_id: d.user_id,
    workCenterId: d.workCenterId,
  }));
}

const pauPdvs = salesPoints.filter(
  (d) => d
    && !d.deletedAt
    && d.type === 'sales_point'
    && String(d.user_id || '') === '13e49ef6-183a-4afa-a17b-7730917fe685',
);
console.log(`\nSales points Pau (13e49…): ${pauPdvs.length}`);
for (const d of pauPdvs) {
  console.log(JSON.stringify({
    id: d._id,
    name: d.name,
    active: d.active,
    business_id: d.business_id || d.businessId,
    workCenterId: d.workCenterId,
  }));
}
