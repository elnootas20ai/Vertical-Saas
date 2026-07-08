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
    // Pro base = 2 empresas + 1 extra contratado.
    expect(getEffectiveBusinessLimit(activePro)).toBe(3);
  });

  it('degrada PDV a básico si suscripción inactiva', () => {
    expect(
      getEffectivePointOfSaleLimit({ ...activePro, status: 'suspended', extraPointOfSaleSlots: 5 }),
    ).toBe(1);
  });

  it('respeta extras PDV y marcas con suscripción activa', () => {
    // Pro base = 2 PDV + 1 extra = 3; 2 marcas + 2 extras = 4.
    expect(getEffectivePointOfSaleLimit(activePro)).toBe(3);
    expect(getEffectiveCommercialBrandLimit(activePro)).toBe(4);
  });

  it('bloquea creación cuando se alcanza el cupo', () => {
    const ent = resolveTenantEntitlements(activePro, {
      businesses: 3,
      pointOfSales: 3,
      commercialBrands: 4,
    });
    expect(ent.canCreateBusiness).toBe(false);
    expect(ent.canCreatePointOfSale).toBe(false);
    expect(ent.canCreateCommercialBrand).toBe(false);
  });
});
