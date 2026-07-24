/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import {
  countNaturalDays,
  countBusinessDays,
  countVacationRequestDays,
  validateVacationRequestPolicy,
} from '../src/app/lib/vacationsApi.ts';

describe('vacationPolicy (MVP calendario)', () => {
  it('cuenta días naturales inclusive (ES)', () => {
    expect(countNaturalDays('2026-07-01', '2026-07-07')).toBe(7);
    expect(countNaturalDays('2026-07-01', '2026-07-01')).toBe(1);
    expect(countNaturalDays('2026-07-07', '2026-07-01')).toBe(0);
  });

  it('cuenta solo laborables lun–vie', () => {
    // mié 1 jul 2026 → mar 7 jul 2026 = 5 laborables
    expect(countBusinessDays('2026-07-01', '2026-07-07')).toBe(5);
  });

  it('por defecto cuenta naturales si no hay dayBasis business', () => {
    expect(countVacationRequestDays('2026-07-01', '2026-07-07', null)).toBe(7);
    expect(countVacationRequestDays('2026-07-01', '2026-07-07', { dayBasis: 'natural' })).toBe(7);
    expect(countVacationRequestDays('2026-07-01', '2026-07-07', { dayBasis: 'business' })).toBe(5);
  });

  it('rechaza fin antes que inicio', () => {
    const r = validateVacationRequestPolicy('2026-08-10', '2026-08-01', {
      maxConsecutiveDays: 14,
      minNoticeDays: 0,
      onlyWeekdays: false,
    });
    expect(r.ok).toBe(false);
  });

  it('respeta máximo de días seguidos (2 semanas)', () => {
    const ok = validateVacationRequestPolicy('2026-09-01', '2026-09-14', {
      maxConsecutiveDays: 14,
      minNoticeDays: 0,
    });
    expect(ok).toEqual({ ok: true });

    const bad = validateVacationRequestPolicy('2026-09-01', '2026-09-15', {
      maxConsecutiveDays: 14,
      minNoticeDays: 0,
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toMatch(/máximo 14/);
  });

  it('permite sin límite si maxConsecutiveDays es 0', () => {
    const r = validateVacationRequestPolicy('2026-09-01', '2026-09-30', {
      maxConsecutiveDays: 0,
      minNoticeDays: 0,
    });
    expect(r).toEqual({ ok: true });
  });

  it('exige antelación mínima', () => {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const soon = new Date(today);
    soon.setDate(soon.getDate() + 2);
    const iso = soon.toISOString().slice(0, 10);

    const bad = validateVacationRequestPolicy(iso, iso, {
      maxConsecutiveDays: 0,
      minNoticeDays: 7,
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toMatch(/antelación/);
  });

  it('bloquea fines de semana si onlyWeekdays', () => {
    // sáb 4 jul 2026
    const bad = validateVacationRequestPolicy('2026-07-04', '2026-07-04', {
      maxConsecutiveDays: 0,
      minNoticeDays: 0,
      onlyWeekdays: true,
    });
    expect(bad.ok).toBe(false);

    // lun 6 jul 2026
    const ok = validateVacationRequestPolicy('2026-07-06', '2026-07-06', {
      maxConsecutiveDays: 0,
      minNoticeDays: 0,
      onlyWeekdays: true,
    });
    expect(ok).toEqual({ ok: true });
  });
});
