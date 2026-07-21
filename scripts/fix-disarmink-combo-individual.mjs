/**
 * Diagnóstico + fix del combo «Individual» en DISARMINK (Pau / Modomio real).
 * Motivo TPV: isStockItem=true lo oculta.
 * Estructura: 1 pizza (todas) + Patatas Deluxe|Monalisa + bebida.
 *
 * Uso VPS: node scripts/fix-disarmink-combo-individual.mjs [--apply]
 */
const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const DISARMINK = 'ed846f31-aee7-4568-ac03-fa25ff3ad773';
const MODOMIO_BRAND = 'brand-96a8d7ce-e9af-459c-b8a9-48ffc55949ec';
const APPLY = process.argv.includes('--apply');

const COMBO_STRUCTURE = [
  { slotKind: 'main', label: 'Pizza', required: true, expectedCount: 1 },
  { slotKind: 'side', label: 'Patatas Deluxe o Monalisa', required: true, expectedCount: 1 },
  { slotKind: 'drink', label: 'Bebida', required: true, expectedCount: 1 },
];

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

async function main() {
  const data = await couch('GET', '/bbddsaas-catalog/_all_docs?include_docs=true&limit=50000');
  const docs = (data.rows || []).map((r) => r.doc).filter(Boolean);
  const biz = docs.filter((d) => !d.deletedAt && bid(d) === DISARMINK && d.type === 'catalog_item');

  const individual = biz.find((d) => fold(d.name) === 'individual' && d.itemType === 'combo');
  const deluxe = biz.find((d) => fold(d.name) === 'patatas deluxe' && fold(d.category) === 'complementos');
  const monalisa = biz.find((d) => fold(d.name) === 'patatas monalisa' && fold(d.category) === 'complementos');
  const pizzas = biz.filter(
    (d) =>
      (d.module || 'catalog') === 'catalog' &&
      d.itemType !== 'combo' &&
      d.isStockItem !== true &&
      d.active !== false &&
      /pizza|calzone|premium|especialidad/i.test(`${d.category || ''} ${d.name || ''}`),
  );
  const drinks = biz.filter(
    (d) =>
      (d.module || 'catalog') === 'catalog' &&
      d.itemType !== 'combo' &&
      d.isStockItem !== true &&
      d.active !== false &&
      /bebida|refresco/i.test(d.category || ''),
  );

  console.log(APPLY ? '=== APPLY ===' : '=== DRY ===');
  console.log({
    individual: individual
      ? {
          _id: individual._id,
          isStockItem: individual.isStockItem,
          active: individual.active,
          structure: individual.customFields?.comboStructure?.length || 0,
          confirmed: individual.customFields?.comboStructureConfirmed,
          brandIds: individual.brandIds,
          unitPrice: individual.unitPrice,
        }
      : null,
    deluxe: deluxe ? { _id: deluxe._id, name: deluxe.name, price: deluxe.unitPrice } : null,
    monalisa: monalisa ? { _id: monalisa._id, name: monalisa.name, price: monalisa.unitPrice } : null,
    pizzas: pizzas.length,
    drinks: drinks.length,
  });

  if (!individual) {
    console.error('No existe combo Individual en DISARMINK');
    process.exit(1);
  }
  if (!deluxe || !monalisa) {
    console.error('Faltan Patatas Deluxe o Patatas Monalisa en Complementos');
    process.exit(1);
  }

  const sideAllowlist = [deluxe._id, monalisa._id];
  const next = {
    ...individual,
    name: 'Individual',
    itemType: 'combo',
    category: 'Combos',
    module: 'catalog',
    isStockItem: false,
    stockCategory: 'finished_product',
    active: true,
    available: true,
    brandIds: Array.isArray(individual.brandIds) && individual.brandIds.length
      ? individual.brandIds
      : [MODOMIO_BRAND],
    description:
      individual.description ||
      'Menú pizza: elige pizza + Patatas Deluxe o Monalisa + bebida',
    customFields: {
      ...(individual.customFields || {}),
      comboStructure: COMBO_STRUCTURE,
      comboStructureConfirmed: true,
      // Restringe el hueco de patatas en TPV a Deluxe | Monalisa
      comboSlotAllowlists: {
        side: sideAllowlist,
      },
    },
    updatedAt: new Date().toISOString(),
  };

  console.log('Cambios:', {
    isStockItem: `${individual.isStockItem} → false`,
    sideAllowlist: ['Patatas Deluxe', 'Patatas Monalisa'],
    structure: COMBO_STRUCTURE.map((s) => s.label).join(' + '),
  });

  if (!APPLY) {
    console.log('No se escribe. Usa --apply');
    return;
  }

  await couch('PUT', `/bbddsaas-catalog/${encodeURIComponent(individual._id)}`, next);
  console.log('✓ Individual listo para TPV', individual._id);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
