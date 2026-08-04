// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  diningOrderToCrmDeliveryOrder,
  diningOrdersToCrmDeliveryOrders,
} from '../src/app/lib/restaurantCrmOrders';
import type { DiningOrder } from '../src/app/lib/salaApi';

function makeOrder(overrides: Partial<DiningOrder> = {}): DiningOrder {
  return {
    _id: 'ord-1',
    id: 'ord-1',
    type: 'dining_order',
    userId: 'u1',
    businessId: 'biz-1',
    tableId: 't1',
    tableNumber: 7,
    tableName: 'Mesa 7',
    zone: 'Terraza',
    section: '',
    guests: 2,
    comandas: [{
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
        {
          id: 'i1',
          productId: 'p1',
          name: 'Burger',
          price: 12,
          quantity: 1,
          category: '',
          notes: '',
          modifiers: [],
          status: 'served',
          cancelledReason: '',
          cancelledBy: '',
        },
      ],
    }],
    subtotal: 12,
    discount: 0,
    discountPercent: 0,
    discountReason: '',
    tax: 0,
    total: 12,
    status: 'closed',
    createdBy: 'u1',
    createdByName: 'Ana',
    servedAt: '',
    paidAt: '2026-08-01T12:00:00.000Z',
    closedAt: '2026-08-01T12:05:00.000Z',
    payments: [{
      id: 'pay1',
      method: 'tarjeta',
      amount: 12,
      amountReceived: 0,
      changeGiven: 0,
      tip: 0,
      paidBy: 'u1',
      paidByName: 'Ana',
      paidAt: '2026-08-01T12:00:00.000Z',
      splitLabel: '',
    }],
    splitMode: 'none',
    splitCount: 0,
    clientId: 'cli-9',
    clientName: 'Pau',
    invoiceGenerated: false,
    financialMovementId: '',
    notes: '',
    createdAt: '2026-08-01T11:00:00.000Z',
    updatedAt: '2026-08-01T12:05:00.000Z',
    ...overrides,
  };
}

describe('restaurantCrmOrders', () => {
  it('adapta cuenta cerrada a forma CRM con deliveryType sala', () => {
    const mapped = diningOrderToCrmDeliveryOrder(makeOrder());
    expect(mapped.deliveryType).toBe('sala');
    expect(mapped.status).toBe('entregado');
    expect(mapped.totalAmount).toBe(12);
    expect(mapped.salesPointName).toContain('Mesa 7');
    expect(mapped.items?.[0]?.name).toBe('Burger');
  });

  it('filtra por clientId y omite canceladas', () => {
    const list = diningOrdersToCrmDeliveryOrders(
      [
        makeOrder(),
        makeOrder({ _id: 'ord-2', id: 'ord-2', clientId: 'otro', status: 'closed' }),
        makeOrder({ _id: 'ord-3', id: 'ord-3', status: 'cancelled' }),
      ],
      'cli-9',
    );
    expect(list).toHaveLength(1);
    expect(list[0]._id).toBe('ord-1');
  });
});
