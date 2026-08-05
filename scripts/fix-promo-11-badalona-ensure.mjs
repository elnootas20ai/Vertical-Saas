#!/usr/bin/env node
/**
 * Asegura promo «Pizzas básicas 11€ L-J» en BADALONA (Pau).
 * - Solo Badalona (wc + pdv del TPV; sin Tiana)
 * - 5 pizzas: Prosciutto, Bacon, Calzone aperta, Margarita, Roquefort
 *
 *   node scripts/fix-promo-11-badalona-ensure.mjs
 *   node scripts/fix-promo-11-badalona-ensure.mjs --apply
 */
const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const APPLY = process.argv.includes('--apply');

const PROMO_ID = 'promo-pizzas-basicas-11-lj';
const PAU = '13e49ef6-183a-4afa-a17b-7730917fe685';
const BADALONA_WC = 'wc-16361270-5794-4b95-89e5-644685f36e24';
const BADALONA_PDV = 'pdv-594a8503-1515-47b8-9e02-fb8ff09052b6';
const TIANA_WC = 'wc-ffdee346-8730-4aeb-961d-24832f17f1c1';

const NAME_INCLUDES = [
  'prosciutto',
  'proscuito',
  'bacon',
  'calzone aperta',
  'calzone apertas',
  'margarita',
  'margherita',
  'roquefort',
];

async function couch(method, path, body) {
  const res = await fetch(`${COUCH}${path}`, {
    method,
    headers: { Authorization: AUTH, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok && !(method === 'GET' && res.status === 404)) {
    throw new Error(`${method} ${path}: ${data.error || res.status} ${data.reason || ''}`);
  }
  return data;
}

const existing = await couch('GET', `/bbddsaas-catalog/${encodeURIComponent(PROMO_ID)}`);
const now = new Date().toISOString();

const base = existing && existing.type === 'promotion'
  ? existing
  : {
      _id: PROMO_ID,
      type: 'promotion',
      id: PROMO_ID,
      user_id: PAU,
      createdAt: now,
    };

const next = {
  ...base,
  _id: PROMO_ID,
  type: 'promotion',
  id: PROMO_ID,
  name: 'Pizzas básicas 11€ L-J',
  description: 'Prosciutto, Bacon, Calzone aperta, Margarita y Roquefort a 11€ de lunes a jueves. Solo Badalona.',
  status: 'active',
  active: true,
  promoType: 'fixed_unit_price',
  fixedUnitPrice: 11,
  discountValue: 11,
  weekdays: [1, 2, 3, 4],
  applyMode: 'auto',
  salesPointIds: [BADALONA_WC, BADALONA_PDV],
  excludeSalesPointIds: [TIANA_WC],
  user_id: PAU,
  productMatch: {
    productIds: Array.isArray(base.productMatch?.productIds) ? base.productMatch.productIds : [],
    nameIncludes: NAME_INCLUDES,
  },
  discountTarget: 'product',
  extrasMode: 'on_top',
  startDate: base.startDate || '2026-01-01T00:00:00.000Z',
  endDate: base.endDate || '2030-12-31T23:59:59.000Z',
  updatedAt: now,
  deletedAt: null,
};

console.log(APPLY ? '=== APPLY ===' : '=== DRY ===');
console.log('Antes:', existing?.type === 'promotion' ? {
  status: existing.status,
  fixedUnitPrice: existing.fixedUnitPrice,
  weekdays: existing.weekdays,
  salesPointIds: existing.salesPointIds,
  nameIncludes: existing.productMatch?.nameIncludes,
} : '(no existía)');
console.log('Después:', {
  status: next.status,
  fixedUnitPrice: next.fixedUnitPrice,
  weekdays: next.weekdays,
  salesPointIds: next.salesPointIds,
  nameIncludes: next.productMatch.nameIncludes,
});

if (!APPLY) {
  console.log('\nDry-run OK. Pasa --apply para guardar.');
  process.exit(0);
}

const saved = await couch('PUT', `/bbddsaas-catalog/${encodeURIComponent(PROMO_ID)}`, next);
console.log('OK rev=', saved.rev);

const check = await couch('GET', `/bbddsaas-catalog/${encodeURIComponent(PROMO_ID)}`);
console.log('Verificación:', {
  status: check.status,
  fixedUnitPrice: check.fixedUnitPrice,
  weekdays: check.weekdays,
  salesPointIds: check.salesPointIds,
  nameIncludes: check.productMatch?.nameIncludes,
  type: check.type,
});
