/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach } from 'vitest';
import {
  consumeSalaSetupPending,
  peekSalaSetupPending,
  writeSalaSetupPending,
} from '../src/app/lib/salaQuickSetup.ts';
import { scopeRestaurantPointsOfSale } from '../src/app/verticals/restaurant/loadRestaurantStores.ts';

describe('salaQuickSetup pending scope', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('solo consume pending de la empresa esperada', () => {
    writeSalaSetupPending('biz-a', 'pdv-a');
    expect(peekSalaSetupPending('biz-a')).toBe('pdv-a');
    expect(peekSalaSetupPending('biz-b')).toBeNull();
    expect(consumeSalaSetupPending('biz-b')).toBeNull();
    expect(consumeSalaSetupPending('biz-a')).toBe('pdv-a');
  });
});

describe('scopeRestaurantPointsOfSale', () => {
  it('excluye PDV de otra empresa restaurante', () => {
    const businesses = [
      { business_id: 'biz-a', businessType: 'restaurant', name: 'Local A', createdAt: '2025-01-01T00:00:00.000Z' },
      { business_id: 'biz-b', businessType: 'restaurant', name: 'Local B', createdAt: '2025-01-01T00:00:00.000Z' },
    ];
    const workCenters = [
      { _id: 'wc-a', name: 'Local A', centerType: 'punto_de_venta', businessId: 'biz-a', active: true },
      { _id: 'wc-b', name: 'Local B', centerType: 'punto_de_venta', businessId: 'biz-b', active: true },
    ];
    const pointsOfSale = [
      { _id: 'pdv-a', workCenterId: 'wc-a', active: true, name: 'PDV A' },
      { _id: 'pdv-b', workCenterId: 'wc-b', active: true, name: 'PDV B' },
    ];
    const scoped = scopeRestaurantPointsOfSale(pointsOfSale, workCenters, businesses[0], businesses);
    expect(scoped.map((p) => p._id)).toEqual(['pdv-a']);
  });
});
