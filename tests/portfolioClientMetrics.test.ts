import { describe, expect, it } from 'vitest';
import { computePortfolioClientMetrics } from '../src/app/lib/portfolioMetrics';
import { localCalendarDayKey } from '../src/app/lib/tpvCajaScope';

describe('computePortfolioClientMetrics', () => {
  it('suma un alta TPV de hoy en clientes nuevos del mes', () => {
    const monthKey = localCalendarDayKey().slice(0, 7);
    const todayIso = new Date().toISOString();
    const metrics = computePortfolioClientMetrics(
      [
        { createdAt: todayIso, stats: { createdFrom: 'tpv', acquisitionKind: 'organic' } },
        { createdAt: '2024-01-15T12:00:00.000Z', stats: { createdFrom: 'crm' } },
        { createdAt: '', stats: { createdFrom: 'import' } },
        { createdAt: todayIso, stats: { acquisitionKind: 'migration', excludeFromNewMetrics: true } },
      ],
      monthKey,
    );
    expect(metrics.totalClients).toBe(4);
    expect(metrics.newClientsMonth).toBe(1);
  });

  it('no cuenta createdAt vacío como alta del mes', () => {
    const monthKey = localCalendarDayKey().slice(0, 7);
    const metrics = computePortfolioClientMetrics(
      [
        { createdAt: '', stats: { createdFrom: 'crm' } },
        { stats: { createdFrom: 'crm' } },
      ],
      monthKey,
    );
    expect(metrics.newClientsMonth).toBe(0);
    expect(metrics.totalClients).toBe(2);
  });
});
