import { describe, expect, it } from 'vitest';
import {
  formatDecimalEs,
  formatMoneyEs,
  formatNumberEs,
  formatQtyEs,
} from '../src/app/lib/formatNumberEs.ts';

describe('formatNumberEs', () => {
  it('pone punto de miles', () => {
    expect(formatNumberEs(100000, { maxFraction: 0 })).toBe('100.000');
  });

  it('dinero con 2 decimales y coma', () => {
    expect(formatDecimalEs(100)).toBe('100,00');
    expect(formatMoneyEs(1234.5)).toBe('1.234,50 €');
  });

  it('cantidades con decimal solo si hace falta', () => {
    expect(formatQtyEs(2.5)).toBe('2,5');
    expect(formatQtyEs(10)).toBe('10');
  });
});
