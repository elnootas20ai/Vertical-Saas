import { describe, expect, it } from 'vitest';
import {
  computeQuoteTotal,
  parseQuoteAmount,
  patchQuoteLine,
  quoteLinesAreEqual,
} from '../src/app/lib/eventsFlow';
import type { QuoteLine } from '../src/app/lib/eventsTypes';

const line = (partial: Partial<QuoteLine>): QuoteLine => ({
  id: 'l1',
  concepto: 'Carpa',
  cantidad: 1,
  precioUnitario: 950,
  total: 950,
  ...partial,
});

describe('eventsQuoteLines', () => {
  it('recalcula el total al cambiar cantidad o precio', () => {
    expect(patchQuoteLine(line({}), { cantidad: 2 }).total).toBe(1900);
    expect(patchQuoteLine(line({}), { precioUnitario: 800 }).total).toBe(800);
  });

  it('parsea importes en formato ES', () => {
    expect(parseQuoteAmount('1.250,50')).toBe(1250.5);
    expect(parseQuoteAmount('400,00')).toBe(400);
    expect(parseQuoteAmount('50')).toBe(50);
  });

  it('suma el presupuesto con las líneas actuales', () => {
    expect(computeQuoteTotal([
      line({ total: 950 }),
      line({ id: 'l2', total: 400 }),
      line({ id: 'l3', cantidad: 50, precioUnitario: 18, total: 900 }),
    ])).toBe(2250);
  });

  it('detecta si el presupuesto ha cambiado', () => {
    const a = [line({})];
    expect(quoteLinesAreEqual(a, [line({})])).toBe(true);
    expect(quoteLinesAreEqual(a, [line({ precioUnitario: 800, total: 800 })])).toBe(false);
  });
});
