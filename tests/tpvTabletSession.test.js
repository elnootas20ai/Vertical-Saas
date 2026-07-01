import { describe, expect, it } from 'vitest';
import {
  TPV_TABLET_DELIVERY_PATH,
  isTpvTabletWorkerPath,
} from '../src/app/lib/tpvTabletSession.ts';

describe('tpvTabletSession — rutas tablet', () => {
  it('isTpvTabletWorkerPath reconoce delivery y prefijo worker/tpv', () => {
    expect(isTpvTabletWorkerPath(TPV_TABLET_DELIVERY_PATH)).toBe(true);
    expect(isTpvTabletWorkerPath('/saas/worker/tpv')).toBe(true);
    expect(isTpvTabletWorkerPath('/saas/worker/tpv/delivery')).toBe(true);
    expect(isTpvTabletWorkerPath('/saas/dashboard')).toBe(false);
    expect(isTpvTabletWorkerPath('/auth/gate')).toBe(false);
  });
});
