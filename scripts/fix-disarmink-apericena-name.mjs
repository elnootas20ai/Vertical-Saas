#!/usr/bin/env node
/**
 * DISARMINK (hoypecamos) — renombrar pizza Apericina → Apericena en catálogo CouchDB.
 * Catálogo a nivel empresa → aplica a ambas tiendas (Tiana / Badalona).
 *
 *   node scripts/fix-disarmink-apericena-name.mjs
 *   node scripts/fix-disarmink-apericena-name.mjs --apply
 */
const COUCH = 'http://127.0.0.1:5984';
const user = process.env.COUCHDB_USER || 'vertialadmin';
const pass = process.env.COUCHDB_PASSWORD || 'uriel12345';
const AUTH = 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
const DB = 'bbddsaas-catalog';
const DISARMINK = 'ed846f31-aee7-4568-ac03-fa25ff3ad773';
const TARGET_NAME = 'Apericena';
const TARGET_ING = 'Tomate, mozzarella, atún, cebolla, olivas';
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
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function isAperiVariant(name) {
  return /apericen|apericin|aprecien|apreciin|apreciensa/.test(fold(name));
}

function getIng(d) {
  let ing = d.customFields?.ingredients ?? d.ingredients ?? '';
  if (Array.isArray(ing)) {
    ing = ing.map((x) => (typeof x === 'object' ? x.name || '' : String(x || ''))).filter(Boolean).join(', ');
  }
  return String(ing || '').trim();
}

console.log(APPLY ? '=== APPLY Apericena rename ===' : '=== DRY Apericena rename ===');

const all = await couch('GET', `/${DB}/_all_docs?include_docs=true&limit=80000`);
const docs = (all.rows || []).map((r) => r.doc).filter(Boolean);
const matches = docs.filter((d) => bid(d) === DISARMINK && isAperiVariant(d.name));

console.log('Matches DISARMINK:', matches.length);
for (const d of matches) {
  console.log(
    JSON.stringify({
      id: d._id,
      name: d.name,
      active: d.active !== false,
      deletedAt: d.deletedAt || null,
      isStockItem: !!d.isStockItem,
      price: d.unitPrice ?? d.price ?? null,
      salesPointId: d.salesPointId || null,
      ingredients: getIng(d).slice(0, 80),
    }),
  );
}

const live = matches.filter((d) => !d.deletedAt && d.active !== false && (d.module || 'catalog') === 'catalog');
if (live.length === 0) {
  console.error('No hay producto vivo Apericina/Apericena en DISARMINK');
  process.exit(1);
}

// Preferir el que ya se vende (precio > 0, categoría Pizzas); si hay varios, el más reciente.
live.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
const primary = live[0];
const extras = live.slice(1);

const ops = [];

if (String(primary.name || '').trim() !== TARGET_NAME || getIng(primary) !== TARGET_ING) {
  ops.push({
    kind: 'rename',
    id: primary._id,
    from: primary.name,
    to: TARGET_NAME,
    doc: primary,
  });
} else {
  console.log('Primary ya OK:', primary._id, primary.name);
}

for (const d of extras) {
  ops.push({
    kind: 'soft_delete_duplicate',
    id: d._id,
    from: d.name,
    doc: d,
  });
}

// Duplicados soft-deleted con nombre Apericina: opcional dejar; no reactivar.
console.log('Ops:', ops.length);
for (const op of ops) {
  console.log('-', op.kind, op.id, op.from, '→', op.to || '(delete)');
}

if (!APPLY) {
  console.log('Dry-run. Pasa --apply para escribir.');
  process.exit(0);
}

const now = new Date().toISOString();
for (const op of ops) {
  if (op.kind === 'rename') {
    const next = {
      ...op.doc,
      name: TARGET_NAME,
      updatedAt: now,
      customFields: {
        ...(op.doc.customFields && typeof op.doc.customFields === 'object' ? op.doc.customFields : {}),
        ingredients: TARGET_ING,
      },
    };
    if ('ingredients' in next && typeof next.ingredients === 'string') {
      next.ingredients = TARGET_ING;
    }
    const put = await couch('PUT', `/${DB}/${encodeURIComponent(next._id)}`, next);
    console.log('RENAMED', next._id, 'rev', put.rev, '→', TARGET_NAME);
  } else if (op.kind === 'soft_delete_duplicate') {
    const next = {
      ...op.doc,
      active: false,
      deletedAt: op.doc.deletedAt || now,
      updatedAt: now,
    };
    const put = await couch('PUT', `/${DB}/${encodeURIComponent(next._id)}`, next);
    console.log('SOFT_DELETED_DUP', next._id, 'rev', put.rev);
  }
}

// Verify
const check = await couch('GET', `/${DB}/${encodeURIComponent(primary._id)}`);
console.log('VERIFY', JSON.stringify({
  id: check._id,
  name: check.name,
  active: check.active !== false,
  deletedAt: check.deletedAt || null,
  ingredients: getIng(check),
  price: check.unitPrice ?? check.price,
}));

if (String(check.name).trim() !== TARGET_NAME || check.deletedAt) {
  console.error('VERIFY FAIL');
  process.exit(1);
}
console.log('OK — Apericena en catálogo empresa (ambas tiendas).');
