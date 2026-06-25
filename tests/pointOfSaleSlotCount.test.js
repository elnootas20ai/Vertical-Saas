import { describe, expect, it } from 'vitest';
import {
  canCreateDeliveryPointOfSale,
  countEffectiveRetailPointOfSaleSlots,
} from '../shared/billing/pointOfSaleSlotCount.js';

describe('pointOfSaleSlotCount', () => {
  it('cuenta tienda sin caja como 1 ubicación', () => {
    expect(
      countEffectiveRetailPointOfSaleSlots({
        linkedWorkCenterIds: [],
        orphanPdvCount: 0,
        unlinkedWorkCenterCount: 1,
      }),
    ).toBe(1);
  });

  it('cuenta tienda con caja enlazada como 1 ubicación', () => {
    expect(
      countEffectiveRetailPointOfSaleSlots({
        linkedWorkCenterIds: ['wc-1'],
        orphanPdvCount: 0,
        unlinkedWorkCenterCount: 0,
      }),
    ).toBe(1);
  });

  it('permite activar caja en tienda existente con plan de 1 PDV', () => {
    expect(
      canCreateDeliveryPointOfSale({
        effectiveCount: 1,
        limit: 1,
        isLinkingExistingStore: true,
      }),
    ).toBe(true);
  });

  it('bloquea segunda tienda con plan de 1 PDV', () => {
    expect(
      canCreateDeliveryPointOfSale({
        effectiveCount: 1,
        limit: 1,
        isLinkingExistingStore: false,
      }),
    ).toBe(false);
  });
});
