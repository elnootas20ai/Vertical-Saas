#!/usr/bin/env node
/**
 * Solo lectura: todas las Aguas 50cl / Mineral y precios ~1.80.
 */
const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');

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
const items = catalog.filter((d) => d?.type === 'catalog_item' && !d.deletedAt);

const aguas = items.filter((d) => /\bagua\b/.test(fold(d.name)));
console.log('=== TODAS LAS AGUAS (activas) ===');
for (const a of aguas.sort((x, y) => String(x.name).localeCompare(String(y.name), 'es'))) {
  const up = Number(a.unitPrice);
  const mark = up === 1.8 || Math.abs(up - 1.8) < 0.001 || up === 180 ? '>>> ' : '    ';
  console.log(
    `${mark}${a.name} | unitPrice=${a.unitPrice} | active=${a.active !== false} | bid=${bid(a) || '(sin)'} | id=${a._id}`,
  );
}

console.log('\n=== items con unitPrice exactamente 1.8 ===');
for (const d of items.filter((x) => Number(x.unitPrice) === 1.8 || Math.abs(Number(x.unitPrice) - 1.8) < 0.001)) {
  console.log(`- ${d.name} | bid=${bid(d)} | cat=${d.category} | id=${d._id}`);
}
