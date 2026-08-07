import { describe, expect, it } from 'vitest';
import {
  DELIVERY_OPS_PATH,
  isDeliveryNestedPath,
  isSaasRootNavPath,
  resolveSaasBackFallback,
  resolveSaasBackTarget,
  shouldShowSaasBack,
} from '../src/app/lib/saasBackNavigation.js';

describe('saasBackNavigation', () => {
  it('no muestra Atrás en pestañas raíz', () => {
    expect(isSaasRootNavPath('/saas/dashboard')).toBe(true);
    expect(isSaasRootNavPath('/saas/delivery-ops')).toBe(true);
    expect(isSaasRootNavPath('/saas/alerts')).toBe(true);
    expect(isSaasRootNavPath('/saas/clients')).toBe(true);
    expect(shouldShowSaasBack('/saas/dashboard')).toBe(false);
    expect(shouldShowSaasBack('/saas/delivery-ops')).toBe(false);
  });

  it('Delivery anidado: Atrás → Operativa', () => {
    expect(isDeliveryNestedPath('/saas/delivery-kitchen')).toBe(true);
    expect(isDeliveryNestedPath('/saas/delivery-montaje')).toBe(true);
    expect(isDeliveryNestedPath('/saas/delivery-reparto')).toBe(true);
    expect(isDeliveryNestedPath('/saas/vertical/delivery/catalogo')).toBe(true);
    expect(isDeliveryNestedPath('/saas/delivery-ops')).toBe(false);
    expect(resolveSaasBackTarget('/saas/delivery-kitchen')).toBe(DELIVERY_OPS_PATH);
    expect(resolveSaasBackFallback('/saas/delivery-reparto')).toBe(DELIVERY_OPS_PATH);
    expect(shouldShowSaasBack('/saas/delivery-kitchen')).toBe(true);
  });

  it('muestra Atrás en pantallas anidadas genéricas', () => {
    expect(shouldShowSaasBack('/saas/team')).toBe(true);
    expect(shouldShowSaasBack('/saas/settings')).toBe(true);
  });

  it('respeta backTo false / string', () => {
    expect(shouldShowSaasBack('/saas/team', false)).toBe(false);
    expect(shouldShowSaasBack('/saas/dashboard', '/saas/team')).toBe(true);
  });
});
