import { describe, expect, it } from 'vitest';
import {
  getEffectiveBusinessLimit,
  getEffectivePointOfSaleLimit,
  getEffectiveCommercialBrandLimit,
  resolveTenantEntitlements,
} from '../shared/billing/entitlements.js';

describe('billing entitlements', () => {
  const activePro = {
    status: 'subscription_active',
    selectedPlanId: 'pro',
    planName: 'Pro',
    extraPointOfSaleSlots: 1,
    extraCommercialBrandSlots: 2,
    extraBusinessSlots: 1,
  };

  it('suma extras de empresa al plan Pro', () => {
    expect(getEffectiveBusinessLimit(activePro)).toBe(4);
  });

  it('degrada PDV a básico si suscripción inactiva', () => {
    expect(
      getEffectivePointOfSaleLimit({ ...activePro, status: 'suspended', extraPointOfSaleSlots: 5 }),
    ).toBe(1);
  });

  it('respeta extras PDV y marcas con suscripción activa', () => {
    expect(getEffectivePointOfSaleLimit(activePro)).toBe(3);
    expect(getEffectiveCommercialBrandLimit(activePro)).toBe(3);
  });

  it('bloquea creación cuando se alcanza el cupo', () => {
    const ent = resolveTenantEntitlements(activePro, {
      businesses: 4,
      pointOfSales: 3,
      commercialBrands: 3,
    });
    expect(ent.canCreateBusiness).toBe(false);
    expect(ent.canCreatePointOfSale).toBe(false);
    expect(ent.canCreateCommercialBrand).toBe(false);
  });
});
