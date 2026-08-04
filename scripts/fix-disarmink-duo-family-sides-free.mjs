#!/usr/bin/env node
/**
 * DISARMINK Pau — Dúo y Family: complementos SIN suplemento.
 *
 * - Quita surcharges de Tequeños / Salchipapas Supreme / etc. en Dúo y Family.
 * - Incluye en allowlist todos los complementos activos de carta
 *   (3 patatas + Delicia + Supreme + Tequeños + Salchipapas + Alitas + Nuggets + Chicken Balls).
 *
 * Individual no se toca (sigue con +1,50 tequeños / +1 salchipapas si estaba).
 *
 *   node scripts/fix-disarmink-duo-family-sides-free.mjs
 *   node scripts/fix-disarmink-duo-family-sides-free.mjs --apply
 */
const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const DISARMINK = 'ed846f31-aee7-4568-ac03-fa25ff3ad773';
const APPLY = process.argv.includes('--apply');

async function couch(method, path, body) {
  const res = await fetch(`${COUCH}${path}`, {
    method,
    headers: { Authorization: AUTH, 'Content-Type': 'application/json', Accept: 'application/json' },
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
      /complemento|side|entrante/i.test(String(d.category || '')),
  )
  .sort((a, b) => String(a.name).localeCompare(String(b.name), 'es'));

const sideIds = allSides.map((d) => d._id);
console.log(APPLY ? '=== APPLY ===' : '=== DRY (sin escribir) ===');
console.log(
  'Complementos a incluir (todos sin surcharge):',
  allSides.map((d) => d.name),
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

  const nextAllow = [...new Set([...sideIds, ...prevAllow])];
  // Vaciar surcharges de side: todos van incluidos en el menú.
  const nextSur = {};

  console.log(`\n${combo.name}:`);
  console.log('  antes allow', prevAllow.length, 'sur', prevSur);
  console.log('  después allow', nextAllow.length, 'sur', nextSur);
  console.log(
    '  nombres',
    nextAllow.map((id) => biz.find((x) => x._id === id)?.name || id),
  );

  toWrite.push({
    ...combo,
    updatedAt: now,
    customFields: {
      ...(combo.customFields || {}),
      comboStructureConfirmed: true,
      comboSlotAllowlists: {
        ...(combo.customFields?.comboSlotAllowlists || {}),
        side: nextAllow,
      },
      comboSlotSurcharges: {
        ...(combo.customFields?.comboSlotSurcharges || {}),
        side: nextSur,
      },
    },
  });
}

if (!APPLY) {
  console.log(`\nDry-run. Para aplicar: añade --apply (${toWrite.length} docs)`);
  process.exit(0);
}

for (const doc of toWrite) {
  const saved = await couch('PUT', `/bbddsaas-catalog/${encodeURIComponent(doc._id)}`, doc);
  console.log('OK', doc.name, saved.rev);
}
console.log('Hecho.');
