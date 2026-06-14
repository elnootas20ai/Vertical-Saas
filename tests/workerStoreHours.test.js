import { describe, expect, it } from 'vitest';
import {
  formatStoreHoursToday,
  getScheduleDayKeyForDate,
  listStoreHoursWeek,
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
    expect(today.label).toBe('10:00 – 22:00');
    expect(listStoreHoursWeek(wc)).toHaveLength(7);
  });
});
