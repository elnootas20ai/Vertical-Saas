#!/usr/bin/env node
const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const id = 'dord-' + 'search';

async function allDocs(db) {
  const res = await fetch(`${COUCH}/${encodeURIComponent(db)}/_all_docs?include_docs=true&limit=100000`, {
    headers: { Authorization: AUTH, Accept: 'application/json' },
  });
  const data = await res.json();
  return (data.rows || []).map((r) => r.doc).filter(Boolean);
}

const docs = await allDocs('bbddsaas-delivery');
const o = docs.find((d) => d?.orderNumber === 'PED-6LQQRF' || d?.orderNumber === 'PED-6KC491');
const recent = docs
  .filter((d) => d?.type === 'delivery_order' && d.user_id?.startsWith('13e49') && String(d.createdAt || '') >= '2026-07-29T20:')
  .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
  .slice(0, 15);

for (const ord of recent) {
  const hasBbq = (ord.items || []).some((i) => /bbq/i.test(String(i.name || '')));
  const tot = Number(ord.totalAmount);
  if (!hasBbq && tot !== 33 && !(ord.items || []).some((i) => Number(i.unitPrice) >= 30 || Number(i.total) >= 30)) {
    continue;
  }
  console.log(JSON.stringify({
    order: ord.orderNumber,
    status: ord.status,
    createdAt: ord.createdAt,
    itemsSubtotal: ord.itemsSubtotal,
    discountAmount: ord.discountAmount,
    deliveryFee: ord.deliveryFee,
    totalAmount: ord.totalAmount,
    items: (ord.items || []).map((i) => ({ name: i.name, qty: i.quantity, unitPrice: i.unitPrice, total: i.total, extras: i.extras })),
  }, null, 2));
  console.log('---');
}

console.log('\n=== PED-6LQQRF ===');
const x = docs.find((d) => d?.orderNumber === 'PED-6LQQRF');
if (x) {
  console.log(JSON.stringify({
    order: x.orderNumber,
    itemsSubtotal: x.itemsSubtotal,
    discountAmount: x.discountAmount,
    totalAmount: x.totalAmount,
    items: x.items,
  }, null, 2));
}
