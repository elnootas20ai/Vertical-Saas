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
  it('ticket cliente: efectivo con cambio de calculadora en el método', () => {
    const opts = baseOptions();
    opts.order.changeGiven = 1.5;
    opts.order.amountReceived = 20;
    const doc = buildTicketDocument({ ...opts, variant: 'customer' });
    expect(doc.paymentLabel).toBe('Efectivo (1.50€)');
    const text = decodeEscpos(encodeTicketEscpos(doc));
    expect(text).toMatch(/Metodo: Efectivo \(1\.50EUR\)/);
  });

  it('cocina: nombre + calle arriba, luego pedido/tel/productos + mods + notas, sin importes', () => {
    const doc = buildTicketDocument({ ...baseOptions(), variant: 'kitchen' });
    expect(doc.title).toBe('COMANDA');
    expect(doc.total).toBe(0);
    expect(doc.base).toBe(0);
    expect(doc.customerName).toBe('María García');
    expect(doc.customerPhone).toBe('666123456');
    expect(doc.customerAddress).toBe('Av. Principal 12, 3º');
    expect(doc.lines).toHaveLength(2);
    expect(doc.lines[0].added).toEqual(['Extra queso']);
    expect(doc.lines[0].removed).toEqual(['cebolla']);
    expect(doc.lines[0].note).toBe('Bien hecha');
    expect(doc.orderNotes).toContain('Sin timbre');

    const text = decodeEscpos(encodeTicketEscpos(doc));
    // Nombre y calle los primeros datos útiles (antes de COMANDA / Pedido).
    const nameIdx = text.indexOf('Maria Garcia');
    const addrIdx = text.indexOf('Av. Principal 12');
    const titleIdx = text.indexOf('COMANDA');
    const orderIdx = text.indexOf('Pedido: #1042');
    expect(nameIdx).toBeGreaterThanOrEqual(0);
    expect(addrIdx).toBeGreaterThan(nameIdx);
    expect(titleIdx).toBeGreaterThan(addrIdx);
    expect(orderIdx).toBeGreaterThan(titleIdx);
    expect(text).toContain('Envio a domicilio');
    expect(text).toContain('Tel: 666123456');
    expect(text).toContain('Pago: Efectivo');
    expect(text).toContain('Pizza Margarita');
    expect(text).toContain('1x Pizza Margarita');
    expect(text).toContain('EXTRA queso');
    expect(text).not.toContain('DE MAS');
    expect(text).not.toContain('DE MENOS');
    expect(text).not.toContain('EXTRA DE');
    expect(text).toContain('SIN cebolla');
    expect(text).toContain('cebolla');
    expect(text).toContain('Bien hecha');
    expect(text).toContain('Sin timbre');
    // +2 negrita cocina: ESC E on (0x1b 0x45 0x01) en el buffer.
    const bytes = encodeTicketEscpos(doc);
    expect(bytes).toContain(0x1b);
    let sawBoldOn = false;
    for (let i = 0; i < bytes.length - 2; i += 1) {
      if (bytes[i] === 0x1b && bytes[i + 1] === 0x45 && bytes[i + 2] === 0x01) {
        sawBoldOn = true;
        break;
      }
    }
    expect(sawBoldOn).toBe(true);
    // Color rojo ESC r 1 para mods (impresoras 2 colores; en 1 color se ignora).
    let sawRed = false;
    for (let i = 0; i < bytes.length - 2; i += 1) {
      if (bytes[i] === 0x1b && bytes[i + 1] === 0x72 && bytes[i + 2] === 0x01) {
        sawRed = true;
        break;
      }
    }
    expect(sawRed).toBe(true);
    expect(text).not.toMatch(/TOTAL/);
    expect(text).not.toMatch(/Base imponible/);
    expect(text).not.toMatch(/Atendido:/);
    expect(text).not.toMatch(/NIF\/CIF/);
    expect(text).not.toMatch(/Tienda:/);
    expect(text).not.toMatch(/Cobrado|Pendiente/i);
    expect(doc.paymentLabel).toBe('Efectivo');
    expect(doc.paymentStatusLabel).toBe('');
  });

  it('cocina: muestra Tarjeta cuando el pedido va con tarjeta', () => {
    const opts = baseOptions();
    opts.order.paymentMethod = 'tarjeta';
    const doc = buildTicketDocument({ ...opts, variant: 'kitchen' });
    expect(doc.paymentLabel).toBe('Tarjeta');
    const text = decodeEscpos(encodeTicketEscpos(doc));
    expect(text).toContain('Pago: Tarjeta');
    expect(text).not.toMatch(/TOTAL|Cobrado/i);
  });

  it('reparto: dirección, productos, total y cobro', () => {
    const doc = buildTicketDocument({ ...baseOptions(), variant: 'delivery' });
    expect(doc.title).toBe('REPARTO');
    expect(doc.total).toBe(18.5);
    expect(doc.deliveryTypeLabel).toMatch(/domicilio/i);
    expect(doc.customerPhone).toBe('666123456');
    expect(doc.customerAddress).toContain('Av. Principal');
    expect(doc.paymentLabel).toBe('Efectivo');

    const text = decodeEscpos(encodeTicketEscpos(doc));
    expect(text).toContain('REPARTO');
    expect(text).toContain('Envio a domicilio');
    expect(text).toContain('Dir: Av. Principal');
    expect(text).toContain('666123456');
    expect(text).toContain('TOTAL');
    expect(text).toContain('18.50');
    expect(text).toContain('Metodo: Efectivo');
    expect(text).toContain('Cobrado');
  });

  it('ticket cliente y reparto: metodo aunque el cobro este pendiente', () => {
    const opts = baseOptions();
    opts.order.paymentStatus = 'pending';
    opts.order.paymentMethod = 'tarjeta';
    opts.order.paidAmount = 0;
    const customer = buildTicketDocument({ ...opts, variant: 'customer' });
    const delivery = buildTicketDocument({ ...opts, variant: 'delivery' });
    expect(customer.paymentLabel).toBe('Tarjeta');
    expect(delivery.paymentLabel).toBe('Tarjeta');
    expect(customer.paymentStatusLabel).toBe('Pendiente de cobro');
    expect(decodeEscpos(encodeTicketEscpos(customer))).toContain('Metodo: Tarjeta');
    expect(decodeEscpos(encodeTicketEscpos(delivery))).toContain('Metodo: Tarjeta');
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
    expect(text).toContain('Cliente: Maria');
    expect(text).not.toContain('Garcia');
    expect(text).toContain('Tel: 666123456');
    expect(text).toContain('Dir: Av. Principal');
    expect(text).toContain('Base imponible');
    expect(text).toContain('IVA 10%');
    expect(text).toContain('TOTAL');
    expect(text).toContain('Extra queso');
    expect(text).toContain('Gracias por su visita');
    expect(text).toContain('Atendido: Ana');
  });

  it('ticket/reparto: muestra línea de envío cuando hay deliveryFee', () => {
    const opts = baseOptions();
    opts.order.totalAmount = 20.49;
    opts.order.paidAmount = 0;
    opts.order.paymentStatus = 'pending';
    opts.order.deliveryFee = 1.5;
    opts.order.items = [{ quantity: 1, name: 'Individual', total: 18.99 }];
    const customer = buildTicketDocument({ ...opts, variant: 'customer' });
    expect(customer.lines.some((l) => /envio/i.test(l.name) && l.total === 1.5)).toBe(true);
    expect(customer.total).toBe(20.49);
    const text = decodeEscpos(encodeTicketEscpos(customer));
    expect(text).toContain('Envio a domicilio');
    expect(text).toContain('1.50');
    expect(text).toContain('20.49');

    const kitchen = buildTicketDocument({ ...opts, variant: 'kitchen' });
    expect(kitchen.lines.some((l) => /envio/i.test(l.name))).toBe(false);
  });

  it('ticket: solo nombre de pila, sin apellidos', () => {
    const opts = baseOptions();
    opts.order.customerName = 'María García López';
    opts.cashierName = 'pau royo del amor';
    const doc = buildTicketDocument({ ...opts, variant: 'customer' });
    expect(doc.customerName).toBe('María');
    expect(doc.cashierName).toBe('pau');
    const text = decodeEscpos(encodeTicketEscpos(doc));
    expect(text).toContain('Cliente: Maria');
    expect(text).toContain('Atendido: pau');
    expect(text).not.toMatch(/Garcia|Lopez|royo|amor/i);
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

  it('varios combos iguales: Family #1 / #2 y × de cantidad → x (no ?3)', () => {
    const opts = baseOptions();
    opts.order.items = [
      {
        quantity: 1,
        name: 'Family',
        total: 30,
        extras: [
          '▸ Margarita',
          '+ Extra queso',
          '- sin cebolla',
          '▸ Aquarius Limon ×3',
        ],
      },
      {
        quantity: 1,
        name: 'Family',
        total: 30,
        extras: [
          '▸ Apericena',
          '+ Extra bacon',
          '▸ Aquarius Limon ×4',
        ],
      },
    ];
    const doc = buildTicketDocument({ ...opts, variant: 'kitchen' });
    expect(doc.lines.map((l) => l.name)).toEqual(['Family #1', 'Family #2']);
    expect(doc.lines[0].compositionBlocks?.[0]).toMatchObject({
      label: 'Margarita',
      added: ['Extra queso'],
      removed: ['cebolla'],
    });
    expect(doc.lines[1].compositionBlocks?.[0]).toMatchObject({
      label: 'Apericena',
      added: ['Extra bacon'],
    });
    expect(doc.lines[0].composition?.some((c) => /Aquarius Limon x3/.test(c))).toBe(true);
    expect(doc.lines[1].composition?.some((c) => /Aquarius Limon x4/.test(c))).toBe(true);

    const text = decodeEscpos(encodeTicketEscpos(doc));
    expect(text).toContain('Family #1');
    expect(text).toContain('Family #2');
    expect(text).toContain('Aquarius Limon x3');
    expect(text).toContain('Aquarius Limon x4');
    expect(text).toMatch(/EXTRA queso|Extra queso/i);
    expect(text).toMatch(/EXTRA bacon|Extra bacon/i);
    expect(text).toContain('SIN cebolla');
    expect(text).not.toMatch(/\?3|\?4/);
  });
});
