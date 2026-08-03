#!/usr/bin/env node
/**
 * DISARMINK (Tiana / Pau) — las 3 bebidas 2L existen en catálogo pero NO salen en TPV
 * porque se crearon sin itemType: "product". Van en categoría Bebidas (junto a Coca/Fanta).
 *
 * Solo corrige itemType + category. No borra nada.
 *
 *   node scripts/fix-disarmink-bebidas-2l-itemtype.mjs
 *   node scripts/fix-disarmink-bebidas-2l-itemtype.mjs --apply
 */
const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const DB = 'bbddsaas-catalog';
const DISARMINK = 'ed846f31-aee7-4568-ac03-fa25ff3ad773';
const APPLY = process.argv.includes('--apply');
const TARGET_CATEGORY = 'Bebidas';

/** IDs vivos confirmados en prod (diag 2026-08-03). */
const TARGET_IDS = [
  'catitem-ad978a8e-7ee8-4599-98e4-32cf2e83b6ec', // Coca-Cola 2L 3,50
  'catitem-3dd0f2f2-6381-4e0c-9d5a-a82697a92a70', // Fanta Naranja 2L 3,50
  'catitem-16ac976d-90a1-4dd1-bc22-56565c73ebe0', // Fanta Limón 2L 3,50
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

console.log(APPLY ? '=== APPLY 2L → Refrescos + itemType ===' : '=== DRY 2L → Refrescos + itemType ===');

for (const id of TARGET_IDS) {
  const d = await couch('GET', `/${DB}/${encodeURIComponent(id)}`);
  if (bid(d) !== DISARMINK) throw new Error(`${id} biz=${bid(d)} (esperado DISARMINK)`);
  if (d.deletedAt) throw new Error(`${id} está soft-deleted (${d.name})`);

  const before = {
    name: d.name,
    category: d.category ?? null,
    itemType: d.itemType ?? null,
    isStockItem: d.isStockItem,
    module: d.module ?? null,
    stockCategory: d.stockCategory ?? null,
    active: d.active,
    price: d.unitPrice ?? d.price,
  };

  const needs =
    d.itemType !== 'product' ||
    d.category !== TARGET_CATEGORY ||
    d.module !== 'catalog' ||
    d.stockCategory !== 'finished_product' ||
    d.active === false ||
    d.available === false;

  console.log(needs ? 'FIX' : 'OK ', before.name, before, '→', id);

  if (!APPLY || !needs) continue;

  const next = {
    ...d,
    itemType: 'product',
    category: TARGET_CATEGORY,
    module: 'catalog',
    stockCategory: 'finished_product',
    active: true,
    available: true,
    updatedAt: new Date().toISOString(),
  };
  await couch('PUT', `/${DB}/${encodeURIComponent(id)}`, next);
  console.log(`  saved itemType=product category=${TARGET_CATEGORY}`);
}

if (!APPLY) console.log('\nDry-run. Para aplicar: --apply');
