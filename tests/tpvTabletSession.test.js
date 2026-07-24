import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  TPV_TABLET_DELIVERY_PATH,
  TPV_TABLET_RESTAURANT_PATH,
  isTpvTabletAllowedPath,
  isTpvTabletWorkerPath,
  resolveTpvTabletWorkerPath,
  writeTpvTabletBinding,
  clearTpvTabletBinding,
  TPV_TABLET_VERTICAL_RESTAURANT,
} from '../src/app/lib/tpvTabletSession.ts';

const storage = new Map();

describe('tpvTabletSession — rutas tablet', () => {
  beforeEach(() => {
    storage.clear();
    globalThis.localStorage = {
      getItem: (key) => storage.get(String(key)) ?? null,
      setItem: (key, value) => {
        storage.set(String(key), String(value));
      },
      removeItem: (key) => {
        storage.delete(String(key));
      },
      clear: () => storage.clear(),
      key: () => null,
      length: 0,
    };
  });

  afterEach(() => {
    clearTpvTabletBinding();
  });

  it('isTpvTabletWorkerPath reconoce delivery, restaurant y prefijo worker/tpv', () => {
    expect(isTpvTabletWorkerPath(TPV_TABLET_DELIVERY_PATH)).toBe(true);
    expect(isTpvTabletWorkerPath(TPV_TABLET_RESTAURANT_PATH)).toBe(true);
    expect(isTpvTabletWorkerPath('/saas/worker/tpv')).toBe(true);
    expect(isTpvTabletWorkerPath('/saas/dashboard')).toBe(false);
  });

  it('isTpvTabletAllowedPath bloquea cuenta personal con código TPV activo', () => {
    expect(isTpvTabletAllowedPath('/saas/worker/tpv/delivery')).toBe(true);
    expect(isTpvTabletAllowedPath('/saas/worker/clock')).toBe(true);
    expect(isTpvTabletAllowedPath('/auth/tpv-tablet')).toBe(true);
    expect(isTpvTabletAllowedPath('/saas/user-dashboard')).toBe(false);
    expect(isTpvTabletAllowedPath('/saas/dashboard')).toBe(false);
    expect(isTpvTabletAllowedPath('/saas/clients')).toBe(false);
    expect(isTpvTabletAllowedPath('/auth/gate')).toBe(false);
  });

  it('resolveTpvTabletWorkerPath respeta delivery vs restaurant del binding', () => {
    clearTpvTabletBinding();
    expect(resolveTpvTabletWorkerPath()).toBe(TPV_TABLET_DELIVERY_PATH);

    writeTpvTabletBinding({
      terminalCode: 'STORE-001',
      pdvId: 'pdv-1',
      workCenterId: 'wc-1',
      businessId: 'biz-1',
      dataUserId: 'user-1',
      tpvVertical: TPV_TABLET_VERTICAL_RESTAURANT,
    });
    expect(resolveTpvTabletWorkerPath()).toBe(TPV_TABLET_RESTAURANT_PATH);
  });

  it('con código TPV activo no se permite ir a cuenta personal', () => {
    writeTpvTabletBinding({
      terminalCode: 'STORE-001',
      pdvId: 'pdv-1',
      workCenterId: 'wc-1',
      businessId: 'biz-1',
      dataUserId: 'owner-1',
      authUserId: 'owner-1',
    });
    expect(isTpvTabletAllowedPath('/saas/user-dashboard')).toBe(false);
    expect(isTpvTabletAllowedPath(resolveTpvTabletWorkerPath())).toBe(true);
  });
});
