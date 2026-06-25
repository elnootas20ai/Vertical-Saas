import { describe, expect, it } from 'vitest';
import {
  calculateOnboardingPricing,
  clampOnboardingPlanId,
  isOnboardingPlanAllowed,
  minimumOnboardingPlanId,
  recommendOnboardingPlan,
  recommendOnboardingPlanId,
} from '../src/app/lib/onboardingPlanRecommendation.ts';

describe('onboarding plan recommendation', () => {
  const baseModules = {
    inventory: true,
    sales: true,
    crm: false,
    documentation: false,
    analytics: false,
    workshop: false,
  };

  it('recomienda BASIC para operativa mínima', () => {
    expect(
      recommendOnboardingPlanId({
        businessType: 'delivery',
        userCount: 2,
        locationCount: 1,
        businessCount: 1,
        commercialBrandCount: 0,
        modules: baseModules,
      }),
    ).toBe('basic');
  });

  it('recomienda PRO si hay líneas comerciales extra', () => {
    expect(
      recommendOnboardingPlanId({
        businessType: 'delivery',
        userCount: 2,
        locationCount: 1,
        businessCount: 1,
        commercialBrandCount: 1,
        modules: baseModules,
      }),
    ).toBe('pro');
  });

  it('recomienda PRO con varios PDV o empresas', () => {
    expect(
      recommendOnboardingPlanId({
        businessType: 'delivery',
        userCount: 2,
        locationCount: 2,
        businessCount: 1,
        commercialBrandCount: 0,
        modules: baseModules,
      }),
    ).toBe('pro');

    expect(
      recommendOnboardingPlanId({
        businessType: 'delivery',
        userCount: 2,
        locationCount: 1,
        businessCount: 2,
        commercialBrandCount: 0,
        modules: baseModules,
      }),
    ).toBe('pro');
  });

  it('recomienda PRO con 5+ módulos o muchas cartas delivery', () => {
    expect(
      recommendOnboardingPlanId({
        businessType: 'delivery',
        userCount: 2,
        locationCount: 1,
        businessCount: 1,
        commercialBrandCount: 0,
        modules: {
          inventory: true,
          sales: true,
          crm: true,
          documentation: true,
          analytics: true,
          workshop: false,
        },
      }),
    ).toBe('pro');

    expect(
      minimumOnboardingPlanId({
        businessType: 'delivery',
        userCount: 2,
        locationCount: 1,
        deliveryNeeds: {
          tpv: true,
          catalogStock: true,
          deliveryOrders: true,
          autoShipping: true,
          clients: true,
          team: true,
          invoicing: false,
          reports: false,
        },
        modules: {},
      }),
    ).toBe('pro');
  });

  it('recomienda PRO con más de 5 trabajadores', () => {
    expect(
      recommendOnboardingPlanId({
        businessType: 'delivery',
        userCount: 8,
        locationCount: 1,
        businessCount: 1,
        commercialBrandCount: 0,
        modules: baseModules,
      }),
    ).toBe('pro');
  });

  it('no permite plan inferior al mínimo', () => {
    const params = {
      businessType: 'delivery',
      userCount: 2,
      locationCount: 1,
      businessCount: 1,
      commercialBrandCount: 1,
      modules: baseModules,
    };
    expect(isOnboardingPlanAllowed('basic', params)).toBe(false);
    expect(isOnboardingPlanAllowed('normal', params)).toBe(false);
    expect(isOnboardingPlanAllowed('pro', params)).toBe(true);
    expect(clampOnboardingPlanId('basic', params)).toBe('pro');
  });

  it('marca exceedsPlanLimits cuando supera cupo PRO base', () => {
    const rec = recommendOnboardingPlan({
      businessType: 'delivery',
      userCount: 3,
      locationCount: 1,
      businessCount: 1,
      commercialBrandCount: 2,
      modules: baseModules,
    });
    expect(rec.plan.id).toBe('pro');
    expect(rec.exceedsPlanLimits).toBe(true);
  });

  it('calcula total mensual con plan PRO y ampliaciones de infraestructura', () => {
    const proPlan = {
      id: 'pro',
      name: 'PRO',
      priceMonthly: 349,
      priceAnnual: 279,
      maxUsers: 12,
      maxLocations: 2,
      maxBusinesses: 3,
      maxCommercialBrands: 1,
      features: [],
    };
    const pricing = calculateOnboardingPricing({
      plan: proPlan,
      billingMode: 'monthly',
      userCount: 5,
      locationCount: 3,
      businessCount: 4,
      commercialBrandCount: 2,
    });
    expect(pricing.baseCost).toBe(349);
    expect(pricing.extraPdv).toBe(1);
    expect(pricing.extraPdvCost).toBe(49);
    expect(pricing.extraBusinesses).toBe(1);
    expect(pricing.extraBusinessesCost).toBe(89);
    expect(pricing.extraBrands).toBe(1);
    expect(pricing.extraBrandsCost).toBe(19);
    expect(pricing.total).toBe(349 + 49 + 89 + 19);
  });

  it('calcula total anual con -20% en plan y ampliaciones', () => {
    const proPlan = {
      id: 'pro',
      name: 'PRO',
      priceMonthly: 349,
      priceAnnual: 279,
      maxUsers: 12,
      maxLocations: 2,
      maxBusinesses: 3,
      maxCommercialBrands: 1,
      features: [],
    };
    const pricing = calculateOnboardingPricing({
      plan: proPlan,
      billingMode: 'annual',
      userCount: 4,
      locationCount: 4,
      businessCount: 4,
      commercialBrandCount: 4,
    });
    expect(pricing.baseCost).toBe(279);
    expect(pricing.extraPdv).toBe(2);
    expect(pricing.extraPdvCost).toBe(78);
    expect(pricing.extraBusinesses).toBe(1);
    expect(pricing.extraBusinessesCost).toBe(71);
    expect(pricing.extraBrands).toBe(3);
    expect(pricing.extraBrandsCost).toBe(45);
    expect(pricing.total).toBe(473);
  });
});
