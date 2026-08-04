#!/usr/bin/env node
/**
 * Busca 1.8 / 1,80 en docs DISARMINK (carta, combos, menús) — solo lectura.
 */
const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const DISARMINK = 'ed846f31-aee7-4568-ac03-fa25ff3ad773';

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

function fold(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

const catalog = await allDocs('bbddsaas-catalog');
const biz = catalog.filter((d) => bid(d) === DISARMINK);

console.log('=== docs con 1.8 / 180 en JSON (DISARMINK, incl. deleted) ===');
let n = 0;
for (const d of biz) {
  const blob = JSON.stringify(d);
  if (!/(?:[^0-9]|^)1\.8(?:0+)?(?:[^0-9]|$)|"unitPrice":\s*180\b|:180,|:180\}/.test(blob)) continue;
  if (!/agua|bebida|drink|refresco|combo|slot|surcharge|precio|price/i.test(blob) && !/\bagua\b/.test(fold(d.name))) {
    // still show if number 1.8 appears near price keys
  }
  n += 1;
  if (n > 40) continue;
  console.log({
    id: d._id,
    name: d.name,
    type: d.type,
    itemType: d.itemType,
    unitPrice: d.unitPrice,
    deletedAt: d.deletedAt || null,
    active: d.active !== false,
  });
  // extract snippets with 1.8
  const matches = blob.match(/.{0,40}1\.8[0-9]*.{0,40}/g) || [];
  for (const m of matches.slice(0, 5)) console.log('  …', m);
}
console.log('total hits', n);

console.log('\n=== Agua 50cl duplicado (detalle brand / menu) ===');
for (const id of [
  'catitem-7fdaffeb-fdbc-4e45-996c-8a6f0886b800',
  'catitem-895c8224-2bac-4a56-9ecd-b67a5f07341e',
]) {
  const d = biz.find((x) => x._id === id);
  if (!d) continue;
  console.log(JSON.stringify({
    id: d._id,
    name: d.name,
    unitPrice: d.unitPrice,
    brandId: d.brandId,
    brandIds: d.brandIds,
    customFields: d.customFields,
    allowedInMenus: d.allowedInMenus,
    menuIds: d.menuIds,
    visibleInTpv: d.visibleInTpv,
    channels: d.channels,
    updatedAt: d.updatedAt,
  }, null, 2));
}
