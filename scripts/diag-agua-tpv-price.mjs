#!/usr/bin/env node
/**
 * Por qué TPV puede seguir viendo Agua a 1.80.
 * Solo lectura.
 */
const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const DISARMINK = 'ed846f31-aee7-4568-ac03-fa25ff3ad773';

async function allDocs(db) {
  const res = await fetch(`${COUCH}/${encodeURIComponent(db)}/_all_docs?include_docs=true&limit=80000`, {
    headers: { Authorization: AUTH, Accept: 'application/json' },
  });
  const data = await res.json();
  if (data.error) throw new Error(`${db}: ${data.error}`);
  return (data.rows || []).map((r) => r.doc).filter(Boolean);
}

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

const [catalog, brands] = await Promise.all([
  allDocs('bbddsaas-catalog'),
  allDocs('bbddsaas-brands').catch(() => []),
]);

const biz = catalog.filter((d) => d?.type === 'catalog_item' && bid(d) === DISARMINK && !d.deletedAt);
const aguas = biz.filter((d) => /\bagua\b/.test(fold(d.name)));

console.log('=== AGUAS DISARMINK ===');
for (const a of aguas) {
  console.log({
    id: a._id,
    name: a.name,
    unitPrice: a.unitPrice,
    active: a.active !== false,
    itemType: a.itemType,
    category: a.category,
    brandId: a.brandId || a.customFields?.brandId,
    isStockItem: a.customFields?.isStockItem,
    channelPrices: a.channelPrices || a.customFields?.channelPrices,
    storePrices: a.storePrices || a.customFields?.storePrices,
    rev: a._rev,
    updatedAt: a.updatedAt,
  });
}

const drinks = biz.filter((d) => fold(d.category) === 'bebidas' && d.itemType !== 'combo' && d.active !== false);
console.log('\n=== BEBIDAS activas (precios) ===');
for (const d of drinks.sort((a, b) => String(a.name).localeCompare(String(b.name), 'es'))) {
  console.log(`- ${d.name} unitPrice=${d.unitPrice} id=${d._id.slice(0, 28)}…`);
}

console.log('\n=== MARCAS ===');
for (const b of brands.filter((x) => bid(x) === DISARMINK && !x.deletedAt)) {
  console.log(`- ${b.name} id=${b._id} kind=${b.deliveryLineKind}`);
}
