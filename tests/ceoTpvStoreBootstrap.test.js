/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from 'vitest';
import { needsCeoTpvStoreBootstrap } from '../src/app/lib/ceoTpvStoreBootstrap.ts';
import { shouldLoadRetailStoresForBusiness } from '../src/app/verticals/retailScopeRegistry.ts';
import { writeRestaurantRetailCache } from '../src/app/verticals/restaurant/restaurantRetailCache.ts';

const businesses = [
  {
    business_id: 'biz-rest',
    businessType: 'restaurant',
    name: 'Bodegeta',
    createdAt: '2025-01-01T00:00:00.000Z',
  },
];

describe('needsCeoTpvStoreBootstrap', () => {
  it('pide bootstrap si hay centros pero ningún PDV activo', () => {
    expect(
      needsCeoTpvStoreBootstrap(
        [{ _id: 'wc-1', name: 'Bar', centerType: 'punto_de_venta', active: true }],
        [],
        [],
      ),
    ).toBe(true);
  });

  it('no pide bootstrap si ya hay filas abribles', () => {
    expect(
      needsCeoTpvStoreBootstrap(
        [{ _id: 'wc-1', name: 'Bar', centerType: 'punto_de_venta', active: true }],
        [{ _id: 'pdv-1', workCenterId: 'wc-1', active: true }],
        [{ rowId: 'wc-1', pdvId: 'pdv-1', needsPdv: false, inactive: false }],
      ),
    ).toBe(false);
  });
});

describe('shouldLoadRetailStoresForBusiness (restaurant)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('recarga si la caché tiene centros sin PDV abrible', () => {
    writeRestaurantRetailCache(
      'biz-rest',
      {
        rows: [{ rowId: 'wc-1', pdvId: null, needsPdv: true, inactive: false }],
        retailWorkCenters: [
          { _id: 'wc-1', name: 'Bar', centerType: 'punto_de_venta', businessId: 'biz-rest', active: true },
        ],
        allPointsOfSale: [],
        savedAt: Date.now(),
      },
      businesses[0],
      businesses,
    );

    expect(
      shouldLoadRetailStoresForBusiness(
        { business: businesses[0], businesses },
        'biz-rest',
        { hasDisplayedStores: false },
      ),
    ).toBe(true);
  });

  it('no recarga si la caché ya tiene PDV activo', () => {
    writeRestaurantRetailCache(
      'biz-rest',
      {
        rows: [{ rowId: 'wc-1', pdvId: 'pdv-1', needsPdv: false, inactive: false }],
        retailWorkCenters: [
          { _id: 'wc-1', name: 'Bar', centerType: 'punto_de_venta', businessId: 'biz-rest', active: true },
        ],
        allPointsOfSale: [{ _id: 'pdv-1', workCenterId: 'wc-1', active: true }],
        savedAt: Date.now(),
      },
      businesses[0],
      businesses,
    );

    expect(
      shouldLoadRetailStoresForBusiness(
        { business: businesses[0], businesses },
        'biz-rest',
        { hasDisplayedStores: false },
      ),
    ).toBe(false);
  });
});
