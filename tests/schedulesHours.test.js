import { describe, expect, it } from 'vitest';
import {
  computeDayHours,
  computeDayWorkMinutes,
  computeWeeklyHours,
  defaultWeekly,
  emptyShift,
  WEEKDAYS,
} from '../src/app/lib/schedulesApi.ts';

function day(partial) {
  return { ...emptyShift(), enabled: true, ...partial };
}

describe('computeDayWorkMinutes / computeWeeklyHours', () => {
  it('09:00–17:00 con pausa 13–14 = 7 h', () => {
    expect(computeDayHours(day({ start: '09:00', end: '17:00', breakStart: '13:00', breakEnd: '14:00' }))).toBe(7);
  });

  it('no resta pausa fuera del turno (01:00–02:00 con jornada 09–17)', () => {
    expect(
      computeDayHours(day({ start: '09:00', end: '17:00', breakStart: '01:00', breakEnd: '02:00' })),
    ).toBe(8);
  });

  it('entrada = salida → 0 h', () => {
    expect(computeDayHours(day({ start: '05:00', end: '05:00' }))).toBe(0);
  });

  it('turno nocturno 22:00–06:00 con pausa 00:00–00:30', () => {
    expect(
      computeDayHours(day({ start: '22:00', end: '06:00', breakStart: '00:00', breakEnd: '00:30' })),
    ).toBe(7.5);
  });

  it('sin pausa (00:00–00:00) no resta nada', () => {
    expect(
      computeDayHours(day({ start: '09:00', end: '19:00', breakStart: '00:00', breakEnd: '00:00' })),
    ).toBe(10);
  });

  it('defaultWeekly sin lunch de tienda no resta 1 h fantasma', () => {
    const weekly = defaultWeekly();
    // Lun–Vie 09–19 = 10 h × 5; Sáb 10–14 = 4 h → 54 h
    expect(computeWeeklyHours(weekly)).toBe(54);
  });

  it('semana Lun–Vie 09–17 pausa 13–14 = 35 h', () => {
    const weekly = {};
    for (const d of WEEKDAYS) {
      weekly[d] = emptyShift();
    }
    for (const d of ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']) {
      weekly[d] = day({ start: '09:00', end: '17:00', breakStart: '13:00', breakEnd: '14:00' });
    }
    expect(computeWeeklyHours(weekly)).toBe(35);
  });

  it('minutos enteros para 09:00–18:30 sin pausa', () => {
    expect(computeDayWorkMinutes(day({ start: '09:00', end: '18:30', breakStart: '00:00', breakEnd: '00:00' }))).toBe(
      570,
    );
  });
});
