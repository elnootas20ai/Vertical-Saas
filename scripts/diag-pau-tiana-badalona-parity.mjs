#!/usr/bin/env node
/**
 * Solo lectura: ¿el catálogo TPV cuadran Tiana vs Badalona (DISARMINK)?
 * Ambas tiendas comparten business; se mira restricciones por PDV + itemType.
 */
const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const DISARMINK = 'ed846f31-aee7-4568-ac03-fa25ff3ad773';

const STORES = {
  tiana: {
    label: 'TIANA',
    pdv: 'pdv-934ce697-314d-46e5-bc9b-e0a2afee3bf7',
    wc: 'wc-ffdee346-8730-4aeb-961d-24832f17f1c1',
  },
  badalona: {
    label: 'BADALONA',
    pdv: 'pdv-594a8503-1515-47b8-9e02-fb8ff09052b6',
    wc: 'wc-16361270-5794-4b95-89e5-644685f36e24',
  },
};

const REVO_REFRESCOS = [
  { key: 'coca_cola', label: 'COCA COLA', match: (n) => (/^coca[\s-]*cola$/.test(n) || n === 'cocacola') && !/0|zero|2\s*l|2l|litros?/.test(n) },
  { key: 'coca_0', label: 'COCA COLA 0', match: (n) => /coca/.test(n) && (/0\b|zero/.test(n)) && !/2\s*l|2l|litros?/.test(n) },
  { key: 'fanta_naranja', label: 'FANTA NARANJA', match: (n) => /fanta/.test(n) && /naranja/.test(n) && !/2\s*l|2l|litros?/.test(n) },
  { key: 'fanta_limon', label: 'FANTA LIMON', match: (n) => /fanta/.test(n) && /limon/.test(n) && !/2\s*l|2l|litros?/.test(n) },
  { key: 'nestea', label: 'NESTEA', match: (n) => /nestea/.test(n) },
  { key: 'aquarius_limon', label: 'AQUARIUS LIMON', match: (n) => /aquarius/.test(n) && /limon/.test(n) && !/50/.test(n) },
  { key: 'aquarius_naranja', label: 'AQUARIUS NARANJA', match: (n) => /aquarius/.test(n) && /naranja/.test(n) },
  { key: 'agua', label: 'AGUA', match: (n) => /^agua\b/.test(n) && !/gas/.test(n) },
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

function isLive(d) {
  return !d.deletedAt && d.active !== false;
}

function passesTpvType(d) {
  return d.itemType === 'product' || d.itemType === 'combo';
}

function spIds(d) {
  const raw = d.salesPointIds || d.sales_point_ids || d.pointOfSaleIds || [];
  return Array.isArray(raw) ? raw.map(String) : [];
}

/** Si no hay lista → visible en todas. Si hay lista → solo esas. */
function visibleInStore(d, store) {
  const ids = spIds(d);
  if (!ids.length) return true;
  return ids.includes(store.pdv) || ids.includes(store.wc);
}

async function allDocs(db) {
  const data = await couch(`/${encodeURIComponent(db)}/_all_docs?include_docs=true&limit=80000`);
  return (data.rows || []).map((r) => r.doc).filter(Boolean);
}

const catalog = await allDocs('bbddsaas-catalog');
const sales = await allDocs('bbddsaas-sales-points');
const delivery = await allDocs('bbddsaas-delivery').catch(() => []);

console.log('=== PDVs / work centers ===');
for (const [key, store] of Object.entries(STORES)) {
  const docs = [...sales, ...delivery].filter((d) => d && (d._id === store.pdv || d._id === store.wc));
  for (const d of docs) {
    console.log(store.label, {
      id: d._id,
      name: d.name,
      type: d.type,
      biz: bid(d) || '(none)',
      active: d.active,
      deletedAt: d.deletedAt || null,
    });
  }
  if (!docs.length) console.log(store.label, 'NO ENCONTRADO', store);
}

const items = catalog.filter((d) => d?.type === 'catalog_item' && bid(d) === DISARMINK);
const live = items.filter(isLive);
const tpvReady = live.filter(passesTpvType);

console.log('\n=== Catálogo DISARMINK (compartido) ===');
console.log({
  totalItems: items.length,
  live: live.length,
  tpvReady_product_or_combo: tpvReady.length,
  liveMissingItemType: live.filter((d) => !passesTpvType(d)).length,
});

const missingType = live.filter((d) => !passesTpvType(d));
if (missingType.length) {
  console.log('\n--- vivos SIN itemType product/combo (ocultos TPV en AMBAS tiendas) ---');
  for (const d of missingType.sort((a, b) => fold(a.name).localeCompare(fold(b.name)))) {
    console.log(`  ${d.name} | ${d.category || '-'} | ${priceOf(d)}€ | itemType=${d.itemType ?? 'null'} | ${d._id}`);
  }
}

const restricted = live.filter((d) => spIds(d).length > 0);
console.log(`\n=== Productos con salesPointIds (${restricted.length}) ===`);
for (const d of restricted.sort((a, b) => fold(a.name).localeCompare(fold(b.name)))) {
  const tiana = visibleInStore(d, STORES.tiana);
  const bad = visibleInStore(d, STORES.badalona);
  const flag = tiana && bad ? 'AMBAS' : tiana ? 'SOLO_TIANA' : bad ? 'SOLO_BADALONA' : 'NINGUNA';
  console.log(`${flag} | ${d.name} | ${d.category || '-'} | ${priceOf(d)}€ | sps=${JSON.stringify(spIds(d))} | typeOK=${passesTpvType(d)}`);
}

function storeTpvSet(store) {
  return tpvReady.filter((d) => visibleInStore(d, store));
}

const tianaSet = storeTpvSet(STORES.tiana);
const badSet = storeTpvSet(STORES.badalona);
const tianaIds = new Set(tianaSet.map((d) => d._id));
const badIds = new Set(badSet.map((d) => d._id));

const onlyTiana = tianaSet.filter((d) => !badIds.has(d._id));
const onlyBad = badSet.filter((d) => !tianaIds.has(d._id));

console.log('\n=== Paridad TPV Tiana vs Badalona ===');
console.log({
  tianaTpvProducts: tianaSet.length,
  badalonaTpvProducts: badSet.length,
  onlyInTiana: onlyTiana.length,
  onlyInBadalona: onlyBad.length,
  sameCount: tianaSet.length === badSet.length,
});

if (onlyTiana.length) {
  console.log('\n--- solo Tiana ---');
  for (const d of onlyTiana) console.log(`  ${d.name} | ${d.category} | ${priceOf(d)}€ | ${d._id}`);
}
if (onlyBad.length) {
  console.log('\n--- solo Badalona ---');
  for (const d of onlyBad) console.log(`  ${d.name} | ${d.category} | ${priceOf(d)}€ | ${d._id}`);
}

console.log('\n=== Checklist REFRESCOS Revo (visibilidad TPV por tienda) ===');
for (const exp of REVO_REFRESCOS) {
  const hits = live.filter((d) => exp.match(fold(d.name)));
  const row = (store, label) => {
    const ok = hits.filter((d) => passesTpvType(d) && visibleInStore(d, store));
    if (!ok.length) {
      const hidden = hits.filter((d) => visibleInStore(d, store));
      return hidden.length
        ? `OCULTO_TPV(${hidden.map((d) => `${d.name} type=${d.itemType ?? 'null'}`).join('; ')})`
        : 'FALTA';
    }
    return ok.map((d) => `${d.name} ${priceOf(d)}€ [${d.category}]`).join(' | ');
  };
  console.log(
    `${exp.label.padEnd(20)} | TIANA: ${row(STORES.tiana, 'T')} | BADALONA: ${row(STORES.badalona, 'B')}`,
  );
}

// Promos con PDV restriction
const promos = catalog.filter((d) => d?.type === 'promotion' && bid(d) === DISARMINK && !d.deletedAt);
console.log(`\n=== Promos DISARMINK (${promos.length}) — alcance por tienda ===`);
for (const p of promos) {
  const ids = spIds(p);
  const tiana = !ids.length || ids.includes(STORES.tiana.pdv) || ids.includes(STORES.tiana.wc);
  const bad = !ids.length || ids.includes(STORES.badalona.pdv) || ids.includes(STORES.badalona.wc);
  const flag = !ids.length ? 'AMBAS' : tiana && bad ? 'AMBAS(lista)' : tiana ? 'SOLO_TIANA' : bad ? 'SOLO_BADALONA' : 'NINGUNA';
  console.log(`${flag} | ${p.name || p._id} | status=${p.status} | sps=${JSON.stringify(ids)}`);
}
