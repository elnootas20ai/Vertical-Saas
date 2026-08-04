#!/usr/bin/env node
/**
 * Solo lectura: detalle pedido Prosciutto Badalona + catálogo + promo.
 */
const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const ORDER_ID = 'dord-4bce4707-5f8f-4557-9a83-8a7c3b088f56';
const PROMO_ID = 'promo-pizzas-basicas-11-lj';

async function get(db, id) {
  const res = await fetch(`${COUCH}/${encodeURIComponent(db)}/${encodeURIComponent(id)}`, {
    headers: { Authorization: AUTH, Accept: 'application/json' },
  });
  return res.json();
}

const order = await get('bbddsaas-delivery', ORDER_ID);
const promo = await get('bbddsaas-catalog', PROMO_ID);
const item = (order.items || [])[0] || {};
const catId = item.catalogItemId;
const cat = catId ? await get('bbddsaas-catalog', catId) : null;

console.log('ORDER', JSON.stringify({
  _id: order._id,
  orderNumber: order.orderNumber,
  status: order.status,
  paymentStatus: order.paymentStatus,
  salesPointId: order.salesPointId,
  pointOfSaleId: order.pointOfSaleId,
  workCenterId: order.workCenterId,
  salesPointName: order.salesPointName,
  subtotal: order.subtotal,
  discount: order.discount,
  total: order.total,
  totals: order.totals,
  paymentMethod: order.paymentMethod,
  registerSessionId: order.registerSessionId || order.tpvRegisterSessionId,
  items: order.items,
  pricing: order.pricing,
  promotions: order.promotions || order.appliedPromotions,
}, null, 2));

console.log('\nCATALOG ITEM', cat ? JSON.stringify({
  _id: cat._id,
  name: cat.name,
  unitPrice: cat.unitPrice,
  price: cat.price,
  business_id: cat.business_id,
}, null, 2) : 'n/a');

console.log('\nPROMO', JSON.stringify({
  _id: promo._id,
  name: promo.name,
  status: promo.status,
  fixedUnitPrice: promo.fixedUnitPrice,
  weekdays: promo.weekdays,
  salesPointIds: promo.salesPointIds,
  productMatch: promo.productMatch,
}, null, 2));
