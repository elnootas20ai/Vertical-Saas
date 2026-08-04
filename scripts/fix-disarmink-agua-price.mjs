#!/usr/bin/env node
/**
 * DISARMINK — Agua 50cl de 1,80 → 1,20 € (unitPrice).
 *
 *   node scripts/fix-disarmink-agua-price.mjs
 *   node scripts/fix-disarmink-agua-price.mjs --apply
 */
const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const DISARMINK = 'ed846f31-aee7-4568-ac03-fa25ff3ad773';
const TARGET_ID = 'catitem-895c8224-2bac-4a56-9ecd-b67a5f07341e';
const NEW_PRICE = 1.2;
const APPLY = process.argv.includes('--apply');

async function couch(method, path, body) {
  const res = await fetch(`${COUCH}${path}`, {
    method,
    headers: { Authorization: AUTH, 'Content-Type': 'application/json', Accept: 'application/json' },
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

const doc = await couch('GET', `/bbddsaas-catalog/${encodeURIComponent(TARGET_ID)}`);
if (bid(doc) !== DISARMINK) {
  throw new Error(`business_id inesperado: ${bid(doc)}`);
}
if (!/^agua\s*50cl$/i.test(String(doc.name || '').trim())) {
  throw new Error(`nombre inesperado: ${doc.name}`);
}

const prev = Number(doc.unitPrice);
console.log(APPLY ? '=== APPLY ===' : '=== DRY (sin escribir) ===');
console.log(`${doc.name} (${doc._id})`);
console.log(`  unitPrice: ${prev} → ${NEW_PRICE}`);

if (!APPLY) {
  console.log('Dry-run OK. Pasa --apply para guardar.');
  process.exit(0);
}

const next = {
  ...doc,
  unitPrice: NEW_PRICE,
  updatedAt: new Date().toISOString(),
};
const saved = await couch('PUT', `/bbddsaas-catalog/${encodeURIComponent(TARGET_ID)}`, next);
console.log('Guardado rev=', saved.rev);
const check = await couch('GET', `/bbddsaas-catalog/${encodeURIComponent(TARGET_ID)}`);
console.log('Verificación unitPrice=', check.unitPrice);
