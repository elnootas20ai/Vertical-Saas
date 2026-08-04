import { describe, expect, it } from 'vitest';
import {
  computeAccruedVacationDays,
  countAccrualMonthsInYear,
  computeVacationBalance,
  resolveFteFactor,
  resolveWeeklyContractHours,
} from '../src/app/lib/vacationAccrual.ts';

/** Jornada completa por defecto en tests (40 h → 100 %). */
const FULL = { contract: { hoursPerWeek: 40, workday: 'completa' } };

describe('vacationAccrual', () => {
  it('cuenta meses fraccionados desde el alta', () => {
    expect(countAccrualMonthsInYear('2026-01-01', undefined, 2026, new Date('2026-06-30T12:00:00'))).toBe(6);
    const janPartial = countAccrualMonthsInYear('2026-01-15', undefined, 2026, new Date('2026-01-31T12:00:00'));
    expect(janPartial).toBeGreaterThan(0.5);
    expect(janPartial).toBeLessThan(0.6);
  });

  it('devenga ~2 días por mes en modo monthly (40 h)', () => {
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
      ...FULL,
    });
    expect(accrued).toBe(12);
  });

  it('respeta cupo anual máximo (40 h)', () => {
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
      ...FULL,
    });
    expect(accrued).toBe(22);
  });

  it('allowance manual ignora accrual y prorrata', () => {
    const settings = {
      defaultDaysPerYear: 22,
      accrualMode: 'monthly',
      daysPerMonth: 2,
      allowances: { u1: 30 },
    };
    expect(
      computeAccruedVacationDays(settings, 'u1', {
        startDate: '2026-01-01',
        year: 2026,
        asOf: '2026-03-01',
        contract: { hoursPerWeek: 20 },
      }),
    ).toBe(30);
  });

  it('calcula saldo remaining = accrued - used', () => {
    const bal = computeVacationBalance(
      { defaultDaysPerYear: 22, accrualMode: 'monthly', daysPerMonth: 2, allowances: {} },
      'u1',
      4,
      1,
      { startDate: '2026-01-01', year: 2026, asOf: '2026-06-30', ...FULL },
    );
    expect(bal.accrued).toBe(12);
    expect(bal.used).toBe(4);
    expect(bal.pending).toBe(1);
    expect(bal.remaining).toBe(8);
    expect(bal.fteFactor).toBe(1);
    expect(bal.hoursPerWeek).toBe(40);
  });

  it('modo annual_fixed genera por meses completos (no regala el año el día 1)', () => {
    // Menos de 1 mes completo → 0
    const midMonth = computeAccruedVacationDays(
      { defaultDaysPerYear: 22, accrualMode: 'annual_fixed', allowances: {} },
      'u1',
      { startDate: '2026-06-01', year: 2026, asOf: '2026-06-15', ...FULL },
    );
    expect(midMonth).toBe(0);

    // 1 mes completo → ~1,8 d (22/12)
    const oneMonth = computeAccruedVacationDays(
      { defaultDaysPerYear: 22, accrualMode: 'annual_fixed', allowances: {} },
      'u1',
      { startDate: '2026-06-01', year: 2026, asOf: '2026-07-01', ...FULL },
    );
    expect(oneMonth).toBeGreaterThan(1);
    expect(oneMonth).toBeLessThan(3);

    // Año completo → cupo entero
    expect(
      computeAccruedVacationDays(
        { defaultDaysPerYear: 22, accrualMode: 'annual_fixed', allowances: {} },
        'u1',
        { startDate: '2026-01-01', year: 2026, asOf: '2026-12-31', ...FULL },
      ),
    ).toBe(22);
  });

  it('media jornada no da 15 d el día del alta', () => {
    const accrued = computeAccruedVacationDays(
      { defaultDaysPerYear: 30, accrualMode: 'annual_fixed', allowances: {} },
      'u1',
      {
        startDate: '2026-08-02',
        year: 2026,
        asOf: '2026-08-02',
        contract: { hoursPerWeek: 20 },
      },
    );
    expect(accrued).toBe(0);
  });

  it('con 1 día laboral no carga días (ni 14 ni fracción pedible)', () => {
    const bal = computeVacationBalance(
      { defaultDaysPerYear: 30, accrualMode: 'monthly', daysPerMonth: 2.5, allowances: {} },
      'u1',
      0,
      0,
      {
        startDate: '2026-08-01',
        year: 2026,
        asOf: '2026-08-02',
        contract: { hoursPerWeek: 40 },
      },
    );
    expect(bal.accrued).toBe(0);
    expect(bal.requestable).toBe(0);
    expect(bal.completedMonths).toBe(0);
  });

  it('sin fecha de alta no inventa cupo (mensual ni anual)', () => {
    expect(
      computeAccruedVacationDays(
        { defaultDaysPerYear: 30, accrualMode: 'monthly', daysPerMonth: 2.5, allowances: {} },
        'u1',
        { year: 2026, asOf: '2026-08-02', ...FULL },
      ),
    ).toBe(0);
    expect(
      computeAccruedVacationDays(
        { defaultDaysPerYear: 30, accrualMode: 'annual_fixed', allowances: {} },
        'u1',
        { year: 2026, asOf: '2026-08-02', ...FULL },
      ),
    ).toBe(0);
  });

  it('al completar 1 mes carga el bloque mensual (pedible entero)', () => {
    const bal = computeVacationBalance(
      { defaultDaysPerYear: 30, accrualMode: 'monthly', daysPerMonth: 2.5, allowances: {} },
      'u1',
      0,
      0,
      {
        startDate: '2026-07-01',
        year: 2026,
        asOf: '2026-08-01',
        contract: { hoursPerWeek: 40 },
      },
    );
    expect(bal.completedMonths).toBe(1);
    expect(bal.accrued).toBe(2.5);
    expect(bal.requestable).toBe(2);
  });

  it('sin jornada/horas no inventa cupo a tiempo completo', () => {
    expect(
      computeAccruedVacationDays(
        { defaultDaysPerYear: 30, accrualMode: 'monthly', daysPerMonth: 2.5, allowances: {} },
        'u1',
        { startDate: '2026-01-01', year: 2026, asOf: '2026-07-01' },
      ),
    ).toBe(0);
    expect(resolveWeeklyContractHours({})).toBeNull();
    expect(resolveFteFactor({})).toBeNull();
  });

  it('40 h/sem = 2,5 d/mes; 20 h/sem = mitad', () => {
    const settings = {
      defaultDaysPerYear: 30,
      accrualMode: 'monthly',
      daysPerMonth: 2.5,
      allowances: {},
    };
    const full = computeAccruedVacationDays(settings, 'u1', {
      startDate: '2026-01-01',
      year: 2026,
      asOf: '2026-04-30',
      contract: { hoursPerWeek: 40 },
    });
    const half = computeAccruedVacationDays(settings, 'u1', {
      startDate: '2026-01-01',
      year: 2026,
      asOf: '2026-04-30',
      contract: { hoursPerWeek: 20 },
    });
    expect(full).toBe(10); // 4 meses × 2.5
    expect(half).toBe(5); // 4 meses × 1.25
    expect(resolveFteFactor({ hoursPerWeek: 20 })).toBe(0.5);
  });

  it('jornada media sin hoursPerWeek → 50 %', () => {
    const settings = {
      defaultDaysPerYear: 30,
      accrualMode: 'monthly',
      daysPerMonth: 2.5,
      allowances: {},
    };
    const accrued = computeAccruedVacationDays(settings, 'u1', {
      startDate: '2026-01-01',
      year: 2026,
      asOf: '2026-02-28',
      contract: { workday: 'media' },
    });
    expect(accrued).toBe(2.5); // 2 meses × 1.25
    expect(resolveWeeklyContractHours({ workday: 'completa' })).toBe(40);
    expect(resolveWeeklyContractHours({ workday: 'parcial' })).toBe(20);
  });

  it('horario asignado sirve si no hay hoursPerWeek en ficha', () => {
    expect(resolveWeeklyContractHours({ scheduleWeeklyHours: 25 })).toBe(25);
    expect(resolveFteFactor({ scheduleWeeklyHours: 25 })).toBe(0.625);
  });

  it('cupo annual_fixed prorrateado por horas y meses', () => {
    // 20 h → 50 %; 12 meses → 15 d
    expect(
      computeAccruedVacationDays(
        { defaultDaysPerYear: 30, accrualMode: 'annual_fixed', allowances: {} },
        'u1',
        {
          startDate: '2026-01-01',
          year: 2026,
          asOf: '2026-12-31',
          contract: { hoursPerWeek: 20 },
        },
      ),
    ).toBe(15);
  });
});
