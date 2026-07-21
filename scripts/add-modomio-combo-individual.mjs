/**
 * Crea «Combo Individual» en Modomio: 1 pizza + patatas/complemento + refresco.
 * Estructura TPV confirmada para poder avanzar.
 *
 * Uso VPS: node scripts/add-modomio-combo-individual.mjs --apply
 */
import { randomUUID } from 'node:crypto';

const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const MODOMIO_BIZ = '33821959-ae50-4e52-bfea-ea2b145faeac';
const ADMIN = 'e94ccc03-5399-40a8-8e92-740bd66f38e0';
const APPLY = process.argv.includes('--apply');

const COMBO_STRUCTURE = [
  { slotKind: 'main', label: 'Pizza', required: true, expectedCount: 1 },
  { slotKind: 'side', label: 'Patatas', required: true, expectedCount: 1 },
  { slotKind: 'drink', label: 'Refresco', required: true, expectedCount: 1 },
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

function bizId(item) {
  return String(item.business_id || item.businessId || '')
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
  const modomio = docs.filter((d) => !d.deletedAt && bizId(d) === MODOMIO_BIZ);

  const existing = modomio.find((d) => fold(d.name) === 'combo individual');
  const template =
    modomio.find((d) => fold(d.name) === 'combo modomio') ||
    modomio.find((d) => d.itemType === 'combo');

  const complements = modomio.filter(
    (d) =>
      (d.module || 'catalog') === 'catalog' &&
      d.itemType !== 'combo' &&
      /complement|patata|side|entrante/i.test(`${d.category || ''} ${d.name || ''}`),
  );
  const drinks = modomio.filter(
    (d) =>
      (d.module || 'catalog') === 'catalog' &&
      d.itemType !== 'combo' &&
      /bebida|refresco|coca|fanta|sprite/i.test(`${d.category || ''} ${d.name || ''}`),
  );
  const pizzas = modomio.filter(
    (d) =>
      (d.module || 'catalog') === 'catalog' &&
      d.itemType !== 'combo' &&
      /pizza|premium|especialidad|calzone/i.test(`${d.category || ''} ${d.name || ''}`),
  );

  console.log(APPLY ? '=== APPLY ===' : '=== DRY ===');
  console.log({
    existingComboIndividual: existing ? existing._id : null,
    template: template ? template.name : null,
    pizzas: pizzas.length,
    complements: complements.length,
    drinks: drinks.length,
  });

  if (existing) {
    console.log('Ya existe Combo Individual — actualizo estructura/labels.');
    const next = {
      ...existing,
      name: 'Combo Individual',
      itemType: 'combo',
      category: 'Combos',
      module: 'catalog',
      isStockItem: false,
      stockCategory: 'finished_product',
      active: true,
      available: true,
      customFields: {
        ...(existing.customFields || {}),
        comboStructure: COMBO_STRUCTURE,
        comboStructureConfirmed: true,
      },
      updatedAt: new Date().toISOString(),
    };
    if (!APPLY) {
      console.log('DRY: actualizaría', existing._id);
      return;
    }
    await couch('PUT', `/bbddsaas-catalog/${encodeURIComponent(existing._id)}`, next);
    console.log('✓ actualizado', existing._id);
    return;
  }

  const now = new Date().toISOString();
  const id = `catitem-${randomUUID()}`;
  const doc = {
    _id: id,
    type: 'catalog_item',
    id,
    user_id: template?.user_id || ADMIN,
    business_id: MODOMIO_BIZ,
    vertical: 'delivery',
    module: 'catalog',
    itemType: 'combo',
    name: 'Combo Individual',
    description: '1 pizza + patatas + refresco',
    category: 'Combos',
    unitPrice: Number(template?.unitPrice) || 12.9,
    costPrice: Number(template?.costPrice) || 0,
    taxRate: template?.taxRate ?? 10,
    stockQuantity: 0,
    minStock: 0,
    unit: 'ud',
    active: true,
    available: true,
    webVisible: true,
    isStockItem: false,
    stockCategory: 'finished_product',
    brandIds: Array.isArray(template?.brandIds) ? [...template.brandIds] : [],
    allergens: [],
    images: [],
    image: template?.image || '',
    sku: `COMBO-IND-${Date.now().toString(36).toUpperCase()}`,
    comboItems: [],
    customFields: {
      comboStructure: COMBO_STRUCTURE,
      comboStructureConfirmed: true,
    },
    createdAt: now,
    updatedAt: now,
  };

  console.log('Nuevo doc:', {
    _id: doc._id,
    name: doc.name,
    unitPrice: doc.unitPrice,
    brandIds: doc.brandIds.length,
    structure: COMBO_STRUCTURE.map((s) => s.label).join(' + '),
  });

  if (!APPLY) {
    console.log('No se crea nada. Usa --apply');
    return;
  }

  await couch('PUT', `/bbddsaas-catalog/${encodeURIComponent(id)}`, doc);
  console.log('✓ creado Combo Individual', id);
  console.log('En TPV: Pizza (o especialidad) + Patatas/complemento + Refresco → Continuar');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
