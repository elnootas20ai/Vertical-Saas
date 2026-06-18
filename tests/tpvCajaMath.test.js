import { describe, expect, it } from 'vitest';
import {
  buildTpvRegisterSummary,
  calcTpvExpectedCash,
  normalizeTpvPaymentMethod,
} from '../src/app/lib/tpvCajaMath.js';

describe('normalizeTpvPaymentMethod', () => {
  it('maps legacy otros to otro', () => {
    expect(normalizeTpvPaymentMethod('otros')).toBe('otro');
    expect(normalizeTpvPaymentMethod('OTROS')).toBe('otro');
  });
});

describe('calcTpvExpectedCash', () => {
  it('includes staff_consumption paid in cash', () => {
    const session = {
      initialCashAmount: 100,
      transactions: [
        { type: 'sale', paymentMethod: 'efectivo', amount: 20 },
        { type: 'staff_consumption', paymentMethod: 'efectivo', amount: 5 },
        { type: 'return', paymentMethod: 'efectivo', amount: 2 },
        { type: 'cash_in', amount: 10 },
        { type: 'cash_out', amount: 3 },
      ],
    };
    expect(calcTpvExpectedCash(session)).toBe(130);
  });
});

describe('buildTpvRegisterSummary', () => {
  it('counts otros legacy sales under otro', () => {
    const session = {
      initialCashAmount: 0,
      transactions: [
        { type: 'sale', paymentMethod: 'otros', amount: 7 },
        { type: 'sale', paymentMethod: 'otro', amount: 3 },
      ],
    };
    const summary = buildTpvRegisterSummary(session);
    expect(summary.salesByMethod.otro).toBe(10);
  });
});
