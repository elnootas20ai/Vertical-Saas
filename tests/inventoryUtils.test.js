import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeInventoryStats,
  computePurchaseSuggestion,
  inventoryStatus,
  inventoryStatusLabel,
  readInventoryProductBrand,
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
