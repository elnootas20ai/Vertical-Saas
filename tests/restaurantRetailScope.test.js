/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import {
  filterRestaurantRetailWorkCenters,
  resolveRestaurantRetailOwnerId,
} from '../src/app/verticals/restaurant/retailScope.ts';

function wc(overrides) {
  return {
    _id: overrides._id || 'wc-1',
    name: overrides.name || 'Centro',
    centerType: 'punto_de_venta',
    active: true,
    createdAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('filterRestaurantRetailWorkCenters', () => {
  it('respeta local etiquetado del restaurante (badlona → bodegetta)', () => {
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
    const center = wc({
      _id: 'store-badlona',
      name: 'badlona',
      businessId: 'biz-bodegeta',
    });
    expect(resolveRestaurantRetailOwnerId(center)).toBe('biz-bodegeta');
    expect(
      filterRestaurantRetailWorkCenters([center], businesses[0], businesses),
    ).toHaveLength(1);
  });

  it('no muestra tienda etiquetada en otra empresa (aunque el nombre coincida)', () => {
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
    const center = wc({
      _id: 'store-modomio',
      name: 'Modomio Badalona',
      businessId: 'biz-modomio',
    });
    expect(resolveRestaurantRetailOwnerId(center)).toBe('biz-modomio');
    expect(
      filterRestaurantRetailWorkCenters([center], businesses[0], businesses),
    ).toHaveLength(0);
  });

  it('oculta centros creados automáticamente por sala', () => {
    const businesses = [
      {
        business_id: 'biz-bodegeta',
        businessType: 'restaurant',
        name: 'bodegeta',
        createdAt: '2025-01-01T00:00:00.000Z',
      },
    ];
    const salaCenter = wc({
      _id: 'store-terraza',
      name: 'terraza',
      businessId: 'biz-bodegeta',
      notes: 'sala_room:room_abc',
    });
    expect(
      filterRestaurantRetailWorkCenters([salaCenter], businesses[0], businesses),
    ).toHaveLength(0);
  });
});
