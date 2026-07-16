import { describe, expect, it } from 'vitest';
import {
  resolveAlertRouteForBusiness,
  mapAlertsForBusinessVertical,
  getAlertResolveLabel,
} from '../src/app/lib/alertActions';
import type { AlertRecord } from '../src/app/lib/alertCenterApi';

function alertWith(partial: Partial<AlertRecord>): AlertRecord {
  return {
    id: 'a1',
    user_id: 'u1',
    level: 'warning',
    category: 'delivery_delayed_order',
    title: 't',
    message: 'm',
    read: false,
    priority: 'medium',
    status: 'new',
    businessId: 'b1',
    source: 'delivery',
    channels: ['in_app'],
    assignedTo: { userIds: [], roles: [] },
    resolvedAt: null,
    resolvedBy: null,
    seenAt: null,
    seenBy: null,
    deletedBy: null,
    statusHistory: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
    ...partial,
  };
}

describe('resolveAlertRouteForBusiness', () => {
  it('no remapea a bar/restaurante (retirado)', () => {
    expect(resolveAlertRouteForBusiness('/saas/delivery-kitchen', 'restaurant')).toBe('/saas/delivery-kitchen');
    expect(resolveAlertRouteForBusiness('/saas/delivery-ops', 'restaurant')).toBe('/saas/delivery-ops');
    expect(resolveAlertRouteForBusiness('/saas/vertical/delivery/caja', 'restaurant')).toBe('/saas/vertical/delivery/caja');
  });

  it('conserva rutas delivery', () => {
    expect(resolveAlertRouteForBusiness('/saas/delivery-kitchen', 'delivery')).toBe('/saas/delivery-kitchen');
    expect(resolveAlertRouteForBusiness('/saas/catalog', 'delivery')).toBe('/saas/catalog');
  });

  it('devuelve cadena vacía si no hay ruta', () => {
    expect(resolveAlertRouteForBusiness('', 'delivery')).toBe('');
    expect(resolveAlertRouteForBusiness(undefined, 'delivery')).toBe('');
  });
});

describe('mapAlertsForBusinessVertical', () => {
  it('deja rutas delivery intactas', () => {
    const alerts = [
      alertWith({ id: 'a1', route: '/saas/delivery-kitchen' }),
      alertWith({ id: 'a2', route: '/saas/catalog' }),
    ];
    const mapped = mapAlertsForBusinessVertical(alerts, 'restaurant');
    expect(mapped[0].route).toBe('/saas/delivery-kitchen');
    expect(mapped[1].route).toBe('/saas/catalog');
  });
});

describe('getAlertResolveLabel', () => {
  it('etiqueta rutas delivery', () => {
    expect(getAlertResolveLabel(alertWith({ route: '/saas/delivery-kitchen' }))).toBe('Ir a cocina');
    expect(getAlertResolveLabel(alertWith({ route: '/saas/delivery-ops' }))).toBe('Ir a pedidos');
    expect(getAlertResolveLabel(alertWith({ route: '/saas/vertical/delivery/caja' }))).toBe('Ir a caja');
  });
});
