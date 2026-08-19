import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildInventoryOrganizerGroups,
  computeInventoryStats,
  computePurchaseSuggestion,
  filterItemsByOrganizer,
  inventoryStatus,
  inventoryStatusLabel,
  listInventoryOrganizerChoices,
  readInventoryProductBrand,
  resolveInventoryOrganizerId,
  stockFieldsForOrganizer,
  ORGANIZER_BEVERAGES,
  ORGANIZER_PACKAGING,
} from '../src/app/lib/inventoryUtils.ts';

test('inventoryStatus detects low and out', () => {
  assert.equal(inventoryStatus({ stockQuantity: 0, minStock: 5 }), 'out');
  assert.equal(inventoryStatus({ stockQuantity: 3, minStock: 5 }), 'low');
  assert.equal(inventoryStatus({ stockQuantity: 10, minStock: 5 }), 'ok');
});

test('readInventoryProductBrand prefers customFields.productBrand', () => {
  assert.equal(
    readInventoryProductBrand({ customFields: { productBrand: 'Galbani' }, supplierName: 'Otro' }),
    'Galbani',
  );
  assert.equal(readInventoryProductBrand({ customFields: {}, supplierName: 'Proveedor X' }), 'Proveedor X');
});

test('computeInventoryStats sums value', () => {
  const stats = computeInventoryStats([
    { stockQuantity: 10, minStock: 2, costPrice: 2.5 },
    { stockQuantity: 0, minStock: 1, costPrice: 1 },
  ]);
  assert.equal(stats.total, 2);
  assert.equal(stats.out, 1);
  assert.equal(stats.estimatedValue, 25);
});

test('inventoryStatusLabel in Spanish', () => {
  assert.equal(inventoryStatusLabel('ok'), 'Correcto');
  assert.equal(inventoryStatusLabel('low'), 'Bajo');
});

test('computePurchaseSuggestion covers deficit to minimum', () => {
  const low = computePurchaseSuggestion({ stockQuantity: 8, minStock: 10, reorderQuantity: 50 });
  assert.equal(low.quantity, 2);
  assert.equal(low.stockAfter, 10);

  const out = computePurchaseSuggestion({ stockQuantity: 0, minStock: 20, reorderQuantity: 50 });
  assert.equal(out.quantity, 50);
  assert.equal(out.stockAfter, 50);
});

test('resolveInventoryOrganizerId respeta inventoryOrganizerId', () => {
  const id = resolveInventoryOrganizerId(
    {
      name: 'Masa',
      stockCategory: 'ingredient',
      customFields: { inventoryOrganizerId: 'brand-pizza-1' },
    },
    new Map(),
    new Map(),
    [{ _id: 'brand-pizza-1', name: 'pizzeria', deliveryLineKind: 'pizza' }],
  );
  assert.equal(id, 'brand-pizza-1');
  assert.equal(stockFieldsForOrganizer(ORGANIZER_BEVERAGES).stockCategory, 'beverage');
  const choices = listInventoryOrganizerChoices([
    { _id: 'brand-pizza-1', name: 'pizzeria', deliveryLineKind: 'pizza' },
  ]);
  assert.ok(choices.some((c) => c.id === 'brand-pizza-1'));
  assert.ok(choices.some((c) => c.label === 'Bebidas'));
});

test('buildInventoryOrganizerGroups no mete el resto en un Total que no filtra', () => {
  const pizza = { _id: 'brand-pizza-1', name: 'pizzeria', deliveryLineKind: 'pizza' };
  const drinks = { _id: 'brand-drinks-1', name: 'bebidas marca', deliveryLineKind: 'drinks_desserts' };
  const items = [
    {
      name: 'Masa',
      stockQuantity: 4,
      minStock: 1,
      customFields: { inventoryOrganizerId: pizza._id },
    },
    {
      name: 'Cola',
      stockQuantity: 2,
      minStock: 1,
      customFields: { inventoryOrganizerId: drinks._id },
    },
    {
      name: 'Caja pizza',
      stockQuantity: 10,
      minStock: 1,
      stockCategory: 'packaging',
      customFields: { inventoryOrganizerId: ORGANIZER_PACKAGING },
    },
  ];
  const groups = buildInventoryOrganizerGroups(items, [], [pizza, drinks]);
  const leftover = groups.find((g) => g.id === drinks._id);
  assert.ok(leftover, 'la línea de bebidas debe ser un chip con su id, no Total');
  assert.equal(leftover.total, 1);
  assert.equal(groups.some((g) => g.id === 'total'), false);
  const filtered = filterItemsByOrganizer(items, drinks._id, [], [pizza, drinks]);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].name, 'Cola');
});
