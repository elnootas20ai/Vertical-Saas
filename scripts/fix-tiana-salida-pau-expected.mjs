/**
 * Corrige expectedCash tras salida PAU 600 (apps cash no está en txs simples).
 * expected = 700.91 - 600 = 100.91; contado/fondo 101.05; diff 0.14
 */
const APPLY = process.argv.includes('--apply');
const COUCH = process.env.COUCHDB_URL || 'http://127.0.0.1:5984';
const AUTH =
  'Basic ' +
  Buffer.from(
    `${process.env.COUCHDB_USER || 'vertialadmin'}:${process.env.COUCHDB_PASSWORD || 'uriel12345'}`,
  ).toString('base64');
const SESSION_ID = 'tpvreg-3b890bdb-0cb7-4833-913b-e6300bee08ac';
const LEFT = 101.05;
const EXPECTED = 100.91; // 700.91 - 600
const DIFF = 0.14;

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

const session = await couch(`/bbddsaas-delivery/${SESSION_ID}`);
console.log(
  JSON.stringify(
    {
      apply: APPLY,
      before: {
        expectedCash: session.expectedCash,
        finalCashAmount: session.finalCashAmount,
        nextDayInitialCash: session.nextDayInitialCash,
        difference: session.difference,
      },
      target: { expectedCash: EXPECTED, finalCashAmount: LEFT, nextDayInitialCash: LEFT, difference: DIFF },
    },
    null,
    2,
  ),
);

if (!APPLY) {
  console.log('Dry-run');
  process.exit(0);
}

const now = new Date().toISOString();
const next = {
  ...session,
  expectedCash: EXPECTED,
  finalCashAmount: LEFT,
  actualCash: LEFT,
  nextDayInitialCash: LEFT,
  difference: DIFF,
  updatedAt: now,
};

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
      expectedCash: verify.expectedCash,
      finalCashAmount: verify.finalCashAmount,
      nextDayInitialCash: verify.nextDayInitialCash,
      difference: verify.difference,
      pauOut: (verify.transactions || []).find(
        (t) => t.type === 'cash_out' && Number(t.amount) === 600 && /pau/i.test(String(t.description || '')),
      ),
    },
    null,
    2,
  ),
);
