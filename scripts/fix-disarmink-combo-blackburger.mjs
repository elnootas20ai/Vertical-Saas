#!/usr/bin/env node
/**
 * DISARMINK — crea/actualiza «Combo Blackburger» (marca blackburger):
 *   1 burger (todas) + 1 complemento (todos; suplemento Supreme/Tequeños) + 1 bebida (refrescos + cervezas)
 *
 * Como Individual de pizza, pero para Blackburger.
 *
 *   node scripts/fix-disarmink-combo-blackburger.mjs
 *   node scripts/fix-disarmink-combo-blackburger.mjs --price=14.90
 *   node scripts/fix-disarmink-combo-blackburger.mjs --price=14.90 --apply
 */
import { randomUUID } from 'node:crypto';

const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const DISARMINK = 'ed846f31-aee7-4568-ac03-fa25ff3ad773';
const BLACKBURGER_BRAND = 'brand-e99413ea-59df-4382-8a06-1d56fac890e0';
const PAU_USER = '13e49ef6-183a-4afa-a17b-7730917fe685';
const APPLY = process.argv.includes('--apply');
const priceArg = process.argv.find((a) => a.startsWith('--price='));
const PRICE = priceArg ? Number(priceArg.split('=')[1]) : NaN;

const COMBO_NAME = 'Combo Blackburger';
const COMBO_STRUCTURE = [
  { slotKind: 'main', label: 'Burger', required: true, expectedCount: 1 },
  { slotKind: 'side', label: 'Complemento', required: true, expectedCount: 1 },
  { slotKind: 'drink', label: 'Bebida', required: true, expectedCount: 1 },
];

