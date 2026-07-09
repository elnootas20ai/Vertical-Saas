import { describe, expect, it } from 'vitest';
import {
  resolveRetailOpsHomePath,
  resolveRetailCeoTpvPath,
  resolveRetailCajaPath,
  resolveTpvCeoExitPath,
  shouldForceRetailStoreReload,
  isDeliveryOnlyRoute,
  RESTAURANT_CEO_TPV_PATH,
  DELIVERY_OPS_HOME_PATH,
} from '../src/app/lib/retailOpsPaths.ts';

describe('retailOpsPaths — restaurant vs delivery', () => {
  it('restaurant paths never point to delivery-ops', () => {
    expect(resolveRetailOpsHomePath('restaurant')).toBe('/saas/caja');
    expect(resolveRetailCeoTpvPath('restaurant')).toBe('/saas/caja/tpv');
    expect(resolveRetailCajaPath('restaurant')).toBe('/saas/caja');
    expect(resolveTpvCeoExitPath('/saas/caja/tpv', 'restaurant')).toBe('/saas/caja');
  });

  it('delivery paths stay on delivery vertical', () => {
    expect(resolveRetailOpsHomePath('delivery')).toBe(DELIVERY_OPS_HOME_PATH);
    expect(resolveRetailCeoTpvPath('delivery')).toBe('/saas/vertical/delivery/tpv');
    expect(resolveTpvCeoExitPath('/saas/vertical/delivery/tpv', 'delivery')).toBe(DELIVERY_OPS_HOME_PATH);
  });

  it('shouldForceRetailStoreReload covers restaurant ops screens', () => {
    expect(shouldForceRetailStoreReload('/saas/caja')).toBe(true);
    expect(shouldForceRetailStoreReload('/saas/sala')).toBe(true);
    expect(shouldForceRetailStoreReload('/saas/cocina')).toBe(true);
    expect(shouldForceRetailStoreReload('/saas/dashboard')).toBe(false);
  });

  it('isDeliveryOnlyRoute flags delivery URLs', () => {
    expect(isDeliveryOnlyRoute('/saas/delivery-ops')).toBe(true);
    expect(isDeliveryOnlyRoute(RESTAURANT_CEO_TPV_PATH)).toBe(false);
  });
});
