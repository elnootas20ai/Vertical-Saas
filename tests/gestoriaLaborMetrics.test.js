import { describe, expect, it } from 'vitest';
import {
  buildGestoriaHubSnapshot,
  isTaxModelDocument,
} from '../src/app/lib/gestoriaLaborMetrics.ts';

describe('gestoriaLaborMetrics', () => {
  it('calcula KPIs de equipo y docs laborales', () => {
    const snap = buildGestoriaHubSnapshot({
      workers: [
        {
          user_id: 'w1',
          fullName: 'Ana',
          personalData: { dni: '12345678Z', birthDate: '1990-01-01', address: 'Calle 1', city: 'Madrid' },
          employment: { bankAccount: 'ES00' },
          workerIdentityCompleted: true,
        },
        {
          user_id: 'w2',
          fullName: 'Luis',
          personalData: {},
          employment: {},
        },
      ],
      payrollDocs: [
        {
          _id: 'p1',
          type: 'payroll',
          id: 'p1',
          worker_id: 'w1',
          worker_name: 'Ana',
          documentType: 'nomina',
          name: 'Nómina',
          period: '2026-08',
          uploadedBy: 'ceo',
          createdAt: '2026-08-01T10:00:00.000Z',
          updatedAt: '2026-08-01T10:00:00.000Z',
        },
        {
          _id: 'p2',
          type: 'payroll',
          id: 'p2',
          worker_id: 'w1',
          worker_name: 'Ana',
          documentType: 'dni_nie',
          name: 'DNI',
          uploadedBy: 'w1',
          createdAt: '2026-08-01T10:00:00.000Z',
          updatedAt: '2026-08-01T10:00:00.000Z',
        },
      ],
      taxModelsCount: 3,
      today: new Date('2026-08-15T12:00:00.000Z'),
    });

    expect(snap.totalWorkers).toBe(2);
    expect(snap.payslipsThisMonth).toBe(1);
    expect(snap.missingIdentityScanCount).toBe(1);
    expect(snap.taxModelsCount).toBe(3);
    expect(snap.workers.find((w) => w.user_id === 'w1')?.hasIdentityScan).toBe(true);
    expect(snap.workers.find((w) => w.user_id === 'w2')?.missingLabels.length).toBeGreaterThan(0);
  });

  it('detecta modelos de impuestos por nombre/tipo', () => {
    expect(isTaxModelDocument({ docType: 'financial' })).toBe(true);
    expect(isTaxModelDocument({ name: 'Modelo 303 2T 2026' })).toBe(true);
    expect(isTaxModelDocument({ name: 'Contrato alquiler' })).toBe(false);
  });
});
