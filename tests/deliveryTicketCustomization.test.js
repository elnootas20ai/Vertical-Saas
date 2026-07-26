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
    expect(parts.composition).toEqual([]);
    expect(parts.note).toBe('tostada');
  });

  it('incluye composición del menú/combo (▸) y mitades (½)', () => {
    const parts = orderItemCustomizationParts({
      extras: [
        '▸ Margarita',
        '▸ Patatas',
        '▸ Coca Cola',
        '+ Extra queso',
        '- sin cebolla',
        '½ Diávola',
        '½ Barbacoa',
      ],
    });
    expect(parts.composition).toEqual([
      'Margarita',
      'Patatas',
      'Coca Cola',
      '1/2 Diávola',
      '1/2 Barbacoa',
    ]);
    expect(parts.added).toEqual(['Extra queso']);
    expect(parts.removed).toEqual(['cebolla']);
  });
});

describe('ticket cocina — todos los productos: notas y detalle', () => {
  function kitchenDoc(items, orderNotes = '') {
    return buildTicketDocument({
      business: { name: 'hoypecamos', taxId: 'B67284315' },
      order: {
        _id: 'o-kit',
        orderNumber: 'PED-K',
        customerName: 'cli',
        deliveryType: 'recogida',
        paymentStatus: 'pending',
        totalAmount: 40,
        notes: orderNotes || undefined,
        items,
      },
      variant: 'kitchen',
    });
  }

  it('producto simple: nota de línea + nota de pedido', () => {
    const doc = kitchenDoc(
      [{ quantity: 1, name: 'Margarita', total: 10, notes: 'poco hecha', extras: [] }],
      'llamar al llegar',
    );
    expect(doc.lines[0].note).toBe('poco hecha');
    expect(doc.lines[0].composition).toBeUndefined();
    expect(doc.orderNotes).toBe('llamar al llegar');
  });

  it('producto con extras y sin: +/− y nota', () => {
    const doc = kitchenDoc([
      {
        quantity: 2,
        name: 'Diávola',
        total: 24,
        notes: 'cortar',
        extras: ['+ Extra queso', '- sin cebolla'],
        ingredients: [{ name: 'cebolla', quantity: 'sin' }],
      },
    ]);
    expect(doc.lines[0].added).toEqual(['Extra queso']);
    expect(doc.lines[0].removed).toEqual(['cebolla']);
    expect(doc.lines[0].note).toBe('cortar');
  });

  it('combo: composición + extras + nota de componente + nota de línea', () => {
    const doc = kitchenDoc([
      {
        quantity: 1,
        name: 'Menú Individual',
        total: 18,
        notes: 'sin picante',
        extras: [
          '▸ Margarita',
          '▸ Tequeños',
          '▸ Agua',
          '+ Extra bacon',
          '- sin orégano',
          '· bien caliente',
        ],
      },
    ]);
    expect(doc.lines[0].composition).toEqual([
      'Margarita',
      'Tequeños',
      'Agua',
      'Nota: bien caliente',
    ]);
    expect(doc.lines[0].added).toEqual(['Extra bacon']);
    expect(doc.lines[0].removed).toEqual(['orégano']);
    expect(doc.lines[0].note).toBe('sin picante');
  });

  it('mitad y mitad: 1/2 + extras', () => {
    const doc = kitchenDoc([
      {
        quantity: 1,
        name: 'Pizza mitad',
        total: 14,
        extras: ['½ Diávola', '½ Barbacoa', '+ Extra mozzarella'],
      },
    ]);
    expect(doc.lines[0].composition).toEqual(['1/2 Diávola', '1/2 Barbacoa']);
    expect(doc.lines[0].added).toEqual(['Extra mozzarella']);
  });

  it('varios productos en el mismo pedido: cada uno conserva su detalle', () => {
    const doc = kitchenDoc([
      { quantity: 1, name: 'Agua', total: 2, notes: 'fria' },
      {
        quantity: 1,
        name: 'Menú Dúo',
        total: 22,
        extras: ['▸ Pepperoni', '▸ Margarita', '▸ Patatas', '▸ Coca'],
      },
      {
        quantity: 1,
        name: 'Burger',
        total: 11,
        notes: 'punto medio',
        extras: ['- sin pepinillo', '+ Extra cheddar'],
      },
    ]);
    expect(doc.lines).toHaveLength(3);
    expect(doc.lines[0].note).toBe('fria');
    expect(doc.lines[1].composition).toEqual(['Pepperoni', 'Margarita', 'Patatas', 'Coca']);
    expect(doc.lines[2].note).toBe('punto medio');
    expect(doc.lines[2].added).toEqual(['Extra cheddar']);
    expect(doc.lines[2].removed).toEqual(['pepinillo']);
  });
});

describe('shouldPrintCustomerTicketOnDispatch', () => {
  it('imprime domicilio y sin tipo; no recogida ni sala', async () => {
    const { shouldPrintCustomerTicketOnDispatch } = await import(
      '../src/app/lib/deliveryTicketHelpers.ts'
    );
    expect(shouldPrintCustomerTicketOnDispatch({ deliveryType: 'domicilio' })).toBe(true);
    expect(shouldPrintCustomerTicketOnDispatch({})).toBe(true);
    expect(shouldPrintCustomerTicketOnDispatch({ deliveryType: 'recogida' })).toBe(false);
    expect(shouldPrintCustomerTicketOnDispatch({ deliveryType: 'sala' })).toBe(false);
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
    expect(doc.base).toBeCloseTo(30.5 / 1.1, 2);
  });
});
