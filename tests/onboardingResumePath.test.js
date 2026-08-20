import { describe, expect, it } from 'vitest';
import {
  COMPANY_ONBOARDING_ROUTES,
  companyNeedsOnboarding,
  resolveCompanyOnboardingResumePath,
} from '../shared/onboarding/resumePath.js';

describe('resolveCompanyOnboardingResumePath', () => {
  it('sin progreso empieza en business-type', () => {
    expect(resolveCompanyOnboardingResumePath({ onboardingData: {} })).toBe(
      '/auth/onboarding/business-type',
    );
    expect(resolveCompanyOnboardingResumePath({})).toBe('/auth/onboarding/business-type');
  });

  it('retoma en el siguiente paso tras completedStep', () => {
    expect(
      resolveCompanyOnboardingResumePath({ onboardingData: { completedStep: 0 } }),
    ).toBe('/auth/onboarding/company');
    expect(
      resolveCompanyOnboardingResumePath({ onboardingData: { completedStep: 4 } }),
    ).toBe('/auth/onboarding/payment-info');
    expect(
      resolveCompanyOnboardingResumePath({ onboardingData: { completedStep: 5 } }),
    ).toBe('/auth/onboarding/contrato');
  });

  it('no se pasa del último paso', () => {
    expect(
      resolveCompanyOnboardingResumePath({ onboardingData: { completedStep: 99 } }),
    ).toBe(COMPANY_ONBOARDING_ROUTES[COMPANY_ONBOARDING_ROUTES.length - 1]);
  });
});

describe('companyNeedsOnboarding', () => {
  it('empresa sin completar necesita onboarding', () => {
    expect(companyNeedsOnboarding({ accountType: 'company', onboardingCompleted: false })).toBe(true);
  });

  it('no aplica a trabajador ni alta completa', () => {
    expect(companyNeedsOnboarding({ accountType: 'user', onboardingCompleted: false })).toBe(false);
    expect(companyNeedsOnboarding({ accountType: 'company', onboardingCompleted: true })).toBe(false);
    expect(
      companyNeedsOnboarding({
        accountType: 'company',
        onboardingCompleted: false,
        invitedBy: 'owner-1',
      }),
    ).toBe(false);
  });
});
