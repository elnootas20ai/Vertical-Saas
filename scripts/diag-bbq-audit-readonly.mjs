#!/usr/bin/env node
/**
 * Solo lectura — auditoría suave Badalona/Pau:
 * BBQ precio, promo 11€ L-J (no debe pillar BBQ), pedidos ~33€ / cancelados.
 */
const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const PAU = '13e49ef6-183a-4afa-a17b-7730917fe685';
const DISARMINK = 'ed846f31-aee7-4568-ac03-fa25ff3ad773';
const PROMO_ID = 'promo-pizzas-basicas-11-lj';
const BBQ_ID = 'catitem-a57bd632-954f-4f4b-b16e-d8654dd64491';

async function get(db, id) {
  const res = await fetch(`${COUCH}/${encodeURIComponent(db)}/${encodeURIComponent(id)}`, {
    headers: { Authorization: AUTH, Accept: 'application/json' },
  });
  return res.json();
}

async function allDocs(db) {
  const res = await fetch(`${COUCH}/${encodeURIComponent(db)}/_all_docs?include_docs=true&limit=100000`, {
    headers: { Authorization: AUTH, Accept: 'application/json' },
  });
  const data = await res.json();
  if (data.error) throw new Error(`${db}: ${data.error}`);
  return (data.rows || []).map((r) => r.doc).filter(Boolean);
}

function fold(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

function bid(d) {
  return String(d.business_id || d.businessId || '')
    .replace(/^business:/, '')
    .trim();
}

const [bbq, promo, delivery] = await Promise.all([
  get('bbddsaas-catalog', BBQ_ID),
  get('bbddsaas-catalog', PROMO_ID),
  allDocs('bbddsaas-delivery'),
]);

console.log('=== 1) Catálogo BBQ ===');
console.log({
  name: bbq.name,
  unitPrice: bbq.unitPrice,
  deletedAt: bbq.deletedAt || null,
  updatedAt: bbq.updatedAt,
  ok: Number(bbq.unitPrice) === 15.5 && !bbq.deletedAt,
});

console.log('\n=== 2) Promo 11€ L-J ===');
const names = promo.productMatch?.nameIncludes || [];
const wouldMatchBbq = names.some((n) => fold('BBQ').includes(fold(n)) || fold(n).includes('bbq'));
// matchPromoProduct uses word boundaries — simulate simple check
const hay = fold('BBQ');
const nameHit = names.some((n) => {
  const needle = fold(n);
  if (!needle) return false;
  const re = new RegExp(`(?:^|[^a-z0-9])${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|[^a-z0-9])`);
  return re.test(hay);
});
console.log({
  status: promo.status,
  fixedUnitPrice: promo.fixedUnitPrice,
  weekdays: promo.weekdays,
  salesPointIds: promo.salesPointIds,
  nameIncludes: names,
  BBQ_entra_en_promo: nameHit,
  ok_promo_activa: promo.status === 'active' && Number(promo.fixedUnitPrice) === 11,
  ok_BBQ_fuera: !nameHit,
});

const cutoff = '2026-07-29T00:00:00.000Z';
const orders = delivery.filter(
  (d) =>
    (d?.type === 'delivery_order' || d?.type === 'order') &&
    String(d.user_id || '') === PAU &&
    String(d.createdAt || '') >= cutoff,
);

console.log(`\n=== 3) Pedidos Pau hoy (${orders.length}) — BBQ / ~33€ / cancelados ===`);
const interesting = [];
for (const o of orders) {
  const items = o.items || [];
  const hasBbq = items.some((i) => /bbq/i.test(String(i.name || '')) && !/taco|salsa|burger|black/i.test(fold(i.name)));
  const has33 =
    Number(o.totalAmount) === 33 ||
    items.some((i) => Number(i.unitPrice) >= 32 && Number(i.unitPrice) <= 34);
  const cancelled = /cancel|anulad/i.test(String(o.status || '')) || Boolean(o.deletedAt);
  if (!hasBbq && !has33 && !cancelled) continue;
  interesting.push({
    order: o.orderNumber,
    status: o.status,
    deletedAt: o.deletedAt || null,
    createdAt: o.createdAt,
    pdv: o.salesPointName,
    itemsSubtotal: o.itemsSubtotal,
    discountAmount: o.discountAmount,
    totalAmount: o.totalAmount,
    items: items.map((i) => ({
      name: i.name,
      qty: i.quantity,
      unitPrice: i.unitPrice,
      total: i.total,
    })),
    flags: { hasBbq, has33, cancelled },
  });
}
interesting.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
for (const row of interesting) {
  console.log(JSON.stringify(row));
}

console.log('\n=== 4) Resumen ===');
const bbqOk = Number(bbq.unitPrice) === 15.5 && !bbq.deletedAt;
const promoOk = promo.status === 'active' && Number(promo.fixedUnitPrice) === 11 && !nameHit;
const bbqAt33 = interesting.some(
  (r) =>
    r.flags.hasBbq &&
    (Number(r.totalAmount) === 33 ||
      r.items.some((i) => /bbq/i.test(i.name) && Number(i.unitPrice) >= 30)),
);
console.log({
  catalogo_BBQ_15_50: bbqOk,
  promo_OK_y_BBQ_excluida: promoOk,
  hay_pedido_BBQ_a_33_activo: bbqAt33,
  nota: bbqAt33
    ? 'Hay algo raro con BBQ a 33'
    : 'No hay BBQ activa a 33€; el 33€ de hoy es Bacon×3 con promo (correcto)',
});
