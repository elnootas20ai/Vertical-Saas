import { describe, expect, it } from 'vitest';
import { diningOrderToShiftDeliveryOrder } from '../src/app/lib/restaurantShiftOrderMap.ts';
import { buildShiftBrandRevenue } from '../src/app/lib/registerShiftBrandBilling.ts';

describe('diningOrderToShiftDeliveryOrder', () => {
  it('convierte comanda cobrada con brandIds para facturación del turno', () => {
    const shaped = diningOrderToShiftDeliveryOrder({
      _id: 'd1',
      id: 'd1',
      type: 'dining_order',
      userId: 'u',
      businessId: 'biz',
      tableId: 't1',
      tableNumber: 1,
      tableName: 'M1',
      zone: '',
      section: '',
      guests: 2,
      subtotal: 30,
      discount: 0,
      discountPercent: 0,
      discountReason: '',
      tax: 0,
      total: 30,
      status: 'paid',
      createdBy: '',
      createdByName: '',
      servedAt: '',
      paidAt: '2026-07-31T13:00:00.000Z',
      closedAt: '2026-07-31T13:00:00.000Z',
      payments: [{ id: 'p1', method: 'tarjeta', amount: 30, amountReceived: 30, changeGiven: 0, tip: 0, paidBy: '', paidByName: '', paidAt: '2026-07-31T13:00:00.000Z', splitLabel: '' }],
      splitMode: '',
      splitCount: 0,
      clientId: '',
      clientName: '',
      invoiceGenerated: false,
      financialMovementId: '',
      notes: '',
      createdAt: '2026-07-31T12:00:00.000Z',
      updatedAt: '2026-07-31T13:00:00.000Z',
      comandas: [{
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
          {
            id: 'i1', productId: 'p', name: 'Burger', price: 20, quantity: 1, category: 'burgers',
            notes: '', modifiers: [], status: 'served', cancelledReason: '', cancelledBy: '',
            brandIds: ['brand-a'],
          },
          {
            id: 'i2', productId: 'p2', name: 'Taco', price: 10, quantity: 1, category: 'tacos',
            notes: '', modifiers: [], status: 'served', cancelledReason: '', cancelledBy: '',
            brandIds: ['brand-b'],
          },
        ],
      }],
    });

    expect(shaped.status).toBe('entregado');
    expect(shaped.paymentStatus).toBe('paid');
    expect(shaped.totalAmount).toBe(30);
    expect(shaped.items).toHaveLength(2);
    expect(shaped.items[0].brandIds).toEqual(['brand-a']);

    const billing = buildShiftBrandRevenue(
      {
        openedAt: '2026-07-31T10:00:00.000Z',
        closedAt: '2026-07-31T20:00:00.000Z',
        status: 'closed',
        pointOfSaleId: 'pdv1',
      },
      [shaped],
      { 'brand-a': 'Burger', 'brand-b': 'Tacos' },
    );
    expect(billing.total).toBe(30);
    const byId = Object.fromEntries(billing.rows.map((r) => [r.brandId, r.revenue]));
    expect(byId['brand-a']).toBe(20);
    expect(byId['brand-b']).toBe(10);
  });
});
