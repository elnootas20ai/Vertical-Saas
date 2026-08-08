#!/usr/bin/env node
/**
 * Solo lectura: cierre Tiana abierto — split Modomio / Blackburger efectivo+tarjeta.
 */
const COUCH = process.env.COUCHDB_URL || 'http://127.0.0.1:5984';
const AUTH =
  'Basic ' +
  Buffer.from(`${process.env.COUCHDB_USER || ''}:${process.env.COUCHDB_PASSWORD || ''}`).toString(
    'base64',
  );
const SESSION = 'tpvreg-212f55a3-24ea-43a9-b337-b6e5b138a3ad';

async function couch(path) {
  const res = await fetch(`${COUCH}${path}`, {
    headers: { Authorization: AUTH, Accept: 'application/json' },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path}: ${data.reason || data.error || res.status}`);
  return data;
}

function money(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function pm(v) {
  return String(v || '').trim().toLowerCase();
}

const sess = await couch(`/bbddsaas-delivery/${SESSION}`);
const sales = (sess.transactions || []).filter((t) => t.type === 'sale');
console.log('=== SESSION ===');
console.log({
  name: sess.salesPointName || sess.pointOfSaleName,
  status: sess.status,
  openedAt: sess.openedAt,
  worker: sess.openedByName || sess.workerName,
  businessId: sess.business_id || sess.businessId,
  salesPointId: sess.salesPointId || sess.pointOfSaleId,
});
console.log({
  saleCount: sales.length,
  efectivo: money(
    sales.filter((t) => pm(t.paymentMethod) === 'efectivo').reduce((s, t) => s + Number(t.amount || 0), 0),
  ),
  tarjeta: money(
    sales.filter((t) => pm(t.paymentMethod) === 'tarjeta').reduce((s, t) => s + Number(t.amount || 0), 0),
  ),
});

const orderIds = [
  ...new Set(sales.map((t) => String(t.linkedDeliveryOrderId || t.orderId || '').trim()).filter(Boolean)),
];

const brandNameById = new Map();
for (const db of ['bbddsaas-brands', 'udar-brands', 'vertial-brands']) {
  try {
    const data = await couch(`/${db}/_all_docs?include_docs=true`);
    for (const row of data.rows || []) {
      const d = row.doc;
      if (!d || d.type !== 'brand') continue;
      brandNameById.set(d._id, d.name);
    }
  } catch {
    /* db missing */
  }
}

// billing configs mentioning modomio/black or for this business
const bid = String(sess.business_id || sess.businessId || '').replace(/^business:/, '');
for (const db of ['bbddsaas-delivery', 'bbddsaas']) {
  try {
    const data = await couch(`/${db}/_all_docs?include_docs=true&limit=50000`);
    for (const row of data.rows || []) {
      const d = row.doc;
      if (!d || d.type !== 'brand_billing_config') continue;
      const b = String(d.business_id || d.businessId || '').replace(/^business:/, '');
      if (b && bid && b !== bid) continue;
      console.log('=== BILLING CONFIG ===');
      console.log({
        db,
        id: d._id,
        business_id: b,
        sheets: (d.sheets || []).map((s) => ({
          id: s.id,
          label: s.label,
          brandIds: s.brandIds,
          brandNames: (s.brandIds || []).map((id) => brandNameById.get(id) || id),
        })),
        sharedSplitMode: d.sharedSplitMode,
        orphanMode: d.orphanMode,
      });
    }
  } catch {
    /* ignore */
  }
}

const byBrand = new Map();
let ordersWithBrand = 0;
let ordersWithout = 0;
const unknownBrandIds = new Set();

for (const id of orderIds) {
  let order;
  try {
    order = await couch(`/bbddsaas-delivery/${encodeURIComponent(id)}`);
  } catch {
    continue;
  }
  const orderPay = { efectivo: 0, tarjeta: 0 };
  for (const t of sales) {
    const oid = String(t.linkedDeliveryOrderId || t.orderId || '').trim();
    if (oid !== id) continue;
    const amount = money(t.amount);
    if (pm(t.paymentMethod) === 'efectivo') orderPay.efectivo = money(orderPay.efectivo + amount);
    if (pm(t.paymentMethod) === 'tarjeta') orderPay.tarjeta = money(orderPay.tarjeta + amount);
  }
  const orderTotal = money(orderPay.efectivo + orderPay.tarjeta) || money(order.totalAmount || order.total);

  // attribute by line brandIds (simple equal split of pay if multi-brand)
  const items = Array.isArray(order.items) ? order.items : [];
  const lineWeights = [];
  for (const item of items) {
    const ids = Array.isArray(item.brandIds)
      ? item.brandIds.map((b) => String(b || '').trim()).filter(Boolean)
      : [];
    const lineAmt =
      money(item.total ?? item.lineTotal ?? item.linePrice) ||
      money(Number(item.price || 0) * Number(item.quantity || 1));
    if (ids.length === 0) {
      lineWeights.push({ brandId: '__unbranded__', amount: lineAmt });
    } else {
      const each = money(lineAmt / ids.length);
      for (const brandId of ids) lineWeights.push({ brandId, amount: each });
    }
  }
  const brandedSum = money(lineWeights.filter((w) => w.brandId !== '__unbranded__').reduce((s, w) => s + w.amount, 0));
  const unbrandedSum = money(lineWeights.filter((w) => w.brandId === '__unbranded__').reduce((s, w) => s + w.amount, 0));
  if (brandedSum > 0) ordersWithBrand += 1;
  else ordersWithout += 1;

  const brandTotals = new Map();
  for (const w of lineWeights) {
    if (w.brandId === '__unbranded__') continue;
    brandTotals.set(w.brandId, money((brandTotals.get(w.brandId) || 0) + w.amount));
  }
  // absorb unbranded into majority brand of order (approx UI)
  if (unbrandedSum > 0 && brandTotals.size > 0) {
    const top = [...brandTotals.entries()].sort((a, b) => b[1] - a[1])[0][0];
    brandTotals.set(top, money((brandTotals.get(top) || 0) + unbrandedSum));
  } else if (unbrandedSum > 0 && brandTotals.size === 0) {
    brandTotals.set('__unbranded__', unbrandedSum);
  }

  const attrSum = money([...brandTotals.values()].reduce((s, n) => s + n, 0)) || orderTotal || 1;
  for (const [brandId, amt] of brandTotals) {
    const share = amt / attrSum;
    const row = byBrand.get(brandId) || { revenue: 0, efectivo: 0, tarjeta: 0, orders: 0 };
    row.revenue = money(row.revenue + orderTotal * share);
    row.efectivo = money(row.efectivo + orderPay.efectivo * share);
    row.tarjeta = money(row.tarjeta + orderPay.tarjeta * share);
    row.orders += 1;
    byBrand.set(brandId, row);
    if (!brandNameById.has(brandId) && brandId !== '__unbranded__') unknownBrandIds.add(brandId);
  }
}

console.log('=== BRAND SPLIT (approx from order brandIds) ===');
console.log({ ordersLinked: orderIds.length, ordersWithBrand, ordersWithout });
const rows = [...byBrand.entries()]
  .map(([brandId, row]) => ({
    brandId,
    name: brandNameById.get(brandId) || brandId,
    ...row,
  }))
  .sort((a, b) => b.revenue - a.revenue);
for (const r of rows) {
  console.log(
    `${r.name}: total ${r.revenue}€ · efectivo ${r.efectivo}€ · tarjeta ${r.tarjeta}€ · pedidos ${r.orders}`,
  );
}
if (unknownBrandIds.size) console.log('unknown brand ids', [...unknownBrandIds]);
