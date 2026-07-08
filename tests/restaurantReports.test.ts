import { describe, expect, it } from 'vitest';
import {
  computeRestaurantTotals,
  computeSalesByDay,
  computeSalesByZone,
  computeTopProducts,
  filterBilledOrders,
} from '../src/app/verticals/restaurant/restaurantReports';
import type { DiningOrder } from '../src/app/lib/salaApi';

function makeBilledOrder(overrides: Partial<DiningOrder> = {}): DiningOrder {
  return {
    _id: 'order-1',
    businessId: 'biz-1',
    tableNumber: 3,
    zone: 'Interior',
    guests: 2,
    total: 30,
    status: 'paid',
    paidAt: '2026-07-01T14:00:00.000Z',
    closedAt: '',
    createdAt: '2026-07-01T13:00:00.000Z',
    payments: [{ id: 'p1', method: 'card', amount: 30, amountReceived: 30, changeGiven: 0, tip: 2, paidBy: '', paidByName: '', paidAt: '', splitLabel: '' }],
    comandas: [
      {
        id: 'c1',
        orderNumber: 1,
        status: 'served',
        sentToKitchenAt: '',
        readyAt: '',
        servedAt: '',
        createdBy: '',
        createdByName: '',
        createdAt: '',
        notes: '',
        items: [
          { id: 'i1', productId: 'p1', name: 'Hamburguesa', price: 12, quantity: 2, category: '', notes: '', modifiers: [], status: 'served', cancelledReason: '', cancelledBy: '' },
          { id: 'i2', productId: 'p2', name: 'Refresco', price: 3, quantity: 2, category: '', notes: '', modifiers: [], status: 'served', cancelledReason: '', cancelledBy: '' },
        ],
      },
    ],
    ...overrides,
  } as DiningOrder;
}

describe('restaurantReports', () => {
  it('solo cuenta pedidos cobrados o cerrados del negocio activo', () => {
    const orders = [
      makeBilledOrder(),
      makeBilledOrder({ _id: 'o2', status: 'open' }),
      makeBilledOrder({ _id: 'o3', businessId: 'biz-otro' }),
      makeBilledOrder({ _id: 'o4', status: 'closed' }),
    ];
    const billed = filterBilledOrders(orders, 'biz-1');
    expect(billed.map((o) => o._id)).toEqual(['order-1', 'o4']);
  });

  it('calcula totales, ticket medio y propinas', () => {
    const totals = computeRestaurantTotals([
      makeBilledOrder(),
      makeBilledOrder({ _id: 'o2', total: 50, guests: 4 }),
    ]);
    expect(totals.totalSales).toBe(80);
    expect(totals.ticketCount).toBe(2);
    expect(totals.avgTicket).toBe(40);
    expect(totals.totalGuests).toBe(6);
    expect(totals.totalTips).toBe(4);
  });

  it('agrupa ventas por día usando fecha de cobro', () => {
    const rows = computeSalesByDay([
      makeBilledOrder(),
      makeBilledOrder({ _id: 'o2', paidAt: '2026-07-02T20:00:00.000Z', total: 45 }),
      makeBilledOrder({ _id: 'o3', paidAt: '2026-07-01T21:00:00.000Z', total: 10 }),
    ]);
    expect(rows).toEqual([
      { day: '2026-07-01', sales: 40, tickets: 2 },
      { day: '2026-07-02', sales: 45, tickets: 1 },
    ]);
  });

  it('calcula top de productos por ingresos ignorando cancelados', () => {
    const order = makeBilledOrder();
    order.comandas[0].items[1].status = 'cancelled';
    const rows = computeTopProducts([order, makeBilledOrder({ _id: 'o2' })]);
    expect(rows[0].name).toBe('Hamburguesa');
    expect(rows[0].quantity).toBe(4);
    expect(rows[0].revenue).toBe(48);
    const refresco = rows.find((r) => r.name === 'Refresco');
    expect(refresco?.quantity).toBe(2);
  });

  it('agrupa ventas por zona', () => {
    const rows = computeSalesByZone([
      makeBilledOrder(),
      makeBilledOrder({ _id: 'o2', zone: 'Terraza', total: 60 }),
    ]);
    expect(rows[0]).toEqual({ zone: 'Terraza', sales: 60, tickets: 1 });
    expect(rows[1]).toEqual({ zone: 'Interior', sales: 30, tickets: 1 });
  });
});
