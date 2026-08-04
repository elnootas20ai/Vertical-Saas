#!/usr/bin/env node
/**
 * Busca productos Agua con precio ~180 / 1.80 en catálogo (solo lectura).
 *   node scripts/diag-agua-price.mjs
 */
const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');

async function allDocs(db) {
  const res = await fetch(`${COUCH}/${encodeURIComponent(db)}/_all_docs?include_docs=true&limit=80000`, {
    headers: { Authorization: AUTH, Accept: 'application/json' },
  });
  const data = await res.json();
  if (data.error) throw new Error(`${db}: ${data.error} ${data.reason || ''}`);
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
const aguas = items.filter((d) => {
  const n = fold(d.name);
  return /\bagua\b/.test(n) || n === 'agua' || n.startsWith('agua ');
});

console.log(`Aguas en catálogo: ${aguas.length}`);
for (const a of aguas.sort((x, y) => String(x.name).localeCompare(String(y.name), 'es'))) {
  const p = Number(a.price ?? a.salePrice ?? a.unitPrice ?? NaN);
  const odd = p === 180 || p === 1.8 || p === 18000 || Math.abs(p - 180) < 0.001;
  console.log(
    `${odd ? '>>> ' : '    '}${a.name} | price=${a.price} | bid=${bid(a)} | id=${a._id} | cat=${a.category} | active=${a.active !== false}`,
  );
}
