#!/usr/bin/env node
/**
 * Reparación: meter venta PED-DM2Q88 (Carol 15€ efectivo) en sesión de caja Tiana.
 *
 *   node scripts/fix-carol-caja-15.mjs           # dry-run
 *   node scripts/fix-carol-caja-15.mjs --apply
 */
const APPLY = process.argv.includes('--apply');
const COUCH = process.env.COUCHDB_URL || 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from(
  `${process.env.COUCHDB_USER || 'vertialadmin'}:${process.env.COUCHDB_PASSWORD || 'uriel12345'}`,
).toString('base64');
const SESSION_ID = 'tpvreg-7d1d3343-05c3-4422-8e8c-1cb58698246a';
const ORDER_ID = 'dord-34be593e-2fa0-4a04-a6ed-e3c08cbdd552';

async function couch(path, opts = {}) {
  const res = await fetch(`${COUCH}${path}`, {
    ...opts,
    headers: {
      Authorization: AUTH,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path}: ${data.reason || data.error || res.status}`);
  return data;
}

function money(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

function isCash(pm) {
  return String(pm || '').trim().toLowerCase() === 'efectivo';
}

function expectedCash(session) {
  const txs = session.transactions || [];
  const cashSales = txs
    .filter((t) => (t.type === 'sale' || t.type === 'staff_consumption') && isCash(t.paymentMethod))
    .reduce((s, t) => s + Number(t.amount || 0), 0);
  const cashOut = txs
    .filter((t) => t.type === 'cash_out' || t.type === 'expense')
    .reduce((s, t) => s + Number(t.amount || 0), 0);
  const cashIn = txs.filter((t) => t.type === 'cash_in').reduce((s, t) => s + Number(t.amount || 0), 0);
  const returns = txs
    .filter((t) => t.type === 'return' && isCash(t.paymentMethod))
    .reduce((s, t) => s + Number(t.amount || 0), 0);
  return money(Number(session.initialCashAmount || 0) + cashSales - returns + cashIn - cashOut);
}

const session = await couch(`/bbddsaas-delivery/${SESSION_ID}`);
const order = await couch(`/bbddsaas-delivery/${ORDER_ID}`);

const already = (session.transactions || []).some(
  (t) =>
    t.type === 'sale' &&
    String(t.orderId || t.linkedDeliveryOrderId || '') === ORDER_ID,
);
console.log({
  apply: APPLY,
  order: order.orderNumber,
  status: order.status,
  paymentStatus: order.paymentStatus,
  amount: order.paidAmount || order.totalAmount,
  sessionStatus: session.status,
  alreadyInCaja: already,
  expectedBefore: expectedCash(session),
});

if (already) {
  console.log('Ya está en caja. Nada que hacer.');
  process.exit(0);
}
if (session.status !== 'open') {
  console.error('La sesión no está abierta:', session.status);
  process.exit(2);
}

const now = new Date().toISOString();
const amount = money(order.paidAmount || order.totalAmount || 15);
const tx = {
  id: `tx-fix-carol-${Date.now().toString(36)}`,
  type: 'sale',
  amount,
  paymentMethod: 'efectivo',
  description: `Pedido ${order.orderNumber} — ${order.customerName} (reparación caja)`,
  registeredBy: 'Sistema (reparación)',
  orderId: order._id,
  orderNumber: order.orderNumber || '',
  linkedDeliveryOrderId: order._id,
  channel: order.channel || 'tpv',
  date: order.paidAt || order.deliveredAt || now,
};

const linkedOrderIds = [...new Set([...(session.linkedOrderIds || []), order._id])];
const transactions = [...(session.transactions || []), tx];
const salesByChannel = { ...(session.salesByChannel || {}) };
if (tx.channel) {
  salesByChannel[tx.channel] = money(Number(salesByChannel[tx.channel] || 0) + amount);
}

const next = {
  ...session,
  transactions,
  linkedOrderIds,
  salesByChannel,
  updatedAt: now,
};

console.log('will add tx', tx);
console.log('expectedAfter', expectedCash(next));

if (!APPLY) {
  console.log('Dry-run. Pasa --apply para escribir.');
  process.exit(0);
}

const saved = await couch(`/bbddsaas-delivery/${SESSION_ID}`, {
  method: 'PUT',
  body: JSON.stringify(next),
});
console.log('OK rev', saved.rev);
const verify = await couch(`/bbddsaas-delivery/${SESSION_ID}`);
console.log({
  expectedNow: expectedCash(verify),
  cashSales: money(
    (verify.transactions || [])
      .filter((t) => t.type === 'sale' && isCash(t.paymentMethod))
      .reduce((s, t) => s + Number(t.amount || 0), 0),
  ),
  linked: (verify.linkedOrderIds || []).includes(ORDER_ID),
});
