#!/usr/bin/env node
/**
 * Solo lectura: ¿Pau (DISARMINK) tiene hamburguesa ibérica y pizza ibérica?
 *
 *   node scripts/diag-pau-iberica-products.mjs
 */
const COUCH = process.env.COUCHDB_URL || 'http://127.0.0.1:5984';
const AUTH =
  'Basic ' +
  Buffer.from(
    `${process.env.COUCHDB_USER || 'vertialadmin'}:${process.env.COUCHDB_PASSWORD || 'uriel12345'}`,
  ).toString('base64');
const DISARMINK = 'ed846f31-aee7-4568-ac03-fa25ff3ad773';

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

async function main() {
  const res = await fetch(`${COUCH}/bbddsaas-catalog/_all_docs?include_docs=true&limit=80000`, {
    headers: { Authorization: AUTH, Accept: 'application/json' },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

  const docs = (data.rows || []).map((r) => r.doc).filter(Boolean);
  const biz = docs.filter((d) => d?.type === 'catalog_item' && bid(d) === DISARMINK);

  const iberica = biz.filter((d) => fold(d.name).includes('iberic'));

  console.log(`DISARMINK catalog_item total: ${biz.length}`);
  console.log(`Con «ibéric*» en nombre (incl. borrados): ${iberica.length}\n`);

  for (const d of iberica.sort((a, b) => String(a.name).localeCompare(String(b.name), 'es'))) {
    const n = fold(d.name);
    const kind =
      /pizza/.test(n) || /pizza/i.test(String(d.category || ''))
        ? 'pizza'
        : /burg|hambur|burger/.test(n) || /burg|hambur/i.test(String(d.category || ''))
          ? 'burger'
          : 'otro';
    console.log(
      JSON.stringify({
        kind,
        name: d.name,
        category: d.category || '',
        itemType: d.itemType || '',
        active: d.active !== false,
        deleted: Boolean(d.deletedAt),
        price: d.price ?? d.basePrice ?? null,
        _id: d._id,
      }),
    );
  }

  const live = iberica.filter((d) => !d.deletedAt && d.active !== false);
  const hasBurger = live.some((d) => {
    const n = fold(d.name);
    return /burg|hambur/.test(n) || /burg|hambur/i.test(String(d.category || ''));
  });
  const hasPizza = live.some((d) => {
    const n = fold(d.name);
    return /pizza/.test(n) || /pizza/i.test(String(d.category || ''));
  });

  console.log('\n=== RESUMEN (activos, no borrados) ===');
  console.log(`Hamburguesa ibérica: ${hasBurger ? 'SÍ' : 'NO'}`);
  console.log(`Pizza ibérica: ${hasPizza ? 'SÍ' : 'NO'}`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
