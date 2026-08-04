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

  it('sin horario de tienda no bloquea fichaje ni dice Cerrado', () => {
    const today = formatStoreHoursToday(mockWorkCenter(undefined), new Date('2026-06-01T12:00:00'));
    expect(today.status).toBe('no_schedule');
    expect(today.headline).toBe('Horario de tienda no definido');
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
