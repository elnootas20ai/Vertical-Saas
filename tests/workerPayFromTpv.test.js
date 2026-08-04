import { describe, expect, it } from 'vitest';
import {
  buildWorkerPayMonthSummary,
  isTpvWorkerPayTx,
  workerNameFromPayDescription,
} from '../src/app/verticals/delivery/workerPayFromTpv.ts';

describe('workerPayFromTpv', () => {
  it('detecta salidas pago trabajador', () => {
    expect(isTpvWorkerPayTx({ type: 'cash_out', description: 'Pago trabajador · Ana' })).toBe(true);
    expect(isTpvWorkerPayTx({ type: 'cash_out', description: 'Compra material' })).toBe(false);
    expect(isTpvWorkerPayTx({ type: 'cash_in', description: 'Pago trabajador · Ana' })).toBe(false);
  });

  it('parsea nombre de la descripción', () => {
    expect(workerNameFromPayDescription('Pago trabajador · Ana López · anticipo')).toBe('Ana López');
    expect(workerNameFromPayDescription('Pago trabajador · Pedro')).toBe('Pedro');
  });

  it('agrega pagos del mes por trabajador y descuentos nómina', () => {
    const summary = buildWorkerPayMonthSummary(
      [
        {
          _id: 's1',
          pointOfSaleName: 'TEST1',
          transactions: [
            {
              id: 't1',
              type: 'cash_out',
              paymentMethod: 'efectivo',
              amount: 50,
              description: 'Pago trabajador · Ana',
              workerId: 'u1',
              workerName: 'Ana',
              date: '2026-08-02T10:00:00.000Z',
            },
            {
              id: 't2',
              type: 'cash_out',
              paymentMethod: 'efectivo',
              amount: 20,
              description: 'Pago trabajador · Ana · semana',
              workerId: 'u1',
              workerName: 'Ana',
              date: '2026-08-03T12:00:00.000Z',
            },
            {
              id: 't3',
              type: 'cash_out',
              paymentMethod: 'efectivo',
              amount: 30,
              description: 'Otro motivo',
              date: '2026-08-03T13:00:00.000Z',
            },
            {
              id: 't4',
              type: 'cash_out',
              paymentMethod: 'efectivo',
              amount: 10,
              description: 'Pago trabajador · Ana',
              workerId: 'u1',
              workerName: 'Ana',
              date: '2026-07-20T10:00:00.000Z',
            },
          ],
        },
      ],
      '2026-08',
      [
        {
          paymentMode: 'payroll_deduction',
          workerId: 'u1',
          workerName: 'Ana',
          total: 8,
          createdAt: '2026-08-04T09:00:00.000Z',
        },
      ],
    );

    expect(summary.paidTotal).toBe(70);
    expect(summary.payCount).toBe(2);
    expect(summary.payrollDeductionTotal).toBe(8);
    expect(summary.netAdvanced).toBe(62);
    expect(summary.byWorker).toHaveLength(1);
    expect(summary.byWorker[0].workerName).toBe('Ana');
    expect(summary.byWorker[0].paidTotal).toBe(70);
    expect(summary.byWorker[0].netAdvanced).toBe(62);
  });
});
