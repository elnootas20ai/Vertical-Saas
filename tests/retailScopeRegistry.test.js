/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearAllRetailScopeCaches,
  filterRetailWorkCentersForScope,
  readRetailScopeCacheForBusiness,
  resolveRetailScopeKind,
  shouldLoadRetailStoresForBusiness,
  writeRetailScopeCacheForBusiness,
} from '../src/app/verticals/retailScopeRegistry.ts';

const DELIVERY_CACHE = 'vertial_delivery_stores_cache:v2:biz-bodegeta';
const SIDEBAR_CACHE = 'vertial.sidebarRetail:v3:biz-bodegeta';
const RESTAURANT_CACHE = 'vertial.restaurantRetail:v1:biz-bodegeta';

function wc(overrides) {
  return {
    _id: overrides._id || 'wc-1',
    name: overrides.name || 'Centro',
    centerType: 'punto_de_venta',
    active: true,
    businessId: overrides.businessId,
    createdAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const businesses = [
  {
    business_id: 'biz-bodegeta',
    businessType: 'restaurant',
    name: 'bodegeta',
    createdAt: '2025-01-01T00:00:00.000Z',
  },
  {
    business_id: 'biz-modomio',
    businessType: 'delivery',
    name: 'modomio',
    createdAt: '2024-01-01T00:00:00.000Z',
  },
];

describe('retailScopeRegistry', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it('clasifica verticales correctamente', () => {
    expect(resolveRetailScopeKind('restaurant')).toBe('restaurant');
    expect(resolveRetailScopeKind('delivery')).toBe('delivery');
    expect(resolveRetailScopeKind('events')).toBe('strict');
  });

  it('restaurante respeta local propio etiquetado aunque el nombre no coincida', () => {
    const badlona = wc({
      _id: 'store-badlona',
      name: 'badlona',
      businessId: 'biz-bodegeta',
    });
    const filtered = filterRetailWorkCentersForScope([badlona], {
      business: businesses[0],
      businesses,
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]._id).toBe('store-badlona');
  });

  it('restaurante no hereda tienda etiquetada en delivery', () => {
    const stolen = wc({
      _id: 'store-modomio',
      name: 'modomio central',
      businessId: 'biz-modomio',
    });
    const filtered = filterRetailWorkCentersForScope([stolen], {
      business: businesses[0],
      businesses,
    });
    expect(filtered).toHaveLength(0);
  });

  it('restaurante NO lee caché delivery aunque exista para el mismo businessId', () => {
    const poisoned = {
      retailWorkCenters: [
        wc({ _id: 'store-badlona', name: 'badlona', businessId: 'biz-bodegeta' }),
      ],
      allPointsOfSale: [{ _id: 'pdv-1', workCenterId: 'store-badlona', active: true }],
    };
    sessionStorage.setItem(DELIVERY_CACHE, JSON.stringify(poisoned));
    localStorage.setItem(
      SIDEBAR_CACHE,
      JSON.stringify({
        rows: [{ id: 'store-badlona', label: 'badlona' }],
        retailWorkCenters: poisoned.retailWorkCenters,
        allPointsOfSale: poisoned.allPointsOfSale,
        savedAt: Date.now(),
      }),
    );

    const cached = readRetailScopeCacheForBusiness('biz-bodegeta', {
      business: businesses[0],
      businesses,
    });
    expect(cached).toBeNull();
  });

  it('clearAllRetailScopeCaches limpia delivery y restaurante', () => {
    sessionStorage.setItem(DELIVERY_CACHE, '{}');
    localStorage.setItem(SIDEBAR_CACHE, '{}');
    localStorage.setItem(RESTAURANT_CACHE, '{}');

    clearAllRetailScopeCaches('biz-bodegeta');

    expect(sessionStorage.getItem(DELIVERY_CACHE)).toBeNull();
    expect(localStorage.getItem(SIDEBAR_CACHE)).toBeNull();
    expect(localStorage.getItem(RESTAURANT_CACHE)).toBeNull();
  });

  it('modo strict no fusiona huérfanas de otra empresa', () => {
    const orphan = wc({
      _id: 'orphan',
      name: 'tienda suelta',
      businessId: '',
    });
    const mine = wc({
      _id: 'mine',
      name: 'events sala',
      businessId: 'biz-events',
    });
    const filtered = filterRetailWorkCentersForScope([orphan, mine], {
      business: {
        business_id: 'biz-events',
        businessType: 'events',
        name: 'events co',
      },
      businesses: [
        {
          business_id: 'biz-events',
          businessType: 'events',
          name: 'events co',
        },
      ],
      accountBusinessCount: 2,
    });
    expect(filtered.map((w) => w._id)).toEqual(['mine']);
  });

  it('restaurante sigue cargando si hasDisplayedStores pero no hay PDV usable', () => {
    const ctx = { business: businesses[0], businesses };
    expect(
      shouldLoadRetailStoresForBusiness(ctx, 'biz-bodegeta', { hasDisplayedStores: true }),
    ).toBe(true);
  });

  it('restaurante force=true recarga aunque la caché tenga PDV', () => {
    writeRetailScopeCacheForBusiness(
      'biz-bodegeta',
      {
        retailWorkCenters: [
          wc({ _id: 'store-1', name: 'Bodegeta', businessId: 'biz-bodegeta' }),
        ],
        allPointsOfSale: [
          {
            _id: 'pdv-1',
            name: 'Bodegeta',
            code: 'BOD',
            businessId: 'biz-bodegeta',
            workCenterId: 'store-1',
            active: true,
            terminals: [],
          },
        ],
      },
      { business: businesses[0], businesses },
    );
    const ctx = { business: businesses[0], businesses };
    expect(
      shouldLoadRetailStoresForBusiness(ctx, 'biz-bodegeta', { hasDisplayedStores: true }),
    ).toBe(false);
    expect(
      shouldLoadRetailStoresForBusiness(ctx, 'biz-bodegeta', {
        hasDisplayedStores: true,
        force: true,
      }),
    ).toBe(true);
  });

  it('caché restaurante conserva PDV solo-sala (sin WC retail)', () => {
    writeRetailScopeCacheForBusiness(
      'biz-bodegeta',
      {
        retailWorkCenters: [],
        allPointsOfSale: [
          {
            _id: 'pdv-sala',
            name: 'Local bodegeta',
            code: 'LOC',
            businessId: 'biz-bodegeta',
            workCenterId: 'wc-sala',
            active: true,
            terminals: [],
          },
        ],
      },
      { business: businesses[0], businesses },
    );
    const cached = readRetailScopeCacheForBusiness('biz-bodegeta', {
      business: businesses[0],
      businesses,
    });
    expect(cached?.allPointsOfSale.map((p) => p._id)).toEqual(['pdv-sala']);
  });
});
