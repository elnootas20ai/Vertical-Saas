#!/usr/bin/env node
/**
 * DISARMINK — Patatas Supreme → 5,20€
 *   node scripts/fix-disarmink-patatas-supreme-precio.mjs
 *   node scripts/fix-disarmink-patatas-supreme-precio.mjs --apply
 */
const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const DB = 'bbddsaas-catalog';
const DISARMINK = 'ed846f31-aee7-4568-ac03-fa25ff3ad773';
const NEW_PRICE = 5.2;
const APPLY = process.argv.includes('--apply');

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

function priceOf(d) {
  return Math.round(Number(d.unitPrice ?? d.price ?? 0) * 100) / 100;
}

const all = await couch('GET', `/${DB}/_all_docs?include_docs=true&limit=80000`);
const matches = (all.rows || [])
  .map((r) => r.doc)
  .filter((d) => {
    if (!d || d.type !== 'catalog_item' || d.deletedAt) return false;
    if (bid(d) !== DISARMINK) return false;
    const n = fold(d.name);
    return n.includes('patata') && n.includes('supreme');
  });

console.log(APPLY ? '=== APPLY ===' : '=== DRY ===');
if (!matches.length) {
  console.log('No encontré Patatas Supreme en Disarmink.');
  process.exit(1);
}

for (const d of matches) {
  console.log(`${d.name}  ${priceOf(d)} → ${NEW_PRICE}  (${d._id}) module=${d.module || '-'}`);
}

if (!APPLY) {
  console.log('Dry-run OK. Pasa --apply para guardar.');
  process.exit(0);
}

const now = new Date().toISOString();
for (const d of matches) {
  // Solo carta vendible; si hay stock a 0€ duplicado, también ponemos precio si es catalog
  if ((d.module || 'catalog') === 'stock' && priceOf(d) === 0 && matches.length > 1) {
    console.log('skip stock', d._id);
    continue;
  }
  const saved = await couch('PUT', `/${DB}/${encodeURIComponent(d._id)}`, {
    ...d,
    unitPrice: NEW_PRICE,
    price: NEW_PRICE,
    active: true,
    available: true,
    updatedAt: now,
  });
  console.log('ok', d._id, saved.rev);
}
console.log('Hecho. Recarga TPV (Ctrl+Shift+R).');
