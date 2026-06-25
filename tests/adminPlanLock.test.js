import { describe, expect, it } from 'vitest';
import {
  applyAdminPlanLock,
  preserveAdminLockedPlan,
} from '../shared/billing/adminPlanLock.js';

describe('admin plan lock', () => {
  it('normaliza y fija el plan al guardar desde admin', () => {
    const locked = applyAdminPlanLock({}, 'pro', 'Pro');
    expect(locked.selectedPlanId).toBe('pro');
    expect(locked.planName).toBe('Pro');
    expect(locked.adminPlanLocked).toBe(true);
    expect(locked.adminPlanLockedAt).toBeTruthy();
  });

  it('restaura plan bloqueado tras un merge que intenta bajarlo', () => {
    const prev = applyAdminPlanLock({ status: 'subscription_active' }, 'pro', 'Pro');
    const next = preserveAdminLockedPlan(
      { ...prev, selectedPlanId: 'basic', planName: 'Básico' },
      prev,
    );
    expect(next.selectedPlanId).toBe('pro');
    expect(next.planName).toBe('Pro');
    expect(next.adminPlanLocked).toBe(true);
  });
});
