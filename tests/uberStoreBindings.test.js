import { describe, expect, it } from 'vitest';
import {
  legacyUberBinding,
  sanitizeUberStoreBinding,
  uberBindingDocumentId,
  uberIntegratorStoreId,
} from '../services/uberStoreBindings.js';
import {
  sanitizeUberSandboxOrder,
  uberSandboxOrderDocumentId,
} from '../services/uberSandboxOrders.js';
import { filterUberCatalogItemsForBrand } from '../services/uberEatsMenu.js';

describe('Uber store bindings', () => {
  it('uses environment and store ID in the unique document key', () => {
    expect(uberBindingDocumentId('sandbox', 'store-1')).not.toBe(
      uberBindingDocumentId('production', 'store-1'),
    );
    expect(uberBindingDocumentId('sandbox', 'store-1')).not.toBe(
      uberBindingDocumentId('sandbox', 'store-2'),
    );
  });

  it('builds a stable unique integrator store ID per binding', () => {
    expect(uberIntegratorStoreId('biz-1', 'store-1')).toBe(
      uberIntegratorStoreId('biz-1', 'store-1'),
    );
    expect(uberIntegratorStoreId('biz-1', 'store-1')).not.toBe(
      uberIntegratorStoreId('biz-1', 'store-2'),
    );
  });

  it('reads the current single-store integration as a legacy binding', () => {
    expect(legacyUberBinding({
      env: 'sandbox',
      storeId: 'store-old',
      storeName: 'Uber Test',
      salesPointId: 'pdv-1',
      enabled: true,
    }, 'biz-1')).toMatchObject({
      businessId: 'biz-1',
      storeId: 'store-old',
      salesPointId: 'pdv-1',
      primary: true,
    });
  });

  it('never exposes deleted binding documents', () => {
    expect(sanitizeUberStoreBinding({
      _id: 'binding-1',
      type: 'uber_store_binding',
      deletedAt: '2026-09-07T00:00:00.000Z',
    })).toBeNull();
  });
});

describe('Uber catalog by brand', () => {
  const items = [
    { id: 'shared', brandIds: [] },
    { id: 'brand-a', brandIds: ['a'] },
    { id: 'brand-b', brandIds: ['b'] },
  ];

  it('publishes selected-brand products plus shared products', () => {
    expect(filterUberCatalogItemsForBrand(items, 'a').map((item) => item.id)).toEqual([
      'shared',
      'brand-a',
    ]);
  });
});

describe('Uber sandbox order isolation', () => {
  it('uses a different document type from delivery orders', () => {
    const id = uberSandboxOrderDocumentId('biz-1', 'order-1');
    const order = sanitizeUberSandboxOrder({
      _id: id,
      type: 'uber_sandbox_order',
      business_id: 'biz-1',
      environment: 'sandbox',
      externalOrderId: 'order-1',
      status: 'received',
      items: [],
    });
    expect(id).toContain('uber-sandbox-order:');
    expect(order).toMatchObject({
      businessId: 'biz-1',
      environment: 'sandbox',
      externalOrderId: 'order-1',
      status: 'received',
    });
  });
});
