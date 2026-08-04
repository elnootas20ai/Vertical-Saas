#!/usr/bin/env node
/** Solo lectura: productos a 13,10€ Modomio / DISARMINK. */
const COUCH = process.env.COUCHDB_URL || 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from(
  `${process.env.COUCHDB_USER || 'vertialadmin'}:${process.env.COUCHDB_PASSWORD || 'uriel12345'}`,
).toString('base64');
const BIZ = {
  modomio: '33821959-ae50-4e52-bfea-ea2b145faeac',
  disarmink: 'ed846f31-aee7-4568-ac03-fa25ff3ad773',
};

function bid(d) {
  return String(d.business_id || d.businessId || '').replace(/^business:/, '').trim();
}
function priceOf(d) {
  const n = Number(d.unitPrice ?? d.price ?? d.basePrice ?? 0);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}
function bizLabel(d) {
  return bid(d) === BIZ.modomio ? 'modomio' : 'disarmink';
}

const data = await (
  await fetch(`${COUCH}/bbddsaas-catalog/_all_docs?include_docs=true`, {
    headers: { Authorization: AUTH, Accept: 'application/json' },
  })
).json();

const catalog = (data.rows || [])
  .map((r) => r.doc)
  .filter(Boolean)
  .filter((d) => bid(d) === BIZ.modomio || bid(d) === BIZ.disarmink)
  .filter((d) => !d.deletedAt);

const exact = catalog
  .filter((d) => Math.abs(priceOf(d) - 13.1) < 0.001)
  .map((d) => ({ name: d.name, price: priceOf(d), biz: bizLabel(d), active: d.active !== false }))
  .sort((a, b) => a.name.localeCompare(b.name, 'es'));

console.log('exact 13.10', exact.length);
for (const h of exact) console.log(JSON.stringify(h));

const near = catalog
  .filter((d) => d.active !== false)
  .filter((d) => {
    const p = priceOf(d);
    return p >= 12.9 && p <= 13.5;
  })
  .map((d) => ({ name: d.name, price: priceOf(d), biz: bizLabel(d) }))
  .sort((a, b) => a.price - b.price || a.name.localeCompare(b.name, 'es'));

console.log('near 12.90-13.50');
for (const h of near) console.log(JSON.stringify(h));
