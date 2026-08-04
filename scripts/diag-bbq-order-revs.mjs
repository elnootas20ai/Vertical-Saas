#!/usr/bin/env node
/** Solo lectura: historial revs del pedido BBQ cancelado + ticket/ops display clues */
const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const ORDER = 'dord-cf24c52b-b89d-4406-911e-542b1b178eb1'; // PED-6KC491 BBQ

async function couch(path) {
  const res = await fetch(`${COUCH}${path}`, {
    headers: { Authorization: AUTH, Accept: 'application/json' },
  });
  return res.json();
}

const meta = await couch(`/bbddsaas-delivery/${ORDER}?revs_info=true`);
console.log('=== PED-6KC491 (BBQ cancelada) revs ===');
for (const info of (meta._revs_info || []).slice(0, 10)) {
  if (info.status !== 'available') {
    console.log(info.rev, info.status);
    continue;
  }
  const d = await couch(`/bbddsaas-delivery/${ORDER}?rev=${encodeURIComponent(info.rev)}`);
  console.log({
    rev: info.rev,
    status: d.status,
    totalAmount: d.totalAmount,
    discountAmount: d.discountAmount,
    itemsSubtotal: d.itemsSubtotal,
    items: (d.items || []).map((i) => ({
      name: i.name,
      qty: i.quantity,
      unitPrice: i.unitPrice,
      total: i.total,
    })),
    updatedAt: d.updatedAt,
  });
}

// ¿Hay docs conflict / deleted con BBQ?
const changes = await couch('/bbddsaas-delivery/_changes?include_docs=true&limit=50&descending=true');
const bbqish = (changes.results || [])
  .map((r) => r.doc)
  .filter(
    (d) =>
      d &&
      (d.type === 'delivery_order' || d.type === 'order') &&
      String(d.user_id || '').startsWith('13e49') &&
      (d.items || []).some((i) => /bbq/i.test(String(i.name || ''))),
  );
console.log('\n=== Últimos changes con BBQ (Pau) ===');
for (const d of bbqish.slice(0, 10)) {
  console.log({
    id: d._id,
    order: d.orderNumber,
    status: d.status,
    deleted: d._deleted || !!d.deletedAt,
    total: d.totalAmount,
    items: (d.items || []).map((i) => `${i.quantity}x ${i.name}@${i.unitPrice}`),
  });
}
