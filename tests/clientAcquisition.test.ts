import { describe, expect, it } from 'vitest';
import {
  countsTowardNewClientMetrics,
  isMigrationClient,
  suggestClientImportAcquisitionKind,
} from '../src/app/lib/clientAcquisition';
import { computePortfolioClientMetrics } from '../src/app/lib/portfolioMetrics';

describe('clientAcquisition', () => {
  it('sugiere migración en el wizard Excel a partir de 500 filas', () => {
    expect(suggestClientImportAcquisitionKind(499)).toBe('organic');
    expect(suggestClientImportAcquisitionKind(500)).toBe('migration');
    expect(suggestClientImportAcquisitionKind(7000)).toBe('migration');
  });

  it('solo trata como migración el flag explícito (no el volumen del día)', () => {
    expect(isMigrationClient({ stats: { acquisitionKind: 'migration' } })).toBe(true);
    expect(isMigrationClient({ stats: { excludeFromNewMetrics: true } })).toBe(true);
    expect(isMigrationClient({ stats: { acquisitionKind: 'organic', createdFrom: 'import' } })).toBe(false);
    expect(isMigrationClient({ stats: { createdFrom: 'import' } })).toBe(false);
    expect(isMigrationClient({})).toBe(false);
    // 500 altas el mismo día sin flag → cuentan como nuevos
    expect(countsTowardNewClientMetrics({ createdAt: '2026-07-10T10:00:00.000Z' })).toBe(true);
  });
});

describe('computePortfolioClientMetrics + migración', () => {
  it('no cuenta migraciones marcadas; sí cuenta altas sin flag aunque sean muchas', () => {
    const monthKey = '2026-07';
    const bulkUnmarked = Array.from({ length: 500 }, (_, i) => ({
      createdAt: `2026-07-10T12:${String(i % 60).padStart(2, '0')}:00.000Z`,
    }));
    const flagged = [
      { createdAt: '2026-07-10T11:00:00.000Z', stats: { acquisitionKind: 'migration' as const } },
      { createdAt: '2026-07-11T09:00:00.000Z', stats: { acquisitionKind: 'organic' as const } },
      { createdAt: '2026-06-15T10:00:00.000Z', stats: { acquisitionKind: 'organic' as const } },
    ];
    const m = computePortfolioClientMetrics([...bulkUnmarked, ...flagged], monthKey);
    expect(m.totalClients).toBe(503);
    expect(m.newClientsMonth).toBe(501); // 500 sin flag + 1 organic; migration excluida
    expect(m.newClientsPrevMonth).toBe(1);
  });
});
