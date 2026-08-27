import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateNetQtyByCatalogItem,
  movementNetKey,
  netQtyByItemWarehousePair,
  parseMovementNetKey,
} from '../shared/stock/movementNetQty.js';
import { resolveSalesPointIdFromRef } from '../services/storeWarehouseService.js';

test('movementNetKey / parseMovementNetKey roundtrip', () => {
  const key = movementNetKey('item-1', 'wh-a');
  assert.deepEqual(parseMovementNetKey(key), { catalogItemId: 'item-1', warehouseId: 'wh-a' });
  assert.deepEqual(parseMovementNetKey(movementNetKey('item-2', '')), {
    catalogItemId: 'item-2',
    warehouseId: '',
  });
});

test('netQtyByItemWarehousePair separa por almacén y resta reversos', () => {
  const movements = [
    { catalogItemId: 'item-a', warehouseId: 'wh-1', movementType: 'sale', quantity: 5 },
    { catalogItemId: 'item-a', warehouseId: 'wh-2', movementType: 'sale', quantity: 3 },
    { catalogItemId: 'item-a', warehouseId: 'wh-1', movementType: 'sale_reversal', quantity: 2 },
    { catalogItemId: 'item-b', warehouseId: 'wh-1', movementType: 'recipe_consumption', quantity: 1.5 },
  ];
  const saleNet = netQtyByItemWarehousePair(movements, 'sale', 'sale_reversal');
  assert.equal(saleNet[movementNetKey('item-a', 'wh-1')], 3);
  assert.equal(saleNet[movementNetKey('item-a', 'wh-2')], 3);
  assert.equal(saleNet[movementNetKey('item-b', 'wh-1')], undefined);

  const recipeNet = netQtyByItemWarehousePair(movements, 'recipe_consumption', 'recipe_consumption_reversal');
  assert.equal(recipeNet[movementNetKey('item-b', 'wh-1')], 1.5);

  const byItem = aggregateNetQtyByCatalogItem(saleNet);
  assert.equal(byItem['item-a'], 6);
});

test('resolveSalesPointIdFromRef: PDV id, wc: y workCenterId', () => {
  const pdvs = [
    { _id: 'pdv-bad', name: 'Badalona', workCenterId: 'wc-bad' },
    { _id: 'pdv-tia', name: 'Tiana', workCenterId: 'wc-tia', deletedAt: '2020-01-01' },
    { _id: 'pdv-live', name: 'Live', workCenterId: 'wc-live' },
  ];
  assert.equal(resolveSalesPointIdFromRef(pdvs, 'pdv-bad'), 'pdv-bad');
  assert.equal(resolveSalesPointIdFromRef(pdvs, 'wc:wc-bad'), 'pdv-bad');
  assert.equal(resolveSalesPointIdFromRef(pdvs, 'wc-live'), 'pdv-live');
  assert.equal(resolveSalesPointIdFromRef(pdvs, 'wc:wc-tia'), '');
  assert.equal(resolveSalesPointIdFromRef(pdvs, ''), '');
  assert.equal(resolveSalesPointIdFromRef(pdvs, 'unknown'), '');
});
