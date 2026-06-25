import { describe, expect, it } from 'vitest';
import {
  buildSubscriptionFromOnboarding,
  computeOnboardingExtraSlots,
} from '../shared/billing/onboardingSubscription.js';

describe('onboarding subscription provisioning', () => {
  it('provisiona PRO con extras según infraestructura', () => {
    const sub = buildSubscriptionFromOnboarding({
      businessMetrics: {
        userCount: 5,
        locationCount: 3,
        businessCount: 1,
        commercialBrandCount: 1,
      },
      subscriptionSelection: {
        recommendedPlanId: 'pro',
        billingMode: 'monthly',
      },
      trial: { endDate: Date.now() + 14 * 86400000 },
    });

    expect(sub.selectedPlanId).toBe('pro');
    expect(sub.planName).toBe('Pro');
    expect(sub.status).toBe('trial_active');
    expect(sub.extraPointOfSaleSlots).toBe(1);
    expect(sub.extraCommercialBrandSlots).toBe(0);
    expect(sub.extraBusinessSlots).toBe(0);
    expect(sub.paymentProvider).toBe('onboarding_stub');
  });

  it('añade cupos extra cuando supera límites PRO', () => {
    const extras = computeOnboardingExtraSlots('pro', {
      locationCount: 4,
      businessCount: 5,
      commercialBrandCount: 3,
    });
    expect(extras.extraPointOfSaleSlots).toBe(2);
    expect(extras.extraBusinessSlots).toBe(2);
    expect(extras.extraCommercialBrandSlots).toBe(2);
  });

  it('sube a PRO si piden basic con marcas extra en onboarding', () => {
    const sub = buildSubscriptionFromOnboarding(
      {
        businessType: 'delivery',
        businessMetrics: { userCount: 2, locationCount: 1, businessCount: 1, commercialBrandCount: 1 },
        requestedModules: { inventory: true, sales: true, crm: false, documentation: false, analytics: false, workshop: false },
        subscriptionSelection: { recommendedPlanId: 'basic', billingMode: 'monthly' },
      },
      {},
      { selectedPlanId: 'basic' },
    );
    expect(sub.selectedPlanId).toBe('pro');
  });

  it('respeta override de plan al guardar tarjeta', () => {
    const sub = buildSubscriptionFromOnboarding(
      {
        businessMetrics: { userCount: 2, locationCount: 1, businessCount: 1, commercialBrandCount: 0 },
        subscriptionSelection: { recommendedPlanId: 'basic', billingMode: 'monthly' },
      },
      {},
      { selectedPlanId: 'pro', billingMode: 'annual' },
    );
    expect(sub.selectedPlanId).toBe('pro');
    expect(sub.billingMode).toBe('annual');
  });

  it('no cambia el plan si el admin lo bloqueó manualmente', () => {
    const sub = buildSubscriptionFromOnboarding(
      {
        businessMetrics: { userCount: 2, locationCount: 1, businessCount: 1, commercialBrandCount: 0 },
        subscriptionSelection: { recommendedPlanId: 'basic', billingMode: 'monthly' },
      },
      {
        selectedPlanId: 'pro',
        planName: 'Pro',
        adminPlanLocked: true,
        adminPlanLockedAt: '2026-01-01T00:00:00.000Z',
        status: 'subscription_active',
      },
      { selectedPlanId: 'basic' },
    );
    expect(sub.selectedPlanId).toBe('pro');
    expect(sub.planName).toBe('Pro');
    expect(sub.adminPlanLocked).toBe(true);
    expect(sub.status).toBe('subscription_active');
  });
});
