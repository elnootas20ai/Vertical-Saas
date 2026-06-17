import { describe, expect, it } from 'vitest';
import {
  buildShiftSalesBreakdown,
  filterOrdersForRegisterSession,
} from '../src/app/lib/registerShiftSalesBreakdown.ts';

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

  it('filtra pedidos vinculados a la sesión de caja', () => {
    const session = {
      linkedOrderIds: ['o1'],
      transactions: [{ type: 'sale', linkedDeliveryOrderId: 'o2' }],
    };
    const orders = [
      { _id: 'o1', id: 'o1', status: 'entregado', items: [], totalAmount: 10, createdAt: '' },
      { _id: 'o2', id: 'o2', status: 'entregado', items: [], totalAmount: 5, createdAt: '' },
      { _id: 'o3', id: 'o3', status: 'entregado', items: [], totalAmount: 99, createdAt: '' },
    ];

    const scoped = filterOrdersForRegisterSession(session, orders);
    expect(scoped.map((o) => o._id).sort()).toEqual(['o1', 'o2']);
  });
});
