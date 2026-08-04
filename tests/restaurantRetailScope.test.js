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

describe('buildRestaurantCeoTpvStoreRows', () => {
  it('no deja el TPV vacío si solo hay PDV de la empresa (sin WC retail)', async () => {
    const { buildRestaurantCeoTpvStoreRows } = await import(
      '../src/app/verticals/restaurant/ceoTpvStores.ts'
    );
    const business = {
      business_id: 'biz-bodegeta',
      businessType: 'restaurant',
      name: 'bodegeta',
      createdAt: '2025-01-01T00:00:00.000Z',
    };
    const rows = buildRestaurantCeoTpvStoreRows(
      [],
      [
        {
          _id: 'pdv-1',
          name: 'bodegeta',
          code: 'BOD',
          businessId: 'biz-bodegeta',
          active: true,
          terminals: [],
        },
      ],
      business,
      [business],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].pdvId).toBe('pdv-1');
  });

  it('incluye PDV etiquetado aunque el WC sea solo sala_room', async () => {
    const { buildRestaurantCeoTpvStoreRows } = await import(
      '../src/app/verticals/restaurant/ceoTpvStores.ts'
    );
    const business = {
      business_id: 'biz-bodegeta',
      businessType: 'restaurant',
      name: 'bodegeta',
      createdAt: '2025-01-01T00:00:00.000Z',
    };
    const rows = buildRestaurantCeoTpvStoreRows(
      [
        wc({
          _id: 'wc-sala',
          name: 'Terraza',
          businessId: 'biz-bodegeta',
          notes: 'sala_room:room_1',
        }),
      ],
      [
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
      business,
      [business],
    );
    expect(rows.some((r) => r.pdvId === 'pdv-sala')).toBe(true);
  });
});
