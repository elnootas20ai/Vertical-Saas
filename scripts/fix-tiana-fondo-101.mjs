/**
 * Prod: dejar fondo apertura Tiana en 101.05 (restar 600 del cierre).
 *   node scripts/fix-tiana-fondo-101.mjs           # dry-run
 *   node scripts/fix-tiana-fondo-101.mjs --apply
 */
const APPLY = process.argv.includes('--apply');
const COUCH = process.env.COUCHDB_URL || 'http://127.0.0.1:5984';
const AUTH =
  'Basic ' +
  Buffer.from(
    `${process.env.COUCHDB_USER || 'vertialadmin'}:${process.env.COUCHDB_PASSWORD || 'uriel12345'}`,
  ).toString('base64');
const SESSION_ID = 'tpvreg-3b890bdb-0cb7-4833-913b-e6300bee08ac';
const TARGET = 101.05;

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
const before = {
  status: session.status,
  name: session.pointOfSaleName || session.terminalName,
  nextDayInitialCash: session.nextDayInitialCash,
  finalCashAmount: session.finalCashAmount,
};
console.log(JSON.stringify({ apply: APPLY, sessionId: SESSION_ID, before, target: TARGET }, null, 2));

if (String(session.status || '') !== 'closed') {
  console.error('La sesión no está cerrada:', session.status);
  process.exit(2);
}

if (!APPLY) {
  console.log('Dry-run. Pasa --apply para escribir.');
  process.exit(0);
}

const now = new Date().toISOString();
const next = {
  ...session,
  nextDayInitialCash: TARGET,
  updatedAt: now,
  notes: [
    String(session.notes || '').trim(),
    `[${now}] Fondo apertura ajustado a ${TARGET.toFixed(2)}€ (retirada 600€; antes ${Number(session.nextDayInitialCash || 0).toFixed(2)}€)`,
  ]
    .filter(Boolean)
    .join('\n'),
};

const saved = await couch(`/bbddsaas-delivery/${SESSION_ID}`, {
  method: 'PUT',
  body: JSON.stringify(next),
});
console.log(
  JSON.stringify(
    {
      ok: true,
      rev: saved.rev,
      nextDayInitialCash: TARGET,
    },
    null,
    2,
  ),
);
