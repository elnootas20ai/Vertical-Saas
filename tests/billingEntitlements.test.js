import { describe, expect, it } from 'vitest';
import {
  getEffectiveBusinessLimit,
  getEffectivePointOfSaleLimit,
  getEffectiveCommercialBrandLimit,
  getEffectiveWorkerSeatLimit,
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
    // Pro base = 1 PDV + 1 extra = 2; 2 marcas + 2 extras = 4.
    expect(getEffectivePointOfSaleLimit(activePro)).toBe(2);
    expect(getEffectiveCommercialBrandLimit(activePro)).toBe(4);
  });

  it('suma trabajadores extra al plan Pro (12 + 3 = 15)', () => {
    expect(
      getEffectiveWorkerSeatLimit({
        status: 'subscription_active',
        selectedPlanId: 'pro',
        planName: 'Pro',
        extraWorkerSlots: 3,
      }),
    ).toBe(15);
  });

  it('permite 20 trabajadores con extras (Pro 12 + 8)', () => {
    expect(
      getEffectiveWorkerSeatLimit({
        status: 'subscription_active',
        selectedPlanId: 'pro',
        planName: 'Pro',
        extraWorkerSlots: 8,
      }),
    ).toBe(20);
  });

  it('bloquea invitaciones al alcanzar cupo de trabajadores', () => {
    const ent = resolveTenantEntitlements(
      {
        status: 'subscription_active',
        selectedPlanId: 'basic',
        planName: 'Básico',
        extraWorkerSlots: 0,
      },
      { businesses: 0, pointOfSales: 0, commercialBrands: 0, workers: 2 },
    );
    expect(ent.workers).toBe(2);
    expect(ent.canInviteWorker).toBe(false);
  });
});
