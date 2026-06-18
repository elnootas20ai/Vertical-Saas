import { describe, expect, it } from 'vitest';
import {
  buildShiftSalesBreakdown,
  distributeOrderLineTotals,
  filterOrdersForRegisterSession,
  orderLineDiscountRatio,
} from '../src/app/lib/registerShiftSalesBreakdown.ts';
import { reconcileRegisterTotals } from '../src/app/lib/tpvCajaMath.js';

describe('registerShiftSalesBreakdown', () => {
  it('agrupa productos y categorías del turno', () => {
    const orders = [
      {
        _id: 'o1',
        id: 'o1',
        orderNumber: '100',
        status: 'entregado',
        totalAmount: 20,
        customerName: 'Ana',
        paymentMethod: 'efectivo',
        channel: 'tpv',
        createdAt: '2026-06-17T12:00:00.000Z',
        items: [
          { id: '1', name: 'Margarita', quantity: 2, unitPrice: 9, total: 18, category: 'Pizzas' },
          { id: '2', name: 'Coca-Cola', quantity: 1, unitPrice: 2, total: 2, category: 'Bebidas' },
        ],
      },
    ];

    const breakdown = buildShiftSalesBreakdown(orders);
    expect(breakdown.orderCount).toBe(1);
    expect(breakdown.totalUnits).toBe(3);
    expect(breakdown.categories.map((c) => c.category)).toEqual(['Pizzas', 'Bebidas']);
    expect(breakdown.categories[0].products[0].name).toBe('Margarita');
    expect(breakdown.categories[0].products[0].quantity).toBe(2);
  });

  it('incluye todos los completados del turno aunque no estén en linkedOrderIds', () => {
    const session = {
      openedAt: '2026-06-17T08:00:00.000Z',
      closedAt: '',
      status: 'open',
      linkedOrderIds: ['o1'],
      transactions: [{ type: 'sale', linkedDeliveryOrderId: 'o2' }],
    };
    const orders = [
      { _id: 'o1', id: 'o1', status: 'entregado', items: [], totalAmount: 10, createdAt: '2026-06-17T12:00:00.000Z' },
      { _id: 'o2', id: 'o2', status: 'entregado', items: [], totalAmount: 5, createdAt: '2026-06-17T13:00:00.000Z' },
      {
        _id: 'o3',
        id: 'o3',
        status: 'en_reparto',
        paymentCollected: true,
        paymentStatus: 'paid',
        paidAmount: 99,
        totalAmount: 99,
        items: [],
        createdAt: '2026-06-17T14:00:00.000Z',
      },
      { _id: 'o4', id: 'o4', status: 'en_montaje', items: [], totalAmount: 20, createdAt: '2026-06-17T15:00:00.000Z' },
      { _id: 'o5', id: 'o5', status: 'entregado', items: [], totalAmount: 50, createdAt: '2026-06-16T10:00:00.000Z' },
    ];

    const scoped = filterOrdersForRegisterSession(session, orders);
    expect(scoped.map((o) => o._id).sort()).toEqual(['o1', 'o2', 'o3']);
  });

  it('excluye devueltos del recuento', () => {
    const session = {
      openedAt: '2026-06-17T08:00:00.000Z',
      closedAt: '',
      status: 'open',
    };
    const orders = [
      { _id: 'o1', status: 'devuelto', paymentStatus: 'refunded', items: [], totalAmount: 10, createdAt: '2026-06-17T12:00:00.000Z' },
      { _id: 'o2', status: 'entregado', items: [], totalAmount: 5, createdAt: '2026-06-17T13:00:00.000Z' },
    ];
    expect(filterOrdersForRegisterSession(session, orders).map((o) => o._id)).toEqual(['o2']);
  });

  it('reparte descuento entre líneas y cuadra total del pedido', () => {
    const orders = [{
      _id: 'o1',
      status: 'entregado',
      totalAmount: 18,
      discountAmount: 2,
      createdAt: '2026-06-17T12:00:00.000Z',
      items: [
        { name: 'Margarita', quantity: 2, unitPrice: 10, total: 20, category: 'Pizzas' },
      ],
    }];
    expect(orderLineDiscountRatio(orders[0], 20)).toBe(0.9);
    const breakdown = buildShiftSalesBreakdown(orders);
    expect(breakdown.totalRevenue).toBe(18);
    expect(breakdown.categories[0].revenue).toBe(18);
    expect(breakdown.orders[0].items.reduce((s, i) => s + i.total, 0)).toBe(18);
  });

  it('distributeOrderLineTotals cuadra céntimos', () => {
    expect(distributeOrderLineTotals([10, 10, 10], 29.99)).toEqual([10, 10, 9.99]);
  });
});
