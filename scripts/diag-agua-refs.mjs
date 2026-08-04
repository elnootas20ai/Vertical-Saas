#!/usr/bin/env node
/**
 * ¿Algún combo/carta activa sigue apuntando a Agua borrada (1.80) o al duplicado a 0?
 */
const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const DISARMINK = 'ed846f31-aee7-4568-ac03-fa25ff3ad773';
const IDS = [
  'catitem-5687d192-7d40-4b3d-92f1-0118f8387c96', // deleted 1.8
  'catitem-7fdaffeb-fdbc-4e45-996c-8a6f0886b800', // stock twin price 0
  'catitem-895c8224-2bac-4a56-9ecd-b67a5f07341e', // live 1.2
];

async function allDocs(db) {
  const res = await fetch(`${COUCH}/${encodeURIComponent(db)}/_all_docs?include_docs=true&limit=80000`, {
    headers: { Authorization: AUTH, Accept: 'application/json' },
  });
  const data = await res.json();
  if (data.error) throw new Error(`${db}: ${data.error}`);
  return (data.rows || []).map((r) => r.doc).filter(Boolean);
}

function bid(d) {
  return String(d.business_id || d.businessId || '')
    .replace(/^business:/, '')
    .trim();
}

const catalog = await allDocs('bbddsaas-catalog');
const biz = catalog.filter((d) => bid(d) === DISARMINK && !d.deletedAt);

console.log('=== referencias a IDs Agua en docs activos ===');
for (const id of IDS) {
  const refs = [];
  for (const d of biz) {
    if (d._id === id) continue;
    const blob = JSON.stringify(d);
    if (blob.includes(id)) refs.push(`${d.name} (${d._id}) type=${d.type}/${d.itemType}`);
  }
  console.log(`\n${id} → ${refs.length} refs`);
  for (const r of refs.slice(0, 25)) console.log(' ', r);
}

// drink options with price deltas in combo slots
console.log('\n=== slots/opciones con price 1.8 en combos activos ===');
for (const d of biz) {
  const blob = JSON.stringify(d);
  if (!blob.includes('1.8')) continue;
  if (!/combo|slot|option|drink|bebida|surcharge|extra/i.test(blob)) continue;
  console.log(d.name, d._id, 'unitPrice=', d.unitPrice);
}
