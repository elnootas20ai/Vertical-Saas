import { describe, expect, it } from 'vitest';
import { resolveBusinessNameFromOnboarding } from '../shared/billing/onboardingBusiness.js';

describe('onboarding business provisioning helpers', () => {
  it('prioriza nombre comercial del onboarding', () => {
    expect(
      resolveBusinessNameFromOnboarding({
        companyName: 'Registro S.L.',
        onboardingData: { companyProfile: { tradeName: 'Pizzería Roma' } },
      }),
    ).toBe('Pizzería Roma');
  });

  it('usa companyName de cuenta si falta tradeName', () => {
    expect(
      resolveBusinessNameFromOnboarding({
        companyName: 'Mi Negocio',
        onboardingData: { companyProfile: {} },
      }),
    ).toBe('Mi Negocio');
  });

  it('devuelve vacío si no hay datos', () => {
    expect(resolveBusinessNameFromOnboarding({ onboardingData: {} })).toBe('');
  });
});
