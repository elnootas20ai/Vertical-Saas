#!/usr/bin/env node
const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const id = 'dord-4bce4707-5f8f-4557-9a83-8a7c3b088f56';
const res = await fetch(`${COUCH}/bbddsaas-delivery/${id}`, {
  headers: { Authorization: AUTH, Accept: 'application/json' },
});
const o = await res.json();
console.log(JSON.stringify({
  orderNumber: o.orderNumber,
  status: o.status,
  paymentStatus: o.paymentStatus,
  paymentMethod: o.paymentMethod,
  itemsSubtotal: o.itemsSubtotal,
  discountAmount: o.discountAmount,
  deliveryFee: o.deliveryFee,
  totalAmount: o.totalAmount,
  paidAmount: o.paidAmount,
  deliveryType: o.deliveryType,
  salesPointId: o.salesPointId,
  items: (o.items || []).map((i) => ({ name: i.name, qty: i.quantity, unitPrice: i.unitPrice, total: i.total })),
}, null, 2));

// session PDV id vs promo
const sessions = await (await fetch(`${COUCH}/bbddsaas-delivery/_all_docs?include_docs=true&limit=100000`, {
  headers: { Authorization: AUTH, Accept: 'application/json' },
})).json();
const open = (sessions.rows || []).map((r) => r.doc).find((d) => d?._id === 'tpvreg-bbd0a90a-1699-4ee7-ae3a-1f8275de8656');
console.log('\nSESSION', open ? {
  pointOfSaleId: open.pointOfSaleId,
  pointOfSaleName: open.pointOfSaleName,
  workCenterId: open.workCenterId,
} : null);
