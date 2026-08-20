import { describe, expect, it } from 'vitest';
import {
  quoteSubscription,
  quoteSubscriptionFromAccount,
} from '../shared/billing/subscriptionQuote.js';

describe('subscriptionQuote', () => {
  it('mensual básico sin extras = 49', () => {
    const q = quoteSubscription({ planId: 'basic', billingMode: 'monthly' });
    expect(q.listMonthlyEuros).toBe(49);
    expect(q.amountDueEuros).toBe(49);
    expect(q.monthlyEquivalentEuros).toBe(49);
  });

  it('anual = lista mensual × 12 × 0,8 (no 39×12)', () => {
    const q = quoteSubscription({ planId: 'basic', billingMode: 'annual' });
    expect(q.listMonthlyEuros).toBe(49);
    expect(q.amountDueEuros).toBe(470.4); // 49*12*0.8
    expect(q.monthlyEquivalentEuros).toBe(39.2);
    expect(q.formulaNote).toContain('0,8');
  });

  it('PRO + 2 PDV + 3 trab. mensuales', () => {
    const q = quoteSubscription({
      planId: 'pro',
      billingMode: 'monthly',
      metrics: {
        userCount: 15, // pro incluye 12 → +3
        locationCount: 3, // pro incluye 1 → +2
        businessCount: 1,
        commercialBrandCount: 0,
      },
    });
    // 349 + 2*49 + 3*5 = 462
    expect(q.extras.extraPdv).toBe(2);
    expect(q.extras.extraWorkers).toBe(3);
    expect(q.amountDueEuros).toBe(462);
  });

  it('PRO + extras en anual usa la misma lista ×12×0,8', () => {
    const q = quoteSubscription({
      planId: 'pro',
      billingMode: 'annual',
      metrics: {
        userCount: 15,
        locationCount: 3,
        businessCount: 1,
        commercialBrandCount: 0,
      },
    });
    expect(q.listMonthlyEuros).toBe(462);
    expect(q.amountDueEuros).toBe(4435.2); // 462*12*0.8
  });

  it('prioriza métricas del onboarding sobre slots vacíos en subscription', () => {
    const q = quoteSubscriptionFromAccount({
      subscription: {
        selectedPlanId: 'pro',
        billingMode: 'monthly',
        extraPointOfSaleSlots: 0,
        extraWorkerSlots: 0,
      },
      onboardingData: {
        businessMetrics: {
          userCount: 15,
          locationCount: 3,
          businessCount: 1,
          commercialBrandCount: 0,
        },
        subscriptionSelection: {
          recommendedPlanId: 'pro',
          billingMode: 'annual',
        },
      },
    });
    expect(q.billingMode).toBe('annual');
    expect(q.listMonthlyEuros).toBe(462);
    expect(q.amountDueEuros).toBe(4435.2);
  });
});
