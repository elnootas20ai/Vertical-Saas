// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  buildDiningCajaPayItems,
  buildSplitPartViews,
  computeEqualSplitAmounts,
  diningOrderHasPendingKitchen,
  flattenDiningAccountLines,
  scaleAmountsToTotal,
  scaleDiningLinesToPayAmount,
} from '../src/app/lib/restaurantDiningTpv';
import type { DiningOrder } from '../src/app/lib/salaApi';

function makeOrder(overrides: Partial<DiningOrder> = {}): DiningOrder {
  return {
    _id: 'order-1',
    id: 'order-1',
    type: 'dining_order',
    userId: 'u1',
    businessId: 'biz-1',
    tableId: 't1',
    tableNumber: 5,
    tableName: 'Mesa 5',
    zone: 'Terraza',
    section: '',
    guests: 2,
    comandas: [],
    subtotal: 0,
    discount: 0,
    discountPercent: 0,
    discountReason: '',
    tax: 0,
    total: 0,
    status: 'open',
    createdBy: 'u1',
    createdByName: 'Ana',
    servedAt: '',
    paidAt: '',
    closedAt: '',
    payments: [],
    splitMode: 'none',
    splitCount: 0,
    clientId: '',
    clientName: '',
    invoiceGenerated: false,
    financialMovementId: '',
    notes: '',
    createdAt: '2026-07-08T10:00:00.000Z',
    updatedAt: '2026-07-08T10:00:00.000Z',
    ...overrides,
  };
}

describe('scaleAmountsToTotal', () => {
  it('reescala manteniendo la proporción y cuadrando céntimos', () => {
    const scaled = scaleAmountsToTotal([10, 20, 30], 66);
    expect(scaled.reduce((s, a) => s + a, 0)).toBeCloseTo(66, 2);
    expect(scaled[2]).toBeGreaterThan(scaled[1]);
    expect(scaled[1]).toBeGreaterThan(scaled[0]);
  });

  it('si ya suman el total no cambia nada', () => {
    expect(scaleAmountsToTotal([12.5, 7.5], 20)).toEqual([12.5, 7.5]);
  });

  it('el resto de redondeo cae en la parte mayor', () => {
    const scaled = scaleAmountsToTotal([1, 1, 1], 10);
    const sum = Math.round(scaled.reduce((s, a) => s + a, 0) * 100) / 100;
    expect(sum).toBe(10);
  });

  it('devuelve tal cual con entradas degeneradas', () => {
    expect(scaleAmountsToTotal([], 50)).toEqual([]);
    expect(scaleAmountsToTotal([0, 0], 50)).toEqual([0, 0]);
  });
});

describe('buildSplitPartViews', () => {
  it('usa los importes persistidos cuando existen (división por artículo/importe libre)', () => {
    const order = makeOrder({
      total: 50,
      splitMode: 'custom',
      splitCount: 2,
      splitAmounts: [35, 15],
    });
    const parts = buildSplitPartViews(order);
    expect(parts.map((p) => p.amount)).toEqual([35, 15]);
    expect(parts[0].label).toBe('Parte 1/2');
  });

  it('cae a partes iguales si no hay importes persistidos', () => {
    const order = makeOrder({ total: 30, splitMode: 'equal', splitCount: 3 });
    const parts = buildSplitPartViews(order);
    expect(parts.map((p) => p.amount)).toEqual(computeEqualSplitAmounts(30, 3));
  });

  it('marca pagada la parte cuyo pago coincide por etiqueta e importe', () => {
    const order = makeOrder({
      total: 50,
      splitMode: 'custom',
      splitCount: 2,
      splitAmounts: [35, 15],
      payments: [{
        id: 'p1',
        method: 'tarjeta',
        amount: 35,
        amountReceived: 0,
        changeGiven: 0,
        tip: 2,
        paidBy: 'u1',
        paidByName: 'Ana',
        paidAt: '2026-07-08T11:00:00.000Z',
        splitLabel: 'Parte 1/2',
      }],
    });
    const parts = buildSplitPartViews(order);
    expect(parts[0].paid).toBe(true);
    expect(parts[1].paid).toBe(false);
  });

  it('sin división no devuelve partes', () => {
    expect(buildSplitPartViews(makeOrder({ total: 20 }))).toEqual([]);
  });
});

