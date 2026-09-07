import { describe, expect, it } from 'vitest';
import {
  applyAutomationRules,
  automationStatusForReservation,
  statusAfterScheduleChange,
} from '../src/app/lib/restaurantReservationsApi';
import type { RestaurantReservation } from '../src/app/lib/restaurantReservationTypes';

const settings = {
  enabled: true,
  delayAfterMinutes: 15,
  noShowAfterMinutes: 15, // extra tras retraso → no_show a los 30 min desde la hora
};

function res(partial: Partial<RestaurantReservation>): RestaurantReservation {
  return {
    _id: 'rsr-1',
    _rev: '1',
    type: 'rst_reservation',
    user_id: 'u1',
    guestName: 'Test',
    phone: '',
    email: '',
    clientId: '',
    date: '2026-09-07',
    time: '22:30',
    partySize: '2',
    preferredZone: '',
    tableId: '',
    tableName: '',
    tableNumber: '',
    notes: '',
    status: 'pending',
    history: '[]',
    orderId: '',
    createdAt: '',
    updatedAt: '',
    ...partial,
  } as RestaurantReservation;
}

describe('restaurant reservation automation', () => {
  it('no marca retraso ni no_show antes de la hora de la reserva', () => {
    const now = Date.parse('2026-09-07T21:51:00+02:00');
    const r = res({ time: '22:30', status: 'confirmed' });
    expect(automationStatusForReservation(r, settings, now)).toBe('confirmed');
    expect(applyAutomationRules([r], settings, now)[0].status).toBe('confirmed');
  });

  it('marca retraso solo tras delayAfterMinutes desde la hora', () => {
    const atStart = Date.parse('2026-09-07T22:30:00+02:00');
    const at14 = Date.parse('2026-09-07T22:44:00+02:00');
    const at15 = Date.parse('2026-09-07T22:45:00+02:00');
    const r = res({ time: '22:30', status: 'confirmed' });
    expect(automationStatusForReservation(r, settings, atStart)).toBe('confirmed');
    expect(automationStatusForReservation(r, settings, at14)).toBe('confirmed');
    expect(automationStatusForReservation(r, settings, at15)).toBe('delayed');
  });

  it('marca no_show tras delay + minutos más (no absoluto desde la hora)', () => {
    const at29 = Date.parse('2026-09-07T22:59:00+02:00');
    const at30 = Date.parse('2026-09-07T23:00:00+02:00');
    const r = res({ time: '22:30', status: 'confirmed' });
    expect(automationStatusForReservation(r, settings, at29)).toBe('delayed');
    expect(automationStatusForReservation(r, settings, at30)).toBe('no_show');
  });

  it('no toca seated / finished / cancelled', () => {
    const now = Date.parse('2026-09-07T23:30:00+02:00');
    for (const status of ['seated', 'finished', 'cancelled'] as const) {
      expect(automationStatusForReservation(res({ status, time: '20:00' }), settings, now)).toBe(status);
    }
  });

  it('al reprogramar a hora futura, sale de no_show', () => {
    const now = Date.parse('2026-09-07T21:51:00+02:00');
    const stuck = res({
      time: '20:00',
      status: 'no_show',
      history: JSON.stringify([{ action: 'Confirmación', userId: 'u', userName: 'U', at: '2026-09-07T19:00:00.000Z' }]),
    });
    expect(statusAfterScheduleChange(stuck, '2026-09-07', '22:30', settings, now)).toBe('confirmed');
  });

  it('al reprogramar a hora futura sin confirmación previa, vuelve a pending', () => {
    const now = Date.parse('2026-09-07T21:51:00+02:00');
    const stuck = res({
      time: '20:00',
      status: 'no_show',
      history: JSON.stringify([{ action: 'Creación', userId: 'u', userName: 'U', at: '2026-09-07T19:00:00.000Z' }]),
    });
    expect(statusAfterScheduleChange(stuck, '2026-09-07', '22:30', settings, now)).toBe('pending');
  });

  it('sin cambio de fecha/hora no propone status', () => {
    const now = Date.parse('2026-09-07T21:51:00+02:00');
    const stuck = res({ time: '22:30', status: 'no_show' });
    expect(statusAfterScheduleChange(stuck, '2026-09-07', '22:30', settings, now)).toBeUndefined();
  });

  it('fecha/hora inválida no fuerza no_show', () => {
    const now = Date.parse('2026-09-07T23:00:00+02:00');
    const bad = res({ date: 'nope', time: 'xx', status: 'confirmed' });
    expect(automationStatusForReservation(bad, settings, now)).toBe('confirmed');
  });
});
