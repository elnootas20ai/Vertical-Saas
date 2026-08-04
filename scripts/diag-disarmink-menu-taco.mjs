/**
 * Diagnóstico: Menú Taco DISARMINK (solo lectura).
 *   node scripts/diag-disarmink-menu-taco.mjs
 */
const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
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

const data = await (
  await fetch(`${COUCH}/bbddsaas-catalog/_all_docs?include_docs=true&limit=80000`, {
    headers: { Authorization: AUTH, Accept: 'application/json' },
  })
).json();
const biz = (data.rows || [])
  .map((r) => r.doc)
  .filter((d) => d && !d.deletedAt && bid(d) === DISARMINK && d.type === 'catalog_item');

const taco = biz.find((d) => d.itemType === 'combo' && /menu\s*taco/.test(fold(d.name)));
const ind = biz.find((d) => d.itemType === 'combo' && fold(d.name) === 'individual');
const byId = new Map(biz.map((d) => [d._id, d]));

const nameOf = (id) => byId.get(id)?.name || id;

console.log('=== Menú Taco ===');
if (!taco) {
  console.log('No encontrado');
  process.exit(1);
}
console.log('id:', taco._id);
console.log('name:', taco.name);
console.log(
  'structure:',
  (taco.customFields?.comboStructure || []).map(
    (s) => `${s.slotKind}×${s.expectedCount || 1}「${s.label}」`,
  ),
);
console.log(
  'side allow:',
  (taco.customFields?.comboSlotAllowlists?.side || []).map(nameOf),
);
console.log(
  'drink allow:',
  taco.customFields?.comboSlotAllowlists?.drink || '(sin lista = todas las bebidas)',
);
console.log('side surcharges:', taco.customFields?.comboSlotSurcharges?.side || null);

console.log('\n=== Individual (referencia) ===');
console.log(
  'side allow:',
  (ind?.customFields?.comboSlotAllowlists?.side || []).map(nameOf),
);
console.log(
  'drink allow:',
  ind?.customFields?.comboSlotAllowlists?.drink || '(sin lista = todas las bebidas)',
);

const patatas = biz.filter(
  (d) =>
    d.itemType !== 'combo' &&
    fold(d.category) === 'complementos' &&
    /^patatas\b/.test(fold(d.name)) &&
    d.active !== false,
);
const drinks = biz.filter(
  (d) => d.itemType !== 'combo' && fold(d.category) === 'bebidas' && d.active !== false,
);
console.log('\n=== Carta ===');
console.log(
  'Patatas activas:',
  patatas.map((p) => p.name).join(' · ') || '(ninguna)',
);
console.log('Bebidas activas:', drinks.length, '→', drinks.map((d) => d.name).join(' · '));
