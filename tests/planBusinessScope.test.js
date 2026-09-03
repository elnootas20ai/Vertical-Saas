import { describe, expect, it } from 'vitest';
import {
  getVisibleBusinessLimit,
  limitVisibleBusinesses,
} from '../src/app/lib/planBusinessScope';
import { isProDowngradeBlocked, planTierRank } from '../src/app/lib/planDowngradeGuard';

describe('planBusinessScope', () => {
  it('Pro no limita empresas visibles', () => {
    expect(getVisibleBusinessLimit('pro', 0)).toBe(Number.POSITIVE_INFINITY);
  });

  it('Mediano limita a 1 sin extras', () => {
    expect(getVisibleBusinessLimit('normal', 0)).toBe(1);
  });

  it('oculta empresas extra y prioriza la preferida', () => {
    const list = [
      { business_id: 'a', name: 'A' },
      { business_id: 'b', name: 'B' },
      { business_id: 'c', name: 'C' },
    ];
    const visible = limitVisibleBusinesses(list, 1, { preferId: 'c' });
    expect(visible).toHaveLength(1);
    expect(visible[0].business_id).toBe('c');
  });
});

describe('planDowngradeGuard', () => {
  it('bloquea bajada Pro→Mediano en clientes reales', () => {
    expect(
      isProDowngradeBlocked({
        canSimulatePlans: false,
        activePlanId: 'pro',
        targetPlanId: 'normal',
      }),
    ).toBe(true);
  });

  it('admin puede simular bajada', () => {
    expect(
      isProDowngradeBlocked({
        canSimulatePlans: true,
        activePlanId: 'pro',
        targetPlanId: 'normal',
      }),
    ).toBe(false);
  });

  it('permite upgrade Mediano→Pro', () => {
    expect(planTierRank('normal')).toBeLessThan(planTierRank('pro'));
    expect(
      isProDowngradeBlocked({
        canSimulatePlans: false,
        activePlanId: 'normal',
        targetPlanId: 'pro',
      }),
    ).toBe(false);
  });
});
