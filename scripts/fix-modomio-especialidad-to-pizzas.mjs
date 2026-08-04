#!/usr/bin/env node
/**
 * Modomio (marca Pau / hoypecamos): mueve las pizzas de «Especialidad» a «Pizzas»
 * y deja la categoría Especialidad vacía en carta.
 *
 * Productos: Pallesa, Carbonara al Guanciale, Pera al Gorgo,
 * Pizza Mortadella e Pistacchio, Sanginaccio.
 *
 *   node scripts/fix-modomio-especialidad-to-pizzas.mjs
 *   node scripts/fix-modomio-especialidad-to-pizzas.mjs --apply
 */
const COUCH = process.env.COUCH || 'http://127.0.0.1:5984';
const AUTH =
  process.env.AUTH
  || ('Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64'));
const APPLY = process.argv.includes('--apply');

const EXPECT_BIZ = 'ed846f31-aee7-4568-ac03-fa25ff3ad773';
const EXPECT_BRAND = 'brand-96a8d7ce-e9af-459c-b8a9-48ffc55949ec';
const NEW_CATEGORY = 'Pizzas';

/** Nombres esperados (fold) → etiqueta */
const TARGET_NAMES = [
  'pallesa',
  'carbonara al guanciale',
  'pera al gorgo',
  'pizza mortadella e pistacchio',
  'mortadella e pistacchio',
  'sanginaccio',
];

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

function isTargetName(name) {
  const n = fold(name);
  return TARGET_NAMES.some((t) => n === t || n.includes(t));
}

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
  if (!res.ok) {
    throw new Error(`${method} ${path}: ${data.error || res.status} ${data.reason || ''}`);
  }
  return data;
}

async function allDocs(db) {
  const data = await couch(
    'GET',
    `/${encodeURIComponent(db)}/_all_docs?include_docs=true&limit=80000`,
  );
  return (data.rows || []).map((r) => r.doc).filter(Boolean);
}

const catalog = await allDocs('bbddsaas-catalog');

const products = catalog.filter((d) => {
  if (d.deletedAt) return false;
  if (bid(d) !== EXPECT_BIZ) return false;
  if (!(d.brandIds || []).map(String).includes(EXPECT_BRAND)) return false;
  if (String(d.itemType || 'product') !== 'product') return false;
  if ((d.module || 'catalog') !== 'catalog') return false;
  return isTargetName(d.name);
});

const especialidadLeft = catalog.filter((d) => {
  if (d.deletedAt) return false;
  if (bid(d) !== EXPECT_BIZ) return false;
  if (!(d.brandIds || []).map(String).includes(EXPECT_BRAND)) return false;
  if (String(d.itemType || 'product') !== 'product') return false;
  return fold(d.category) === 'especialidad';
});

console.log(APPLY ? '=== APPLY ===' : '=== DRY (sin escribir) ===');
console.log(`Productos a revisar: ${products.length}`);
for (const doc of products) {
  const prev = String(doc.category || '').trim();
  const already = fold(prev) === fold(NEW_CATEGORY);
  console.log(`- ${doc.name} (${doc._id}) «${prev}»${already ? ' (ya Pizzas)' : ` → «${NEW_CATEGORY}»`}`);
}

console.log(`\nEspecialidad activos (marca): ${especialidadLeft.length}`);
for (const d of especialidadLeft) {
  console.log(`  · ${d.name} | ${d._id}`);
}

if (products.length < 5) {
  console.warn('AVISO: esperaba al menos 5 productos (Pallesa + 4). Revisa nombres.');
}

if (!APPLY) {
  console.log('\nDry-run OK. Pasa --apply para guardar.');
  process.exit(0);
}

let changed = 0;
for (const doc of products) {
  if (fold(doc.category) === fold(NEW_CATEGORY)) continue;
  const next = {
    ...doc,
    category: NEW_CATEGORY,
    updatedAt: new Date().toISOString(),
  };
  const saved = await couch('PUT', `/bbddsaas-catalog/${encodeURIComponent(doc._id)}`, next);
  console.log(`OK ${doc.name} rev=${saved.rev}`);
  changed += 1;
}

const check = await allDocs('bbddsaas-catalog');
const left = check.filter((d) => {
  if (d.deletedAt) return false;
  if (bid(d) !== EXPECT_BIZ) return false;
  if (!(d.brandIds || []).map(String).includes(EXPECT_BRAND)) return false;
  if (String(d.itemType || 'product') !== 'product') return false;
  return fold(d.category) === 'especialidad';
});
console.log(`\nGuardados: ${changed}`);
console.log(`Especialidad restantes (productos marca): ${left.length}`);
for (const d of left) console.log(`  !! ${d.name}`);
