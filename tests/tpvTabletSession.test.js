import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  TPV_TABLET_DELIVERY_PATH,
  TPV_TABLET_RESTAURANT_PATH,
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
    expect(isTpvTabletWorkerPath('/saas/worker/tpv/delivery')).toBe(true);
    expect(isTpvTabletWorkerPath('/saas/worker/tpv/restaurant')).toBe(true);
    expect(isTpvTabletWorkerPath('/saas/dashboard')).toBe(false);
    expect(isTpvTabletWorkerPath('/auth/gate')).toBe(false);
  });

  it('resolveTpvTabletWorkerPath devuelve restaurant cuando el binding es restaurant', () => {
    clearTpvTabletBinding();
    writeTpvTabletBinding({
      terminalCode: 'SALA-001',
      pdvId: 'pdv-1',
      workCenterId: 'wc-1',
      businessId: 'biz-1',
      dataUserId: 'user-1',
      tpvVertical: TPV_TABLET_VERTICAL_RESTAURANT,
    });
    expect(resolveTpvTabletWorkerPath()).toBe(TPV_TABLET_RESTAURANT_PATH);
  });

  it('inferLegacyTpvVertical migra bindings SALA-* a restaurant', () => {
    writeTpvTabletBinding({
      terminalCode: 'SALA-001',
      pdvId: 'pdv-1',
      workCenterId: 'wc-1',
      businessId: 'biz-1',
      dataUserId: 'user-1',
    });
    expect(resolveTpvTabletWorkerPath()).toBe(TPV_TABLET_RESTAURANT_PATH);
  });
});
