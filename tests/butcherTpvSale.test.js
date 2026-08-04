import { describe, it, expect } from 'vitest';
import {
  mapButcherTpvLinesToSaleItems,
  butcherTpvLinesTotalWeightKg,
  mapTpvPaymentToButcher,
} from '../src/app/lib/butcherTpvSale.ts';
import { buildButcherCajaZCsv } from '../src/app/lib/butcherCajaZExport.ts';

describe('butcher TPV sale mapping', () => {
  it('mapea kg y gramos a quantity en kg', () => {
    const items = mapButcherTpvLinesToSaleItems([
      {
        productoId: 'p1',
        nombre: 'Entrecot',
        cantidad: 500,
        unidad: 'gramos',
        cantidadKg: 0.5,
        precioUnitario: 20,
        subtotal: 10,
      },
      {
        productoId: 'p2',
        nombre: 'Chorizo',
        cantidad: 2,
        unidad: 'unidades',
        cantidadKg: 0,
        precioUnitario: 3,
        subtotal: 6,
      },
    ]);
    expect(items[0].quantity).toBe(0.5);
    expect(items[0].unit).toBe('kg');
    expect(items[1].quantity).toBe(2);
    expect(items[1].unit).toBe('ud');
  });

  it('totalWeight solo suma peso', () => {
    const w = butcherTpvLinesTotalWeightKg([
      { nombre: 'A', cantidad: 1, unidad: 'kg', cantidadKg: 1.2, precioUnitario: 1, subtotal: 1.2 },
      { nombre: 'B', cantidad: 3, unidad: 'unidades', cantidadKg: 0, precioUnitario: 1, subtotal: 3 },
    ]);
    expect(w).toBe(1.2);
  });

  it('mapa de pago', () => {
    expect(mapTpvPaymentToButcher('efectivo')).toBe('cash');
    expect(mapTpvPaymentToButcher('tarjeta')).toBe('card');
    expect(mapTpvPaymentToButcher('bizum')).toBe('bizum');
  });
});

describe('butcher caja Z csv', () => {
  it('incluye totales y métodos', () => {
    const csv = buildButcherCajaZCsv({
      _id: 'sess-1',
      type: 'tpv_register_session',
      id: 'sess-1',
      user_id: 'u1',
      pointOfSaleId: 'pdv1',
      pointOfSaleName: 'Mostrador',
      terminalId: 't1',
      terminalName: 'T1',
      workerId: 'w',
      workerName: 'Ana',
      datafonId: '',
      datafonName: '',
      printerId: '',
      printerName: '',
      status: 'closed',
      openedAt: '2026-08-03T08:00:00.000Z',
      openedBy: 'Ana',
      openingCashCount: {},
      initialCashAmount: 100,
      transactions: [
        {
          id: 'tx1',
          type: 'sale',
          paymentMethod: 'efectivo',
          amount: 25.5,
          description: 'TK-1',
          date: '2026-08-03T09:00:00.000Z',
        },
        {
          id: 'tx2',
          type: 'sale',
          paymentMethod: 'tarjeta',
          amount: 10,
          description: 'TK-2',
          date: '2026-08-03T10:00:00.000Z',
        },
      ],
      cashCounts: [],
      closedAt: '2026-08-03T22:00:00.000Z',
      closedBy: 'Ana',
      closingCashCount: { actualCash: 125.5, expectedCash: 125.5, difference: 0 },
      finalCashAmount: 125.5,
      expectedCash: 125.5,
      difference: 0,
      closingNotes: '',
    }, { businessName: 'Carnicería Test' });

    expect(csv).toContain('Cierre Z carnicería');
    expect(csv).toContain('Mostrador');
    expect(csv).toContain('efectivo');
    expect(csv).toContain('25.50');
  });
});
