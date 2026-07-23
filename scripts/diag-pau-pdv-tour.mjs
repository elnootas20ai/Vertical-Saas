#!/usr/bin/env node
/**
 * Solo lectura: por qué el tour de Pau puede marcar «sin PDV».
 * Uso VPS: node scripts/diag-pau-pdv-tour.mjs
 */
import '../config/env.js';

const COUCH = process.env.COUCHDB_URL || 'http://127.0.0.1:5984';
const AUTH =
  'Basic ' + Buffer.from(`${process.env.COUCHDB_USER}:${process.env.COUCHDB_PASSWORD}`).toString('base64');
const PAU = '13e49ef6-183a-4afa-a17b-7730917fe685';
const DISARMINK = 'ed846f31-aee7-4568-ac03-fa25ff3ad773';

async function couch(path) {
  const res = await fetch(`${COUCH}${path}`, {
    headers: { Authorization: AUTH, Accept: 'application/json' },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path}: ${res.status} ${data.error || ''} ${data.reason || ''}`);
  return data;
}

async function allDocs(db) {
  const data = await couch(`/${encodeURIComponent(db)}/_all_docs?include_docs=true&limit=50000`);
  return (data.rows || []).map((r) => r.doc).filter(Boolean);
}

function bid(doc) {
  return String(doc.business_id || doc.businessId || '')
    .replace(/^business:/, '')
    .trim();
}

const accountsDb = process.env.COUCHDB_ACCOUNTS_DB || 'accounts';
const salesDb =
  process.env.COUCHDB_SALES_POINTS_DB ||
  process.env.VITE_SALES_POINTS_DB ||
  'bbddsaas-sales-points';

console.log('ENV_DBS', {
  COUCHDB_DB: process.env.COUCHDB_DB,
  accountsDb,
  salesDb,
});

async function tryAllDocs(db) {
  try {
    return await allDocs(db);
  } catch (e) {
    console.error('DB_FAIL', db, String(e.message || e));
    return [];
  }
}

const accounts = await tryAllDocs(accountsDb);
const pau = accounts.find(
  (a) =>
    a.type === 'account' &&
    (a.user_id === PAU || /pau\.royo|pauroyo|pau@/i.test(String(a.email || ''))),
);
console.log(
  'ACCOUNT',
  pau
    ? {
        email: pau.email,
        user_id: pau.user_id,
        linkedBusinessId: pau.linkedBusinessId,
        onboardingCompleted: pau.onboardingCompleted,
        companyName: pau.companyName,
      }
    : null,
);

const businesses = accounts.filter((d) => d.type === 'business' && !d.deletedAt);
const relatedBiz = businesses.filter((b) => {
  const id = bid(b) || String(b._id || '').replace(/^business:/, '');
  const owner = String(b.owner_user_id || b.user_id || '');
  return (
    id === DISARMINK ||
    owner === PAU ||
    owner === pau?.user_id ||
    /hoypecamos|modomio|disarmink|pau/i.test(String(b.name || ''))
  );
});
console.log(
  'BUSINESSES',
  relatedBiz.map((b) => ({
    id: bid(b) || b._id,
    name: b.name,
    type: b.businessType,
    owner: b.owner_user_id || b.user_id,
  })),
);

const sales = await tryAllDocs(salesDb);
const bizIds = new Set(
  relatedBiz
    .map((b) => bid(b) || String(b._id || '').replace(/^business:/, ''))
    .filter(Boolean)
    .concat([DISARMINK, PAU]),
);

const relatedSales = sales.filter((d) => {
  if (d.deletedAt) return false;
  const b = bid(d);
  const u = String(d.user_id || '');
  return bizIds.has(b) || u === PAU || u === pau?.user_id;
});

const workCenters = relatedSales.filter(
  (d) => d.type === 'work_center' || d.centerType || d.type === 'sales_point_center',
);
const pdvs = relatedSales.filter(
  (d) =>
    d.type === 'point_of_sale' ||
    d.type === 'pdv' ||
    (!d.centerType && (d.type === 'sales_point' || d.code || d.pdvCode)),
);

console.log('SALES_DB', salesDb);
console.log(
  'WORK_CENTERS',
  workCenters.map((d) => ({
    id: d._id,
    type: d.type,
    centerType: d.centerType,
    name: d.name,
    active: d.active,
    business_id: bid(d),
    user_id: d.user_id,
  })),
);
console.log(
  'PDVS',
  pdvs.map((d) => ({
    id: d._id,
    type: d.type,
    name: d.name,
    active: d.active,
    business_id: bid(d),
    user_id: d.user_id,
    workCenterId: d.workCenterId,
  })),
);

const retailLike = relatedSales.filter(
  (d) =>
    !d.deletedAt &&
    d.active !== false &&
    (d.centerType === 'punto_de_venta' || d.centerType === 'almacen'),
);
const activePdvs = relatedSales.filter(
  (d) =>
    !d.deletedAt &&
    d.active !== false &&
    (d.type === 'point_of_sale' || d.type === 'pdv' || d.type === 'sales_point') &&
    String(d._id || '').trim(),
);

console.log('CHECKLIST_HEURISTIC', {
  hasActiveRetailStore: retailLike.length > 0,
  hasActivePdv: retailLike.length > 0 && activePdvs.length > 0,
  retailLike: retailLike.length,
  activePdvs: activePdvs.length,
});
