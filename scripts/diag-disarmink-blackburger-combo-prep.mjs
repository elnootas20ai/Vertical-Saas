#!/usr/bin/env node
/**
 * Solo lectura: Individual pizza + burgers/complementos/bebidas DISARMINK para Combo Blackburger.
 */
const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const DISARMINK = 'ed846f31-aee7-4568-ac03-fa25ff3ad773';

function fold(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}
function bid(d) {
  return String(d.business_id || d.businessId || '')
    .replace(/^business:/, '')
    .trim();
}
function priceOf(d) {
  const n = Number(d.unitPrice ?? d.price ?? 0);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

const all = await (
  await fetch(`${COUCH}/bbddsaas-catalog/_all_docs?include_docs=true&limit=80000`, {
    headers: { Authorization: AUTH, Accept: 'application/json' },
  })
).json();
const docs = (all.rows || []).map((r) => r.doc).filter((d) => d?.type === 'catalog_item' && bid(d) === DISARMINK && !d.deletedAt && d.active !== false);

const brands = (all.rows || [])
  .map((r) => r.doc)
  .filter((d) => d?.type === 'brand' && bid(d) === DISARMINK && !d.deletedAt);
console.log('brands', brands.map((b) => ({ id: b._id, name: b.name })));

const combos = docs.filter((d) => d.itemType === 'combo');
for (const c of combos) {
  console.log('\nCOMBO', c.name, c._id, 'price', priceOf(c), 'brands', c.brandIds);
  console.log('  structure', JSON.stringify(c.customFields?.comboStructure || []));
  console.log('  allow main', (c.customFields?.comboSlotAllowlists?.main || []).length);
  console.log('  allow side', (c.customFields?.comboSlotAllowlists?.side || []).length);
  console.log('  allow drink', (c.customFields?.comboSlotAllowlists?.drink || []).length);
  console.log('  surcharges side', JSON.stringify(c.customFields?.comboSlotSurcharges?.side || {}));
  console.log('  surcharges drink', JSON.stringify(c.customFields?.comboSlotSurcharges?.drink || {}));
}

const burgers = docs.filter((d) => d.itemType !== 'combo' && /burger|hamburg/.test(fold(d.category + ' ' + d.name)));
console.log('\nBURGERS', burgers.length);
for (const b of burgers.sort((a, b) => fold(a.name).localeCompare(fold(b.name)))) {
  console.log(`  ${b.name} | ${b.category} | ${priceOf(b)}€ | brands=${JSON.stringify(b.brandIds || [])} | ${b._id}`);
}

const sides = docs.filter((d) => d.itemType !== 'combo' && /complemento|patata|tequen|nugget|alita|chicken|salchipapa/.test(fold(d.category + ' ' + d.name)));
console.log('\nSIDES', sides.length);
for (const s of sides.sort((a, b) => fold(a.name).localeCompare(fold(b.name)))) {
  console.log(`  ${s.name} | ${s.category} | ${priceOf(s)}€ | ${s._id}`);
}

const drinks = docs.filter((d) => {
  if (d.itemType === 'combo') return false;
  const c = fold(d.category);
  const n = fold(d.name);
  return /bebida|refresco|cerveza/.test(c) || /coca|fanta|nestea|aquarius|^agua|cerveza|mahou|estrella|moretti|peroni|amstel|desperados|voll|moritz|cerdos|nina|barbuda/.test(n);
});
console.log('\nDRINKS refrescos+cervezas', drinks.length);
for (const d of drinks.sort((a, b) => fold(a.category).localeCompare(fold(b.category)) || fold(a.name).localeCompare(fold(b.name)))) {
  console.log(`  ${d.name} | ${d.category} | ${priceOf(d)}€ | type=${d.itemType} | ${d._id}`);
}

const existingBb = combos.filter((c) => /black|burger/.test(fold(c.name)));
console.log('\nExisting blackburger-named combos', existingBb.map((c) => c.name));
