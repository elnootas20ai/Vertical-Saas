#!/usr/bin/env node
/**
 * Quita el efectivo duplicado PED-3D06SP (50€ x2) en caja Tiana abierta.
 *   node scripts/fix-tiana-dup-cash-ped-3d06sp.mjs
 *   node scripts/fix-tiana-dup-cash-ped-3d06sp.mjs --apply
 */
const APPLY = process.argv.includes('--apply');
const COUCH = process.env.COUCHDB_URL || 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from(
  `${process.env.COUCHDB_USER || 'vertialadmin'}:${process.env.COUCHDB_PASSWORD || 'uriel12345'}`,
).toString('base64');

const SESSION_ID = 'tpvreg-ae337257-19b2-4685-8219-f386d990b7c0';
const ORDER_ID = 'dord-c8e08cd2-8ddd-4a12-8ccc-4367f70547d0';
/** Segunda tx efectivo 50€ (20:42) — la de más */
const REMOVE_TX_ID = 'tx-1787344978740-cp9f';
/** Segundo pago efectivo 50€ en el pedido */
const REMOVE_PAY_ID = 'pay-mt3f1vuc-f13nj';

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

function rebuildSummary(session) {
  const txs = session.transactions || [];
  const sales = txs.filter((t) => t.type === 'sale');
  const sumBy = (pm) =>
    money(
      sales
        .filter((t) => String(t.paymentMethod || '').toLowerCase() === pm)
        .reduce((s, t) => s + Number(t.amount || 0), 0),
    );
  const totalSales = money(sales.reduce((s, t) => s + Number(t.amount || 0), 0));
  const salesByChannel = {};
  for (const t of sales) {
    if (t.channel) salesByChannel[t.channel] = money((salesByChannel[t.channel] || 0) + Number(t.amount || 0));
  }
  return {
    ...(session.summary || {}),
    totalSales,
    salesByMethod: {
      efectivo: sumBy('efectivo'),
      tarjeta: sumBy('tarjeta'),
      bizum: sumBy('bizum'),
      online: sumBy('online'),
      otro: sumBy('otro'),
    },
    salesByChannel,
    totalTransactions: txs.length,
  };
}

function cashSales(session) {
  return money(
    (session.transactions || [])
      .filter((t) => t.type === 'sale' && String(t.paymentMethod || '').toLowerCase() === 'efectivo')
      .reduce((s, t) => s + Number(t.amount || 0), 0),
  );
}

const session = await couch(`/bbddsaas-delivery/${encodeURIComponent(SESSION_ID)}`);
const order = await couch(`/bbddsaas-delivery/${encodeURIComponent(ORDER_ID)}`);

const txs = session.transactions || [];
const cashForOrder = txs.filter(
  (t) =>
    t.type === 'sale'
    && String(t.paymentMethod || '').toLowerCase() === 'efectivo'
    && (String(t.orderId || t.linkedDeliveryOrderId || '') === ORDER_ID
      || /PED-3D06SP/i.test(String(t.description || ''))),
);

console.log({
  apply: APPLY,
  sessionStatus: session.status,
  cashBefore: cashSales(session),
  totalBefore: session.summary?.totalSales,
  cashTxsForOrder: cashForOrder.map((t) => ({ id: t.id, amount: t.amount, at: t.date || t.createdAt })),
  orderPayments: (order.payments || []).map((p) => ({ id: p.id, method: p.method, amount: p.amount })),
});

if (session.status !== 'open') {
  console.error('Sesión no abierta — abort');
  process.exit(2);
}

const victimTx = txs.find((t) => t.id === REMOVE_TX_ID);
if (!victimTx) {
  console.error('No está la tx a quitar:', REMOVE_TX_ID);
  process.exit(2);
}
if (Number(victimTx.amount) !== 50 || String(victimTx.paymentMethod).toLowerCase() !== 'efectivo') {
  console.error('Tx inesperada:', victimTx);
  process.exit(2);
}

const nextTxs = txs.filter((t) => t.id !== REMOVE_TX_ID);
const nextSession = {
  ...session,
  transactions: nextTxs,
  summary: rebuildSummary({ ...session, transactions: nextTxs }),
  updatedAt: new Date().toISOString(),
};

const pays = Array.isArray(order.payments) ? order.payments : [];
const victimPay = pays.find((p) => p.id === REMOVE_PAY_ID);
if (!victimPay) {
  console.error('No está el pago a quitar en pedido:', REMOVE_PAY_ID);
  process.exit(2);
}
const nextPays = pays.filter((p) => p.id !== REMOVE_PAY_ID);
const nextOrder = {
  ...order,
  payments: nextPays,
  updatedAt: new Date().toISOString(),
};

console.log({
  cashAfter: cashSales(nextSession),
  totalAfter: nextSession.summary.totalSales,
  removedTx: REMOVE_TX_ID,
  removedPay: REMOVE_PAY_ID,
  remainingCashTxs: nextTxs.filter(
    (t) =>
      t.type === 'sale'
      && String(t.paymentMethod || '').toLowerCase() === 'efectivo'
      && String(t.orderId || '') === ORDER_ID,
  ).map((t) => ({ id: t.id, amount: t.amount })),
  remainingPays: nextPays.map((p) => ({ id: p.id, method: p.method, amount: p.amount })),
});

if (!APPLY) {
  console.log('Dry-run. Pasa --apply para escribir.');
  process.exit(0);
}

const savedS = await couch(`/bbddsaas-delivery/${encodeURIComponent(SESSION_ID)}`, {
  method: 'PUT',
  body: JSON.stringify(nextSession),
});
const savedO = await couch(`/bbddsaas-delivery/${encodeURIComponent(ORDER_ID)}`, {
  method: 'PUT',
  body: JSON.stringify(nextOrder),
});

const verifyS = await couch(`/bbddsaas-delivery/${encodeURIComponent(SESSION_ID)}`);
const verifyO = await couch(`/bbddsaas-delivery/${encodeURIComponent(ORDER_ID)}`);
console.log({
  ok: true,
  sessionRev: savedS.rev,
  orderRev: savedO.rev,
  cashNow: cashSales(verifyS),
  totalNow: verifyS.summary?.totalSales,
  orderCashPays: (verifyO.payments || []).filter((p) => p.method === 'efectivo'),
});
