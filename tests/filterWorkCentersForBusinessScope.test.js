/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import {
  filterWorkCentersForBusinessScope,
  rescueRetailForBusinessWithoutStores,
} from '../src/app/lib/deliverySetup.ts';

const BIZ = 'biz-pizzas-grandes';
const OTHER = 'biz-modomio';

function wc(overrides) {
  return {
    _id: overrides._id || `wc-${Math.random()}`,
    type: 'sales_point',
    id: overrides.id || overrides._id || 'wc-1',
    user_id: 'user-1',
    name: overrides.name || 'Centro',
    centerType: overrides.centerType || 'punto_de_venta',
    ownership: 'propiedad',
    active: true,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('filterWorkCentersForBusinessScope', () => {
  it('muestra tienda huérfana aunque la empresa tenga oficina etiquetada', () => {
    const centers = [
      wc({ _id: 'office-1', name: 'Oficina central', centerType: 'oficina', businessId: BIZ }),
      wc({ _id: 'store-1', name: 'pizzerias', centerType: 'punto_de_venta' }),
    ];

    const scoped = filterWorkCentersForBusinessScope(centers, BIZ, { accountBusinessCount: 2 });
    expect(scoped.map((row) => row.name).sort()).toEqual(['Oficina central', 'pizzerias']);
  });

  it('no mezcla tiendas de otra empresa cuando ya hay retail propio', () => {
    const centers = [
      wc({ _id: 'mine-1', name: 'Mi tienda', businessId: BIZ }),
      wc({ _id: 'other-1', name: 'Otra tienda', businessId: OTHER }),
    ];

    const scoped = filterWorkCentersForBusinessScope(centers, BIZ, { accountBusinessCount: 2 });
    expect(scoped).toHaveLength(1);
    expect(scoped[0].name).toBe('Mi tienda');
  });
});

describe('rescueRetailForBusinessWithoutStores', () => {
  it('reasigna tienda única mal etiquetada', () => {
    const centers = [wc({ _id: 'store-1', name: 'pizzerias', businessId: OTHER })];
    const rescued = rescueRetailForBusinessWithoutStores(centers, BIZ, [BIZ, OTHER]);
    expect(rescued[0].businessId).toBe(BIZ);
  });

  it('reasigna tienda única con UUID de empresa muerta (no está en known)', () => {
    const centers = [wc({ _id: 'store-1', name: 'Badalona', businessId: 'dead-old-uuid' })];
    const rescued = rescueRetailForBusinessWithoutStores(centers, BIZ, [BIZ, OTHER]);
    expect(rescued[0].businessId).toBe(BIZ);
  });

  it('reclama varias tiendas con UUID muerto sin tocar las de otra empresa viva', () => {
    const centers = [
      wc({ _id: 'pau-1', name: 'Pau Badalona', businessId: OTHER }),
      wc({ _id: 'modo-1', name: 'Badalona', businessId: 'dead-modomio-v1' }),
      wc({ _id: 'modo-2', name: 'Tiana', businessId: 'dead-modomio-v1' }),
    ];
    const rescued = rescueRetailForBusinessWithoutStores(centers, BIZ, [BIZ, OTHER]);
    expect(rescued.find((r) => r._id === 'pau-1')?.businessId).toBe(OTHER);
    expect(rescued.find((r) => r._id === 'modo-1')?.businessId).toBe(BIZ);
    expect(rescued.find((r) => r._id === 'modo-2')?.businessId).toBe(BIZ);
  });
});
