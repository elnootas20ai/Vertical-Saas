#!/usr/bin/env node
/**
 * Solo lectura: por qué Coca-Cola 2L puede no salir en TPV.
 */
const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const DISARMINK = 'ed846f31-aee7-4568-ac03-fa25ff3ad773';
const PAU = '13e49ef6-183a-4afa-a17b-7730917fe685';
const ID_2L = 'catitem-ad978a8e-7ee8-4599-98e4-32cf2e83b6ec';
const ID_COCA = 'catitem-895dfa3b-40b0-438a-89c7-90ba95f2e77c';

async function couch(path) {
  const res = await fetch(`${COUCH}${path}`, {
    headers: { Authorization: AUTH, Accept: 'application/json' },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path}: ${data.error || res.status}`);
  return data;
}

function bid(d) {
  return String(d.business_id || d.businessId || '')
    .replace(/^business:/, '')
    .trim();
}

function fold(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

function dump(d, label) {
  console.log(`\n=== ${label} ===`);
  console.log(
    JSON.stringify(
      {
        _id: d._id,
        name: d.name,
        type: d.type,
        itemType: d.itemType,
        category: d.category,
        module: d.module,
        stockCategory: d.stockCategory,
        isStockItem: d.isStockItem,
        active: d.active,
        available: d.available,
        deletedAt: d.deletedAt || null,
        business_id: d.business_id || d.businessId || null,
        user_id: d.user_id || null,
        brandIds: d.brandIds || null,
        brandId: d.brandId || d.brand_id || null,
        vertical: d.vertical || null,
        unitPrice: d.unitPrice ?? d.price,
        salesPointIds: d.salesPointIds || null,
        customFields: d.customFields || null,
        keys: Object.keys(d).sort(),
      },
      null,
      2,
    ),
  );
}

const coca = await couch(`/bbddsaas-catalog/${encodeURIComponent(ID_COCA)}`);
const coca2l = await couch(`/bbddsaas-catalog/${encodeURIComponent(ID_2L)}`);
dump(coca, 'Coca-Cola (sí se ve)');
dump(coca2l, 'Coca-Cola 2L (no se ve)');

// Simulate API view=tpv filter (same as deliveryController)
function passesTpv(doc) {
  if (doc.deletedAt) return false;
  if (doc.active === false) return false;
  const mod = String(doc.module || 'catalog').trim() || 'catalog';
  if (mod === 'stock') return false;
  if (mod !== 'catalog') return false;
  if (!(doc.itemType === 'product' || doc.itemType === 'combo')) return false;
  return true;
}

console.log('\n=== filter view=tpv ===');
console.log('Coca passes', passesTpv(coca));
console.log('2L passes', passesTpv(coca2l));

// All live drinks named coca / refrescos category for disarmink
const all = await couch('/bbddsaas-catalog/_all_docs?include_docs=true&limit=80000');
const docs = (all.rows || []).map((r) => r.doc).filter((d) => d?.type === 'catalog_item' && bid(d) === DISARMINK);
const live = docs.filter((d) => !d.deletedAt && d.active !== false);
const refrescos = live.filter((d) => fold(d.category) === 'refrescos' || /2\s*l|\b2l\b/.test(fold(d.name)));
console.log('\n=== categoría Refrescos o nombre 2L (vivos) ===');
for (const d of refrescos.sort((a, b) => fold(a.name).localeCompare(fold(b.name)))) {
  console.log({
    name: d.name,
    cat: d.category,
    itemType: d.itemType,
    tpv: passesTpv(d),
    brandIds: d.brandIds || [],
    user_id: d.user_id,
    id: d._id,
  });
}

// Brands for DISARMINK
const brands = docs.length
  ? (await couch('/bbddsaas-catalog/_all_docs?include_docs=true&limit=80000')).rows
      .map((r) => r.doc)
      .filter((d) => d?.type === 'brand' && bid(d) === DISARMINK && !d.deletedAt)
  : [];
// brands may be in same DB
const brandDocs = (all.rows || [])
  .map((r) => r.doc)
  .filter((d) => d?.type === 'brand' && bid(d) === DISARMINK && !d.deletedAt);
console.log('\n=== marcas DISARMINK ===');
for (const b of brandDocs) {
  console.log({
    id: b._id,
    name: b.name,
    salesPointIds: b.salesPointIds || [],
    catalogCategories: b.catalogCategories || [],
  });
}

// How many catalog items for Pau user_id vs business
const byUser = live.filter((d) => String(d.user_id || '') === PAU);
const byBiz = live.filter((d) => bid(d) === DISARMINK);
console.log('\n=== scope counts ===', {
  liveByBiz: byBiz.length,
  liveByPauUser: byUser.length,
  coca2lUser: coca2l.user_id,
  cocaUser: coca.user_id,
});
