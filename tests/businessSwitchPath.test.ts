import { describe, expect, it } from 'vitest';
import { resolvePathAfterBusinessSwitch } from '../src/app/lib/businessSwitchPath';

describe('resolvePathAfterBusinessSwitch', () => {
  it('desde caja restaurante a delivery → caja delivery', () => {
    expect(resolvePathAfterBusinessSwitch('/saas/caja', 'delivery')).toBe(
      '/saas/vertical/delivery/caja',
    );
  });

  it('desde TPV restaurante a delivery → TPV delivery', () => {
    expect(resolvePathAfterBusinessSwitch('/saas/caja/tpv', 'delivery')).toBe(
      '/saas/vertical/delivery/tpv',
    );
  });

  it('desde delivery-ops a restaurante → ops restaurante', () => {
    expect(resolvePathAfterBusinessSwitch('/saas/delivery-ops', 'restaurant')).toBe(
      '/saas/restaurant-ops',
    );
  });

  it('misma vertical no redirige', () => {
    expect(resolvePathAfterBusinessSwitch('/saas/caja', 'restaurant')).toBeNull();
    expect(resolvePathAfterBusinessSwitch('/saas/delivery-ops', 'delivery')).toBeNull();
    expect(resolvePathAfterBusinessSwitch('/saas/events-services', 'events')).toBeNull();
  });

  it('desde servicios de eventos a restaurante → ops restaurante', () => {
    expect(resolvePathAfterBusinessSwitch('/saas/events-services', 'restaurant')).toBe(
      '/saas/restaurant-ops',
    );
  });

  it('desde servicios de eventos a otra vertical → panel', () => {
    expect(resolvePathAfterBusinessSwitch('/saas/events-services', 'cleaning')).toBe(
      '/saas',
    );
  });
});
