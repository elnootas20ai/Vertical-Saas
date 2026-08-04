#!/usr/bin/env node
/** Solo lectura: qué hay de Tacos en catálogo DISARMINK (Tiana/Badalona). */
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

async function allDocs() {
  const res = await fetch(`${COUCH}/bbddsaas-catalog/_all_docs?include_docs=true`, {
    headers: { Authorization: AUTH, Accept: 'application/json' },
  });
  const data = await res.json();
  return (data.rows || []).map((r) => r.doc).filter(Boolean);
}

const docs = await allDocs();
const ours = docs.filter((d) => bid(d) === DISARMINK && !d.deletedAt);
const tacoish = ours.filter((d) => {
  const n = fold(d.name);
  const c = fold(d.category);
  return n.includes('taco') || c === 'tacos' || c.includes('taco');
});

const byCat = new Map();
for (const d of ours) {
  const c = String(d.category || '(sin)').trim() || '(sin)';
  byCat.set(c, (byCat.get(c) || 0) + 1);
}
const cats = [...byCat.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es'));

console.log('=== Categorías (conteo items activos) ===');
for (const [c, n] of cats) {
  if (fold(c).includes('taco') || fold(c) === 'tacos') console.log('*', c, n);
  else if (/taco/i.test(c)) console.log('*', c, n);
}

console.log('\n=== Docs con taco en nombre/categoría ===');
for (const d of tacoish.sort((a, b) => String(a.name).localeCompare(String(b.name), 'es'))) {
  console.log(
    JSON.stringify({
      id: d._id,
      name: d.name,
      category: d.category,
      itemType: d.itemType,
      active: d.active,
      type: d.type,
      brandIds: d.brandIds || d.brandId || null,
      pointOfSaleIds: d.pointOfSaleIds || d.allowedPointOfSaleIds || null,
    }),
  );
}
console.log('total tacoish', tacoish.length);
