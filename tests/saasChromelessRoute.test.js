import { describe, expect, it } from 'vitest';
import { isChromelessSaasRoute } from '../src/app/lib/saasChromelessRoute.ts';

describe('isChromelessSaasRoute', () => {
  it('TPV por código: sin sidebar en worker/tpv', () => {
    expect(isChromelessSaasRoute('/saas/worker/tpv/delivery')).toBe(true);
    expect(isChromelessSaasRoute('/saas/worker/tpv')).toBe(true);
  });

  it('CEO caja/tpv sigue chromeless (pantalla TPV dedicada)', () => {
    expect(isChromelessSaasRoute('/saas/caja/tpv')).toBe(true);
  });

  it('panel normal sigue con sidebar', () => {
    expect(isChromelessSaasRoute('/saas/dashboard')).toBe(false);
    expect(isChromelessSaasRoute('/saas/delivery-ops')).toBe(false);
  });
});
