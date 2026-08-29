#!/usr/bin/env node
/**
 * DISARMINK (Pau Royo) — renombrar hamburguesa «Ibérica» → «Hamburguesa Ibérica».
 * Solo el producto activo de categoría Burger (no la pizza ni ingredientes).
 *
 *   node scripts/fix-disarmink-burger-iberica-name.mjs
 *   node scripts/fix-disarmink-burger-iberica-name.mjs --apply
 */
const COUCH = process.env.COUCHDB_URL || 'http://127.0.0.1:5984';
const user = process.env.COUCHDB_USER || 'vertialadmin';
const pass = process.env.COUCHDB_PASSWORD || 'uriel12345';
const AUTH = 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
const DB = 'bbddsaas-catalog';
const DISARMINK = 'ed846f31-aee7-4568-ac03-fa25ff3ad773';
const TARGET_ID = 'catitem-b1f373cd-f534-4139-8fb3-5d6726573af0';
const TARGET_NAME = 'Hamburguesa Ibérica';
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
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim();
}

console.log(APPLY ? '=== APPLY rename burger Ibérica ===' : '=== DRY rename burger Ibérica ===');

const doc = await couch('GET', `/${DB}/${encodeURIComponent(TARGET_ID)}`);
if (bid(doc) !== DISARMINK) {
  console.error('El doc no es de DISARMINK:', bid(doc));
  process.exit(1);
}
if (doc.deletedAt) {
  console.error('El producto está borrado:', doc._id);
  process.exit(1);
}

const cat = fold(doc.category);
const nameFold = fold(doc.name);
if (!/burg|hambur/.test(cat) && !/burg|hambur/.test(nameFold)) {
  console.error('No parece una hamburguesa:', { name: doc.name, category: doc.category });
  process.exit(1);
}

console.log(
  JSON.stringify({
    id: doc._id,
    from: doc.name,
    to: TARGET_NAME,
    category: doc.category,
    active: doc.active !== false,
  }),
);

if (String(doc.name || '').trim() === TARGET_NAME) {
  console.log('Ya se llama', TARGET_NAME);
  process.exit(0);
}

if (!APPLY) {
  console.log('Dry-run. Pasa --apply para escribir en prod.');
  process.exit(0);
}

const next = {
  ...doc,
  name: TARGET_NAME,
  updatedAt: new Date().toISOString(),
};
const put = await couch('PUT', `/${DB}/${encodeURIComponent(next._id)}`, next);
console.log('RENAMED', next._id, 'rev', put.rev, '→', TARGET_NAME);

const check = await couch('GET', `/${DB}/${encodeURIComponent(TARGET_ID)}`);
console.log('VERIFY', JSON.stringify({ id: check._id, name: check.name, category: check.category }));
if (String(check.name).trim() !== TARGET_NAME) {
  console.error('VERIFY FAIL');
  process.exit(1);
}
console.log('OK — Hamburguesa Ibérica (pizza Ibérica sin tocar).');
