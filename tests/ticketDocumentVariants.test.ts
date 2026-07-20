import { describe, expect, it } from 'vitest';
import { buildTicketDocument } from '../src/app/lib/vertialPrint/ticketDocument';
import { encodeTicketEscpos, sanitizeEscposText } from '../src/app/lib/vertialPrint/escposEncode';
import type { DeliveryTicketPrintOptions } from '../src/app/lib/deliveryTicketTypes';

const baseOptions = (): DeliveryTicketPrintOptions => ({
  business: {
    name: 'Modomio',
    legalName: 'Modomio SL',
    taxId: 'B12345678',
    address: 'Calle Test 1',
    city: 'Badalona',
    phone: '930000000',
  },
  salesPointName: 'Local Centro',
  cashierName: 'Ana',
  order: {
    _id: 'order-1',
    orderNumber: '1042',
    ticketNumber: 'T-1042',
    customerName: 'María García',
    customerPhone: '666123456',
    customerAddress: 'Av. Principal 12, 3º',
    deliveryType: 'domicilio',
    paymentMethod: 'efectivo',
    paymentStatus: 'paid',
    totalAmount: 18.5,
    paidAmount: 18.5,
    paidAt: '2026-07-17T12:00:00.000Z',
    notes: 'Sin timbre, llamar',
    items: [
      {
        quantity: 1,
        name: 'Pizza Margarita',
        total: 12,
        notes: 'Bien hecha',
        extras: ['+ Extra queso'],
        ingredients: [{ name: 'cebolla', quantity: 'sin' }],
      },
      {
        quantity: 2,
        name: 'Coca-Cola',
        total: 6.5,
      },
    ],
  },
});

function decodeEscpos(bytes: Uint8Array): string {
  return sanitizeEscposText(String.fromCharCode(...bytes));
}

describe('ticket variants — botones Cocina / Reparto / Ticket cliente', () => {
  it('cocina: productos + mods + notas, sin importes', () => {
    const doc = buildTicketDocument({ ...baseOptions(), variant: 'kitchen' });
    expect(doc.title).toBe('COMANDA');
    expect(doc.total).toBe(0);
    expect(doc.base).toBe(0);
    expect(doc.lines).toHaveLength(2);
    expect(doc.lines[0].added).toEqual(['Extra queso']);
    expect(doc.lines[0].removed).toEqual(['cebolla']);
    expect(doc.lines[0].note).toBe('Bien hecha');
    expect(doc.orderNotes).toContain('Sin timbre');
    expect(doc.customerAddress).toContain('Av. Principal');

    const text = decodeEscpos(encodeTicketEscpos(doc));
    expect(text).toContain('COMANDA');
    expect(text).toContain('Pizza Margarita');
    expect(text).toContain('Extra queso');
    expect(text).toContain('SIN cebolla');
    expect(text).toContain('Bien hecha');
    expect(text).not.toMatch(/TOTAL/);
    expect(text).not.toMatch(/Base imponible/);
  });

  it('reparto: dirección, productos, total y cobro', () => {
    const doc = buildTicketDocument({ ...baseOptions(), variant: 'delivery' });
    expect(doc.title).toBe('REPARTO');
    expect(doc.total).toBe(18.5);
    expect(doc.deliveryTypeLabel).toMatch(/domicilio/i);
    expect(doc.customerPhone).toBe('666123456');
    expect(doc.customerAddress).toContain('Av. Principal');

    const text = decodeEscpos(encodeTicketEscpos(doc));
    expect(text).toContain('REPARTO');
    expect(text).toContain('Envio a domicilio');
    expect(text).toContain('Dir: Av. Principal');
    expect(text).toContain('666123456');
    expect(text).toContain('TOTAL');
    expect(text).toContain('18.50');
    expect(text).toContain('Cobrado');
  });

  it('ticket cliente: IVA, total, mods, teléfono y dirección', () => {
    const doc = buildTicketDocument({ ...baseOptions(), variant: 'customer' });
    expect(doc.title).toBe('TICKET');
    expect(doc.total).toBe(18.5);
    expect(doc.vat).toBeGreaterThan(0);
    expect(doc.base).toBeGreaterThan(0);
    expect(doc.paymentLabel.toLowerCase()).toContain('efectivo');
    expect(doc.emphasizeCustomerAddress).toBe(true);

    const text = decodeEscpos(encodeTicketEscpos(doc));
    expect(text).toContain('TICKET');
    expect(text).toContain('Cliente: Maria Garcia');
    expect(text).toContain('Tel: 666123456');
    expect(text).toContain('Dir: Av. Principal');
    expect(text).toContain('Base imponible');
    expect(text).toContain('IVA 21%');
    expect(text).toContain('TOTAL');
    expect(text).toContain('Extra queso');
    expect(text).toContain('Gracias por su visita');
  });

  it('recogida: no imprime calle del cliente', () => {
    const opts = baseOptions();
    opts.order.deliveryType = 'recogida';
    const doc = buildTicketDocument({ ...opts, variant: 'customer' });
    expect(doc.customerAddress).toBe('');
    expect(doc.emphasizeCustomerAddress).toBe(false);
    expect(doc.deliveryTypeLabel).toMatch(/recogida/i);

    const text = decodeEscpos(encodeTicketEscpos(doc));
    expect(text).toContain('Recogida en local');
    expect(text).not.toContain('Dir:');
    expect(text).not.toContain('Av. Principal');
  });

  it('DISARMINK / Pau: issuer del ticket es hoypecamos', () => {
    const opts = baseOptions();
    opts.business = {
      name: 'DISARMINK SL',
      legalName: 'disarmink sl',
      taxId: 'B67284315',
    };
    const doc = buildTicketDocument({ ...opts, variant: 'customer' });
    expect(doc.issuer).toBe('hoypecamos');
    const text = decodeEscpos(encodeTicketEscpos(doc));
    expect(text).toContain('hoypecamos');
    expect(text).not.toMatch(/disarmink/i);
  });

  it('no trunca nombres largos: envuelve en varias lineas', () => {
    const opts = baseOptions();
    const longName =
      'Hamburguesa gourmet doble carne con queso cheddar bacon y salsa especial de la casa';
    opts.order.items = [{ quantity: 1, name: longName, total: 14.5 }];
    const text = decodeEscpos(encodeTicketEscpos(buildTicketDocument({ ...opts, variant: 'customer' })));
    expect(text).toContain('Hamburguesa gourmet');
    expect(text).toContain('salsa especial');
    expect(text).toContain('14.50');
  });

  it('omite lineas vacias o cantidad 0', () => {
    const opts = baseOptions();
    opts.order.items = [
      { quantity: 0, name: 'Basura', total: 0 },
      { quantity: 1, name: '  ', total: 1 },
      { quantity: 1, name: 'OK', total: 5 },
    ];
    const doc = buildTicketDocument({ ...opts, variant: 'customer' });
    expect(doc.lines).toHaveLength(1);
    expect(doc.lines[0].name).toBe('OK');
  });
});
