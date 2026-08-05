#!/usr/bin/env node
/**
 * DISARMINK — meter Cervezas y Vinos dentro de Bebidas (una sola pestaña TPV).
 *
 *   node scripts/fix-disarmink-cervezas-vinos-en-bebidas.mjs
 *   node scripts/fix-disarmink-cervezas-vinos-en-bebidas.mjs --apply
 */
const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const CATALOG_DB = 'bbddsaas-catalog';
const DISARMINK = 'ed846f31-aee7-4568-ac03-fa25ff3ad773';
const APPLY = process.argv.includes('--apply');
const CAT_BEBIDAS = 'Bebidas';

async function couch(method, path, body) {
  const res = await fetch(`${COUCH}${path}`, {
    method,
    headers: {
      Authorization: AUTH,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path}: ${data.error || res.status} ${data.reason || ''}`);
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

function isBeerOrWineCategory(cat) {
  const c = fold(cat);
  return c === 'cervezas' || c === 'vinos' || c === 'cerveza' || c === 'vino';
}

function isBeerName(d) {
  const n = fold(d.name);
  if (/pepperoni/.test(n)) return false;
  return /estrella|voll\s*damm|volldamm|moretti|\bperoni\b|moritz|amstel|desperados|cerdos|barbuda|mahou|cerveza/.test(
    n,
  );
}

function isWineName(d) {
  const n = fold(d.name);
  return /vino|lambrusco/.test(n);
}

function stripDrinkSplitCategories(existing) {
  const out = [];
  const seen = new Set();
  let hasBebidas = false;
  for (const c of existing || []) {
    const t = String(c || '').trim();
    if (!t) continue;
    const k = fold(t);
    if (k === 'cervezas' || k === 'vinos' || k === 'cerveza' || k === 'vino') continue;
    if (k === 'bebidas') {
      hasBebidas = true;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(CAT_BEBIDAS);
      continue;
    }
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  if (!hasBebidas) out.push(CAT_BEBIDAS);
  return out;
}

const allCat = await couch('GET', `/${CATALOG_DB}/_all_docs?include_docs=true&limit=80000`);
const rows = (allCat.rows || []).map((r) => r.doc).filter(Boolean);
const docs = rows.filter((d) => d?.type === 'catalog_item' && bid(d) === DISARMINK && !d.deletedAt);

console.log(APPLY ? '=== APPLY cervezas/vinos → Bebidas ===' : '=== DRY cervezas/vinos → Bebidas ===');

const itemUpdates = [];
for (const d of docs) {
  if ((d.module || 'catalog') === 'stock' && Number(d.unitPrice || d.price || 0) === 0) continue;
  const cur = String(d.category || '').trim();
  const shouldMove =
    isBeerOrWineCategory(cur) ||
    ((isBeerName(d) || isWineName(d)) && fold(cur) !== 'bebidas' && fold(cur) !== 'ingredientes');
  if (!shouldMove) continue;
  if (fold(cur) === 'bebidas') continue;
  itemUpdates.push({ doc: d, from: cur || '(sin)', to: CAT_BEBIDAS });
}

console.log(`\n— Productos a mover a Bebidas: ${itemUpdates.length} —`);
for (const u of itemUpdates.sort((a, b) => fold(a.doc.name).localeCompare(fold(b.doc.name)))) {
  console.log(`  [${u.from}] → [${u.to}]  ${u.doc.name}`);
}

const brands = rows.filter(
  (d) =>
    d &&
    bid(d) === DISARMINK &&
    !d.deletedAt &&
    (d.type === 'brand' || d.type === 'commercial_line' || Array.isArray(d.catalogCategories)),
);

const brandUpdates = [];
console.log(`\n— Marcas: ${brands.length} —`);
for (const b of brands) {
  if (!Array.isArray(b.catalogCategories)) continue;
  const prev = b.catalogCategories;
  const next = stripDrinkSplitCategories(prev);
  const same = prev.length === next.length && prev.every((c, i) => c === next[i]);
  console.log(`  ${b.name || b._id}`);
  console.log(`    antes: ${JSON.stringify(prev)}`);
  console.log(`    después: ${JSON.stringify(next)}${same ? ' (sin cambio)' : ''}`);
  if (!same) brandUpdates.push({ doc: b, next });
}

if (!APPLY) {
  console.log('\nDry-run OK. Pasa --apply para guardar.');
  process.exit(0);
}

const now = new Date().toISOString();
for (const u of itemUpdates) {
  const next = {
    ...u.doc,
    category: u.to,
    itemType: u.doc.itemType || 'product',
    module: u.doc.module || 'catalog',
    updatedAt: now,
  };
  const saved = await couch('PUT', `/${CATALOG_DB}/${encodeURIComponent(u.doc._id)}`, next);
  console.log('item', u.doc.name, '→', u.to, saved.rev);
}

for (const u of brandUpdates) {
  const next = {
    ...u.doc,
    catalogCategories: u.next,
    updatedAt: now,
  };
  const saved = await couch('PUT', `/${CATALOG_DB}/${encodeURIComponent(u.doc._id)}`, next);
  console.log('brand', u.doc.name || u.doc._id, saved.rev);
}

console.log('\nHecho. Cervezas y vinos van en Bebidas. Recarga TPV (Ctrl+Shift+R).');
