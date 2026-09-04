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

  it('desde Comercial (ROAL) a Eventos (Paunipol) → hub eventos', () => {
    expect(resolvePathAfterBusinessSwitch('/saas/vertical/compraventa', 'events')).toBe(
      '/saas/vertical/eventos',
    );
    expect(resolvePathAfterBusinessSwitch('/saas/vehicles', 'events')).toBe(
      '/saas/vertical/eventos',
    );
    expect(resolvePathAfterBusinessSwitch('/saas/vertical/compraventa/ventas', 'events')).toBe(
      '/saas/vertical/eventos',
    );
  });

  it('desde Eventos a Comercial → hub compraventa', () => {
    expect(resolvePathAfterBusinessSwitch('/saas/vertical/eventos', 'carDealership')).toBe(
      '/saas/vertical/compraventa',
    );
    expect(resolvePathAfterBusinessSwitch('/saas/events-services', 'carDealership')).toBe(
      '/saas/vertical/compraventa',
    );
  });

  it('misma vertical Comercial no redirige', () => {
    expect(resolvePathAfterBusinessSwitch('/saas/vehicles', 'carDealership')).toBeNull();
  });
});
