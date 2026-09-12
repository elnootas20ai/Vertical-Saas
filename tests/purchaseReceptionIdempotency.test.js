import { beforeEach, describe, expect, it, vi } from 'vitest';

const docs = new Map();

vi.mock('../services/couchdb.js', () => ({
  getCatalogDbName: () => 'catalog',
  ensureDatabase: vi.fn(async () => {}),
  ensureIndex: vi.fn(async () => {}),
  findDocuments: vi.fn(async () => []),
  getDocument: vi.fn(async (_req, _db, id) => {
    const doc = docs.get(id);
    if (!doc) {
      const error = new Error('not found');
      error.statusCode = 404;
      throw error;
    }
    return structuredClone(doc);
  }),
  putDocument: vi.fn(async (_req, _db, id, doc) => {
    const current = docs.get(id);
    const rev = `${Number(String(current?._rev || '0').split('-')[0]) + 1}-test`;
    docs.set(id, structuredClone({ ...doc, _rev: rev }));
    return { ok: true, id, rev };
  }),
}));

describe('purchase reception idempotency', () => {
  beforeEach(() => {
    docs.clear();
    docs.set('stock-1', {
      _id: 'stock-1',
      _rev: '1-test',
      type: 'catalog_item',
      user_id: 'user-1',
      name: 'Harina',
      sku: 'HAR-1',
      stockQuantity: 10,
      costPrice: 2,
      warehouseStock: [{ warehouseId: 'wh-1', quantity: 10 }],
    });
    docs.set('wh-1', {
      _id: 'wh-1',
      type: 'warehouse',
      user_id: 'user-1',
      name: 'Tienda',
    });
  });

  it('la misma clave suma stock una sola vez y reutiliza el movimiento', async () => {
    const { applyPurchaseMovementCost, recordMovement } = await import('../services/stockMovementService.js');
    const payload = {
      catalogItemId: 'stock-1',
      movementType: 'purchase_reception',
      quantity: 5,
      unitCost: 3,
      warehouseId: 'wh-1',
      referenceId: 'po-1',
      referenceType: 'purchase_order',
      idempotencyKey: 'purchase-order:po-1:stock-1:5',
    };

    const first = await recordMovement({}, 'user-1', payload);
    const second = await recordMovement({}, 'user-1', payload);
    await applyPurchaseMovementCost({}, 'user-1', first);
    await applyPurchaseMovementCost({}, 'user-1', first);

    expect(second._id).toBe(first._id);
    expect(docs.get('stock-1').stockQuantity).toBe(15);
    expect(docs.get('stock-1').warehouseStock[0].quantity).toBe(15);
    expect(docs.get('stock-1').costPrice).toBe(2.33);
    expect([...docs.values()].filter((doc) => doc.type === 'stock_movement')).toHaveLength(1);
  });
});
