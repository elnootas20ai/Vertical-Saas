#!/usr/bin/env node
/**
 * Solo PED-6IRJAK: dto L-J 11€ en Prosciutto (14.5→11). No toca promo ni otros pedidos.
 *   node scripts/fix-prosciutto-promo-ped-6irjak.mjs
 *   node scripts/fix-prosciutto-promo-ped-6irjak.mjs --apply
 */
const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const APPLY = process.argv.includes('--apply');
const ORDER_ID = 'dord-4bce4707-5f8f-4557-9a83-8a7c3b088f56';
const FIXED = 11;

async function couch(method, path, body) {
  const res = await fetch(`${COUCH}${path}`, {
    method,
    headers: { Authorization: AUTH, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path}: ${data.error || res.status} ${data.reason || ''}`);
  return data;
}

function roundMoney(n) {
  return Math.round(Number(n) * 100) / 100;
}

const order = await couch('GET', `/bbddsaas-delivery/${encodeURIComponent(ORDER_ID)}`);
if (order.type !== 'delivery_order') throw new Error('pedido no encontrado');
if (String(order.orderNumber || '').toUpperCase() !== 'PED-6IRJAK') {
  throw new Error(`orderNumber inesperado: ${order.orderNumber}`);
}

const items = Array.isArray(order.items) ? order.items : [];
const pro = items.find((i) => /prosc?i?utto|proscuito/i.test(String(i.name || '')));
if (!pro) throw new Error('No hay línea Prosciutto');

const unit = Number(pro.unitPrice || 0);
const qty = Math.max(1, Number(pro.quantity || 1));
if (unit <= FIXED) throw new Error(`unitPrice ${unit} ya ≤ ${FIXED}`);

const lineDiscount = roundMoney((unit - FIXED) * qty);
const itemsSubtotal = roundMoney(items.reduce((s, i) => s + Number(i.total || 0), 0));
const deliveryFee = roundMoney(Number(order.deliveryFee || 0));
const nextDiscount = roundMoney(lineDiscount);
const nextTotal = roundMoney(Math.max(0, itemsSubtotal - nextDiscount) + deliveryFee);

console.log(APPLY ? '=== APPLY (solo pedido) ===' : '=== DRY ===');
console.log(`${order.orderNumber}: Prosciutto ${unit}→${FIXED} (dto ${lineDiscount}€)`);
console.log(`discountAmount ${order.discountAmount || 0} → ${nextDiscount}`);
console.log(`totalAmount ${order.totalAmount} → ${nextTotal}`);
console.log('(no se toca la promo ni otros tickets)');

if (!APPLY) {
  console.log('Dry-run OK. Pasa --apply para guardar.');
  process.exit(0);
}

const saved = await couch('PUT', `/bbddsaas-delivery/${encodeURIComponent(ORDER_ID)}`, {
  ...order,
  discountAmount: nextDiscount,
  totalAmount: nextTotal,
  updatedAt: new Date().toISOString(),
});
console.log('OK rev=', saved.rev);

const check = await couch('GET', `/bbddsaas-delivery/${encodeURIComponent(ORDER_ID)}`);
console.log('Verificación:', {
  discountAmount: check.discountAmount,
  totalAmount: check.totalAmount,
  items: (check.items || []).map((i) => ({ name: i.name, unitPrice: i.unitPrice, total: i.total })),
});
