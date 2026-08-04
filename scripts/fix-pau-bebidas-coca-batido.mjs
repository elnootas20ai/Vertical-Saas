#!/usr/bin/env node
/**
 * DISARMINK (Pau Royo del Amor) — bebidas:
 *  - Quitar batidos de chocolate
 *  - Quitar Coca / Zero a 2,50€ (y duplicados a 0€); dejar las de 1,90€
 *  - Coca-Cola 2L a 3,50€ (crear si falta)
 *
 *   node scripts/fix-pau-bebidas-coca-batido.mjs
 *   node scripts/fix-pau-bebidas-coca-batido.mjs --apply
 */
import { randomUUID } from 'node:crypto';

const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const DB = 'bbddsaas-catalog';
const DISARMINK = 'ed846f31-aee7-4568-ac03-fa25ff3ad773';
const PAU_USER = '13e49ef6-183a-4afa-a17b-7730917fe685';
const APPLY = process.argv.includes('--apply');

const KEEP_PRICE = 1.9;
const COLA_2L_PRICE = 3.5;

/** Acciones fijas tras diagnóstico prod (julio 2026). */
const SOFT_DELETE_IDS = [
  // Batidos chocolate
  'catitem-19fd08f5-07a5-45e8-89a3-2792122b2c52', // Batido de chocolate 0€
  'catitem-394ad546-095c-49be-b954-25baba72c693', // Batido de chocolate 4€
  // Coca duplicadas caras / basura
  'catitem-13d24287-f0e2-44ad-8692-5d977e083df9', // Coca-Cola 33cl 2,50
  'catitem-6c670704-766d-4b15-bee8-44f4cd317d4d', // Coca-Cola 33cl 0€
  'catitem-50b6bc69-acd3-42d7-ae5c-5a5be56011e8', // Zero 33cl 2,50
  'catitem-fc1392da-b470-4c16-a1ee-8b3c24e8a5e0', // Zero 33cl 0€
];

const KEEP_IDS = [
  'catitem-895dfa3b-40b0-438a-89c7-90ba95f2e77c', // Coca-Cola 1,90
  'catitem-27c641f1-3e32-4d0f-b8dc-23f34f34d8de', // Coca-Cola 0 1,90
];

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
  const n = Number(d.unitPrice ?? d.price ?? d.basePrice ?? 0);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function approx(a, b, tol = 0.02) {
  return Math.abs(Number(a) - Number(b)) <= tol;
}

async function get(id) {
  return couch('GET', `/${DB}/${encodeURIComponent(id)}`);
}

async function put(doc) {
  return couch('PUT', `/${DB}/${encodeURIComponent(doc._id)}`, doc);
}

console.log(APPLY ? '=== APPLY Disarmink bebidas ===' : '=== DRY Disarmink bebidas ===');

const keepDocs = [];
for (const id of KEEP_IDS) {
  const d = await get(id);
  if (bid(d) !== DISARMINK) throw new Error(`keep ${id} biz=${bid(d)}`);
  if (d.deletedAt) throw new Error(`keep ${id} ya borrado`);
  if (!approx(priceOf(d), KEEP_PRICE)) {
    console.warn(`AVISO keep ${d.name} precio=${priceOf(d)} (esperado ${KEEP_PRICE})`);
  }
  keepDocs.push(d);
  console.log('KEEP', d.name, priceOf(d), d._id);
}

const toDelete = [];
for (const id of SOFT_DELETE_IDS) {
  const d = await get(id);
  if (bid(d) !== DISARMINK) throw new Error(`del ${id} biz=${bid(d)}`);
  if (d.deletedAt) {
    console.log('YA BORRADO', d.name, d._id);
    continue;
  }
  toDelete.push(d);
  console.log('SOFT-DELETE', d.name, priceOf(d), d._id);
}

// ¿Hay Coca 2L viva?
const all = await couch('GET', `/${DB}/_all_docs?include_docs=true&limit=80000`);
const docs = (all.rows || []).map((r) => r.doc).filter(Boolean);
const live2L = docs.filter((d) => {
  if (d.type !== 'catalog_item' || d.deletedAt) return false;
  if (bid(d) !== DISARMINK) return false;
  const n = fold(d.name);
  return /coca/.test(n) && /2\s*l|\b2l\b|2\s*litros?/.test(n);
});

let create2L = null;
const price2L = [];
if (live2L.length) {
  for (const [i, d] of live2L.entries()) {
    if (i === 0) {
      if (!approx(priceOf(d), COLA_2L_PRICE)) {
        price2L.push(d);
        console.log('PRECIO 2L', d.name, priceOf(d), '→', COLA_2L_PRICE, d._id);
      } else {
        console.log('2L OK', d.name, priceOf(d), d._id);
      }
    } else {
      toDelete.push(d);
      console.log('SOFT-DELETE 2L dup', d.name, d._id);
    }
  }
} else {
  const template = keepDocs[0];
  create2L = {
    _id: `catitem-${randomUUID()}`,
    type: 'catalog_item',
    name: 'Coca-Cola 2L',
    category: template?.category || 'Bebidas',
    unitPrice: COLA_2L_PRICE,
    price: COLA_2L_PRICE,
    active: true,
    available: true,
    itemType: 'product',
    isStockItem: false,
    module: 'catalog',
    stockCategory: 'finished_product',
    business_id: DISARMINK,
    businessId: DISARMINK,
    user_id: template?.user_id || PAU_USER,
    brandId: template?.brandId || template?.brand_id || undefined,
    brand_id: template?.brand_id || template?.brandId || undefined,
    taxRate: template?.taxRate ?? 10,
    unit: template?.unit || 'ud',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  };
  console.log('CREAR', create2L.name, COLA_2L_PRICE, create2L._id);
}

if (!APPLY) {
  console.log('\nDry-run OK. Pasa --apply para guardar.');
  process.exit(0);
}

const now = new Date().toISOString();
for (const d of toDelete) {
  const saved = await put({
    ...d,
    deletedAt: now,
    active: false,
    available: false,
    updatedAt: now,
  });
  console.log('deleted', d._id, saved.rev);
}
for (const d of price2L) {
  const saved = await put({
    ...d,
    unitPrice: COLA_2L_PRICE,
    price: COLA_2L_PRICE,
    active: true,
    available: true,
    deletedAt: null,
    updatedAt: now,
  });
  console.log('priced', d._id, COLA_2L_PRICE, saved.rev);
}
if (create2L) {
  const saved = await put(create2L);
  console.log('created', create2L._id, saved.rev);
}

console.log('\nHecho. Recarga TPV (Ctrl+Shift+R).');
