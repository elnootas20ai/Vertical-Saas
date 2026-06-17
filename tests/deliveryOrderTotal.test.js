import { describe, expect, it } from 'vitest';
import { buildDeliveryOrderDocument } from '../services/couchdb.js';

describe('buildDeliveryOrderDocument — total con descuento', () => {
  it('respeta totalAmount con descuento al crear', () => {
    const doc = buildDeliveryOrderDocument('user-1', {
      customerName: 'Test',
      items: [
        { name: 'Pizza', quantity: 2, unitPrice: 10, total: 20 },
      ],
      totalAmount: 18,
      discountAmount: 2,
      paymentStatus: 'paid',
      paidAmount: 18,
    });

    expect(doc.itemsSubtotal).toBe(20);
    expect(doc.discountAmount).toBe(2);
    expect(doc.totalAmount).toBe(18);
    expect(doc.paidAmount).toBe(18);
  });

  it('conserva total con descuento en actualización de estado', () => {
    const existing = buildDeliveryOrderDocument('user-1', {
      items: [{ name: 'Pizza', quantity: 1, unitPrice: 15, total: 15 }],
      totalAmount: 12,
      discountAmount: 3,
      paidAmount: 12,
      paymentStatus: 'paid',
      status: 'listo',
    });

    const updated = buildDeliveryOrderDocument(
      'user-1',
      { ...existing, status: 'entregado' },
      existing,
    );

    expect(updated.totalAmount).toBe(12);
    expect(updated.discountAmount).toBe(3);
  });
});
