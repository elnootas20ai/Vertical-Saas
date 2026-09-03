import { describe, expect, it } from 'vitest';
import { resolveEffectivePlanTier } from '../src/app/lib/pointOfSaleLimits';
import { resolveTenantEntitlements } from '../src/app/lib/tenantEntitlements';

describe('Plan (dev) simulation', () => {
  it('Mediano simulado gana a billingExempt/adminProAccess', () => {
    const tier = resolveEffectivePlanTier(
      {
        status: 'subscription_active',
        selectedPlanId: 'pro',
        planName: 'Pro',
        adminProAccess: true,
        billingExempt: true,
      },
      { devSimulatedTier: 'normal' },
    );
    expect(tier).toBe('normal');
  });

  it('sin simulación, billingExempt eleva a Pro', () => {
    const tier = resolveEffectivePlanTier({
      status: 'subscription_active',
      selectedPlanId: 'basic',
      planName: 'Básico',
      billingExempt: true,
    });
    expect(tier).toBe('pro');
  });

  it('featurePlanTier Mediano no reabre Pro por adminProAccess', () => {
    const access = resolveTenantEntitlements(
      {
        status: 'subscription_active',
        selectedPlanId: 'normal',
        planName: 'Mediano',
        adminProAccess: true,
        extraPointOfSaleSlots: 0,
        extraCommercialBrandSlots: 0,
        extraBusinessSlots: 0,
      },
      { businesses: 1, pointOfSales: 1, commercialBrands: 1 },
      { featurePlanTier: 'normal' },
    );
    expect(access.planTier).toBe('normal');
    expect(access.hasProAccess).toBe(false);
    expect(access.pointOfSales).toBe(1);
    expect(access.businesses).toBe(1);
  });
});
