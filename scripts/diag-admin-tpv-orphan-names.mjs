/**
 * Solo lectura: buscar centros/PDV huérfanos galletitas/carns en admin.
 */
import dotenv from 'dotenv';
dotenv.config();

const req = { headers: {}, cookies: {} };
const couch = await import('../services/couchdb.js');
const account = await couch.findAccountByEmail(req, 'uriel@admin.com');
const userId = account.user_id;
const wcDb = couch.getWorkCentersDbName();
await couch.ensureDatabase(req, wcDb);
const wcs = await couch.getAllDocuments(req, wcDb);
const re = /gallet|oreo|carns|guille/i;

console.log('--- name search ---');
for (const h of wcs.filter((d) => d?.type === 'sales_point' && !d?.deletedAt && re.test(JSON.stringify(d)))) {
  console.log('WC', {
    id: h._id,
    name: h.name,
    type: h.centerType,
    biz: h.businessId || h.business_id,
    user: h.user_id,
  });
}

const pdvs = await couch.listPointsOfSaleByUser(req, userId);
for (const p of pdvs.filter((x) => re.test(JSON.stringify(x)))) {
  console.log('PDV', {
    id: p._id,
    name: p.name,
    wc: p.workCenterId,
    code: p.terminalCode || p.code,
    biz: p.businessId || p.business_id,
  });
}

const allUserWc = wcs.filter(
  (d) => d?.type === 'sales_point' && !d?.deletedAt && String(d.user_id || '') === userId,
);
console.log(
  'All WC for admin:',
  allUserWc.map((h) => ({ name: h.name, type: h.centerType, biz: h.businessId || h.business_id })),
);
