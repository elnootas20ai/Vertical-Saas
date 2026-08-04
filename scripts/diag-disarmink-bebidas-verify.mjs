#!/usr/bin/env node
const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const DB = 'bbddsaas-catalog';
const DISARMINK = 'ed846f31-aee7-4568-ac03-fa25ff3ad773';

async function couch(path) {
  const res = await fetch(`${COUCH}${path}`, {
    headers: { Authorization: AUTH, Accept: 'application/json' },
  });
  return res.json();
}

function bid(d) {
  return String(d.business_id || d.businessId || '').replace(/^business:/, '').trim();
}
function fold(s) {
  return String(s || '').trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
}
function priceOf(d) {
  return Math.round(Number(d.unitPrice ?? d.price ?? 0) * 100) / 100;
}

const ids = [
  'catitem-550fedc3-acbf-4478-a497-072a2dd36157',
  'catitem-8f3c4aeb-2fb0-44ac-b46e-c04a017b8207',
  'catitem-17f83c8f-236c-4b46-a7b5-647a92bfa22b',
];
for (const id of ids) {
  const d = await couch(`/${DB}/${encodeURIComponent(id)}`);
  console.log({ id, name: d.name, price: priceOf(d), del: d.deletedAt || null, biz: bid(d) });
}

const all = await couch(`/${DB}/_all_docs?include_docs=true&limit=80000`);
const live = (all.rows || [])
  .map((r) => r.doc)
  .filter((d) => d?.type === 'catalog_item' && bid(d) === DISARMINK && !d.deletedAt);

const want = [
  'coca-cola', 'coca-cola 0', 'fanta naranja', 'fanta limon', 'nestea',
  'aquarius limon', 'aquarius naranja', 'agua', 'coca-cola 2l',
  'fanta naranja 2l', 'fanta limon 2l',
  'estrella', 'voll', 'moretti', 'peroni', 'moritz', 'amstel', 'desperados',
  'cerdos', 'barbuda', 'vino blanco', 'vino negro', 'lambrusco',
];
console.log('\n=== VIVO relevante ===');
for (const d of live.sort((a, b) => fold(a.name).localeCompare(fold(b.name)))) {
  const n = fold(d.name);
  if (!want.some((w) => n.includes(w))) continue;
  console.log(`${String(priceOf(d)).padStart(5)}  ${d.name}`);
}
