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
    expect(sub.status).toBe('pending_payment');
    expect(sub.extraPointOfSaleSlots).toBe(2);
    expect(sub.extraCommercialBrandSlots).toBe(0);
    expect(sub.extraBusinessSlots).toBe(0);
    expect(sub.extraWorkerSlots).toBe(0); // Pro incluye 12; userCount 5
    expect(sub.paymentProvider).toBe('bank_transfer');
  });

  it('no convierte pending_payment en trial al provisionar onboarding', () => {
    const sub = buildSubscriptionFromOnboarding(
      {
        businessMetrics: { userCount: 1, locationCount: 1, businessCount: 1, commercialBrandCount: 0 },
        subscriptionSelection: { recommendedPlanId: 'basic', billingMode: 'monthly' },
      },
      { status: 'pending_payment', paymentConcept: 'VERTIAL-ABC123' },
    );
    expect(sub.status).toBe('pending_payment');
    expect(sub.paymentConcept).toBe('VERTIAL-ABC123');
  });

  it('añade cupos extra cuando supera límites PRO', () => {
    const extras = computeOnboardingExtraSlots('pro', {
      locationCount: 4,
      businessCount: 5,
      commercialBrandCount: 3,
    });
    // Pro incluye 1 PDV, 2 empresas y 2 marcas: el resto van como cupos extra.
    expect(extras.extraPointOfSaleSlots).toBe(3);
    expect(extras.extraBusinessSlots).toBe(3);
    expect(extras.extraCommercialBrandSlots).toBe(1);
    expect(extras.extraWorkerSlots).toBe(0);
  });

  it('añade trabajadores extra al contratar 15 en plan Pro', () => {
    const extras = computeOnboardingExtraSlots('pro', {
      userCount: 15,
      locationCount: 1,
      businessCount: 1,
      commercialBrandCount: 0,
    });
    expect(extras.extraWorkerSlots).toBe(3); // 15 - 12
  });

  it('añade trabajadores extra al contratar 20 en plan Pro', () => {
    const extras = computeOnboardingExtraSlots('pro', {
      userCount: 20,
      locationCount: 2,
      businessCount: 1,
      commercialBrandCount: 0,
    });
    expect(extras.extraWorkerSlots).toBe(8); // 20 - 12
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
