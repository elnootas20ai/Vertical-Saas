/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { filterRetailWorkCentersForScope } from '../src/app/verticals/retailScopeRegistry.ts';

function wc(partial) {
  return {
    id: partial._id,
    centerType: 'punto_de_venta',
    active: true,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...partial,
  };
}

describe('filterRetailWorkCentersForScope — delivery blindado', () => {
  it('delivery no oculta tiendas con notas sala_room legacy', () => {
    const stores = [
      wc({
        _id: 'wc-modomio',
        name: 'Modomio',
        businessId: 'biz-modomio',
        notes: 'sala_room:legacy-noise',
      }),
    ];
    const filtered = filterRetailWorkCentersForScope(stores, {
      business: {
        business_id: 'biz-modomio',
        businessType: 'delivery',
        name: 'Modomio',
      },
      businesses: [
        { business_id: 'biz-modomio', businessType: 'delivery', name: 'Modomio' },
      ],
      accountBusinessCount: 1,
    });
    expect(filtered.map((s) => s._id)).toEqual(['wc-modomio']);
  });

  it('restaurant sí excluye centros técnicos de sala', () => {
    const stores = [
      wc({
        _id: 'wc-sala',
        name: 'Mesa técnica',
        businessId: 'biz-resto',
        notes: 'sala_room:room-1',
      }),
      wc({
        _id: 'wc-bar',
        name: 'Local',
        businessId: 'biz-resto',
      }),
    ];
    const filtered = filterRetailWorkCentersForScope(stores, {
      business: {
        business_id: 'biz-resto',
        businessType: 'restaurant',
        name: 'Bar',
      },
      businesses: [
        { business_id: 'biz-resto', businessType: 'restaurant', name: 'Bar' },
      ],
      accountBusinessCount: 1,
    });
    expect(filtered.map((s) => s._id)).toEqual(['wc-bar']);
  });
});
