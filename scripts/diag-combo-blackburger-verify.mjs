#!/usr/bin/env node
/** Solo lectura: Combo Blackburger 3 pasos + allowlists. */
const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const ID = 'catitem-1bea6700-9a36-4f65-90e3-b5e1c3c63b1e';
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

const combo = await (
  await fetch(`${COUCH}/bbddsaas-catalog/${encodeURIComponent(ID)}`, {
    headers: { Authorization: AUTH, Accept: 'application/json' },
  })
).json();
if (combo.error) throw new Error(combo.error);

const all = await (
  await fetch(`${COUCH}/bbddsaas-catalog/_all_docs?include_docs=true&limit=80000`, {
    headers: { Authorization: AUTH, Accept: 'application/json' },
  })
).json();
const byId = new Map((all.rows || []).map((r) => [r.id, r.doc]));

const structure = combo.customFields?.comboStructure || [];
const allow = combo.customFields?.comboSlotAllowlists || {};
const sur = combo.customFields?.comboSlotSurcharges?.side || {};

console.log({
  name: combo.name,
  price: combo.unitPrice ?? combo.price,
  active: combo.active,
  deletedAt: combo.deletedAt || null,
  itemType: combo.itemType,
  isStockItem: combo.isStockItem,
  brandIds: combo.brandIds,
  biz: bid(combo),
  confirmed: combo.customFields?.comboStructureConfirmed,
  steps: structure.length,
});
console.log('structure', structure.map((s) => `${s.slotKind}×${s.expectedCount}「${s.label}」`).join(' · '));
for (const kind of ['main', 'side', 'drink']) {
  const ids = allow[kind] || [];
  const missing = ids.filter((id) => !byId.get(id) || byId.get(id).deletedAt || byId.get(id).active === false);
  console.log(`${kind}: ${ids.length} allow | missing/inactive=${missing.length}`);
  if (kind === 'main') console.log('  ', ids.map((id) => byId.get(id)?.name).join(' · '));
  if (kind === 'side') console.log('  ', ids.map((id) => byId.get(id)?.name).join(' · '));
  if (kind === 'drink') console.log('  sample', ids.slice(0, 8).map((id) => byId.get(id)?.name).join(' · '), '...');
}
console.log(
  'surcharges',
  Object.fromEntries(Object.entries(sur).map(([id, v]) => [byId.get(id)?.name || id, v])),
);

// Sanity: no pizza menus broken (Individual still 3 steps)
const ind = (all.rows || [])
  .map((r) => r.doc)
  .find((d) => d?.type === 'catalog_item' && bid(d) === DISARMINK && d.itemType === 'combo' && fold(d.name) === 'individual');
console.log('\nIndividual intact?', {
  id: ind?._id,
  steps: ind?.customFields?.comboStructure?.length,
  price: ind?.unitPrice,
  active: ind?.active,
  sideAllow: (ind?.customFields?.comboSlotAllowlists?.side || []).length,
});
