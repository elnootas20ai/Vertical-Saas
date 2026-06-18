import { describe, expect, it } from 'vitest';
import {
  buildTpvRegisterSummary,
  calcTpvExpectedCash,
  normalizeTpvPaymentMethod,
  sumCashReturns,
  sumCashStaffConsumption,
  reconcileRegisterTotals,
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

describe('sumCashReturns', () => {
  it('solo cuenta devoluciones en efectivo', () => {
    const session = {
      transactions: [
        { type: 'return', paymentMethod: 'efectivo', amount: 4 },
        { type: 'return', paymentMethod: 'tarjeta', amount: 9 },
        { type: 'return', paymentMethod: 'otros', amount: 3 },
      ],
    };
    expect(sumCashReturns(session)).toBe(4);
  });
});

describe('sumCashStaffConsumption', () => {
  it('suma consumo equipo en efectivo', () => {
    const session = {
      transactions: [
        { type: 'staff_consumption', paymentMethod: 'efectivo', amount: 6 },
        { type: 'staff_consumption', paymentMethod: 'tarjeta', amount: 3 },
      ],
    };
    expect(sumCashStaffConsumption(session)).toBe(6);
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

describe('reconcileRegisterTotals', () => {
  it('marca alineado cuando recuento y ventas netas coinciden', () => {
    const rec = reconcileRegisterTotals(
      { totalSales: 100, totalReturns: 10 },
      { totalRevenue: 90, orderCount: 5 },
    );
    expect(rec.aligned).toBe(true);
    expect(rec.difference).toBe(0);
  });

  it('detecta diferencia entre recuento y caja', () => {
    const rec = reconcileRegisterTotals(
      { totalSales: 100, totalReturns: 0 },
      { totalRevenue: 95, orderCount: 4 },
    );
    expect(rec.aligned).toBe(false);
    expect(rec.difference).toBe(-5);
  });
});
