import { describe, expect, it } from 'vitest';
import {
  formatStoreHoursToday,
  getScheduleDayKeyForDate,
  getStoreHoursStatus,
  listStoreHoursWeek,
  storeHoursStatusLabelEs,
} from '../src/app/lib/workerStoreHours.ts';

function mockWorkCenter(openingHours) {
  return {
    _id: 'wc-1',
    type: 'sales_point',
    id: 'wc-1',
    user_id: 'owner',
    name: 'Tienda Centro',
    centerType: 'punto_de_venta',
    ownership: 'propiedad',
    active: true,
    openingHours,
  };
}

describe('workerStoreHours', () => {
  it('resuelve el día de la semana', () => {
    const monday = new Date('2026-06-01T12:00:00');
    expect(getScheduleDayKeyForDate(monday)).toBe('monday');
  });

  it('formatea horario de hoy', () => {
    const wc = mockWorkCenter({
      timezone: 'Europe/Madrid',
      schedule: {
        monday: { open: true, from: '10:00', to: '22:00' },
        tuesday: { open: true, from: '10:00', to: '22:00' },
        wednesday: { open: true, from: '10:00', to: '22:00' },
        thursday: { open: true, from: '10:00', to: '22:00' },
        friday: { open: true, from: '10:00', to: '22:00' },
        saturday: { open: false, from: '10:00', to: '14:00' },
        sunday: { open: false, from: '10:00', to: '14:00' },
      },
      holidays: [],
      lunchBreak: { enabled: false, from: '14:00', to: '16:00' },
    });
    const today = formatStoreHoursToday(wc, new Date('2026-06-01T12:00:00'));
    expect(today.open).toBe(true);
    expect(today.storeOpenNow).toBe(true);
    expect(today.openForClockIn).toBe(true);
    expect(today.status).toBe('open');
    expect(today.label).toBe('10:00 – 22:00');
    expect(listStoreHoursWeek(wc)).toHaveLength(7);
    expect(getStoreHoursStatus(wc, new Date('2026-06-01T12:00:00')).status).toBe('open');
    expect(storeHoursStatusLabelEs('open')).toBe('Abierta');
  });

  it('marca cerrada pero no bloquea fichaje', () => {
    const wc = mockWorkCenter({
      timezone: 'Europe/Madrid',
      schedule: {
        monday: { open: false, from: '10:00', to: '22:00' },
        tuesday: { open: false, from: '10:00', to: '22:00' },
        wednesday: { open: false, from: '10:00', to: '22:00' },
        thursday: { open: false, from: '10:00', to: '22:00' },
        friday: { open: false, from: '10:00', to: '22:00' },
        saturday: { open: false, from: '10:00', to: '14:00' },
        sunday: { open: false, from: '10:00', to: '14:00' },
      },
      holidays: [],
      lunchBreak: { enabled: false, from: '14:00', to: '16:00' },
    });
    const today = formatStoreHoursToday(wc, new Date('2026-06-01T12:00:00'));
    expect(today.status).toBe('closed');
    expect(today.headline).toBe('Cerrado');
    expect(today.storeOpenNow).toBe(false);
    expect(today.openForClockIn).toBe(true);
  });

  it('fuera de franja: informativo, fichaje permitido', () => {
    const wc = mockWorkCenter({
      timezone: 'Europe/Madrid',
      schedule: {
        monday: { open: true, from: '10:00', to: '14:00' },
        tuesday: { open: true, from: '10:00', to: '14:00' },
        wednesday: { open: true, from: '10:00', to: '14:00' },
        thursday: { open: true, from: '10:00', to: '14:00' },
        friday: { open: true, from: '10:00', to: '14:00' },
        saturday: { open: false, from: '10:00', to: '14:00' },
        sunday: { open: false, from: '10:00', to: '14:00' },
      },
      holidays: [],
      lunchBreak: { enabled: false, from: '14:00', to: '16:00' },
    });
    const today = formatStoreHoursToday(wc, new Date('2026-06-01T18:00:00'));
    expect(today.status).toBe('outside_hours');
    expect(today.headline).toBe('Fuera de horario');
    expect(today.storeOpenNow).toBe(false);
    expect(today.openForClockIn).toBe(true);
  });

  it('turno nocturno: noche del día de inicio y madrugada del siguiente sin solape', () => {
    const overnight = {
      timezone: 'Europe/Madrid',
      schedule: {
        monday: { open: false, from: '20:00', to: '06:00' },
        tuesday: { open: false, from: '20:00', to: '06:00' },
        wednesday: { open: false, from: '20:00', to: '06:00' },
        thursday: { open: false, from: '20:00', to: '06:00' },
        friday: { open: true, from: '20:00', to: '06:00' },
        saturday: { open: true, from: '20:00', to: '06:00' },
        sunday: { open: false, from: '20:00', to: '06:00' },
      },
      holidays: [],
      lunchBreak: { enabled: false, from: '14:00', to: '16:00' },
    };
    const wc = mockWorkCenter(overnight);

    // Viernes 22:00 → abierto (noche de viernes)
    const friNight = formatStoreHoursToday(wc, new Date('2026-06-05T22:00:00'));
    expect(friNight.status).toBe('open');
    expect(friNight.dayKey).toBe('friday');
    expect(friNight.label).toBe('20:00 – 06:00 (+1)');

    // Sábado 03:00 → sigue el viernes (no pisa el sábado)
    const satDawn = formatStoreHoursToday(wc, new Date('2026-06-06T03:00:00'));
    expect(satDawn.status).toBe('open');
    expect(satDawn.dayKey).toBe('friday');
    expect(satDawn.from).toBe('20:00');
    expect(satDawn.to).toBe('06:00');

    // Sábado 12:00 → fuera (aún no empieza el nocturno del sábado)
    const satNoon = formatStoreHoursToday(wc, new Date('2026-06-06T12:00:00'));
    expect(satNoon.status).toBe('outside_hours');
    expect(satNoon.storeOpenNow).toBe(false);

    // Sábado 22:00 → abierto (noche de sábado)
    const satNight = formatStoreHoursToday(wc, new Date('2026-06-06T22:00:00'));
    expect(satNight.status).toBe('open');
    expect(satNight.dayKey).toBe('saturday');

    // Viernes 03:00 → cerrado (esa madrugada sería del jueves, que está cerrado)
    const friDawn = formatStoreHoursToday(wc, new Date('2026-06-05T03:00:00'));
    expect(friDawn.storeOpenNow).toBe(false);
  });

  it('sin horario de tienda no bloquea fichaje ni dice Cerrado', () => {
    const today = formatStoreHoursToday(mockWorkCenter(undefined), new Date('2026-06-01T12:00:00'));
    expect(today.status).toBe('no_schedule');
    expect(today.headline).toBe('Sin horario de apertura');
    expect(today.openForClockIn).toBe(true);
    expect(today.storeOpenNow).toBe(false);
  });

  it('acepta horario legacy plano (días en la raíz sin schedule)', () => {
    const wc = mockWorkCenter({
      timezone: 'Europe/Madrid',
      monday: { open: true, from: '11:00', to: '20:00' },
      tuesday: { open: true, from: '11:00', to: '20:00' },
      wednesday: { open: true, from: '11:00', to: '20:00' },
      thursday: { open: true, from: '11:00', to: '20:00' },
      friday: { open: true, from: '11:00', to: '20:00' },
      saturday: { open: false, from: '11:00', to: '14:00' },
      sunday: { open: false, from: '11:00', to: '14:00' },
    });
    const today = formatStoreHoursToday(wc, new Date('2026-06-01T12:00:00'));
    expect(today.status).toBe('open');
    expect(today.label).toBe('11:00 – 20:00');
  });

  it('día abierto con horas inválidas: no abierta ahora, fichaje ok', () => {
    const wc = mockWorkCenter({
      timezone: 'Europe/Madrid',
      schedule: {
        monday: { open: true, from: '', to: '' },
        tuesday: { open: true, from: '', to: '' },
        wednesday: { open: true, from: '', to: '' },
        thursday: { open: true, from: '', to: '' },
        friday: { open: true, from: '', to: '' },
        saturday: { open: false, from: '', to: '' },
        sunday: { open: false, from: '', to: '' },
      },
      holidays: [],
      lunchBreak: { enabled: false, from: '14:00', to: '16:00' },
    });
    const today = formatStoreHoursToday(wc, new Date('2026-06-01T12:00:00'));
    expect(today.storeOpenNow).toBe(false);
    expect(today.openForClockIn).toBe(true);
  });
});
