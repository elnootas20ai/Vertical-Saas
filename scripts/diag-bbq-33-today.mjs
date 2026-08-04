#!/usr/bin/env node
const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const PAU = '13e49ef6-183a-4afa-a17b-7730917fe685';

async function allDocs(db) {
  const res = await fetch(`${COUCH}/${encodeURIComponent(db)}/_all_docs?include_docs=true&limit=100000`, {
    headers: { Authorization: AUTH, Accept: 'application/json' },
  });
  const data = await res.json();
  return (data.rows || []).map((r) => r.doc).filter(Boolean);
}

const delivery = await allDocs('bbddsaas-delivery');
const cutoff = Date.now() - 1 * 24 * 60 * 60 * 1000;
const hits = [];
for (const o of delivery) {
  if (o?.type !== 'delivery_order' || o.deletedAt) continue;
  if (String(o.user_id || '') !== PAU) continue;
  const t = Date.parse(o.createdAt || 0);
  if (t && t < cutoff) continue;
  for (const it of o.items || []) {
    const unit = Number(it.unitPrice || 0);
    const tot = Number(it.total || 0);
    if ((unit >= 32 && unit <= 34) || (tot >= 32 && tot <= 34) || Number(o.totalAmount) === 33) {
      hits.push({
        order: o.orderNumber,
        status: o.status,
        createdAt: o.createdAt,
        pdv: o.salesPointName,
        orderTotal: o.totalAmount,
        name: it.name,
        qty: it.quantity,
        unitPrice: it.unitPrice,
        total: it.total,
        extras: it.extras,
        category: it.category,
      });
    }
  }
}
console.log('hits ~33 hoy', hits.length);
for (const h of hits) console.log(JSON.stringify(h, null, 2));

// Histórico unitPrice BBQ doc revs? Couch no da historial fácil; mirar updatedAt
const bbq = await (await fetch(`${COUCH}/bbddsaas-catalog/catitem-a57bd632-954f-4f4b-b16e-d8654dd64491`, {
  headers: { Authorization: AUTH, Accept: 'application/json' },
})).json();
console.log('\nBBQ catalog full price fields:', {
  name: bbq.name,
  unitPrice: bbq.unitPrice,
  price: bbq.price,
  basePrice: bbq.basePrice,
  updatedAt: bbq.updatedAt,
  createdAt: bbq.createdAt,
});
