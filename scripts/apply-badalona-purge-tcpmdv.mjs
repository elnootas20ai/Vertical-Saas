/**
 * Prod: quita las 2 ventas PED-TCPMDV (pedido cancelado) de la caja Badalona 14/08
 * y deja lápidas purged* para que un sync de tablet no las resucite.
 *
 * Uso: node scripts/apply-badalona-purge-tcpmdv.mjs
 * Remoto: node scripts/remote-run-script.mjs apply-badalona-purge-tcpmdv.mjs
 */
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
dotenv.config({ path: path.join(root, '.env.development') });
dotenv.config({ path: path.join(root, '.env') });

const ORDER_ID = 'dord-b5e11358-a3b3-4fbc-ab17-6bba23a94c5c';
const SESSION_ID = 'tpvreg-a9c5ae85-c16c-411a-a6e1-6cf317ffade1';
const EXPECT_AMOUNT = 63.8;
const EXPECT_COUNT = 2;

const req = {
  couchUser: process.env.COUCHDB_USER,
  couchPass: process.env.COUCHDB_PASSWORD,
  couchUrl: process.env.COUCHDB_URL || process.env.COUCHDB_HOST,
};

const { getDeliveryDbName, getDocument, putDocument } = await import('../services/couchdb.js');

function money(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function isOrderSale(t) {
  if (String(t?.type || '') !== 'sale') return false;
  const oid = String(t.orderId || t.linkedDeliveryOrderId || '').trim();
  const desc = String(t.description || '');
  return oid === ORDER_ID || /TCPMDV/i.test(desc);
}

function salesTotal(txs) {
  return money(
    (txs || []).filter((t) => t.type === 'sale').reduce((s, t) => s + Number(t.amount || 0), 0),
  );
}

function salesByMethod(txs, method) {
  return money(
    (txs || [])
      .filter((t) => t.type === 'sale' && String(t.paymentMethod || '').toLowerCase() === method)
      .reduce((s, t) => s + Number(t.amount || 0), 0),
  );
}

function rebuildSalesByChannel(txs) {
  const out = {};
  for (const t of txs || []) {
    if (t.type !== 'sale' || !t.channel) continue;
    out[t.channel] = money((out[t.channel] || 0) + Number(t.amount || 0));
  }
  return out;
}

const db = getDeliveryDbName();
const session = await getDocument(req, db, SESSION_ID);
if (!session) {
  console.error('Sesión no encontrada', SESSION_ID);
  process.exit(1);
}

const beforeTxs = Array.isArray(session.transactions) ? session.transactions : [];
const toRemove = beforeTxs.filter(isOrderSale);
const beforeTotal = salesTotal(beforeTxs);
const beforeCard = salesByMethod(beforeTxs, 'tarjeta');

console.log(JSON.stringify({
  dryCheck: {
    status: session.status,
    pointOfSaleName: session.pointOfSaleName,
    removeCount: toRemove.length,
    removeAmounts: toRemove.map((t) => ({ id: t.id, amount: t.amount, paymentMethod: t.paymentMethod })),
    beforeTotal,
    beforeCard,
  },
}, null, 2));

if (toRemove.length === 0) {
  // Idempotente: solo asegurar lápidas
  const purgedSaleTxIds = [...new Set([
    ...(session.purgedSaleTxIds || []),
  ].map(String).filter(Boolean))];
  const purgedOrderSaleIds = [...new Set([
    ...(session.purgedOrderSaleIds || []),
    ORDER_ID,
  ])];
  if (!(session.purgedOrderSaleIds || []).includes(ORDER_ID)) {
    session.purgedSaleTxIds = purgedSaleTxIds;
    session.purgedOrderSaleIds = purgedOrderSaleIds;
    session.updatedAt = new Date().toISOString();
    const saved = await putDocument(req, db, session._id, session);
    console.log(JSON.stringify({ ok: true, mode: 'tombstone_only', rev: saved.rev, purgedOrderSaleIds }, null, 2));
  } else {
    console.log(JSON.stringify({ ok: true, mode: 'already_clean', purgedOrderSaleIds: session.purgedOrderSaleIds }, null, 2));
  }
  process.exit(0);
}

if (toRemove.length !== EXPECT_COUNT) {
  console.error(`Esperaba ${EXPECT_COUNT} ventas a quitar, hay ${toRemove.length}. Aborto.`);
  process.exit(1);
}
for (const t of toRemove) {
  if (money(t.amount) !== EXPECT_AMOUNT) {
    console.error('Importe inesperado', t);
    process.exit(1);
  }
}

const kept = beforeTxs.filter((t) => !isOrderSale(t));
const afterTotal = salesTotal(kept);
const afterCard = salesByMethod(kept, 'tarjeta');
const removedIds = toRemove.map((t) => String(t.id || '').trim()).filter(Boolean);

session.transactions = kept;
session.salesByChannel = rebuildSalesByChannel(kept);
session.linkedOrderIds = (session.linkedOrderIds || []).filter((id) => String(id) !== ORDER_ID);
session.purgedSaleTxIds = [...new Set([
  ...(session.purgedSaleTxIds || []),
  ...removedIds,
].map(String).filter(Boolean))];
session.purgedOrderSaleIds = [...new Set([
  ...(session.purgedOrderSaleIds || []),
  ORDER_ID,
])];
session.updatedAt = new Date().toISOString();

// summary si existe: recalcular totales simples desde txs
if (session.summary && typeof session.summary === 'object') {
  const sales = kept.filter((t) => t.type === 'sale');
  const byMethod = {};
  for (const t of sales) {
    const m = String(t.paymentMethod || 'otro').toLowerCase();
    byMethod[m] = money((byMethod[m] || 0) + Number(t.amount || 0));
  }
  session.summary = {
    ...session.summary,
    totalSales: afterTotal,
    salesCount: sales.length,
    salesByMethod: byMethod,
  };
}

const saved = await putDocument(req, db, session._id, session);
const verify = await getDocument(req, db, SESSION_ID);
const ghost = (verify.transactions || []).filter(isOrderSale);

console.log(JSON.stringify({
  ok: true,
  mode: 'purged',
  rev: saved.rev,
  removed: toRemove.map((t) => ({ id: t.id, amount: t.amount })),
  beforeTotal,
  afterTotal,
  beforeCard,
  afterCard,
  expectedAfterTotal: 533.9,
  expectedAfterCard: 385.47,
  ghostLeft: ghost.length,
  purgedSaleTxIds: verify.purgedSaleTxIds,
  purgedOrderSaleIds: verify.purgedOrderSaleIds,
}, null, 2));

if (ghost.length > 0 || money(afterTotal) !== 533.9) {
  console.error('Verificación fallida');
  process.exit(1);
}
