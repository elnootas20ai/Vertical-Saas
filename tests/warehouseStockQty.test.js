import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyWarehouseStockDelta,
  quantityForWarehouse,
  storeWarehouseDisplayName,
} from '../shared/stock/warehouseStockQty.js';

test('quantityForWarehouse: legacy sin filas', () => {
  assert.equal(quantityForWarehouse({ stockQuantity: 20 }, 'wh-a'), 20);
  assert.equal(quantityForWarehouse({ stockQuantity: 20 }, ''), 20);
});

test('quantityForWarehouse: separado por almacén', () => {
  const item = {
    stockQuantity: 25,
    warehouseStock: [
      { warehouseId: 'wh-bad', quantity: 10 },
      { warehouseId: 'wh-tia', quantity: 15 },
    ],
  };
  assert.equal(quantityForWarehouse(item, 'wh-bad'), 10);
  assert.equal(quantityForWarehouse(item, 'wh-tia'), 15);
  assert.equal(quantityForWarehouse(item, 'wh-other'), 0);
});

test('applyWarehouseStockDelta siembra legacy en el primer almacén', () => {
  const applied = applyWarehouseStockDelta({ stockQuantity: 20 }, 'wh-bad', -3, 'Almacén Badalona');
  assert.equal(applied.previousQty, 20);
  assert.equal(applied.nextQty, 17);
  assert.equal(applied.stockQuantity, 17);
  assert.equal(applied.warehouseStock[0].warehouseId, 'wh-bad');
});

test('applyWarehouseStockDelta sin warehouseId no toca warehouseStock (bug albarán multi-tienda)', () => {
  const item = {
    stockQuantity: 10,
    warehouseStock: [{ warehouseId: 'wh-tia', quantity: 4, warehouseName: 'Tiana' }],
  };
  const applied = applyWarehouseStockDelta(item, '', 20);
  assert.equal(applied.nextQty, 30);
  assert.equal(applied.stockQuantity, 30);
  assert.equal(applied.warehouseStock.length, 1);
  assert.equal(applied.warehouseStock[0].quantity, 4);
  assert.equal(quantityForWarehouse({ ...item, stockQuantity: applied.stockQuantity }, 'wh-tia'), 4);
});

test('applyWarehouseStockDelta con warehouseId sí entra en la tienda', () => {
  const item = {
    stockQuantity: 10,
    warehouseStock: [{ warehouseId: 'wh-tia', quantity: 4, warehouseName: 'Tiana' }],
  };
  const applied = applyWarehouseStockDelta(item, 'wh-tia', 20, 'Tiana');
  assert.equal(applied.nextQty, 24);
  assert.equal(applied.warehouseStock[0].quantity, 24);
  assert.equal(
    quantityForWarehouse({ stockQuantity: applied.stockQuantity, warehouseStock: applied.warehouseStock }, 'wh-tia'),
    24,
  );
});
