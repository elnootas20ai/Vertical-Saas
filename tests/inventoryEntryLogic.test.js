import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFabricationEntryNotes,
  buildManualStockPurchaseInvoicePayload,
  buildPurchaseEntryNotes,
  computeFabricationConsumptions,
  improvisedPurchaseWarning,
  resolveStoreIngredientForStockItem,
  stockItemHasFabricationRecipe,
} from '../src/app/lib/inventoryEntryLogic.ts';

test('resolveStoreIngredientForStockItem by customFields id', () => {
  const ing = { id: 'ing-masa', name: 'Masa', recipeLines: [{ storeIngredientId: 'h', name: 'Harina', quantity: 0.2, unit: 'kg' }] };
  const item = { name: 'Otro', customFields: { storeIngredientId: 'ing-masa' } };
  assert.equal(resolveStoreIngredientForStockItem(item, [ing])?.id, 'ing-masa');
});

test('resolveStoreIngredientForStockItem by name fold', () => {
  const ing = { id: '1', name: 'Masa Bufala', recipeLines: [] };
  const item = { name: 'masa bufala', customFields: {} };
  assert.equal(resolveStoreIngredientForStockItem(item, [ing])?.id, '1');
});

test('stockItemHasFabricationRecipe', () => {
  const withRecipe = {
    id: 'm',
    name: 'Masa',
    recipeLines: [{ storeIngredientId: 'h', name: 'Harina', quantity: 0.2, unit: 'kg' }],
  };
  const without = { id: 'a', name: 'Aceite', recipeLines: [] };
  assert.equal(stockItemHasFabricationRecipe({ name: 'Masa', customFields: {} }, [withRecipe]), true);
  assert.equal(stockItemHasFabricationRecipe({ name: 'Aceite', customFields: {} }, [without]), false);
});

test('computeFabricationConsumptions scales recipe and links stock items', () => {
  const recipe = [
    { storeIngredientId: 'harina', name: 'Harina', quantity: 0.2, unit: 'kg' },
    { storeIngredientId: 'agua', name: 'Agua', quantity: 0.1, unit: 'l' },
  ];
  const stock = [
    { _id: 'c-harina', name: 'Harina', customFields: { storeIngredientId: 'harina' }, unit: 'kg' },
    { _id: 'c-agua', name: 'Agua', customFields: { storeIngredientId: 'agua' }, unit: 'l' },
  ];
  const { lines, missingNames } = computeFabricationConsumptions(recipe, 100, stock);
  assert.deepEqual(missingNames, []);
  assert.equal(lines.length, 2);
  assert.equal(lines[0].quantity, 20);
  assert.equal(lines[0].catalogItemId, 'c-harina');
  assert.equal(lines[1].quantity, 10);
  assert.equal(lines[1].catalogItemId, 'c-agua');
});

test('computeFabricationConsumptions reports missing stock articles', () => {
  const recipe = [{ storeIngredientId: 'x', name: 'Levadura', quantity: 1, unit: 'g' }];
  const { lines, missingNames } = computeFabricationConsumptions(recipe, 2, []);
  assert.deepEqual(missingNames, ['Levadura']);
  assert.equal(lines[0].quantity, 2);
  assert.equal(lines[0].catalogItemId, undefined);
});

test('buildPurchaseEntryNotes and buildFabricationEntryNotes', () => {
  assert.equal(buildPurchaseEntryNotes({ quantity: 5, unit: 'kg' }), 'Compra · sin ticket: +5 kg');
  assert.equal(
    buildPurchaseEntryNotes({ quantity: 5, unit: 'kg', supplierName: 'Sysco', ticketNumber: 'A-9', extraNotes: 'albarán' }),
    'Compra · Sysco · ticket A-9: +5 kg — albarán',
  );
  assert.equal(
    buildFabricationEntryNotes({ quantity: 10, unit: 'ud', recipeName: 'Masa' }),
    'Fabricación «Masa»: +10 ud',
  );
});

test('improvisedPurchaseWarning and invoice payload', () => {
  assert.match(String(improvisedPurchaseWarning({ supplierId: '', supplierName: '' })), /sin proveedor/i);
  assert.equal(improvisedPurchaseWarning({ supplierId: 's1', supplierName: 'Makro' }), null);
  const payload = buildManualStockPurchaseInvoicePayload({
    item: { _id: 'c1', name: 'Harina', costPrice: 2 },
    quantity: 10,
    ticketNumber: '',
    supplierName: '',
  });
  assert.equal(payload.documentKind, 'albaran');
  assert.equal(payload.loadToWarehouse, false);
  assert.equal(payload.flags.noAttachment, true);
  assert.equal(payload.flags.manualReview, true);
  assert.match(String(payload.notes), /improvisada/i);
});