describe('flattenDiningAccountLines', () => {
  it('expone comandaId e itemId y salta artículos/comandas cancelados', () => {
    const order = makeOrder({
      comandas: [
        {
          id: 'c1',
          orderNumber: 1,
          status: 'sent_to_kitchen',
          sentToKitchenAt: '',
          readyAt: '',
          servedAt: '',
          createdBy: 'u1',
          createdByName: 'Ana',
          createdAt: '',
          notes: '',
          items: [
            { id: 'i1', productId: 'p1', name: 'Pizza', price: 10, quantity: 2, category: '', notes: '', modifiers: [], status: 'pending', cancelledReason: '', cancelledBy: '' },
            { id: 'i2', productId: 'p2', name: 'Agua', price: 2, quantity: 1, category: '', notes: '', modifiers: [], status: 'cancelled', cancelledReason: 'error', cancelledBy: 'Ana' },
          ],
        },
        {
          id: 'c2',
          orderNumber: 2,
          status: 'cancelled',
          sentToKitchenAt: '',
          readyAt: '',
          servedAt: '',
          createdBy: 'u1',
          createdByName: 'Ana',
          createdAt: '',
          notes: '',
          items: [
            { id: 'i3', productId: 'p3', name: 'Café', price: 1.5, quantity: 1, category: '', notes: '', modifiers: [], status: 'cancelled', cancelledReason: '', cancelledBy: '' },
          ],
        },
      ],
    });
    const lines = flattenDiningAccountLines(order);
    expect(lines).toHaveLength(1);
    expect(lines[0].comandaId).toBe('c1');
    expect(lines[0].itemId).toBe('i1');
    expect(lines[0].productId).toBe('p1');
    expect(lines[0].lineTotal).toBe(20);
  });

  it('prorratea líneas al importe de un split (suma = payAmount)', () => {
    const order = makeOrder({
      total: 30,
      comandas: [
        {
          id: 'c1',
          orderNumber: 1,
          status: 'served',
          sentToKitchenAt: '',
          readyAt: '',
          servedAt: '',
          createdBy: 'u1',
          createdByName: 'Ana',
          createdAt: '',
          notes: '',
          items: [
            { id: 'i1', productId: 'p1', name: 'Pizza', price: 20, quantity: 1, category: '', notes: '', modifiers: [], status: 'served', cancelledReason: '', cancelledBy: '' },
            { id: 'i2', productId: 'p2', name: 'Cerveza', price: 5, quantity: 2, category: '', notes: '', modifiers: [], status: 'served', cancelledReason: '', cancelledBy: '' },
          ],
        },
      ],
    });
    const lines = flattenDiningAccountLines(order);
    const scaled = scaleDiningLinesToPayAmount(lines, 15, 30);
    expect(scaled.length).toBe(2);
    expect(scaled.reduce((s, l) => s + l.total, 0)).toBeCloseTo(15, 2);
    expect(scaled.every((l) => l.catalogItemId)).toBe(true);

    const full = buildDiningCajaPayItems({ order, payAmount: 30, dueAmount: 30, fallbackName: 'Cuenta' });
    expect(full.reduce((s, l) => s + l.total, 0)).toBeCloseTo(30, 2);
    expect(full.find((l) => l.name === 'Pizza')?.quantity).toBe(1);
  });

  it('detecta comandas pendientes en cocina', () => {
    const pending = makeOrder({
      comandas: [
        {
          id: 'c1',
          orderNumber: 1,
          status: 'sent_to_kitchen',
          sentToKitchenAt: '',
          readyAt: '',
          servedAt: '',
          createdBy: 'u1',
          createdByName: 'Ana',
          createdAt: '',
          notes: '',
          items: [
            { id: 'i1', productId: 'p1', name: 'Pizza', price: 10, quantity: 1, category: '', notes: '', modifiers: [], status: 'pending', cancelledReason: '', cancelledBy: '' },
          ],
        },
      ],
    });
    expect(diningOrderHasPendingKitchen(pending)).toBe(true);
    expect(diningOrderHasPendingKitchen(makeOrder({
      comandas: [
        {
          id: 'c1',
          orderNumber: 1,
          status: 'ready',
          sentToKitchenAt: '',
          readyAt: '',
          servedAt: '',
          createdBy: 'u1',
          createdByName: 'Ana',
          createdAt: '',
          notes: '',
          items: [
            { id: 'i1', productId: 'p1', name: 'Pizza', price: 10, quantity: 1, category: '', notes: '', modifiers: [], status: 'ready', cancelledReason: '', cancelledBy: '' },
          ],
        },
      ],
    }))).toBe(false);
  });
});
