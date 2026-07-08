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
  it('traduce rutas delivery a rutas de restaurante', () => {
    expect(resolveAlertRouteForBusiness('/saas/delivery-kitchen', 'restaurant')).toBe('/saas/cocina');
    expect(resolveAlertRouteForBusiness('/saas/delivery-ops', 'restaurant')).toBe('/saas/sala');
    expect(resolveAlertRouteForBusiness('/saas/delivery-reparto', 'restaurant')).toBe('/saas/sala');
    expect(resolveAlertRouteForBusiness('/saas/vertical/delivery/caja', 'restaurant')).toBe('/saas/caja');
  });

  it('traduce también rutas con query string', () => {
    expect(resolveAlertRouteForBusiness('/saas/delivery-ops?orderId=x', 'restaurant')).toBe('/saas/sala');
  });

  it('no toca rutas para delivery puro ni rutas neutrales', () => {
    expect(resolveAlertRouteForBusiness('/saas/delivery-kitchen', 'delivery')).toBe('/saas/delivery-kitchen');
    expect(resolveAlertRouteForBusiness('/saas/catalog', 'restaurant')).toBe('/saas/catalog');
    expect(resolveAlertRouteForBusiness('/saas/finance', 'restaurant')).toBe('/saas/finance');
  });

  it('devuelve cadena vacía si no hay ruta', () => {
    expect(resolveAlertRouteForBusiness('', 'restaurant')).toBe('');
    expect(resolveAlertRouteForBusiness(undefined, 'restaurant')).toBe('');
  });
});

describe('mapAlertsForBusinessVertical', () => {
  it('mapea solo las alertas con rutas delivery para restaurantes', () => {
    const alerts = [
      alertWith({ id: 'a1', route: '/saas/delivery-kitchen' }),
      alertWith({ id: 'a2', route: '/saas/catalog' }),
    ];
    const mapped = mapAlertsForBusinessVertical(alerts, 'restaurant');
    expect(mapped[0].route).toBe('/saas/cocina');
    expect(mapped[1].route).toBe('/saas/catalog');
  });

  it('devuelve la misma lista para otros verticales', () => {
    const alerts = [alertWith({ route: '/saas/delivery-kitchen' })];
    expect(mapAlertsForBusinessVertical(alerts, 'delivery')).toBe(alerts);
  });
});

describe('getAlertResolveLabel', () => {
  it('etiqueta rutas de cocina y sala de restaurante', () => {
    expect(getAlertResolveLabel(alertWith({ route: '/saas/cocina' }))).toBe('Ir a cocina');
    expect(getAlertResolveLabel(alertWith({ route: '/saas/sala', category: 'sala_long_occupied_table' }))).toBe('Ir a sala');
    expect(getAlertResolveLabel(alertWith({ route: '/saas/caja' }))).toBe('Ir a caja');
  });

  it('mantiene las etiquetas delivery existentes', () => {
    expect(getAlertResolveLabel(alertWith({ route: '/saas/delivery-kitchen' }))).toBe('Ir a cocina');
    expect(getAlertResolveLabel(alertWith({ route: '/saas/delivery-ops' }))).toBe('Ir a pedidos');
  });
});
