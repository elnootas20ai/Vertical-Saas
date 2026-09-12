/**
 * Solo lectura — campos de fondo del último cierre Tiana.
 */
const COUCH = process.env.COUCHDB_URL || 'http://127.0.0.1:5984';
const AUTH =
  'Basic ' +
  Buffer.from(
    `${process.env.COUCHDB_USER || 'vertialadmin'}:${process.env.COUCHDB_PASSWORD || 'uriel12345'}`,
  ).toString('base64');
const ID = process.env.SESSION_ID || 'tpvreg-3b890bdb-0cb7-4833-913b-e6300bee08ac';

const res = await fetch(`${COUCH}/bbddsaas-delivery/${ID}`, {
  headers: { Authorization: AUTH, Accept: 'application/json' },
});
const d = await res.json();
if (!res.ok) {
  console.error(d);
  process.exit(1);
}
console.log(
  JSON.stringify(
    {
      _id: d._id,
      status: d.status,
      name: d.pointOfSaleName || d.terminalName,
      initialCashAmount: d.initialCashAmount,
      actualCash: d.actualCash,
      finalCashAmount: d.finalCashAmount,
      nextDayInitialCash: d.nextDayInitialCash,
      expectedCash: d.expectedCash,
      countedCash: d.countedCash,
      closedAt: d.closedAt,
    },
    null,
    2,
  ),
);
