/**
 * Actualiza estructuras Individual / Dúo / Family en DISARMINK + limpia isStockItem de pizzas de carta.
 *   node scripts/fix-disarmink-combo-menus.mjs
 *   node scripts/fix-disarmink-combo-menus.mjs --apply
 */
const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const DISARMINK = 'ed846f31-aee7-4568-ac03-fa25ff3ad773';
const APPLY = process.argv.includes('--apply');

const MENUS = {
  individual: {
    match: (n) => n === 'individual',
    structure: [
      { slotKind: 'main', label: 'Pizza', required: true, expectedCount: 1 },
      { slotKind: 'side', label: 'Patatas Deluxe o Monalisa', required: true, expectedCount: 1 },
      { slotKind: 'drink', label: 'Bebida', required: true, expectedCount: 1 },
    ],
  },
  duo: {
    match: (n) => n === 'duo' || n === 'dúo',
    structure: [
      { slotKind: 'main', label: 'Pizzas (×2)', required: true, expectedCount: 2 },
      { slotKind: 'side', label: 'Complemento', required: true, expectedCount: 1 },
      { slotKind: 'drink', label: 'Bebidas (×2)', required: true, expectedCount: 2 },
    ],
  },
  family: {
    match: (n) => n === 'family' || n === 'familiar',
    structure: [
      { slotKind: 'main', label: 'Pizzas (×3)', required: true, expectedCount: 3 },
      { slotKind: 'side', label: 'Complementos (×2)', required: true, expectedCount: 2 },
      { slotKind: 'drink', label: 'Bebidas (×4)', required: true, expectedCount: 4 },
    ],
  },
};

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

function looksPizza(d) {
  const cat = fold(d.category);
  const name = fold(d.name);
  if (/^(pizzas?|premium|especialidad(es)?|calzones?)$/.test(cat)) return true;
  if (/pizza|calzone/.test(cat)) return true;
  return /pizza|calzone/.test(name);
}

async function main() {
  const data = await couch('GET', '/bbddsaas-catalog/_all_docs?include_docs=true&limit=50000');
  const docs = (data.rows || []).map((r) => r.doc).filter(Boolean);
  const biz = docs.filter((d) => !d.deletedAt && bid(d) === DISARMINK && d.type === 'catalog_item');

  const deluxe = biz.find((d) => fold(d.name) === 'patatas deluxe' && fold(d.category) === 'complementos');
  const monalisa = biz.find((d) => fold(d.name) === 'patatas monalisa' && fold(d.category) === 'complementos');

  const toWrite = [];

  for (const [key, cfg] of Object.entries(MENUS)) {
    const combo = biz.find((d) => d.itemType === 'combo' && cfg.match(fold(d.name)));
    if (!combo) {
      console.log(`⚠ No encontrado: ${key}`);
      continue;
    }
    const next = {
      ...combo,
      itemType: 'combo',
      category: 'Combos',
      module: 'catalog',
      isStockItem: false,
      active: true,
      available: true,
      customFields: {
        ...(combo.customFields || {}),
        comboStructure: cfg.structure,
        comboStructureConfirmed: true,
      },
      updatedAt: new Date().toISOString(),
    };
    if (key === 'individual' && deluxe && monalisa) {
      next.customFields.comboSlotAllowlists = {
        side: [deluxe._id, monalisa._id],
      };
    } else if (key !== 'individual') {
      // Dúo / Familiar: todos los complementos
      if (next.customFields.comboSlotAllowlists) {
        delete next.customFields.comboSlotAllowlists;
      }
    }
    console.log(`${combo.name}:`, cfg.structure.map((s) => `${s.slotKind}×${s.expectedCount}`).join(' · '));
    toWrite.push(next);
  }

  const pizzasToFix = biz.filter(
    (d) =>
      d.itemType !== 'combo' &&
      d.itemType !== 'service' &&
      d.isStockItem === true &&
      looksPizza(d) &&
      !(d.customFields && d.customFields.halfHalf) &&
      !/^receta\b/i.test(String(d.name || '')),
  );
  console.log(`Pizzas isStockItem→false: ${pizzasToFix.length}`);
  for (const p of pizzasToFix.slice(0, 15)) {
    console.log(`  - ${p.name} (${p.category})`);
  }
  if (pizzasToFix.length > 15) console.log(`  … +${pizzasToFix.length - 15} más`);

  if (!APPLY) {
    console.log('\nSimulación. Usa --apply');
    return;
  }

  for (const doc of toWrite) {
    await couch('PUT', `/bbddsaas-catalog/${encodeURIComponent(doc._id)}`, doc);
  }
  for (const p of pizzasToFix) {
    await couch('PUT', `/bbddsaas-catalog/${encodeURIComponent(p._id)}`, {
      ...p,
      isStockItem: false,
      stockCategory: p.stockCategory || 'finished_product',
      module: 'catalog',
      updatedAt: new Date().toISOString(),
    });
  }
  console.log(`✓ Combos actualizados: ${toWrite.length}. Pizzas liberadas: ${pizzasToFix.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
