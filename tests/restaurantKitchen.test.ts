import { describe, expect, it } from 'vitest';
import {
  buildKitchenTickets,
  kitchenTicketMinutes,
  nextKitchenStatus,
} from '../src/app/verticals/restaurant/restaurantKitchen';
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
    comandas: [
      {
        id: 'c1',
        orderNumber: 1,
        status: 'sent_to_kitchen',
        sentToKitchenAt: '2026-07-08T10:00:00.000Z',
        readyAt: '',
        servedAt: '',
        createdBy: 'u1',
        createdByName: 'Ana',
        createdAt: '2026-07-08T09:58:00.000Z',
        notes: '',
        items: [
          {
            id: 'i1',
            productId: 'p1',
            name: 'Pizza margarita',
            price: 10,
            quantity: 2,
            category: '',
            notes: '',
            modifiers: [],
            status: 'pending',
            cancelledReason: '',
            cancelledBy: '',
          },
        ],
      },
    ],
    subtotal: 20,
    discount: 0,
    discountPercent: 0,
    discountReason: '',
    tax: 0,
    total: 20,
    status: 'open',
    createdBy: 'u1',
    createdByName: 'Ana',
    servedAt: '',
    paidAt: '',
    closedAt: '',
    payments: [],
    splitMode: '',
    splitCount: 0,
    clientId: '',
    clientName: '',
    invoiceGenerated: false,
    financialMovementId: '',
    notes: '',
    createdAt: '2026-07-08T09:55:00.000Z',
    updatedAt: '2026-07-08T10:00:00.000Z',
    ...overrides,
  } as DiningOrder;
}

describe('restaurantKitchen', () => {
  it('aplana comandas activas en tickets de cocina', () => {
    const tickets = buildKitchenTickets([makeOrder()]);
    expect(tickets).toHaveLength(1);
    expect(tickets[0].tableNumber).toBe(5);
    expect(tickets[0].status).toBe('sent_to_kitchen');
    expect(tickets[0].items[0].name).toBe('Pizza margarita');
  });

  it('excluye comandas en borrador, servidas o canceladas', () => {
    const order = makeOrder();
    order.comandas[0].status = 'draft';
    expect(buildKitchenTickets([order])).toHaveLength(0);
    order.comandas[0].status = 'served';
    expect(buildKitchenTickets([order])).toHaveLength(0);
    order.comandas[0].status = 'cancelled';
    expect(buildKitchenTickets([order])).toHaveLength(0);
  });

  it('excluye pedidos cerrados o cobrados', () => {
    expect(buildKitchenTickets([makeOrder({ status: 'paid' })])).toHaveLength(0);
    expect(buildKitchenTickets([makeOrder({ status: 'closed' })])).toHaveLength(0);
    expect(buildKitchenTickets([makeOrder({ status: 'cancelled' })])).toHaveLength(0);
  });

  it('filtra por empresa cuando se indica scope', () => {
    const orders = [makeOrder(), makeOrder({ _id: 'order-2', businessId: 'biz-2' })];
    const tickets = buildKitchenTickets(orders, 'biz-1');
    expect(tickets).toHaveLength(1);
    expect(tickets[0].orderId).toBe('order-1');
  });

  it('ignora items cancelados y descarta comandas sin items visibles', () => {
    const order = makeOrder();
    order.comandas[0].items[0].status = 'cancelled';
    expect(buildKitchenTickets([order])).toHaveLength(0);
  });

  it('ordena por antigüedad de envío a cocina', () => {
    const older = makeOrder({ _id: 'order-old' });
    older.comandas[0].sentToKitchenAt = '2026-07-08T09:00:00.000Z';
    const tickets = buildKitchenTickets([makeOrder(), older]);
    expect(tickets[0].orderId).toBe('order-old');
  });

  it('avanza el flujo pendiente → preparación → lista → servida', () => {
    expect(nextKitchenStatus('sent_to_kitchen')).toBe('in_preparation');
    expect(nextKitchenStatus('in_preparation')).toBe('ready');
    expect(nextKitchenStatus('ready')).toBe('served');
    expect(nextKitchenStatus('served')).toBeNull();
    expect(nextKitchenStatus('draft')).toBeNull();
  });

  it('calcula minutos en cocina', () => {
    const [ticket] = buildKitchenTickets([makeOrder()]);
    const now = Date.parse('2026-07-08T10:25:00.000Z');
    expect(kitchenTicketMinutes(ticket, now)).toBe(25);
  });
});
