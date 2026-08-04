#!/usr/bin/env node
/**
 * Solo lectura: comparar refrescos DISARMINK/Modomio (Pau) con carta Revo.
 *   node scripts/diag-pau-refrescos-revo.mjs
 */
const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const DB = 'bbddsaas-catalog';
const BIZ = {
  modomio: '33821959-ae50-4e52-bfea-ea2b145faeac',
  disarmink: 'ed846f31-aee7-4568-ac03-fa25ff3ad773',
};
const PAU = '13e49ef6-183a-4afa-a17b-7730917fe685';

const EXPECTED = [
  { key: 'coca_cola', label: 'COCA COLA', match: (n) => (/^coca[\s-]*cola$/.test(n) || n === 'cocacola') && !/0|zero|2\s*l|2l|litros?/.test(n) },
  { key: 'coca_0', label: 'COCA COLA 0', match: (n) => /coca/.test(n) && (/0\b|zero/.test(n)) && !/2\s*l|2l|litros?/.test(n) },
  { key: 'fanta_naranja', label: 'FANTA NARANJA', match: (n) => /fanta/.test(n) && /naranja/.test(n) && !/2\s*l|2l|litros?/.test(n) },
  { key: 'fanta_limon', label: 'FANTA LIMON', match: (n) => /fanta/.test(n) && /limon/.test(n) && !/2\s*l|2l|litros?/.test(n) },
  { key: 'nestea', label: 'NESTEA', match: (n) => /nestea|nest tea|te\s*limon|ice\s*tea/.test(n) },
  { key: 'aquarius_limon', label: 'AQUARIUS LIMON', match: (n) => /aquarius/.test(n) && /limon/.test(n) },
  { key: 'aquarius_naranja', label: 'AQUARIUS NARANJA', match: (n) => /aquarius/.test(n) && /naranja/.test(n) },
  { key: 'agua', label: 'AGUA', match: (n) => /^agua\b/.test(n) || n === 'agua' },
  { key: 'coca_2l', label: 'COCA COLA 2L', match: (n) => /coca/.test(n) && /2\s*l|\b2l\b|2\s*litros?/.test(n) },
  { key: 'fanta_naranja_2l', label: 'FANTA NARANJA 2L', match: (n) => /fanta/.test(n) && /naranja/.test(n) && /2\s*l|\b2l\b|2\s*litros?/.test(n) },
  { key: 'fanta_limon_2l', label: 'FANTA LIMON 2L', match: (n) => /fanta/.test(n) && /limon/.test(n) && /2\s*l|\b2l\b|2\s*litros?/.test(n) },
];

async function couch(path) {
  const res = await fetch(`${COUCH}${path}`, {
    headers: { Authorization: AUTH, Accept: 'application/json' },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path}: ${data.error || res.status}`);
  return data;
}

function bid(d) {
  return String(d.business_id || d.businessId || '')
    .replace(/^business:/, '')
    .trim();
}

function fold(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ');
}

function priceOf(d) {
  const n = Number(d.unitPrice ?? d.price ?? d.basePrice ?? 0);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function labelBiz(id) {
  if (id === BIZ.modomio) return 'modomio';
  if (id === BIZ.disarmink) return 'disarmink';
  return id.slice(0, 8);
}

function isLive(d) {
  return !d.deletedAt && d.active !== false;
}

const all = await couch(`/${DB}/_all_docs?include_docs=true&limit=80000`);
const docs = (all.rows || []).map((r) => r.doc).filter((d) => d?.type === 'catalog_item');

const pauish = docs.filter((d) => {
  const b = bid(d);
  return b === BIZ.modomio || b === BIZ.disarmink || String(d.user_id || '') === PAU;
});

const drinkish = pauish.filter((d) => {
  const c = fold(d.category);
  const n = fold(d.name);
  return (
    /bebida|refresco|cerveza|vino|agua/.test(c) ||
    /coca|fanta|nestea|aquarius|^agua|sprite|schweppes|cerveza|mahou|moretti/.test(n)
  );
});

console.log('items pauish', pauish.length, 'drinkish', drinkish.length);

for (const bizKey of ['disarmink', 'modomio']) {
  const bizId = BIZ[bizKey];
  const items = drinkish.filter((d) => bid(d) === bizId);
  const live = items.filter(isLive);
  console.log(`\n======== ${bizKey.toUpperCase()} live=${live.length} (all drinkish=${items.length}) ========`);

  console.log('\n--- checklist Revo REFRESCOS ---');
  for (const exp of EXPECTED) {
    const hits = items.filter((d) => exp.match(fold(d.name)));
    const liveHits = hits.filter(isLive);
    const status = liveHits.length ? 'OK' : hits.length ? 'SOLO_INACTIVO' : 'FALTA';
    console.log(
      `${status.padEnd(14)} ${exp.label.padEnd(20)} →`,
      liveHits.length
        ? liveHits.map((d) => `${d.name} (${priceOf(d)}€) [${d._id}]`).join(' | ')
        : hits.length
          ? hits.map((d) => `${d.name} del=${d.deletedAt || '-'} active=${d.active} [${d._id}]`).join(' | ')
          : '(no hay)',
    );
  }

  console.log('\n--- todas bebidas/refrescos vivos ---');
  for (const d of live.sort((a, b) => fold(a.name).localeCompare(fold(b.name)))) {
    console.log(`  ${d.name} | ${d.category || '-'} | ${priceOf(d)}€ | ${d._id}`);
  }
}

console.log('\n--- COCA 2L en cualquier biz Pau (incl. borradas) ---');
for (const d of pauish.filter((d) => /coca/.test(fold(d.name)) && /2\s*l|\b2l\b|2\s*litros?/.test(fold(d.name)))) {
  console.log({
    biz: labelBiz(bid(d)),
    name: d.name,
    price: priceOf(d),
    cat: d.category,
    active: d.active,
    deletedAt: d.deletedAt || null,
    id: d._id,
  });
}
