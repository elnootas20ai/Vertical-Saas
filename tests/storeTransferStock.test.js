import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertItemsAvailableInWarehouse,
  hasStoreTransferLineMovement,
} from '../shared/stock/storeTransferStock.js';

test('assertItemsAvailableInWarehouse: ok si cabe en origen', () => {
  const catalog = new Map([
    [
      'item-a',
      {
        stockQuantity: 10,
        warehouseStock: [{ warehouseId: 'wh-from', quantity: 8 }],
      },
    ],
  ]);
  assert.doesNotThrow(() =>
    assertItemsAvailableInWarehouse(
      [{ catalogItemId: 'item-a', name: 'Harina', quantity: 5 }],
      catalog,
      'wh-from',
    ),
  );
});

test('assertItemsAvailableInWarehouse: falla si pide de más', () => {
  const catalog = {
    'item-a': {
      stockQuantity: 10,
      warehouseStock: [
        { warehouseId: 'wh-from', quantity: 3 },
        { warehouseId: 'wh-to', quantity: 7 },
      ],
    },
  };
  assert.throws(
    () =>
      assertItemsAvailableInWarehouse(
        [{ catalogItemId: 'item-a', name: 'Harina', quantity: 5 }],
        catalog,
        'wh-from',
      ),
    /Stock insuficiente de "Harina"/,
  );
});

test('hasStoreTransferLineMovement distingue almacén origen vs destino', () => {
  const movements = [
    {
      movementType: 'transfer_in',
      catalogItemId: 'item-a',
      warehouseId: 'wh-from',
      quantity: 2,
    },
  ];
  assert.equal(
    hasStoreTransferLineMovement(movements, {
      movementType: 'transfer_in',
      catalogItemId: 'item-a',
      warehouseId: 'wh-from',
    }),
    true,
  );
  assert.equal(
    hasStoreTransferLineMovement(movements, {
      movementType: 'transfer_in',
      catalogItemId: 'item-a',
      warehouseId: 'wh-to',
    }),
    false,
  );
});
