import { describe, expect, it } from 'vitest';
import { recommendOnboardingPlan, recommendOnboardingPlanId } from '../src/app/lib/onboardingPlanRecommendation.ts';

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
});
