#!/usr/bin/env node
/**
 * DISARMINK — separar TPV en 3 divisiones (como las 3 fotos Gloria):
 *   Bebidas | Cervezas | Vinos
 *
 *   node scripts/fix-disarmink-separar-bebidas-cervezas-vinos.mjs
 *   node scripts/fix-disarmink-separar-bebidas-cervezas-vinos.mjs --apply
 */
const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const CATALOG_DB = 'bbddsaas-catalog';
const DISARMINK = 'ed846f31-aee7-4568-ac03-fa25ff3ad773';
const APPLY = process.argv.includes('--apply');

const CAT_BEBIDAS = 'Bebidas';
const CAT_CERVEZAS = 'Cervezas';
const CAT_VINOS = 'Vinos';

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

function isBeer(d) {
  const n = fold(d.name);
  if (/pepperoni/.test(n)) return false;
  return (
    /estrella|voll\s*damm|volldamm|moretti|\bperoni\b|moritz|amstel|desperados|cerdos|barbuda|mahou|cerveza/.test(n)
  );
}

function isWine(d) {
  const n = fold(d.name);
  return /vino|lambrusco/.test(n);
}

function isSoftDrink(d) {
  const n = fold(d.name);
  if (isBeer(d) || isWine(d)) return false;
  return /coca|fanta|nestea|aquarius|^agua|sprite|zumo|refresco/.test(n);
}

function desiredCategory(d) {
  if (isBeer(d)) return CAT_CERVEZAS;
  if (isWine(d)) return CAT_VINOS;
  if (isSoftDrink(d)) return CAT_BEBIDAS;
  return null;
}

function mergeCategories(existing, mustHave) {
  const out = [];
  const seen = new Set();
  const push = (c) => {
    const t = String(c || '').trim();
    if (!t) return;
    const k = fold(t);
    if (seen.has(k)) return;
    seen.add(k);
    out.push(t);
  };
  // Orden deseado: … Bebidas, Cervezas, Vinos …
  const prefer = [CAT_BEBIDAS, CAT_CERVEZAS, CAT_VINOS];
  for (const c of existing || []) {
    if (prefer.some((p) => fold(p) === fold(c))) continue;
    push(c);
  }
  // Insertar bloque bebidas al final relativo manteniendo preferidos juntos
  // Reconstruir: todo lo no-preferido + preferidos en orden (si existen en merged set)
  const nonPref = out.filter((c) => !prefer.some((p) => fold(p) === fold(c)));
  const result = [...nonPref];
  for (const p of prefer) {
    const hasInExisting = (existing || []).some((c) => fold(c) === fold(p)) || mustHave.includes(p);
    if (hasInExisting || mustHave.includes(p)) result.push(p);
  }
  // Asegurar mustHave
  for (const p of mustHave) {
    if (!result.some((c) => fold(c) === fold(p))) result.push(p);
  }
  return result;
}

const allCat = await couch('GET', `/${CATALOG_DB}/_all_docs?include_docs=true&limit=80000`);
const docs = (allCat.rows || [])
  .map((r) => r.doc)
  .filter((d) => d?.type === 'catalog_item' && bid(d) === DISARMINK && !d.deletedAt);

console.log(APPLY ? '=== APPLY separar divisiones ===' : '=== DRY separar divisiones ===');

const itemUpdates = [];
for (const d of docs) {
  // Solo carta TPV, no stock puro a 0€
  if ((d.module || 'catalog') === 'stock' && Number(d.unitPrice || d.price || 0) === 0) continue;
  const want = desiredCategory(d);
  if (!want) continue;
  const cur = String(d.category || '').trim();
  if (fold(cur) === fold(want)) continue;
  itemUpdates.push({ doc: d, from: cur || '(sin)', to: want });
}

console.log(`\n— Productos a recategorizar: ${itemUpdates.length} —`);
for (const u of itemUpdates.sort((a, b) => a.to.localeCompare(b.to) || fold(a.doc.name).localeCompare(fold(b.doc.name)))) {
  console.log(`  [${u.from}] → [${u.to}]  ${u.doc.name}  (${u.doc._id})`);
}

// Brands / líneas comerciales
const brandDbs = ['bbddsaas-catalog', 'catalog']; // brands often in same catalog db as type brand
let brands = docs.length ? [] : [];
// Brands are separate type in catalog db
brands = (allCat.rows || [])
  .map((r) => r.doc)
  .filter((d) => d && (d.type === 'brand' || d.type === 'commercial_line') && bid(d) === DISARMINK && !d.deletedAt);

// Also try businesses-linked brands without strict type
if (!brands.length) {
  brands = (allCat.rows || [])
    .map((r) => r.doc)
    .filter((d) => d && Array.isArray(d.catalogCategories) && bid(d) === DISARMINK && !d.deletedAt);
}

console.log(`\n— Marcas / líneas con catalogCategories: ${brands.length} —`);
const brandUpdates = [];
for (const b of brands) {
  const prev = b.catalogCategories || [];
  const next = mergeCategories(prev, [CAT_BEBIDAS, CAT_CERVEZAS, CAT_VINOS]);
  const same = prev.length === next.length && prev.every((c, i) => c === next[i]);
  console.log(`  ${b.name || b._id}`);
  console.log(`    antes: ${JSON.stringify(prev)}`);
  console.log(`    después: ${JSON.stringify(next)}${same ? ' (sin cambio)' : ''}`);
  if (!same) brandUpdates.push({ doc: b, next });
}

// Si no hay brands con categories, buscar en otra DB
if (!brands.length) {
  for (const dbName of ['brands', 'bbddsaas-brands', 'businesses']) {
    try {
      const data = await couch('GET', `/${dbName}/_all_docs?include_docs=true&limit=20000`);
      const found = (data.rows || [])
        .map((r) => r.doc)
        .filter((d) => d && bid(d) === DISARMINK && !d.deletedAt && (d.type === 'brand' || Array.isArray(d.catalogCategories)));
      if (found.length) {
        console.log(`\nEncontradas ${found.length} marcas en ${dbName}`);
        for (const b of found) {
          const prev = b.catalogCategories || [];
          const next = mergeCategories(prev, [CAT_BEBIDAS, CAT_CERVEZAS, CAT_VINOS]);
          const same = prev.length === next.length && prev.every((c, i) => c === next[i]);
          console.log(`  ${b.name || b._id} @ ${dbName}`);
          console.log(`    antes: ${JSON.stringify(prev)}`);
          console.log(`    después: ${JSON.stringify(next)}${same ? ' (sin cambio)' : ''}`);
          if (!same) brandUpdates.push({ doc: b, next, db: dbName });
        }
      }
    } catch (e) {
      console.log(`(skip ${dbName}: ${e.message})`);
    }
  }
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
  const db = u.db || CATALOG_DB;
  const next = {
    ...u.doc,
    catalogCategories: u.next,
    updatedAt: now,
  };
  const saved = await couch('PUT', `/${db}/${encodeURIComponent(u.doc._id)}`, next);
  console.log('brand', u.doc.name || u.doc._id, saved.rev);
}

console.log('\nHecho. En TPV deberías ver pestañas Bebidas / Cervezas / Vinos. Ctrl+Shift+R.');
