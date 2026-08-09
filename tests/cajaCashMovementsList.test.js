import { describe, expect, it } from 'vitest';
import { partitionCajaCashMovements } from '../src/app/components/saas/caja/CajaCashMovementsList.tsx';

describe('partitionCajaCashMovements', () => {
  it('separa entradas, salidas y devoluciones con totales', () => {
    const data = partitionCajaCashMovements({
      status: 'open',
      openedAt: '2026-08-09T08:00:00.000Z',
      transactions: [
        {
          id: '1',
          type: 'cash_in',
          paymentMethod: 'efectivo',
          amount: 20,
          description: 'Liquidación repartidor',
          date: '2026-08-09T10:00:00.000Z',
        },
        {
          id: '2',
          type: 'cash_out',
          paymentMethod: 'efectivo',
          amount: 5,
          description: 'Pago trabajador · Ana',
          date: '2026-08-09T11:00:00.000Z',
        },
        {
          id: '3',
          type: 'expense',
          paymentMethod: 'efectivo',
          amount: 3,
          description: 'Gasto legado',
          date: '2026-08-09T11:30:00.000Z',
        },
        {
          id: '4',
          type: 'return',
          paymentMethod: 'efectivo',
          amount: 8,
          description: 'Devolución pedido',
          date: '2026-08-09T12:00:00.000Z',
        },
        {
          id: '5',
          type: 'sale',
          paymentMethod: 'tarjeta',
          amount: 40,
          description: 'Venta',
          date: '2026-08-09T12:30:00.000Z',
        },
      ],
      voidedCashMovements: [
        {
          id: 'v1',
          originalTransactionId: 'x',
          type: 'cash_out',
          amount: 2,
          originalDescription: 'Salida fallida',
          voidReason: 'Error',
          voidedAt: '2026-08-09T13:00:00.000Z',
          originalDate: '2026-08-09T09:00:00.000Z',
        },
      ],
    });

    expect(data.entradas).toHaveLength(1);
    expect(data.salidas).toHaveLength(2);
    expect(data.devoluciones).toHaveLength(1);
    expect(data.voidedOut).toHaveLength(1);
    expect(data.totalIn).toBe(20);
    expect(data.totalOut).toBe(8);
    expect(data.totalReturn).toBe(8);
    expect(data.isEmpty).toBe(false);
  });
});