/** Como en otros menús: tequeños +1,50; supreme (patatas/salchipapas) +1. */
const SIDE_SURCHARGE_RULES = [
  { test: (n) => /tequen/.test(n), amount: 1.5 },
  { test: (n) => n.includes('supreme'), amount: 1 },
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

function priceOf(d) {
  const n = Number(d.unitPrice ?? d.price ?? 0);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function isLiveProduct(d) {
  if (!d || d.type !== 'catalog_item' || d.deletedAt || d.active === false) return false;
  if (d.itemType === 'combo') return false;
  if ((d.module || 'catalog') === 'stock') return false;
  // product explícito, o sin itemType (legado) si es carta
  return d.itemType === 'product' || d.itemType == null || d.itemType === '';
}

const data = await couch('GET', '/bbddsaas-catalog/_all_docs?include_docs=true&limit=80000');
const docs = (data.rows || []).map((r) => r.doc).filter(Boolean);
const biz = docs.filter((d) => d?.type === 'catalog_item' && bid(d) === DISARMINK && !d.deletedAt);

const burgers = biz
  .filter((d) => {
    if (!isLiveProduct(d)) return false;
    const cat = fold(d.category);
    const brands = (d.brandIds || []).map(String);
    return (
      brands.includes(BLACKBURGER_BRAND) &&
      (cat === 'burger' || cat === 'top burger' || /burger|hamburg/.test(fold(d.name)))
    );
  })
  .sort((a, b) => fold(a.name).localeCompare(fold(b.name)));

const sides = biz
  .filter((d) => {
    if (!isLiveProduct(d)) return false;
    const cat = fold(d.category);
    return cat === 'complementos' || cat === 'sides' || cat === 'entrantes';
  })
  .sort((a, b) => fold(a.name).localeCompare(fold(b.name)));

const drinks = biz
  .filter((d) => {
    if (!isLiveProduct(d)) return false;
    if (priceOf(d) <= 0) return false;
    const cat = fold(d.category);
    const n = fold(d.name);
    // Refrescos (Bebidas) + Cervezas. Sin botellas 2L (son venta suelta).
    if (/2\s*l|\b2l\b|2\s*litros?/.test(n)) return false;
    if (cat === 'cervezas' || cat === 'cerveza') return true;
    if (cat === 'bebidas' || cat === 'refrescos') {
      // Excluir zumos caros / rarezas; dejar refrescos típicos + agua
      return true;
    }
    return false;
  })
  .sort((a, b) => fold(a.category).localeCompare(fold(b.category)) || fold(a.name).localeCompare(fold(b.name)));

const sideSurcharges = {};
for (const s of sides) {
  const n = fold(s.name);
  for (const rule of SIDE_SURCHARGE_RULES) {
    if (rule.test(n)) sideSurcharges[s._id] = rule.amount;
  }
}

const existing =
  biz.find((d) => d.itemType === 'combo' && fold(d.name) === fold(COMBO_NAME)) ||
  biz.find((d) => d.itemType === 'combo' && /combo\s*black/.test(fold(d.name)));

const template =
  biz.find((d) => d.itemType === 'combo' && fold(d.name) === 'individual') ||
  biz.find((d) => d.itemType === 'combo' && fold(d.name) === 'menú taco');

console.log(APPLY ? '=== APPLY Combo Blackburger ===' : '=== DRY Combo Blackburger ===');
console.log({
  existing: existing ? { id: existing._id, price: priceOf(existing) } : null,
  priceArg: Number.isFinite(PRICE) ? PRICE : '(falta --price=XX.XX)',
  burgers: burgers.length,
  sides: sides.length,
  drinks: drinks.length,
});
console.log(
  'Burgers:',
  burgers.map((d) => d.name).join(' · '),
);
console.log(
  'Complementos:',
  sides.map((d) => d.name).join(' · '),
);
console.log(
  'Suplementos:',
  Object.fromEntries(
    Object.entries(sideSurcharges).map(([id, v]) => [sides.find((x) => x._id === id)?.name || id, `+${v}€`]),
  ),
);
console.log(
  'Bebidas:',
  drinks.map((d) => `${d.name}[${d.category}]`).join(' · '),
);

if (!burgers.length) {
  console.error('No hay burgers blackburger');
  process.exit(1);
}
if (!sides.length) {
  console.error('No hay complementos');
  process.exit(1);
}
if (!drinks.length) {
  console.error('No hay bebidas');
  process.exit(1);
}
if (!Number.isFinite(PRICE) || PRICE <= 0) {
  console.error('\nFalta precio. Ejemplo: --price=14.90');
  process.exit(APPLY ? 1 : 0);
}

const now = new Date().toISOString();
const customFields = {
  ...(existing?.customFields || {}),
  comboStructure: COMBO_STRUCTURE,
  comboStructureConfirmed: true,
  comboSlotAllowlists: {
    main: burgers.map((d) => d._id),
    side: sides.map((d) => d._id),
    drink: drinks.map((d) => d._id),
  },
  comboSlotSurcharges: {
    side: sideSurcharges,
  },
};

const base = {
  type: 'catalog_item',
  user_id: existing?.user_id || template?.user_id || PAU_USER,
  business_id: DISARMINK,
  businessId: DISARMINK,
  vertical: 'delivery',
  module: 'catalog',
  itemType: 'combo',
  name: COMBO_NAME,
  description: '1 burger + complemento + refresco o cerveza',
  category: 'Combos',
  unitPrice: PRICE,
  price: PRICE,
  costPrice: Number(existing?.costPrice ?? template?.costPrice ?? 0),
  taxRate: existing?.taxRate ?? template?.taxRate ?? 10,
  stockQuantity: 0,
  minStock: 0,
  unit: 'ud',
  active: true,
  available: true,
  webVisible: true,
  isStockItem: false,
  stockCategory: 'finished_product',
  brandIds: [BLACKBURGER_BRAND],
  allergens: [],
  images: [],
  image: existing?.image || '',
  sku: existing?.sku || `COMBO-BB-${Date.now().toString(36).toUpperCase()}`,
  comboItems: [],
  customFields,
  updatedAt: now,
};

if (existing) {
  const next = { ...existing, ...base, _id: existing._id, _rev: existing._rev, createdAt: existing.createdAt || now };
  console.log('\nActualizar', existing._id, '→', PRICE, '€');
  if (!APPLY) {
    console.log('Dry-run. Para aplicar: --apply');
    process.exit(0);
  }
  await couch('PUT', `/bbddsaas-catalog/${encodeURIComponent(existing._id)}`, next);
  console.log('✓ actualizado', existing._id);
} else {
  const id = `catitem-${randomUUID()}`;
  const doc = { ...base, _id: id, id, createdAt: now };
  console.log('\nCrear', id, '→', PRICE, '€');
  if (!APPLY) {
    console.log('Dry-run. Para aplicar: --apply');
    process.exit(0);
  }
  await couch('PUT', `/bbddsaas-catalog/${encodeURIComponent(id)}`, doc);
  console.log('✓ creado', id);
}

console.log('TPV → Blackburger → Combos → Combo Blackburger');
