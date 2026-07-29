import { describe, expect, it } from 'vitest';
import {
  remainingSplitAmount,
  splitPartsAreComplete,
  sumSplitParts,
  validateSplitParts,
} from '../src/app/lib/tpvSplitPayment.ts';

describe('tpvSplitPayment', () => {
  it('valida tramos que cubren el total', () => {
    const parts = [
      { id: 'a', method: 'efectivo', amount: 10 },
      { id: 'b', method: 'tarjeta', amount: 5.5 },
    ];
    expect(sumSplitParts(parts)).toBe(15.5);
    expect(remainingSplitAmount(15.5, parts)).toBe(0);
    expect(splitPartsAreComplete(15.5, parts)).toBe(true);
    expect(validateSplitParts(15.5, parts)).toBeNull();
  });

  it('rechaza si falta importe', () => {
    const parts = [{ id: 'a', method: 'tarjeta', amount: 10 }];
    expect(validateSplitParts(20, parts)).toMatch(/Faltan/);
  });
});
