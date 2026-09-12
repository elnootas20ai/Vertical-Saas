import { beforeEach, describe, expect, it, vi } from 'vitest';

const databases = new Map();

function database(name) {
  if (!databases.has(name)) databases.set(name, new Map());
  return databases.get(name);
}

function selectorMatches(doc, selector) {
  return Object.entries(selector || {}).every(([key, expected]) => {
    if (expected && typeof expected === 'object' && Array.isArray(expected.$in)) {
      return expected.$in.includes(doc[key]);
    }
    return doc[key] === expected;
  });
}

vi.mock('../services/couchdb.js', async (importActual) => {
  const actual = await importActual();
  return {
    ...actual,
    getCatalogDbName: () => 'catalog',
    getFinanceDbName: () => 'finance',
    ensureDatabase: vi.fn(async (_req, name) => {
      database(name);
    }),
    ensureIndex: vi.fn(async () => {}),
    getAllDocuments: vi.fn(async (_req, name) =>
      [...database(name).values()].map((doc) => structuredClone(doc))),
    getDocument: vi.fn(async (_req, name, id) => {
      const doc = database(name).get(id);
      if (!doc) {
        const error = new Error('not found');
        error.statusCode = 404;
        throw error;
      }
      return structuredClone(doc);
    }),
    putDocument: vi.fn(async (_req, name, id, doc) => {
      const current = database(name).get(id);
      const rev = `${Number(String(current?._rev || '0').split('-')[0]) + 1}-test`;
      database(name).set(id, structuredClone({ ...doc, _rev: rev }));
      return { ok: true, id, rev };
    }),
    findDocuments: vi.fn(async (_req, name, selector) =>
      [...database(name).values()]
        .filter((doc) => selectorMatches(doc, selector))
        .map((doc) => structuredClone(doc))),
    listCatalogItemsByUser: vi.fn(async (_req, userId) =>
      [...database('catalog').values()]
        .filter((doc) => doc.type === 'catalog_item' && doc.user_id === userId)
        .map((doc) => structuredClone(doc))),
  };
});

describe('purchase flow integration', () => {
  beforeEach(() => {
    databases.clear();
  });

  it('enlaza documentos, carga stock una vez y crea un único pago solo para factura', async () => {
    const couch = await import('../services/couchdb.js');
    const {
      applyPurchaseMovementCost,
      recordMovement,
    } = await import('../services/stockMovementService.js');
    const {
      reconcilePurchaseInvoiceFromOcr,
    } = await import('../services/ocrPurchasePipeline.js');

    const userId = 'user-1';
    const businessId = 'biz-1';
    const supplier = couch.buildSupplierDocument(userId, {
      name: 'Proveedor',
      businessId,
    });
    const stockItem = {
      _id: 'stock-1',
      _rev: '1-test',
      type: 'catalog_item',
      user_id: userId,
      name: 'Harina',
      sku: 'HAR-1',
      businessId,
      unit: 'kg',
      stockQuantity: 10,
      costPrice: 2,
      warehouseStock: [{ warehouseId: 'wh-1', quantity: 10 }],
    };
    const warehouse = {
      _id: 'wh-1',
      _rev: '1-test',
      type: 'warehouse',
      user_id: userId,
      name: 'Tienda Centro',
      businessId,
      active: true,
    };
    const order = couch.buildPurchaseOrderDocument(userId, {
      orderNumber: 'PC-0001',
      supplierId: supplier._id,
      supplierName: supplier.name,
      status: 'sent',
      businessId,
      warehouseId: warehouse._id,
      items: [{
        catalogItemId: stockItem._id,
        name: stockItem.name,
        quantity: 5,
        unit: 'kg',
        unitCost: 3,
        taxRate: 10,
      }],
    });
    const albaran = couch.buildPurchaseInvoiceDocument(userId, {
      invoiceNumber: 'ALB-1',
      documentKind: 'albaran',
      supplierId: supplier._id,
      supplierName: supplier.name,
      businessId,
      linkedPurchaseOrderId: order._id,
      lines: [{
        itemName: stockItem.name,
        catalogItemId: stockItem._id,
        quantity: 5,
        unit: 'kg',
        unitPrice: 3,
        taxRate: 10,
      }],
      taxAmount: 1.5,
      total: 16.5,
    });

    database('catalog').set(supplier._id, supplier);
    database('catalog').set(stockItem._id, stockItem);
    database('catalog').set(warehouse._id, warehouse);
    database('catalog').set(order._id, order);
    database('catalog').set(albaran._id, albaran);

    await reconcilePurchaseInvoiceFromOcr({}, userId, albaran, {
      applyStock: false,
      createFinance: false,
    });
    expect([...database('finance').values()]).toHaveLength(0);

    const movementPayload = {
      catalogItemId: stockItem._id,
      movementType: 'purchase_reception',
      quantity: 5,
      unitCost: 3,
      warehouseId: warehouse._id,
      referenceId: order._id,
      referenceType: 'purchase_order',
      idempotencyKey: `purchase-order:${order._id}:${stockItem._id}:5`,
    };
    const movement = await recordMovement({}, userId, movementPayload);
    await recordMovement({}, userId, movementPayload);
    await applyPurchaseMovementCost({}, userId, movement);
    await applyPurchaseMovementCost({}, userId, movement);

    expect(database('catalog').get(stockItem._id).stockQuantity).toBe(15);
    expect(database('catalog').get(stockItem._id).costPrice).toBe(2.33);

    const receivedOrder = couch.buildPurchaseOrderDocument(userId, {
      ...order,
      status: 'received',
      linkedAlbaranId: albaran._id,
      linkedAlbaranNumber: albaran.invoiceNumber,
      items: order.items.map((item) => ({ ...item, received: 5 })),
    }, order);
    database('catalog').set(order._id, receivedOrder);

    const invoice = couch.buildPurchaseInvoiceDocument(userId, {
      invoiceNumber: 'FAC-1',
      documentKind: 'factura_proveedor',
      supplierId: supplier._id,
      supplierName: supplier.name,
      businessId,
      linkedPurchaseOrderId: order._id,
      linkedAlbaranId: albaran._id,
      linkedAlbaranNumber: albaran.invoiceNumber,
      lines: albaran.lines,
      taxAmount: albaran.taxAmount,
      total: albaran.total,
    });
    database('catalog').set(invoice._id, invoice);

    await reconcilePurchaseInvoiceFromOcr({}, userId, invoice, {
      applyStock: false,
      createFinance: true,
      financeSource: 'invoice',
    });
    const firstFinanceId = database('catalog').get(invoice._id).linkedFinanceId;
    await reconcilePurchaseInvoiceFromOcr({}, userId, database('catalog').get(invoice._id), {
      applyStock: false,
      createFinance: true,
      financeSource: 'invoice',
    });

    const financeDocs = [...database('finance').values()]
      .filter((doc) => doc.sourceRef === invoice._id);
    expect(financeDocs).toHaveLength(1);
    expect(financeDocs[0]._id).toBe(firstFinanceId);
    expect(financeDocs[0].totalAmount).toBe(16.5);
    expect(database('catalog').get(stockItem._id).stockQuantity).toBe(15);
  });
});
