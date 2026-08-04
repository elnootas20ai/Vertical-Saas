import { describe, it, expect } from 'vitest';
import {
  suggestPriceFromCost,
  cuttingAllocationKg,
  formatBatchCodePrefix,
  nextBatchCode,
  daysUntilExpiry,
} from '../services/butcherMath.js';

describe('butcherMath', () => {
  it('suggestPriceFromCost aplica margen', () => {
    expect(suggestPriceFromCost(10, 50)).toBe(20);
    expect(suggestPriceFromCost(7.5, 30)).toBeCloseTo(10.71, 1);
    expect(suggestPriceFromCost(0, 30)).toBe(0);
  });

  it('cuttingAllocationKg reparte kg y merma', () => {
    const r = cuttingAllocationKg(100, [
      { productId: 'a', productName: 'A', yieldPct: 40 },
      { productId: 'b', productName: 'B', yieldPct: 35 },
    ]);
    expect(r.applied[0].kg).toBe(40);
    expect(r.applied[1].kg).toBe(35);
    expect(r.mermaKg).toBe(25);
  });

  it('batch code secuencial', () => {
    const prefix = formatBatchCodePrefix('2026-08-03', 'vacuno');
    expect(prefix).toBe('VAC-20260803-');
    expect(nextBatchCode(prefix, ['VAC-20260803-001', 'VAC-20260803-002'])).toBe('VAC-20260803-003');
  });

  it('daysUntilExpiry', () => {
    expect(daysUntilExpiry('2026-08-05', '2026-08-03')).toBe(2);
    expect(daysUntilExpiry('', '2026-08-03')).toBeNull();
  });
});
