#!/usr/bin/env node
/**
 * Modomio (marca Pau / hoypecamos): mueve Pallesa de «Especialidad» a «Pizzas».
 *
 *   node scripts/fix-modomio-pallesa-to-pizzas.mjs
 *   node scripts/fix-modomio-pallesa-to-pizzas.mjs --apply
 */
const COUCH = process.env.COUCH || 'http://127.0.0.1:5984';
const AUTH =
  process.env.AUTH
  || ('Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64'));
const APPLY = process.argv.includes('--apply');

/** Pallesa activa · Especialidad · marca Modomio */
const TARGET_ID = 'catitem-2215ec53-bfe8-4725-822d-06a3ead36e67';
const EXPECT_BIZ = 'ed846f31-aee7-4568-ac03-fa25ff3ad773';
const EXPECT_BRAND = 'brand-96a8d7ce-e9af-459c-b8a9-48ffc55949ec';
const NEW_CATEGORY = 'Pizzas';

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

const doc = await couch('GET', `/bbddsaas-catalog/${encodeURIComponent(TARGET_ID)}`);
if (bid(doc) !== EXPECT_BIZ) {
  throw new Error(`business_id inesperado: ${bid(doc)}`);
}
if (!(doc.brandIds || []).map(String).includes(EXPECT_BRAND)) {
  throw new Error(`brandIds inesperado: ${JSON.stringify(doc.brandIds)}`);
}
if (!/^pallesa$/i.test(String(doc.name || '').trim())) {
  throw new Error(`nombre inesperado: ${doc.name}`);
}
if (doc.deletedAt) {
  throw new Error(`documento borrado: ${doc.deletedAt}`);
}

const prev = String(doc.category || '').trim();
console.log(APPLY ? '=== APPLY ===' : '=== DRY (sin escribir) ===');
console.log(`${doc.name} (${doc._id})`);
console.log(`  category: «${prev}» → «${NEW_CATEGORY}»`);

if (fold(prev) === fold(NEW_CATEGORY)) {
  console.log('Ya está en Pizzas. Nada que hacer.');
  process.exit(0);
}

if (!APPLY) {
  console.log('Dry-run OK. Pasa --apply para guardar.');
  process.exit(0);
}

const next = {
  ...doc,
  category: NEW_CATEGORY,
  updatedAt: new Date().toISOString(),
};
const saved = await couch('PUT', `/bbddsaas-catalog/${encodeURIComponent(TARGET_ID)}`, next);
console.log('Guardado rev=', saved.rev);
const check = await couch('GET', `/bbddsaas-catalog/${encodeURIComponent(TARGET_ID)}`);
console.log('Verificación category=', check.category);
