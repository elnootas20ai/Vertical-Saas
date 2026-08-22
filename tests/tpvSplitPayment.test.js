import { describe, expect, it } from 'vitest';
import {
  buildOrderSplitPayLines,
  cashQuickAmountsFor,
  itemAssignmentsToSplitParts,
  orderPaymentRemaining,
  remainingSplitAmount,
  splitPartsAreComplete,
  sumSplitParts,
  validateItemPayAssignments,
  validateSplitParts,
} from '../src/app/lib/tpvSplitPayment.ts';

describe('tpvSplitPayment', () => {
  it('calcula restante de cobro del pedido', () => {
    expect(orderPaymentRemaining({ totalAmount: 57.89, paidAmount: 59.39 })).toBe(0);
    expect(orderPaymentRemaining({ totalAmount: 57.89, paidAmount: 9.39 })).toBe(48.5);
    expect(orderPaymentRemaining({ totalAmount: 10, paidAmount: 0 })).toBe(10);
  });

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

  it('expande artículos 1 a 1 y agrupa métodos', () => {
    const lines = buildOrderSplitPayLines(
      [
        { id: 'p1', name: 'Pizza', quantity: 2, unitPrice: 10, total: 20 },
        { id: 'p2', name: 'Agua', quantity: 1, unitPrice: 1.5, total: 1.5 },
      ],
      21.5,
    );
    expect(lines).toHaveLength(3);
    expect(sumSplitParts(lines)).toBe(21.5);

    const methods = {
      [lines[0].lineId]: 'efectivo',
      [lines[1].lineId]: 'efectivo',
      [lines[2].lineId]: 'tarjeta',
    };
    expect(validateItemPayAssignments(21.5, lines, methods)).toBeNull();
    const parts = itemAssignmentsToSplitParts(
      lines.map((l) => ({ lineId: l.lineId, method: methods[l.lineId], amount: l.amount })),
    );
    expect(parts).toHaveLength(2);
    expect(sumSplitParts(parts)).toBe(21.5);
  });

  it('añade ajuste si el total cobro no cuadra con líneas', () => {
    const lines = buildOrderSplitPayLines(
      [{ id: 'p1', name: 'Pizza', quantity: 1, total: 10 }],
      12,
    );
    expect(lines.some((l) => l.lineId === 'ajuste-cobro')).toBe(true);
    expect(sumSplitParts(lines)).toBe(12);
  });

  it('agrega cambio de efectivo al agrupar por artículos', () => {
    const parts = itemAssignmentsToSplitParts([
      {
        lineId: 'a',
        method: 'efectivo',
        amount: 15.5,
        amountReceived: 20,
        changeGiven: 4.5,
      },
      {
        lineId: 'b',
        method: 'efectivo',
        amount: 10,
        amountReceived: 10,
        changeGiven: 0,
      },
      { lineId: 'c', method: 'tarjeta', amount: 5 },
    ]);
    const cash = parts.find((p) => p.method === 'efectivo');
    expect(cash?.amount).toBe(25.5);
    expect(cash?.amountReceived).toBe(30);
    expect(cash?.changeGiven).toBe(4.5);
  });

  it('cashQuickAmountsFor incluye Exacto y billetes', () => {
    const q = cashQuickAmountsFor(15.5);
    expect(q[0]).toBe(15.5);
    expect(q).toContain(20);
    expect(q).toContain(50);
  });
});
