import { describe, expect, it } from 'vitest';
import {
  applyHoursToOpenDays,
  countOpenScheduleDays,
  createBlankBusinessHoursConfig,
  getBusinessHoursIssue,
  hasValidBusinessHoursConfig,
  normalizeBusinessHoursConfig,
  normalizeScheduleTimeValue,
  DEFAULT_BUSINESS_HOURS_CONFIG,
} from '../src/app/lib/businessHoursUtils.ts';
import { weeklyFromOpeningHours } from '../src/app/lib/schedulesApi.ts';

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

  it('getBusinessHoursIssue detecta apertura después del cierre', () => {
    const cfg = normalizeBusinessHoursConfig(DEFAULT_BUSINESS_HOURS_CONFIG);
    cfg.schedule.monday = { open: true, from: '18:00', to: '10:00' };
    expect(getBusinessHoursIssue(cfg)).toMatch(/antes del cierre/i);
  });

  it('acepta horario distinto por día (partido L–V / finde)', () => {
    const cfg = normalizeBusinessHoursConfig(DEFAULT_BUSINESS_HOURS_CONFIG);
    cfg.schedule.monday = { open: true, from: '09:00', to: '14:00' };
    cfg.schedule.tuesday = { open: true, from: '10:00', to: '20:00' };
    cfg.schedule.wednesday = { open: true, from: '09:00', to: '14:00' };
    cfg.schedule.thursday = { open: true, from: '09:00', to: '14:00' };
    cfg.schedule.friday = { open: true, from: '09:00', to: '22:00' };
    cfg.schedule.saturday = { open: true, from: '11:00', to: '15:00' };
    cfg.schedule.sunday = { open: false, from: '11:00', to: '15:00' };
    expect(getBusinessHoursIssue(cfg)).toBeNull();
  });

  it('acepta horario partido (pausa mediodía) con días distintos', () => {
    const cfg = normalizeBusinessHoursConfig(DEFAULT_BUSINESS_HOURS_CONFIG);
    cfg.schedule.monday = { open: true, from: '09:00', to: '22:00' };
    cfg.schedule.saturday = { open: true, from: '10:00', to: '14:00' };
    cfg.lunchBreak = { enabled: true, from: '14:00', to: '17:00' };
    expect(getBusinessHoursIssue(cfg)).toBeNull();
  });

  it('rechaza pausa de horario partido inválida', () => {
    const cfg = normalizeBusinessHoursConfig(DEFAULT_BUSINESS_HOURS_CONFIG);
    cfg.lunchBreak = { enabled: true, from: '17:00', to: '14:00' };
    expect(getBusinessHoursIssue(cfg)).toMatch(/partido/i);
  });

  it('createBlankBusinessHoursConfig obliga a rellenar horas de días abiertos', () => {
    const blank = createBlankBusinessHoursConfig();
    expect(getBusinessHoursIssue(blank)).toMatch(/Lunes/i);
    blank.schedule.monday = { open: true, from: '09:00', to: '14:00' };
    blank.schedule.tuesday = { open: true, from: '09:00', to: '14:00' };
    blank.schedule.wednesday = { open: true, from: '09:00', to: '14:00' };
    blank.schedule.thursday = { open: true, from: '09:00', to: '14:00' };
    blank.schedule.friday = { open: true, from: '09:00', to: '22:00' };
    // Finde cerrado por defecto: L–V distintos ya es válido (sin “aplicar a todos”).
    expect(blank.schedule.saturday.open).toBe(false);
    expect(getBusinessHoursIssue(blank)).toBeNull();
  });

  it('applyHoursToOpenDays solo toca días abiertos', () => {
    const cfg = normalizeBusinessHoursConfig(DEFAULT_BUSINESS_HOURS_CONFIG);
    cfg.schedule.sunday.open = false;
    const next = applyHoursToOpenDays(cfg.schedule, '08:00', '21:00');
    expect(next.monday).toEqual({ open: true, from: '08:00', to: '21:00' });
    expect(next.sunday.open).toBe(false);
    expect(countOpenScheduleDays(next)).toBe(6);
  });

  it('normalizeScheduleTimeValue repara formatos rotos', () => {
    expect(normalizeScheduleTimeValue('7:00')).toBe('07:00');
    expect(normalizeScheduleTimeValue('19:00:00')).toBe('19:00');
    expect(normalizeScheduleTimeValue('9h30')).toBe('09:30');
    expect(normalizeScheduleTimeValue('')).toBe('');
  });

  it('normalizeBusinessHoursConfig repara horas legacy rotas', () => {
    const n = normalizeBusinessHoursConfig({
      timezone: 'Europe/Madrid',
      schedule: {
        monday: { open: true, from: '7:00', to: '19:00:00' },
      },
      holidays: [],
      lunchBreak: DEFAULT_BUSINESS_HOURS_CONFIG.lunchBreak,
    });
    expect(n.schedule.monday.from).toBe('07:00');
    expect(n.schedule.monday.to).toBe('19:00');
  });

  it('weeklyFromOpeningHours usa el horario de tienda como base de turnos', () => {
    const weekly = weeklyFromOpeningHours({
      timezone: 'Europe/Madrid',
      schedule: {
        monday: { open: true, from: '10:00', to: '22:00' },
        tuesday: { open: true, from: '10:00', to: '22:00' },
        wednesday: { open: true, from: '10:00', to: '22:00' },
        thursday: { open: true, from: '10:00', to: '22:00' },
        friday: { open: true, from: '10:00', to: '22:00' },
        saturday: { open: true, from: '11:00', to: '15:00' },
        sunday: { open: false, from: '11:00', to: '15:00' },
      },
      holidays: [],
      lunchBreak: { enabled: false, from: '14:00', to: '16:00' },
    });
    expect(weekly.monday).toMatchObject({ enabled: true, start: '10:00', end: '22:00' });
    expect(weekly.saturday).toMatchObject({ enabled: true, start: '11:00', end: '15:00' });
    expect(weekly.sunday.enabled).toBe(false);
  });
});
