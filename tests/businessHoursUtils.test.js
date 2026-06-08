import { describe, expect, it } from 'vitest';
import {
  applyHoursToOpenDays,
  countOpenScheduleDays,
  getBusinessHoursIssue,
  hasValidBusinessHoursConfig,
  normalizeBusinessHoursConfig,
  DEFAULT_BUSINESS_HOURS_CONFIG,
} from '../src/app/lib/businessHoursUtils.ts';

describe('businessHoursUtils', () => {
  it('normalizeBusinessHoursConfig rellena schedule incompleto', () => {
    const raw = {
      timezone: 'Europe/Madrid',
      schedule: { monday: { open: true, from: '10:00', to: '20:00' } },
      holidays: [],
      lunchBreak: DEFAULT_BUSINESS_HOURS_CONFIG.lunchBreak,
    };
    const n = normalizeBusinessHoursConfig(raw);
    expect(n.schedule.monday).toEqual({ open: true, from: '10:00', to: '20:00' });
    expect(n.schedule.tuesday.open).toBe(true);
    expect(n.schedule.sunday.open).toBe(false);
  });

  it('getBusinessHoursIssue detecta sin días abiertos', () => {
    const cfg = normalizeBusinessHoursConfig(DEFAULT_BUSINESS_HOURS_CONFIG);
    for (const day of Object.keys(cfg.schedule)) {
      cfg.schedule[day].open = false;
    }
    expect(getBusinessHoursIssue(cfg)).toMatch(/al menos un día/i);
    expect(hasValidBusinessHoursConfig(cfg)).toBe(false);
  });

  it('getBusinessHoursIssue detecta misma hora apertura y cierre', () => {
    const cfg = normalizeBusinessHoursConfig(DEFAULT_BUSINESS_HOURS_CONFIG);
    cfg.schedule.monday = { open: true, from: '09:00', to: '09:00' };
    expect(getBusinessHoursIssue(cfg)).toMatch(/Lunes/i);
  });

  it('applyHoursToOpenDays solo toca días abiertos', () => {
    const cfg = normalizeBusinessHoursConfig(DEFAULT_BUSINESS_HOURS_CONFIG);
    cfg.schedule.sunday.open = false;
    const next = applyHoursToOpenDays(cfg.schedule, '08:00', '21:00');
    expect(next.monday).toEqual({ open: true, from: '08:00', to: '21:00' });
    expect(next.sunday.open).toBe(false);
    expect(countOpenScheduleDays(next)).toBe(6);
  });
});
