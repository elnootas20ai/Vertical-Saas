#!/usr/bin/env node
/**
 * Solo lectura: categorías de bebidas/cervezas/vinos en Disarmink.
 */
const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const DB = 'bbddsaas-catalog';
const DISARMINK = 'ed846f31-aee7-4568-ac03-fa25ff3ad773';

async function couch(path) {
  const res = await fetch(`${COUCH}${path}`, {
    headers: { Authorization: AUTH, Accept: 'application/json' },
  });
  return res.json();
}

function bid(d) {
  return String(d.business_id || d.businessId || '').replace(/^business:/, '').trim();
}
function fold(s) {
  return String(s || '').trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
}
function priceOf(d) {
  return Math.round(Number(d.unitPrice ?? d.price ?? 0) * 100) / 100;
}

const all = await couch(`/${DB}/_all_docs?include_docs=true&limit=80000`);
const live = (all.rows || [])
  .map((r) => r.doc)
  .filter((d) => d?.type === 'catalog_item' && bid(d) === DISARMINK && !d.deletedAt && d.active !== false);

const drinkish = live.filter((d) => {
  const n = fold(d.name);
  const c = fold(d.category);
  return (
    /bebida|refresco|cerveza|vino|aquarius|coca|fanta|nestea|agua|estrella|voll|moretti|peroni|moritz|amstel|desperado|cerdos|barbuda|lambrusco/.test(n) ||
    /bebida|refresco|cerveza|vino/.test(c)
  );
});

const byCat = new Map();
for (const d of drinkish) {
  const c = d.category || '(sin categoría)';
  if (!byCat.has(c)) byCat.set(c, []);
  byCat.get(c).push(d);
}

console.log('=== Por categoría ===');
for (const [c, items] of [...byCat.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  console.log(`\n[${c}] (${items.length})`);
  for (const d of items.sort((a, b) => fold(a.name).localeCompare(fold(b.name)))) {
    console.log(`  ${String(priceOf(d)).padStart(5)}  ${d.name}  | type=${d.itemType || '-'} module=${d.module || '-'}  ${d._id}`);
  }
}

console.log('\n=== Categorías distintas en catálogo vivo ===');
const cats = [...new Set(live.map((d) => d.category || '(sin)'))].sort();
for (const c of cats) console.log('-', c);
