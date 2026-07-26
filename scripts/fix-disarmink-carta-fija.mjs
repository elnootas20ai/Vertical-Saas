/**
 * DISARMINK Pau: deja fija la carta operativa
 * - Carbonara (pizzas) vendible
 * - Complementos en Individual/Dúo/Family/Combo Modommio + suplementos
 * - Mitad y mitad activa (halfHalf, carta)
 *
 *   node scripts/fix-disarmink-carta-fija.mjs --apply
 */
const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const DB = 'bbddsaas-catalog';
const BIZ = 'ed846f31-aee7-4568-ac03-fa25ff3ad773';
const APPLY = process.argv.includes('--apply');

const SIDE_SPECS = [
  { key: 'deluxe', fold: (n) => n === 'patatas deluxe' || n.includes('deluxe'), surcharge: null },
  { key: 'monalisa', fold: (n) => n.includes('monalisa'), surcharge: null },
  { key: 'moniato', fold: (n) => n.includes('moniato'), surcharge: null },
  { key: 'tequenos', fold: (n) => /tequen/.test(n), surcharge: 1.5 },
  { key: 'salchipapas', fold: (n) => n.includes('salchipapas'), surcharge: 1 },
];

async function couch(method, path, body) {
  const res = await fetch(`${COUCH}${path}`, {
    method,
    headers: {
      Authorization: AUTH,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path}: ${data.error || res.status} ${data.reason || ''}`);
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
    .replace(/\p{M}/gu, '');
}

function matchMenu(name, key) {
  const n = fold(name);
  if (key === 'individual') return n === 'individual' || n.includes('individual');
  if (key === 'duo') return n === 'duo' || n.includes('duo');
  if (key === 'family') return n === 'family' || n.includes('family') || n.includes('familiar');
  if (key === 'modomio') {
    return (
      n === 'combo modommio' ||
      n === 'combo modomio' ||
      n === 'combo mmodomio' ||
      (/modommio|modomio/.test(n) && /combo|menu|menú/.test(n))
    );
  }
  return false;
}

function asCarta(doc, extra = {}) {
  return {
    ...doc,
    ...extra,
    isStockItem: false,
    module: 'catalog',
    stockCategory: 'finished_product',
    active: true,
    available: true,
    deletedAt: null,
    updatedAt: new Date().toISOString(),
  };
}

const data = await couch('GET', `/${DB}/_all_docs?include_docs=true&limit=80000`);
const docs = (data.rows || []).map((r) => r.doc).filter(Boolean);
const allBiz = docs.filter((d) => d?.type === 'catalog_item' && bid(d) === BIZ);
const biz = allBiz.filter((d) => !d.deletedAt);

const writes = [];

// ── Carbonara ───────────────────────────────────────────────────────────────
const carbonara =
  biz.find((d) => fold(d.name) === 'carbonara' && !/guanciale/.test(fold(d.name)) && d.itemType !== 'combo') ||
  biz.find((d) => fold(d.name).includes('carbonara') && !/guanciale/.test(fold(d.name)) && d.itemType !== 'combo');

if (!carbonara) {
  console.log('⚠ Carbonara no encontrada');
} else {
  const needs =
    carbonara.isStockItem === true ||
    carbonara.active === false ||
    carbonara.available === false ||
    carbonara.module === 'stock';
  console.log('Carbonara', {
    id: carbonara._id,
    name: carbonara.name,
    isStockItem: carbonara.isStockItem,
    active: carbonara.active,
    needs,
  });
  if (needs) writes.push(asCarta(carbonara));
}

// ── Complementos + menús ────────────────────────────────────────────────────
function findSide(spec) {
  const prefer = (d) => {
    const c = fold(d.category);
    return c === 'complementos' || c === 'sides' || c === 'entrantes';
  };
  const candidates = biz.filter(
    (d) => d.itemType !== 'combo' && d.active !== false && spec.fold(fold(d.name)),
  );
  return candidates.find(prefer) || candidates[0] || null;
}

const sides = SIDE_SPECS.map((spec) => ({ ...spec, product: findSide(spec) }));
if (sides.some((s) => !s.product)) {
  console.error(
    'Faltan complementos:',
    sides.filter((s) => !s.product).map((s) => s.key),
  );
  process.exit(1);
}

console.log(
  'sides',
  sides.map((s) => ({
    key: s.key,
    id: s.product._id,
    name: s.product.name,
    isStockItem: s.product.isStockItem,
    surcharge: s.surcharge,
  })),
);

for (const s of sides) {
  const p = s.product;
  if (p.isStockItem === true || p.module === 'stock' || p.active === false || p.available === false) {
    writes.push(asCarta(p));
  }
}

const sideIds = sides.map((s) => s.product._id);
const sideSurcharges = Object.fromEntries(
  sides.filter((s) => s.surcharge != null).map((s) => [s.product._id, s.surcharge]),
);

for (const key of ['individual', 'duo', 'family', 'modomio']) {
  const combo = biz.find((d) => d.itemType === 'combo' && matchMenu(d.name, key));
  if (!combo) {
    console.log('⚠ menú no encontrado', key);
    continue;
  }
  const prevAllow = Array.isArray(combo.customFields?.comboSlotAllowlists?.side)
    ? combo.customFields.comboSlotAllowlists.side
    : [];
  const nextAllow = [...new Set([...sideIds, ...prevAllow])];
  const prevSur =
    combo.customFields?.comboSlotSurcharges?.side &&
    typeof combo.customFields.comboSlotSurcharges.side === 'object'
      ? combo.customFields.comboSlotSurcharges.side
      : {};
  const nextSur = { ...prevSur, ...sideSurcharges };
  const allowOk = sideIds.every((id) => nextAllow.includes(id));
  const surOk = Object.keys(sideSurcharges).every(
    (id) => Number(prevSur[id]) === Number(sideSurcharges[id]),
  );
  const needsCarta =
    combo.isStockItem === true ||
    combo.active === false ||
    combo.available === false ||
    Boolean(combo.deletedAt) ||
    combo.module !== 'catalog';
  const allowlistsChanged = !(allowOk && surOk && nextAllow.length === prevAllow.length);
  console.log(`menu ${combo.name}`, {
    allowOk,
    surOk,
    sideCount: nextAllow.length,
    needsCarta,
    isStockItem: combo.isStockItem,
  });
  if (!allowlistsChanged && !needsCarta) continue;
  // Even when allowlists already OK, clear stock/inactive flags (e.g. Family).
  writes.push(
    asCarta(combo, {
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
    }),
  );
}

// ── Mitad y mitad ───────────────────────────────────────────────────────────
function isMitad(d) {
  if (d.itemType === 'combo') return false;
  const n = fold(d.name);
  if (n.includes('al gusto') && fold(d.category) === 'ingredientes') return false;
  if (d.module === 'stock' && fold(d.category) === 'ingredientes') return false;
  return n.includes('mitad y mitad') || d.customFields?.halfHalf === true;
}

function mitadScore(d) {
  let s = 0;
  if (!d.deletedAt) s += 100;
  if (d.active !== false) s += 40;
  if (d.available !== false) s += 20;
  if (d.customFields?.halfHalf === true) s += 30;
  if (fold(d.category) === 'premium') s += 15;
  return s;
}

const mitadHits = allBiz.filter(isMitad).sort((a, b) => mitadScore(b) - mitadScore(a));
if (!mitadHits.length) {
  console.log('⚠ Mitad y mitad no encontrada');
} else {
  const keep = mitadHits[0];
  console.log('Mitad keep', { id: keep._id, name: keep.name, deletedAt: keep.deletedAt || null });
  writes.push(
    asCarta(keep, {
      name: 'Mitad y mitad',
      category: fold(keep.category) === 'ingredientes' ? 'Premium' : keep.category || 'Premium',
      price: Number(keep.price) > 0 ? Number(keep.price) : 17,
      itemType: 'product',
      customFields: {
        ...(keep.customFields && typeof keep.customFields === 'object' ? keep.customFields : {}),
        halfHalf: true,
        description:
          String(keep.customFields?.description || '').trim() ||
          'Premium mitad y mitad — elige 2 pizzas',
      },
    }),
  );
  for (const d of mitadHits.slice(1)) {
    if (d.deletedAt) continue;
    writes.push({
      ...d,
      deletedAt: new Date().toISOString(),
      active: false,
      available: false,
      updatedAt: new Date().toISOString(),
    });
  }
}

console.log(APPLY ? '=== APPLY ===' : '=== DRY ===');
console.log(
  'writes',
  writes.map((w) => ({ id: w._id, name: w.name, del: w.deletedAt || null, stock: w.isStockItem })),
);

if (!writes.length) {
  console.log('Ya está todo OK.');
  process.exit(0);
}
if (!APPLY) {
  console.log(`DRY → ${writes.length} doc(s). Usa --apply`);
  process.exit(0);
}

for (const doc of writes) {
  const saved = await couch('PUT', `/${DB}/${encodeURIComponent(doc._id)}`, doc);
  console.log('APPLIED', doc.name || doc._id, saved.rev);
}
console.log('Listo. Carbonara + complementos + Mitad y mitad fijados.');
