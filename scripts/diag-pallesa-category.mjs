#!/usr/bin/env node
/**
 * Solo lectura: localizar Pallesa / Especialidad (Modomio y resto).
 *   node scripts/diag-pallesa-category.mjs
 */
const COUCH = process.env.COUCH || 'http://127.0.0.1:5984';
const AUTH =
  process.env.AUTH
  || ('Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64'));

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

async function allDocs(db) {
  const res = await fetch(
    `${COUCH}/${encodeURIComponent(db)}/_all_docs?include_docs=true&limit=80000`,
    { headers: { Authorization: AUTH, Accept: 'application/json' } },
  );
  const data = await res.json();
  if (data.error) throw new Error(`${db}: ${data.error} ${data.reason || ''}`);
  return (data.rows || []).map((r) => r.doc).filter(Boolean);
}

const [catalog, brands, businesses] = await Promise.all([
  allDocs('bbddsaas-catalog'),
  allDocs('bbddsaas-brands').catch(() => []),
  allDocs('businesses').catch(() => []),
]);

console.log('=== Nombre ~pallesa / palesa / paella / pall ===');
let n = 0;
for (const d of catalog) {
  const name = fold(d.name);
  if (!/pallesa|palesa|paella|\bpall\b/.test(name) && !name.includes('pallesa')) continue;
  n += 1;
  console.log({
    _id: d._id,
    name: d.name,
    category: d.category,
    bid: bid(d),
    deletedAt: d.deletedAt || null,
    active: d.active,
    brandIds: d.brandIds || [],
    module: d.module || 'catalog',
    itemType: d.itemType,
  });
}
console.log('hits', n);

console.log('\n=== category Especialidad (activos) ===');
const esp = catalog.filter((d) => /especialidad/.test(fold(d.category)) && !d.deletedAt);
console.log('count', esp.length);
for (const d of esp) {
  console.log({
    name: d.name,
    category: d.category,
    bid: bid(d),
    brandIds: d.brandIds || [],
  });
}

console.log('\n=== Marcas / negocios relevantes ===');
for (const b of brands) {
  if (/modomio|disarmink|hoy|pau|pallesa/i.test(`${b.name} ${b._id}`)) {
    console.log('brand', { id: b._id || b.id, name: b.name, biz: bid(b) });
  }
}
for (const b of businesses) {
  if (/modomio|disarmink|hoy|pau|royo|pallesa/i.test(`${b.name} ${b.business_id || b._id}`)) {
    console.log('biz', { id: String(b.business_id || b._id || '').replace(/^business:/, ''), name: b.name });
  }
}

console.log('\n=== Brand Modomio (96a8…) productos activos ===');
const BRAND_MODOMIO = 'brand-96a8d7ce-e9af-459c-b8a9-48ffc55949ec';
const brandDoc = brands.find((b) => String(b._id || b.id) === BRAND_MODOMIO);
console.log('brand doc', brandDoc ? { name: brandDoc.name, biz: bid(brandDoc) } : null);
const byCat = new Map();
for (const d of catalog) {
  if (d.deletedAt) continue;
  const brandsOf = (d.brandIds || []).map(String);
  if (!brandsOf.includes(BRAND_MODOMIO) && bid(d) !== 'ed846f31-aee7-4568-ac03-fa25ff3ad773') continue;
  if (!brandsOf.includes(BRAND_MODOMIO)) continue;
  const c = String(d.category || '(sin)');
  if (!byCat.has(c)) byCat.set(c, []);
  byCat.get(c).push(d.name);
}
for (const [c, names] of [...byCat.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  console.log(`  [${c}] (${names.length})`, names.slice(0, 12).join(', '), names.length > 12 ? '…' : '');
}
