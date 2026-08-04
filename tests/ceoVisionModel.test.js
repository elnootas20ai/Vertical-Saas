import { describe, expect, it } from 'vitest';
import {
  computeRiskScore,
  healthFromRisk,
  ceoIsoWeekKey,
} from '../src/app/components/saas/portfolio/ceo/ceoVisionModel.ts';

describe('ceoVisionModel', () => {
  it('computeRiskScore sube con alertas críticas', () => {
    const low = computeRiskScore({
      alertsHigh: 0,
      alertsUnresolved: 0,
      scheduleAlerts: 0,
      mom: 5,
      pending: 0,
      income: 10000,
      openCash: 0,
    });
    const high = computeRiskScore({
      alertsHigh: 2,
      alertsUnresolved: 5,
      scheduleAlerts: 3,
      mom: -20,
      pending: 4000,
      income: 10000,
      openCash: 3,
    });
    expect(low).toBeLessThan(20);
    expect(high).toBeGreaterThan(60);
  });

  it('healthFromRisk mapea tonos', () => {
    expect(healthFromRisk(10, 0)).toBe('stable');
    expect(healthFromRisk(40, 0)).toBe('attention');
    expect(healthFromRisk(70, 0)).toBe('critical');
    expect(healthFromRisk(10, 2)).toBe('critical');
  });

  it('ceoIsoWeekKey formato', () => {
    expect(ceoIsoWeekKey(new Date('2026-08-04T12:00:00'))).toMatch(/^\d{4}-W\d{2}$/);
  });
});
