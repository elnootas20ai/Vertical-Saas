#!/usr/bin/env node
/**
 * Solo lectura: pizzas BBQ / precios ~33€ en catálogo y pedidos recientes Badalona/Pau.
 */
const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const PAU = '13e49ef6-183a-4afa-a17b-7730917fe685';
const DISARMINK = 'ed846f31-aee7-4568-ac03-fa25ff3ad773';

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

const catalog = await allDocs('bbddsaas-catalog');
const items = catalog.filter(
  (d) =>
    d?.type === 'catalog_item' &&
    !d?.deletedAt &&
    String(d.business_id || d.businessId || '').replace(/^business:/, '') === DISARMINK,
);

const bbq = items.filter((d) => /bbq|barbecue|barbacoa/.test(fold(d.name)));
const near33 = items.filter((d) => {
  const p = Number(d.unitPrice);
  return p >= 30 && p <= 36;
});

console.log('=== Catálogo DISARMINK BBQ ===');
for (const d of bbq.sort((a, b) => String(a.name).localeCompare(String(b.name)))) {
  console.log({
    id: d._id,
    name: d.name,
    unitPrice: d.unitPrice,
    category: d.category,
    updatedAt: d.updatedAt,
  });
}

console.log('\n=== Catálogo DISARMINK precio 30–36 € ===');
for (const d of near33.sort((a, b) => Number(b.unitPrice) - Number(a.unitPrice))) {
  console.log({ name: d.name, unitPrice: d.unitPrice, category: d.category, id: d._id, updatedAt: d.updatedAt });
}

const delivery = await allDocs('bbddsaas-delivery');
const cutoff = Date.now() - 2 * 24 * 60 * 60 * 1000;
const hits = [];
for (const o of delivery) {
  if (o?.type !== 'delivery_order' || o.deletedAt) continue;
  if (String(o.user_id || '') !== PAU) continue;
  const t = Date.parse(o.createdAt || o.updatedAt || 0);
  if (t && t < cutoff) continue;
  for (const it of o.items || []) {
    const name = String(it.name || '');
    const price = Number(it.unitPrice || it.total || 0);
    const isBbq = /bbq|barbecue|barbacoa/.test(fold(name));
    const is33 = price >= 32 && price <= 34;
    if (!isBbq && !is33) continue;
    if (!isBbq && !/pizza|calzone/i.test(name + ' ' + (it.category || ''))) continue;
    hits.push({
      order: o.orderNumber,
      status: o.status,
      createdAt: o.createdAt,
      pdv: o.salesPointName,
      name,
      qty: it.quantity,
      unitPrice: it.unitPrice,
      total: it.total,
      extras: it.extras,
    });
  }
}
console.log('\n=== Pedidos Pau ~2d con BBQ o ~33€ pizza ===');
console.log('hits', hits.length);
for (const h of hits.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 30)) {
  console.log(JSON.stringify(h));
}
