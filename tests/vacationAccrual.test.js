import { describe, expect, it } from 'vitest';
import {
  computeAccruedVacationDays,
  countAccrualMonthsInYear,
  computeVacationBalance,
} from '../src/app/lib/vacationAccrual.ts';

describe('vacationAccrual', () => {
  it('cuenta meses fraccionados desde el alta', () => {
    expect(countAccrualMonthsInYear('2026-01-01', undefined, 2026, new Date('2026-06-30T12:00:00'))).toBe(6);
    const janPartial = countAccrualMonthsInYear('2026-01-15', undefined, 2026, new Date('2026-01-31T12:00:00'));
    expect(janPartial).toBeGreaterThan(0.5);
    expect(janPartial).toBeLessThan(0.6);
  });

  it('devenga ~2 días por mes en modo monthly', () => {
    const settings = {
      defaultDaysPerYear: 24,
      accrualMode: 'monthly',
      daysPerMonth: 2,
      allowances: {},
    };
    const accrued = computeAccruedVacationDays(settings, 'u1', {
      startDate: '2026-01-01',
      year: 2026,
      asOf: '2026-06-30',
    });
    expect(accrued).toBe(12);
  });

  it('respeta cupo anual máximo', () => {
    const settings = {
      defaultDaysPerYear: 22,
      accrualMode: 'monthly',
      daysPerMonth: 2,
      allowances: {},
    };
    const accrued = computeAccruedVacationDays(settings, 'u1', {
      startDate: '2026-01-01',
      year: 2026,
      asOf: '2026-12-31',
    });
    expect(accrued).toBe(22);
  });

  it('allowance manual ignora accrual', () => {
    const settings = {
      defaultDaysPerYear: 22,
      accrualMode: 'monthly',
      daysPerMonth: 2,
      allowances: { u1: 30 },
    };
    expect(computeAccruedVacationDays(settings, 'u1', { startDate: '2026-01-01', year: 2026, asOf: '2026-03-01' })).toBe(30);
  });

  it('calcula saldo remaining = accrued - used', () => {
    const bal = computeVacationBalance(
      { defaultDaysPerYear: 22, accrualMode: 'monthly', daysPerMonth: 2, allowances: {} },
      'u1',
      4,
      1,
      { startDate: '2026-01-01', year: 2026, asOf: '2026-06-30' },
    );
    expect(bal.accrued).toBe(12);
    expect(bal.used).toBe(4);
    expect(bal.pending).toBe(1);
    expect(bal.remaining).toBe(8);
  });

  it('modo annual_fixed da el cupo entero', () => {
    expect(
      computeAccruedVacationDays(
        { defaultDaysPerYear: 22, accrualMode: 'annual_fixed', allowances: {} },
        'u1',
        { startDate: '2026-06-01', year: 2026, asOf: '2026-06-15' },
      ),
    ).toBe(22);
  });
});
