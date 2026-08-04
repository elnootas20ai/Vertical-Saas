#!/usr/bin/env node
/** Diag Duo/Family/Individual sides + surcharges Disarmink */
const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const DISARMINK = 'ed846f31-aee7-4568-ac03-fa25ff3ad773';

async function couch(path) {
  const res = await fetch(`${COUCH}${path}`, {
    headers: { Authorization: AUTH, Accept: 'application/json' },
  });
  return res.json();
}
function fold(s) {
  return String(s || '').trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
}
function bid(d) {
  return String(d.business_id || d.businessId || '').replace(/^business:/, '').trim();
}

const data = await couch('/bbddsaas-catalog/_all_docs?include_docs=true&limit=80000');
const docs = (data.rows || []).map((r) => r.doc).filter(Boolean);
const biz = docs.filter((d) => d?.type === 'catalog_item' && bid(d) === DISARMINK && !d.deletedAt);

const sides = biz
  .filter((d) => d.itemType !== 'combo' && d.active !== false && /complemento|side|entrante/i.test(String(d.category || '')))
  .sort((a, b) => String(a.name).localeCompare(String(b.name), 'es'));

console.log('=== Complementos carta ===');
for (const s of sides) console.log(`  ${s._id}  ${s.name}  ${s.unitPrice ?? s.price}`);

const menus = biz.filter((d) => d.itemType === 'combo' && /duo|family|familiar|individual|combo/i.test(fold(d.name)));
console.log('\n=== Combos ===');
for (const c of menus.sort((a, b) => fold(a.name).localeCompare(fold(b.name)))) {
  const allow = c.customFields?.comboSlotAllowlists?.side || [];
  const sur = c.customFields?.comboSlotSurcharges?.side || {};
  console.log(`\n${c.name} (${c._id})`);
  console.log('  structure', JSON.stringify(c.customFields?.comboStructure || c.comboStructure || []));
  console.log('  allow sides:', allow.map((id) => biz.find((x) => x._id === id)?.name || id));
  console.log('  surcharges:', Object.fromEntries(
    Object.entries(sur).map(([id, v]) => [biz.find((x) => x._id === id)?.name || id, v]),
  ));
}
