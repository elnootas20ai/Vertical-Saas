#!/usr/bin/env node
/**
 * Solo lectura: auditar pedidos del turno abierto MODOMIO TIANA vs txs de caja.
 */
const COUCH = process.env.COUCHDB_URL || 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from(
  `${process.env.COUCHDB_USER || 'vertialadmin'}:${process.env.COUCHDB_PASSWORD || 'uriel12345'}`,
).toString('base64');
const SESSION_ID = 'tpvreg-7d1d3343-05c3-4422-8e8c-1cb58698246a';

async function couch(path) {
  const res = await fetch(`${COUCH}${path}`, {
    headers: { Authorization: AUTH, Accept: 'application/json' },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path}: ${data.reason || data.error || res.status}`);
  return data;
}

function money(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

function pm(v) {
  return String(v || '').trim().toLowerCase();
}

function chargeTotal(o) {
  const n = Number(o.paidAmount ?? o.totalAmount ?? o.total ?? 0);
  return money(n);
}

function itemSum(o) {
  const items = o.items || [];
  const sum = items.reduce((s, it) => s + Number(it.total || 0), 0);
  const fee = Math.max(0, Number(o.deliveryFee || 0));
  return money(sum + fee);
}

const session = await couch(`/bbddsaas-delivery/${encodeURIComponent(SESSION_ID)}`);
const txs = session.transactions || [];
const sales = txs.filter((t) => t.type === 'sale');
const linked = [...new Set([
  ...(session.linkedOrderIds || []),
  ...sales.map((t) => String(t.orderId || t.relatedOrderId || t.linkedDeliveryOrderId || '').trim()).filter(Boolean),
])];

console.log('session', {
  status: session.status,
  openedAt: session.openedAt,
  fondo: session.initialCashAmount,
  name: session.salesPointName || session.pointOfSaleName,
  salesTx: sales.length,
  linked: linked.length,
});

const orders = [];
for (const id of linked) {
  try {
    orders.push(await couch(`/bbddsaas-delivery/${encodeURIComponent(id)}`));
  } catch (e) {
    console.log('missing order', id, String(e.message || e));
  }
}

// Also find orders by registerSessionId / created in window for same PDV
const all = await couch('/bbddsaas-delivery/_all_docs?include_docs=true');
const pdv = String(session.salesPointId || session.pointOfSaleId || '');
const opened = new Date(session.openedAt).getTime();
const extras = (all.rows || [])
  .map((r) => r.doc)
  .filter(Boolean)
  .filter((d) => String(d.type || '') === 'delivery_order' || String(d._id || '').startsWith('dord-'))
  .filter((d) => {
    const sp = String(d.salesPointId || d.pointOfSaleId || '');
    const reg = String(d.registerSessionId || d.tpvRegisterSessionId || '');
    const t = new Date(d.createdAt || d.paidAt || 0).getTime();
    if (reg && reg === SESSION_ID) return true;
    if (pdv && sp === pdv && t >= opened - 60_000) return true;
    return false;
  });

const byId = new Map();
for (const o of [...orders, ...extras]) byId.set(o._id, o);
const allOrders = [...byId.values()].sort(
  (a, b) => new Date(a.createdAt || a.paidAt || 0) - new Date(b.createdAt || b.paidAt || 0),
);

console.log('\n=== ORDERS ===');
let sumCash = 0;
let sumCard = 0;
let sumOther = 0;
let sumAll = 0;
const flags = [];

for (const o of allOrders) {
  const status = String(o.status || '');
  const paymentStatus = String(o.paymentStatus || '');
  const method = pm(o.paymentMethod);
  const total = chargeTotal(o);
  const items = itemSum(o);
  const delta = money(total - items);
  const inSession = linked.includes(o._id) || String(o.registerSessionId || '') === SESSION_ID;
  const saleTx = sales.find(
    (t) => String(t.orderId || t.relatedOrderId || t.linkedDeliveryOrderId || '') === o._id,
  );
  const txAmount = saleTx ? money(saleTx.amount) : null;
  const txPm = saleTx ? pm(saleTx.paymentMethod) : null;

  if (status === 'cancelled' || status === 'eliminado' || paymentStatus === 'refunded') {
    // still log
  } else if (method === 'efectivo') {
    sumCash += total;
  } else if (method === 'tarjeta') {
    sumCard += total;
  } else {
    sumOther += total;
  }
  if (status !== 'cancelled' && status !== 'eliminado') sumAll += total;

  const problems = [];
  if (Math.abs(delta) > 0.02) problems.push(`total≠items(${delta})`);
  if (saleTx && Math.abs(txAmount - total) > 0.02) problems.push(`tx≠order(${txAmount} vs ${total})`);
  if (saleTx && txPm && method && txPm !== method) problems.push(`pm mismatch tx=${txPm} order=${method}`);
  if (!saleTx && paymentStatus === 'paid' && !['cancelled', 'eliminado'].includes(status) && inSession) {
    problems.push('paid but no sale tx');
  }
  if (saleTx && ['cancelled', 'eliminado'].includes(status)) problems.push('sale tx but order cancelled');

  const row = {
    num: o.orderNumber,
    id: o._id.slice(-8),
    status,
    paymentStatus,
    method,
    total,
    items,
    fee: money(o.deliveryFee),
    txAmount,
    txPm,
    channel: o.channel || o.source || '',
    customer: o.customerName,
    time: (o.paidAt || o.createdAt || '').slice(11, 19),
    problems,
  };
  console.log(JSON.stringify(row));
  if (problems.length) flags.push(row);
}

console.log('\n=== SUMS FROM ORDERS (non-cancelled) ===');
console.log({
  cash: money(sumCash),
  card: money(sumCard),
  other: money(sumOther),
  all: money(sumAll),
  count: allOrders.length,
});

console.log('\n=== SUMS FROM REGISTER TXS ===');
const txCash = money(
  sales.filter((t) => pm(t.paymentMethod) === 'efectivo').reduce((s, t) => s + Number(t.amount || 0), 0),
);
const txCard = money(
  sales.filter((t) => pm(t.paymentMethod) === 'tarjeta').reduce((s, t) => s + Number(t.amount || 0), 0),
);
const txOther = money(
  sales
    .filter((t) => !['efectivo', 'tarjeta'].includes(pm(t.paymentMethod)))
    .reduce((s, t) => s + Number(t.amount || 0), 0),
);
console.log({
  cash: txCash,
  card: txCard,
  other: txOther,
  total: money(txCash + txCard + txOther),
  saleCount: sales.length,
});

const outs = txs.filter((t) => t.type === 'cash_out' || t.type === 'expense');
const ins = txs.filter((t) => t.type === 'cash_in');
const returns = txs.filter((t) => t.type === 'return');
console.log('\n=== MOVEMENTS ===');
console.log(
  'outs',
  outs.map((t) => ({ amount: t.amount, desc: t.description, date: t.date })),
);
console.log(
  'ins',
  ins.map((t) => ({ amount: t.amount, desc: t.description })),
);
console.log(
  'returns',
  returns.map((t) => ({ amount: t.amount, pm: t.paymentMethod, desc: t.description })),
);

const fondo = Number(session.initialCashAmount || 0);
const appsCash = 16.15; // from UI screenshot; verify if in session
const cashOut = money(outs.reduce((s, t) => s + Number(t.amount || 0), 0));
const expected80 = money(fondo + txCash + appsCash - cashOut);
const expected8470 = money(84.7 + txCash + appsCash - cashOut);
const counted = 205.9;

console.log('\n=== WHAT-IF FONDO ===');
console.log({
  fondoRegistrado: fondo,
  appsCashAsumidoUI: appsCash,
  txCash,
  cashOut,
  expectedCon80: expected80,
  expectedCon8470: expected8470,
  contadoUI: counted,
  sobranteCon80: money(counted - expected80),
  sobranteCon8470: money(counted - expected8470),
});

console.log('\n=== FLAGS ===');
console.log('count', flags.length);
for (const f of flags) console.log(JSON.stringify(f));

// List cash order amounts to see if 17.70 / 13 / 4.70 appear
console.log('\n=== CASH ORDER AMOUNTS ===');
const cashOrders = allOrders
  .filter((o) => pm(o.paymentMethod) === 'efectivo' && !['cancelled', 'eliminado'].includes(String(o.status || '')))
  .map((o) => ({ num: o.orderNumber, total: chargeTotal(o), items: itemSum(o), customer: o.customerName }));
console.log(cashOrders);
console.log(
  'cash sum',
  money(cashOrders.reduce((s, o) => s + o.total, 0)),
);
