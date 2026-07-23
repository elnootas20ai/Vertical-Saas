#!/usr/bin/env node
/**
 * Solo lectura amplia: tiendas/PDV de Pau en prod.
 */
import '../config/env.js';

const COUCH = process.env.COUCHDB_URL || 'http://127.0.0.1:5984';
const AUTH =
  'Basic ' + Buffer.from(`${process.env.COUCHDB_USER}:${process.env.COUCHDB_PASSWORD}`).toString('base64');
const PAU = '13e49ef6-183a-4afa-a17b-7730917fe685';
const DISARMINK = 'ed846f31-aee7-4568-ac03-fa25ff3ad773';

async function allDocs(db) {
  const res = await fetch(`${COUCH}/${encodeURIComponent(db)}/_all_docs?include_docs=true&limit=50000`, {
    headers: { Authorization: AUTH, Accept: 'application/json' },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`${db}: ${res.status}`);
  return (data.rows || []).map((r) => r.doc).filter(Boolean);
}

function bid(doc) {
  return String(doc.business_id || doc.businessId || '')
    .replace(/^business:/, '')
    .trim();
}

const accounts = await allDocs('accounts');
const pau = accounts.find((a) => a.type === 'account' && a.user_id === PAU);
const allBiz = accounts.filter((d) => String(d.type || '').includes('business') || d.businessType);
console.log(
  'BIZ_TYPES_SAMPLE',
  [...new Set(accounts.map((d) => d.type))].slice(0, 40),
);
console.log(
  'BUSINESSES_ANY',
  accounts
    .filter((d) => d.type === 'business' || d.type === 'Business' || d.business_id)
    .filter((d) => {
      const id = bid(d) || String(d._id || '').replace(/^business:/, '');
      const owner = String(d.owner_user_id || d.user_id || d.ownerId || '');
      return (
        id === DISARMINK ||
        owner === PAU ||
        /hoypecamos|modomio|disarmink/i.test(`${d.name || ''} ${d.companyName || ''}`)
      );
    })
    .map((d) => ({
      _id: d._id,
      type: d.type,
      id: bid(d),
      name: d.name,
      businessType: d.businessType,
      owner: d.owner_user_id || d.user_id,
      deletedAt: d.deletedAt,
    })),
);

console.log('PAU_ACCOUNT', {
  email: pau?.email,
  linkedBusinessId: pau?.linkedBusinessId,
  onboardingCompleted: pau?.onboardingCompleted,
  onboardingDataKeys: pau?.onboardingData ? Object.keys(pau.onboardingData) : [],
  tour: pau?.onboardingData?.tour || pau?.tour || null,
  activation: pau?.activationChecklist || pau?.onboardingData?.activation || null,
});

const sales = await allDocs('bbddsaas-sales-points');
const hits = sales.filter((d) => {
  if (d.deletedAt) return false;
  const b = bid(d);
  const u = String(d.user_id || d.owner_user_id || '');
  const name = String(d.name || '');
  return (
    b === DISARMINK ||
    u === PAU ||
    /hoypecamos|modomio|badalona|tiana|disarmink|pau/i.test(name)
  );
});

console.log('SALES_HITS', hits.length);
console.log(
  hits.slice(0, 50).map((d) => ({
    id: d._id,
    type: d.type,
    centerType: d.centerType,
    name: d.name,
    active: d.active,
    business_id: bid(d),
    user_id: d.user_id,
    workCenterId: d.workCenterId,
  })),
);

// Contar por business_id top
const byBiz = new Map();
for (const d of sales) {
  if (d.deletedAt) continue;
  const b = bid(d) || '_none';
  byBiz.set(b, (byBiz.get(b) || 0) + 1);
}
console.log(
  'TOP_BUSINESS_IDS',
  [...byBiz.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15),
);
