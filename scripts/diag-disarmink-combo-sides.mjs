#!/usr/bin/env node
/**
 * Diagnóstico DISARMINK: complementos y surcharges en Individual/Dúo/Family.
 * Solo lectura.
 *
 *   node scripts/diag-disarmink-combo-sides.mjs
 */
const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const DISARMINK = 'ed846f31-aee7-4568-ac03-fa25ff3ad773';

async function couch(method, path) {
  const res = await fetch(`${COUCH}${path}`, {
    method,
    headers: { Authorization: AUTH, Accept: 'application/json' },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path}: ${data.error || res.status}`);
  return data;
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

function matchMenu(name, key) {
  const n = fold(name);
  if (key === 'individual') return n === 'individual' || n.includes('individual');
  if (key === 'duo') return n === 'duo' || n === 'dúo' || /\bduo\b/.test(n);
  if (key === 'family') return n === 'family' || n.includes('family') || n.includes('familiar');
  return false;
}

const data = await couch('GET', '/bbddsaas-catalog/_all_docs?include_docs=true&limit=80000');
const docs = (data.rows || []).map((r) => r.doc).filter(Boolean);
const biz = docs.filter((d) => d?.type === 'catalog_item' && bid(d) === DISARMINK && !d.deletedAt);

const sides = biz
  .filter((d) => d.itemType !== 'combo' && /complemento|side|entrante/i.test(String(d.category || '')))
  .map((d) => ({
    id: d._id,
    name: d.name,
    category: d.category,
    price: d.unitPrice ?? d.price,
    active: d.active !== false,
  }))
  .sort((a, b) => a.name.localeCompare(b.name, 'es'));

console.log('=== COMPLEMENTOS EN CARTA ===');
for (const s of sides) {
  console.log(`- ${s.name} (${s.id.slice(0, 8)}…) cat=${s.category} precio=${s.price} active=${s.active}`);
}

for (const key of ['individual', 'duo', 'family']) {
  const combo = biz.find((d) => d.itemType === 'combo' && matchMenu(d.name, key));
  if (!combo) {
    console.log(`\n⚠ No menú: ${key}`);
    continue;
  }
  const allow = Array.isArray(combo.customFields?.comboSlotAllowlists?.side)
    ? combo.customFields.comboSlotAllowlists.side
    : [];
  const sur =
    combo.customFields?.comboSlotSurcharges?.side &&
    typeof combo.customFields.comboSlotSurcharges.side === 'object'
      ? combo.customFields.comboSlotSurcharges.side
      : {};
  console.log(`\n=== ${combo.name} (${key}) ===`);
  console.log('Allowlist:');
  for (const id of allow) {
    const p = biz.find((x) => x._id === id);
    console.log(`  · ${p?.name || '?'}  surcharge=${Number(sur[id]) || 0}`);
  }
  console.log('Surcharges map:');
  for (const [id, v] of Object.entries(sur)) {
    const p = biz.find((x) => x._id === id);
    console.log(`  · ${p?.name || id} = +${v}`);
  }
  const missing = sides.filter((s) => s.active && !allow.includes(s.id));
  if (missing.length) {
    console.log('Complementos activos NO en allowlist:');
    for (const m of missing) console.log(`  · ${m.name}`);
  }
}
