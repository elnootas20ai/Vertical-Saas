#!/usr/bin/env node
import '../config/env.js';

const COUCH = process.env.COUCHDB_URL || 'http://127.0.0.1:5984';
const AUTH =
  'Basic ' + Buffer.from(`${process.env.COUCHDB_USER}:${process.env.COUCHDB_PASSWORD}`).toString('base64');
const PAU = '13e49ef6-183a-4afa-a17b-7730917fe685';
const DISARMINK = 'ed846f31-aee7-4568-ac03-fa25ff3ad773';
const MODOMIO = '33821959-ae50-4e52-bfea-ea2b145faeac';
const ADMIN = 'e94ccc03-5399-40a8-8e92-740bd66f38e0';

async function allDocs(db) {
  const res = await fetch(`${COUCH}/${encodeURIComponent(db)}/_all_docs?include_docs=true&limit=80000`, {
    headers: { Authorization: AUTH, Accept: 'application/json' },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`${db}: ${res.status} ${data.reason || ''}`);
  return (data.rows || []).map((r) => r.doc).filter(Boolean);
}

function bid(d) {
  return String(d.business_id || d.businessId || '')
    .replace(/^business:/, '')
    .trim();
}

const [businesses, sales, delivery, accounts] = await Promise.all([
  allDocs('businesses'),
  allDocs('bbddsaas-sales-points'),
  allDocs('bbddsaas-delivery'),
  allDocs('accounts'),
]);

const bizHits = businesses.filter((b) => {
  const id = bid(b) || String(b._id || '').replace(/^business:/, '');
  return id === DISARMINK || id === MODOMIO || /hoypecamos|modomio|disarmink|pau/i.test(String(b.name || ''));
});
console.log(
  'BUSINESSES',
  bizHits.map((b) => ({
    _id: b._id,
    name: b.name,
    type: b.businessType,
    owner: b.owner_id || b.ownerUserId || b.user_id,
    members: b.memberUserIds || b.members?.length,
  })),
);

const pauAcc = accounts.find((a) => a.user_id === PAU);
console.log('PAU', {
  email: pauAcc?.email,
  linkedBusinessId: pauAcc?.linkedBusinessId,
  onboardingCompleted: pauAcc?.onboardingCompleted,
});

const salesAll = sales.filter((d) => !d.deletedAt);
console.log(
  'SALES_BY_BIZ',
  {
    disarmink: salesAll.filter((d) => bid(d) === DISARMINK).length,
    modomio: salesAll.filter((d) => bid(d) === MODOMIO).length,
    pauUser: salesAll.filter((d) => String(d.user_id) === PAU).length,
    adminUser: salesAll.filter((d) => String(d.user_id) === ADMIN).length,
  },
);
console.log(
  'SALES_MODOMIO',
  salesAll
    .filter((d) => bid(d) === MODOMIO || String(d.user_id) === ADMIN || /badalona|tiana/i.test(String(d.name || '')))
    .map((d) => ({
      id: d._id,
      type: d.type,
      centerType: d.centerType,
      name: d.name,
      active: d.active,
      business_id: bid(d),
      user_id: d.user_id,
      workCenterId: d.workCenterId,
      tabletCode: d.tabletCode || d.code || null,
    })),
);

const deliveryPdv = delivery.filter(
  (d) =>
    !d.deletedAt &&
    (d.type === 'point_of_sale' || d.type === 'tpv_register_session' || /pdv|point/i.test(String(d.type || ''))),
);
console.log(
  'DELIVERY_PDV_OR_SESSIONS',
  deliveryPdv
    .filter(
      (d) =>
        bid(d) === DISARMINK ||
        bid(d) === MODOMIO ||
        String(d.user_id) === PAU ||
        String(d.user_id) === ADMIN ||
        /badalona|tiana|modomio|hoypecamos/i.test(String(d.name || d.pointOfSaleName || '')),
    )
    .slice(0, 40)
    .map((d) => ({
      id: d._id,
      type: d.type,
      name: d.name || d.pointOfSaleName,
      status: d.status,
      business_id: bid(d),
      user_id: d.user_id,
      pointOfSaleId: d.pointOfSaleId,
      workCenterId: d.workCenterId,
    })),
);

// setup_progress for Pau
const setup = accounts.find((d) => d._id === `setup_progress:${PAU}` || (d.type === 'setup_progress' && d.user_id === PAU));
console.log('SETUP_PROGRESS', setup);
