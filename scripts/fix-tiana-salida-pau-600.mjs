/**
 * Prod: salida 600€ PAU en caja Tiana ayer + contado/fondo 101.05.
 *   node scripts/fix-tiana-salida-pau-600.mjs
 *   node scripts/fix-tiana-salida-pau-600.mjs --apply
 */
const APPLY = process.argv.includes('--apply');
const COUCH = process.env.COUCHDB_URL || 'http://127.0.0.1:5984';
const AUTH =
  'Basic ' +
  Buffer.from(
    `${process.env.COUCHDB_USER || 'vertialadmin'}:${process.env.COUCHDB_PASSWORD || 'uriel12345'}`,
  ).toString('base64');
const SESSION_ID = 'tpvreg-3b890bdb-0cb7-4833-913b-e6300bee08ac';
const OUT_AMOUNT = 600;
const LEFT = 101.05;
const DESC = 'PAU';

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
const txs = Array.isArray(session.transactions) ? [...session.transactions] : [];
const already = txs.some(
  (t) =>
    (t.type === 'cash_out' || t.type === 'expense') &&
    Number(t.amount || 0) === OUT_AMOUNT &&
    /pau/i.test(String(t.description || '')),
);

console.log(
  JSON.stringify(
    {
      apply: APPLY,
      sessionId: SESSION_ID,
      status: session.status,
      name: session.pointOfSaleName || session.terminalName,
      before: {
        nextDayInitialCash: session.nextDayInitialCash,
        finalCashAmount: session.finalCashAmount,
        expectedCash: session.expectedCash,
        difference: session.difference,
        cashOuts: txs
          .filter((t) => t.type === 'cash_out' || t.type === 'expense')
          .map((t) => ({ amount: t.amount, desc: t.description, at: t.date })),
      },
      already,
    },
    null,
    2,
  ),
);

if (String(session.status || '') !== 'closed') {
  console.error('La sesión no está cerrada');
  process.exit(2);
}

if (already) {
  console.log('Ya hay salida 600 PAU. Nada que hacer.');
  process.exit(0);
}

const now = new Date().toISOString();
const outAt = session.closedAt || now;
const tx = {
  id: `tx-pau-out-${Date.now().toString(36)}`,
  type: 'cash_out',
  amount: OUT_AMOUNT,
  paymentMethod: 'efectivo',
  description: DESC,
  registeredBy: 'pau royo del amor',
  date: outAt,
};

const nextTxs = [...txs, tx];
const nextSession = { ...session, transactions: nextTxs };
const expected = expectedCash(nextSession);
const difference = money(LEFT - expected);

const next = {
  ...session,
  transactions: nextTxs,
  finalCashAmount: LEFT,
  actualCash: LEFT,
  expectedCash: expected,
  difference,
  nextDayInitialCash: LEFT,
  updatedAt: now,
  notes: [
    String(session.notes || '').trim(),
    `[${now}] Salida ${OUT_AMOUNT.toFixed(2)}€ ${DESC}; contado/fondo apertura ${LEFT.toFixed(2)}€`,
  ]
    .filter(Boolean)
    .join('\n'),
};

if (session.summary && typeof session.summary === 'object') {
  next.summary = {
    ...session.summary,
    totalCashOut: money(Number(session.summary.totalCashOut || 0) + OUT_AMOUNT),
  };
}

console.log(
  JSON.stringify(
    {
      willAdd: tx,
      after: {
        expectedCash: expected,
        finalCashAmount: LEFT,
        nextDayInitialCash: LEFT,
        difference,
      },
    },
    null,
    2,
  ),
);

if (!APPLY) {
  console.log('Dry-run. Pasa --apply para escribir.');
  process.exit(0);
}

const saved = await couch(`/bbddsaas-delivery/${SESSION_ID}`, {
  method: 'PUT',
  body: JSON.stringify(next),
});
const verify = await couch(`/bbddsaas-delivery/${SESSION_ID}`);
console.log(
  JSON.stringify(
    {
      ok: true,
      rev: saved.rev,
      nextDayInitialCash: verify.nextDayInitialCash,
      finalCashAmount: verify.finalCashAmount,
      expectedCash: verify.expectedCash,
      difference: verify.difference,
      lastOut: (verify.transactions || [])
        .filter((t) => t.type === 'cash_out')
        .slice(-1)[0],
    },
    null,
    2,
  ),
);
