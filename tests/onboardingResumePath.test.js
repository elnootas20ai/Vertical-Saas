import { describe, expect, it } from 'vitest';
import {
  COMPANY_ONBOARDING_ROUTES,
  canAccessServiceAgreement,
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
  });

  it('tras el pago va a confirmación (sin contrato en el alta gratis)', () => {
    expect(
      resolveCompanyOnboardingResumePath({ onboardingData: { completedStep: 5 } }),
    ).toBe('/auth/onboarding/confirmation');
    expect(
      resolveCompanyOnboardingResumePath({ onboardingData: { completedStep: 99 } }),
    ).toBe('/auth/onboarding/confirmation');
  });

  it('el contrato no está en las rutas del alta', () => {
    expect(COMPANY_ONBOARDING_ROUTES).not.toContain('/auth/onboarding/contrato');
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

describe('canAccessServiceAgreement', () => {
  it('solo con suscripción activa (pago real)', () => {
    expect(canAccessServiceAgreement({ status: 'subscription_active' })).toBe(true);
    expect(canAccessServiceAgreement({ status: 'trial_active' })).toBe(false);
    expect(canAccessServiceAgreement({ status: 'pending_payment' })).toBe(false);
    expect(canAccessServiceAgreement(null)).toBe(false);
  });
});
