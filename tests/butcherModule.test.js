import { describe, expect, it } from 'vitest';
import {
  suggestPriceFromCost,
  cuttingAllocationKg,
} from '../services/butcherMath.js';

describe('butcherSaleFinance helpers (math parity)', () => {
  it('margen y despiece siguen siendo deterministas', () => {
    expect(suggestPriceFromCost(10, 30)).toBeCloseTo(14.29, 1);
    const r = cuttingAllocationKg(50, [{ productId: 'a', yieldPct: 60 }]);
    expect(r.applied[0].kg).toBe(30);
    expect(r.mermaKg).toBe(20);
  });
});

describe('butcher module registry', () => {
  it('butcher está registrado y no choca con delivery', async () => {
    const { BUTCHER_MODULE } = await import('../src/app/verticals/butcher/module.ts');
    const { DELIVERY_MODULE } = await import('../src/app/verticals/delivery/module.ts');
    const { getVerticalModuleByBusinessType } = await import('../src/app/verticals/registry.ts');
    expect(BUTCHER_MODULE.id).toBe('butcher');
    expect(BUTCHER_MODULE.businessType).toBe('butcherShop');
    expect(BUTCHER_MODULE.businessType).not.toBe(DELIVERY_MODULE.businessType);
    expect(getVerticalModuleByBusinessType('butcherShop')?.id).toBe('butcher');
  });

  it('rutas carnicería reconocidas', async () => {
    const { isButcherModuleRoute } = await import('../src/app/verticals/butcher/module.ts');
    expect(isButcherModuleRoute('/saas/butcher-hub')).toBe(true);
    expect(isButcherModuleRoute('/saas/vertical/carniceria/tpv')).toBe(true);
    expect(isButcherModuleRoute('/saas/delivery-ops')).toBe(false);
  });
});
