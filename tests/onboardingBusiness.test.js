import { describe, expect, it } from 'vitest';
import {
  findLikelyDuplicateBusiness,
  resolveBusinessNameFromOnboarding,
} from '../shared/billing/onboardingBusiness.js';

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

  it('detecta duplicado por nombre y ciudad del mismo titular', () => {
    const existing = [
      {
        owner_user_id: 'user-1',
        name: 'pizzeriasrodrigue',
        city: 'madrid',
        business_id: 'biz-a',
      },
    ];
    expect(
      findLikelyDuplicateBusiness(existing, {
        ownerUserId: 'user-1',
        name: 'PizzeriasRodrigue',
        city: 'Madrid',
      })?.business_id,
    ).toBe('biz-a');
  });

  it('no confunde empresas de distintos titulares', () => {
    const existing = [
      { owner_user_id: 'user-1', name: 'Pizzería', city: 'Madrid', business_id: 'biz-a' },
    ];
    expect(
      findLikelyDuplicateBusiness(existing, {
        ownerUserId: 'user-2',
        name: 'Pizzería',
        city: 'Madrid',
      }),
    ).toBeNull();
  });
});
