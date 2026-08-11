import { describe, expect, it } from 'vitest';
import {
  buildTpvRegisterSummary,
  calcTpvExpectedCash,
  calcTpvShiftCollectionsTotal,
  countNetSaleOperations,
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

  it('usa openingCashCount si initialCashAmount quedó en 0', () => {
    const session = {
      initialCashAmount: 0,
      openingCashCount: { bills_50: 1, bills_20: 2, bills_10: 1 },
      transactions: [],
    };
    expect(calcTpvExpectedCash(session)).toBe(100);
  });

  it('con fondo 100 permite margen de salida', () => {
    const session = {
      initialCashAmount: 100,
      transactions: [{ type: 'cash_out', amount: 30, paymentMethod: 'efectivo' }],
    };
    expect(calcTpvExpectedCash(session)).toBe(70);
  });
});

describe('calcTpvShiftCollectionsTotal', () => {
  it('suma cobros efectivo+tarjeta y entradas/salidas (sin fondo inicial)', () => {
    const session = {
      initialCashAmount: 100,
      transactions: [
        { type: 'sale', paymentMethod: 'efectivo', amount: 20 },
        { type: 'sale', paymentMethod: 'tarjeta', amount: 15 },
        { type: 'cash_in', amount: 10 },
        { type: 'cash_out', amount: 3 },
      ],
    };
    const row = calcTpvShiftCollectionsTotal(session);
    expect(row.efectivo).toBe(20);
    expect(row.tarjeta).toBe(15);
    expect(row.cashIn).toBe(10);
    expect(row.cashOut).toBe(3);
    // 20 + 15 + 10 - 3 = 42 (fondo 100 no entra)
    expect(row.total).toBe(42);
  });

  it('al cancelar un pedido deja de sumar ese importe en Ef/Tj', () => {
    const session = {
      initialCashAmount: 50,
      transactions: [
        { type: 'sale', paymentMethod: 'efectivo', amount: 16.9, orderId: 'o1' },
        { type: 'sale', paymentMethod: 'tarjeta', amount: 2.8, orderId: 'o2' },
        { type: 'return', paymentMethod: 'efectivo', amount: 16.9, orderId: 'o1' },
      ],
    };
    const row = calcTpvShiftCollectionsTotal(session);
    expect(row.efectivo).toBe(0);
    expect(row.tarjeta).toBe(2.8);
    expect(row.total).toBe(2.8);
    expect(countNetSaleOperations(session)).toBe(1);
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
