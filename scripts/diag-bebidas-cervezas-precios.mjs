#!/usr/bin/env node
/**
 * Solo lectura: precios bebidas (Cerdos Voladores, Moretti, cervezas, etc.).
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

function priceOf(d) {
  const n = Number(d.unitPrice ?? d.price ?? d.salePrice);
  return Number.isFinite(n) ? n : null;
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

const brandById = new Map();
for (const b of brands) {
  const id = String(b._id || b.id || '').trim();
  if (id) brandById.set(id, String(b.name || id));
}

const bizById = new Map();
for (const b of businesses) {
  const id = String(b.business_id || b._id || '').replace(/^business:/, '').trim();
  if (id) bizById.set(id, String(b.name || id));
}

const nameHit = (n) =>
  /cerdo|volador|morett|mahou|estrella|heineken|san miguel|amstel|coronita|corona\b|desperados|clara|cerveza|agua|coca|fanta|sprite|nestea|aquarius|red.?bull|schweppes|tonica|limonada|zum[oa]|batido|monster/.test(
    fold(n),
  );

const catHit = (c) => /bebida|refresco|cerveza|alcohol/.test(fold(c));

const rows = catalog.filter((d) => {
  if (d.deletedAt) return false;
  if (d.active === false) return false;
  if ((d.module || 'catalog') !== 'catalog') return false;
  const it = String(d.itemType || 'product');
  if (it !== 'product' && it !== 'combo') return false;
  return nameHit(d.name) || catHit(d.category);
});

// Priorizar cervezas / marcas pedidas
const focus = rows.filter((d) =>
  /cerdo|volador|morett|mahou|estrella|heineken|san miguel|amstel|corona|desperados|clara|cerveza/.test(
    fold(d.name),
  ),
);

console.log('=== Cervezas / Cerdos / Moretti / similares (activos) ===');
const sorted = focus.sort((a, b) => {
  const ba = bid(a).localeCompare(bid(b));
  if (ba) return ba;
  return String(a.name).localeCompare(String(b.name), 'es');
});

for (const d of sorted) {
  const brandsLabel = (d.brandIds || [])
    .map((id) => brandById.get(String(id)) || id)
    .join(', ');
  console.log(
    [
      bizById.get(bid(d)) || bid(d) || '(sin biz)',
      d.category || '',
      d.name,
      priceOf(d) == null ? '?' : `${priceOf(d).toFixed(2)}€`,
      brandsLabel || '(sin marca)',
      d._id,
    ].join(' | '),
  );
}

console.log(`\nTotal focus: ${sorted.length}`);

// También listar todas las bebidas de empresas Pau (hoypecamos / modomio / disarmink)
const PAU_BIZ = new Set([
  'ed846f31-aee7-4568-ac03-fa25ff3ad773',
  '33821959-ae50-4e52-bfea-ea2b145faeac',
  'd8c7f85c-a0a4-49fa-836d-f87c4dbb0790',
  '7ec4e689-f1d6-4149-86b2-bf582ebc2c0c',
]);

console.log('\n=== Bebidas Pau/Modomio/hoypecamos (categoría Bebidas/Cervezas) ===');
const pauDrinks = catalog
  .filter((d) => {
    if (d.deletedAt || d.active === false) return false;
    if (!PAU_BIZ.has(bid(d))) return false;
    if ((d.module || 'catalog') !== 'catalog') return false;
    if (String(d.itemType || 'product') !== 'product') return false;
    return catHit(d.category) || nameHit(d.name);
  })
  .sort((a, b) => {
    const c = String(a.category || '').localeCompare(String(b.category || ''), 'es');
    if (c) return c;
    return String(a.name).localeCompare(String(b.name), 'es');
  });

for (const d of pauDrinks) {
  const brandsLabel = (d.brandIds || [])
    .map((id) => brandById.get(String(id)) || id)
    .join(', ');
  console.log(
    [
      bizById.get(bid(d)) || bid(d),
      d.category || '',
      d.name,
      priceOf(d) == null ? '?' : `${priceOf(d).toFixed(2)}€`,
      brandsLabel || '-',
    ].join(' | '),
  );
}
console.log(`Total bebidas Pau scope: ${pauDrinks.length}`);
