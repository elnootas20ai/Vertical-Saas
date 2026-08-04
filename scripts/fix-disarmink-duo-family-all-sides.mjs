#!/usr/bin/env node
/**
 * DISARMINK — Dúo y Family: TODOS los complementos de carta + 2 suplementos.
 * Suplementos: Tequeños +1,50€ · Salchipapas Supreme +1€
 *
 *   node scripts/fix-disarmink-duo-family-all-sides.mjs
 *   node scripts/fix-disarmink-duo-family-all-sides.mjs --apply
 */
const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const DISARMINK = 'ed846f31-aee7-4568-ac03-fa25ff3ad773';
const APPLY = process.argv.includes('--apply');

const SURCHARGE_BY_FOLD = [
  { test: (n) => n.includes('tequen'), amount: 1.5 },
  { test: (n) => n.includes('salchipapas'), amount: 1 },
];

async function couch(method, path, body) {
  const res = await fetch(`${COUCH}${path}`, {
    method,
    headers: {
      Authorization: AUTH,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path}: ${data.error || res.status} ${data.reason || ''}`);
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
  if (key === 'duo') return n === 'duo' || n === 'dúo' || /\bduo\b/.test(n);
  if (key === 'family') return n === 'family' || n.includes('family') || n.includes('familiar');
  return false;
}

const data = await couch('GET', '/bbddsaas-catalog/_all_docs?include_docs=true&limit=80000');
const docs = (data.rows || []).map((r) => r.doc).filter(Boolean);
const biz = docs.filter((d) => d?.type === 'catalog_item' && bid(d) === DISARMINK && !d.deletedAt);

const allSides = biz
  .filter(
    (d) =>
      d.itemType !== 'combo' &&
      d.active !== false &&
      (d.module || 'catalog') !== 'stock' &&
      /complemento|side|entrante/i.test(String(d.category || '')),
  )
  .sort((a, b) => String(a.name).localeCompare(String(b.name), 'es'));

const sideIds = allSides.map((d) => d._id);
const nextSur = {};
for (const s of allSides) {
  const n = fold(s.name);
  for (const rule of SURCHARGE_BY_FOLD) {
    if (rule.test(n)) nextSur[s._id] = rule.amount;
  }
}

console.log(APPLY ? '=== APPLY Duo/Family all sides ===' : '=== DRY Duo/Family all sides ===');
console.log(
  'Sides:',
  allSides.map((d) => d.name),
);
console.log(
  'Suplementos:',
  Object.fromEntries(
    Object.entries(nextSur).map(([id, v]) => [biz.find((x) => x._id === id)?.name || id, v]),
  ),
);

const now = new Date().toISOString();
const toWrite = [];

for (const key of ['duo', 'family']) {
  const combo = biz.find((d) => d.itemType === 'combo' && matchMenu(d.name, key));
  if (!combo) {
    console.log(`⚠ No encontrado: ${key}`);
    continue;
  }
  const prevAllow = Array.isArray(combo.customFields?.comboSlotAllowlists?.side)
    ? combo.customFields.comboSlotAllowlists.side
    : [];
  const prevSur =
    combo.customFields?.comboSlotSurcharges?.side &&
    typeof combo.customFields.comboSlotSurcharges.side === 'object'
      ? combo.customFields.comboSlotSurcharges.side
      : {};

  console.log(`\n${combo.name}:`);
  console.log(
    '  antes allow',
    prevAllow.map((id) => biz.find((x) => x._id === id)?.name || id),
  );
  console.log(
    '  antes sur',
    Object.fromEntries(
      Object.entries(prevSur).map(([id, v]) => [biz.find((x) => x._id === id)?.name || id, v]),
    ),
  );
  console.log(
    '  después allow',
    sideIds.map((id) => biz.find((x) => x._id === id)?.name || id),
  );
  console.log(
    '  después sur',
    Object.fromEntries(
      Object.entries(nextSur).map(([id, v]) => [biz.find((x) => x._id === id)?.name || id, v]),
    ),
  );

  toWrite.push({
    ...combo,
    updatedAt: now,
    customFields: {
      ...(combo.customFields || {}),
      comboStructureConfirmed: true,
      comboSlotAllowlists: {
        ...(combo.customFields?.comboSlotAllowlists || {}),
        side: sideIds,
      },
      comboSlotSurcharges: {
        ...(combo.customFields?.comboSlotSurcharges || {}),
        side: nextSur,
      },
    },
  });
}

if (!APPLY) {
  console.log(`\nDry-run OK (${toWrite.length} docs). Pasa --apply.`);
  process.exit(0);
}

for (const doc of toWrite) {
  const saved = await couch('PUT', `/bbddsaas-catalog/${encodeURIComponent(doc._id)}`, doc);
  console.log('ok', doc.name, saved.rev);
}
console.log('\nHecho. Recarga TPV (Ctrl+Shift+R).');
