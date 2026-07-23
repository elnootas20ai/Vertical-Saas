/**
 * DISARMINK (Pau):
 * 1) Crea «Patatas Moniato» (Complementos) si no existe y la pone como 3ª opción del Combo Individual
 * 2) Pizza Pepperoni → Champiñones quitables en TPV
 *
 * Uso VPS: node scripts/fix-disarmink-moniato-pepperoni.mjs [--apply]
 */
const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const DISARMINK = 'ed846f31-aee7-4568-ac03-fa25ff3ad773';
const APPLY = process.argv.includes('--apply');
const { randomUUID } = await import('node:crypto');

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

function parseIngredients(raw) {
  return String(raw || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

function mergeIngredient(list, name) {
  const folded = fold(name);
  if (list.some((x) => fold(x) === folded)) return list;
  return [...list, name];
}

async function main() {
  const data = await couch('GET', '/bbddsaas-catalog/_all_docs?include_docs=true&limit=50000');
  const docs = (data.rows || []).map((r) => r.doc).filter(Boolean);
  const biz = docs.filter((d) => !d.deletedAt && bid(d) === DISARMINK && d.type === 'catalog_item');

  const individual = biz.find((d) => fold(d.name) === 'individual' && d.itemType === 'combo');
  const deluxe = biz.find((d) => fold(d.name) === 'patatas deluxe' && fold(d.category) === 'complementos');
  const monalisa = biz.find((d) => fold(d.name) === 'patatas monalisa' && fold(d.category) === 'complementos');
  let moniato = biz.find(
    (d) =>
      fold(d.name) === 'patatas moniato' ||
      fold(d.name) === 'patatas de moniato' ||
      /patatas?\s*(de\s*)?moniato/.test(fold(d.name)),
  );

  const pepperoniPizza = biz.find((d) => {
    const n = fold(d.name);
    const cat = fold(d.category);
    if (d.itemType === 'combo') return false;
    if (cat === 'ingredientes') return false;
    return n === 'peperoni' || n === 'pepperoni' || n === 'pizza peperoni' || n === 'pizza pepperoni';
  });

  console.log(APPLY ? '=== APPLY ===' : '=== DRY ===');

  if (!individual || !deluxe || !monalisa) {
    console.error('Falta Individual / Deluxe / Monalisa');
    process.exit(1);
  }
  if (!pepperoniPizza) {
    console.error('No hay pizza Pepperoni en carta');
    process.exit(1);
  }

  const now = new Date().toISOString();
  let moniatoDoc = moniato;

  if (!moniatoDoc) {
    const id = `catitem-${randomUUID()}`;
    moniatoDoc = {
      _id: id,
      type: 'catalog_item',
      itemType: 'product',
      name: 'Patatas Moniato',
      category: 'Complementos',
      module: 'catalog',
      vertical: 'delivery',
      business_id: DISARMINK,
      brandIds: Array.isArray(deluxe.brandIds) ? [...deluxe.brandIds] : deluxe.brandIds,
      unitPrice: Number(deluxe.unitPrice) || 4.2,
      taxRate: deluxe.taxRate ?? 10,
      active: true,
      available: true,
      isStockItem: false,
      stockCategory: 'finished_product',
      description: 'Patatas de moniato',
      customFields: {},
      createdAt: now,
      updatedAt: now,
      user_id: deluxe.user_id || individual.user_id,
    };
    console.log('→ Crear Patatas Moniato', {
      _id: id,
      price: moniatoDoc.unitPrice,
      from: deluxe.name,
    });
  } else {
    console.log('→ Patatas Moniato ya existe', { _id: moniatoDoc._id, name: moniatoDoc.name });
  }

  const sideIds = [deluxe._id, monalisa._id, moniatoDoc._id];
  const structure = Array.isArray(individual.customFields?.comboStructure)
    ? individual.customFields.comboStructure.map((s) => {
        if (s.slotKind !== 'side') return { ...s };
        return {
          ...s,
          label: 'Patatas Deluxe, Monalisa o Moniato',
          required: true,
          expectedCount: 1,
        };
      })
    : [
        { slotKind: 'main', label: 'Pizza', required: true, expectedCount: 1 },
        { slotKind: 'side', label: 'Patatas Deluxe, Monalisa o Moniato', required: true, expectedCount: 1 },
        { slotKind: 'drink', label: 'Bebida', required: true, expectedCount: 1 },
      ];

  const comboNext = {
    ...individual,
    updatedAt: now,
    description: 'Menú pizza: elige pizza + Patatas Deluxe, Monalisa o Moniato + bebida',
    customFields: {
      ...(individual.customFields || {}),
      comboStructure: structure,
      comboStructureConfirmed: true,
      comboSlotAllowlists: {
        ...(individual.customFields?.comboSlotAllowlists || {}),
        side: sideIds,
      },
    },
  };

  const currentIng = parseIngredients(pepperoniPizza.customFields?.ingredients);
  const nextIng = mergeIngredient(currentIng, 'Champiñones');
  const pizzaNext = {
    ...pepperoniPizza,
    updatedAt: now,
    customFields: {
      ...(pepperoniPizza.customFields || {}),
      ingredients: nextIng.join(', '),
    },
  };

  console.log('→ Individual sides:', [deluxe.name, monalisa.name, moniatoDoc.name]);
  console.log(`→ ${pepperoniPizza.name}: "${currentIng.join(', ')}" → "${nextIng.join(', ')}"`);

  if (!APPLY) {
    console.log('No se modifica nada. Añade --apply para guardar.');
    return;
  }

  if (!moniato) {
    await couch('PUT', `/bbddsaas-catalog/${encodeURIComponent(moniatoDoc._id)}`, moniatoDoc);
    console.log('✓ Creada Patatas Moniato');
  }

  await couch('PUT', `/bbddsaas-catalog/${encodeURIComponent(individual._id)}`, comboNext);
  console.log('✓ Individual con 3 patatas');

  await couch('PUT', `/bbddsaas-catalog/${encodeURIComponent(pepperoniPizza._id)}`, pizzaNext);
  console.log('✓ Pepperoni con Champiñones quitables');

  console.log('Listo. Recarga TPV en la tablet.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
