#!/usr/bin/env node
const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const DISARMINK = 'ed846f31-aee7-4568-ac03-fa25ff3ad773';

function bid(d) {
  return String(d.business_id || d.businessId || '').replace(/^business:/, '').trim();
}
function fold(s) {
  return String(s || '').trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
}
function priceOf(d) {
  const n = Number(d.unitPrice ?? d.price ?? d.basePrice ?? 0);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

const all = await (
  await fetch(`${COUCH}/bbddsaas-catalog/_all_docs?include_docs=true&limit=80000`, {
    headers: { Authorization: AUTH, Accept: 'application/json' },
  })
).json();

const docs = (all.rows || []).map((r) => r.doc).filter((d) => d?.type === 'catalog_item' && bid(d) === DISARMINK && !d.deletedAt && d.active !== false);

const drinks = docs.filter((d) => {
  const c = fold(d.category);
  const n = fold(d.name);
  return /bebida|refresco/.test(c) || /coca|fanta|nestea|aquarius|^agua/.test(n);
});

console.log('name | price | itemType | isStockItem | wouldShowInTpvFilter');
for (const d of drinks.sort((a, b) => fold(a.name).localeCompare(fold(b.name)))) {
  const itemType = d.itemType || '(missing)';
  const passesType = itemType === 'product' || itemType === 'combo';
  console.log(`${d.name} | ${priceOf(d)}€ | itemType=${itemType} | isStock=${d.isStockItem} | typeOK=${passesType}`);
}

const missingType = drinks.filter((d) => d.itemType !== 'product' && d.itemType !== 'combo');
console.log('\nSIN itemType product/combo:', missingType.length);
for (const d of missingType) {
  console.log(`  - ${d.name} (${priceOf(d)}€) [${d._id}] itemType=${d.itemType} isStock=${d.isStockItem}`);
}
