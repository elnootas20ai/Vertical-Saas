import { describe, expect, it } from 'vitest';
import {
  orderItemCustomizationDetail,
  orderItemCustomizationParts,
} from '../src/app/lib/deliveryTicketHelpers.js';
import { buildTicketDocument } from '../src/app/lib/vertialPrint/ticketDocument.js';

describe('orderItemCustomizationDetail — sin duplicar SIN', () => {
  it('no duplica cuando extras y ingredients llevan el mismo “sin”', () => {
    const lines = orderItemCustomizationDetail({
      extras: ['+ búfala', '- sin cebolla'],
      ingredients: [
        { name: 'tomate', quantity: 'normal' },
        { name: 'cebolla', quantity: 'sin' },
      ],
    });
    expect(lines.filter((l) => /sin\s+cebolla/i.test(l))).toHaveLength(1);
    expect(lines.some((l) => l.includes('+') || l.includes('búfala'))).toBe(true);
  });

  it('parts.removed sale una sola vez', () => {
    const parts = orderItemCustomizationParts({
      notes: 'tostada',
      extras: ['+ búfala', '- sin cebolla', '- sin cebolla'],
      ingredients: [{ name: 'cebolla', quantity: 'sin' }],
    });
    expect(parts.removed).toEqual(['cebolla']);
    expect(parts.added).toEqual(['búfala']);
    expect(parts.note).toBe('tostada');
  });
});

describe('ticket IVA hostelería', () => {
  it('usa 10% por defecto en ticket cliente', () => {
    const doc = buildTicketDocument({
      business: { name: 'hoypecamos', taxId: 'B34743634734' },
      order: {
        _id: 'o1',
        orderNumber: 'PED-1',
        customerName: 'uriel',
        deliveryType: 'domicilio',
        paymentStatus: 'paid',
        totalAmount: 30.5,
        paidAmount: 30.5,
        items: [{ quantity: 1, name: 'Apericena', total: 15.5 }],
      },
      variant: 'customer',
    });
    expect(doc.vatRate).toBe(10);
    expect(doc.base + doc.vat).toBeCloseTo(30.5, 2);
    // 30.5 / 1.10 ≈ 27.727 base
    expect(doc.base).toBeCloseTo(30.5 / 1.1, 2);
  });
});
