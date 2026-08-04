#!/usr/bin/env node
/**
 * Dump campos de precio de Aguas DISARMINK / similares.
 */
const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const DISARMINK = 'ed846f31-aee7-4568-ac03-fa25ff3ad773';

async function get(id) {
  const res = await fetch(`${COUCH}/bbddsaas-catalog/${encodeURIComponent(id)}`, {
    headers: { Authorization: AUTH, Accept: 'application/json' },
  });
  return res.json();
}

async function allDocs(db) {
  const res = await fetch(`${COUCH}/${encodeURIComponent(db)}/_all_docs?include_docs=true&limit=80000`, {
    headers: { Authorization: AUTH, Accept: 'application/json' },
  });
  const data = await res.json();
  if (data.error) throw new Error(`${db}: ${data.error}`);
  return (data.rows || []).map((r) => r.doc).filter(Boolean);
}

function fold(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

function bid(d) {
  return String(d.business_id || d.businessId || '')
    .replace(/^business:/, '')
    .trim();
}

const catalog = await allDocs('bbddsaas-catalog');
const aguas = catalog.filter((d) => {
  if (d?.type !== 'catalog_item' || d.deletedAt) return false;
  if (bid(d) !== DISARMINK) return false;
  const n = fold(d.name);
  return /\bagua\b/.test(n);
});

for (const a of aguas) {
  const keys = Object.keys(a).filter((k) => /price|precio|cost|iva|tax|amount/i.test(k));
  console.log('\n===', a.name, a._id, '===');
  console.log('keys precio:', keys);
  for (const k of keys) console.log(`  ${k}=`, JSON.stringify(a[k]));
  if (a.customFields) {
    const cf = a.customFields;
    const cfKeys = Object.keys(cf).filter((k) => /price|precio|cost|iva|tax|amount/i.test(k));
    console.log('customFields precio:', cfKeys);
    for (const k of cfKeys) console.log(`  cf.${k}=`, JSON.stringify(cf[k]));
  }
  // también basePrice / variants
  console.log('sample:', {
    price: a.price,
    basePrice: a.basePrice,
    salePrice: a.salePrice,
    unitPrice: a.unitPrice,
    priceCents: a.priceCents,
    pvp: a.pvp,
  });
}
