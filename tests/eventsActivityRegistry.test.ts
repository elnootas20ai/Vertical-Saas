import { describe, expect, it } from 'vitest';
import { buildEventActivityFromRecord, mergeEventActivity } from '../src/app/lib/eventsActivityRegistry';
import type { EventRecord } from '../src/app/lib/eventsTypes';

function baseEvent(patch: Partial<EventRecord> = {}): EventRecord {
  return {
    _id: 'ev-1',
    type: 'ev_event',
    user_id: 'u1',
    nombre: 'Boda test',
    tipo: 'boda',
    fecha: '2026-09-01',
    lugar: 'Madrid',
    cliente: 'Ana',
    invitados: 100,
    presupuesto: 1000,
    estado: 'presupuesto',
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-01T10:00:00.000Z',
    ...patch,
  } as EventRecord;
}

describe('eventsActivityRegistry', () => {
  it('arma registro desde timestamps del evento', () => {
    const entries = buildEventActivityFromRecord(baseEvent({
      quoteSentAt: '2026-08-02T10:00:00.000Z',
      acceptedAt: '2026-08-03T10:00:00.000Z',
      depositPaidAt: '2026-08-04T10:00:00.000Z',
      depositPaidAmount: 300,
      contractedAt: '2026-08-04T11:00:00.000Z',
      fullyPaidAt: '2026-08-05T10:00:00.000Z',
    }));
    const kinds = entries.map((e) => e.kind);
    expect(kinds).toContain('created');
    expect(kinds).toContain('quote_sent');
    expect(kinds).toContain('quote_accepted');
    expect(kinds).toContain('deposit_paid');
    expect(kinds).toContain('contracted');
    expect(kinds).toContain('fully_paid');
  });

  it('ordena de más reciente a más antigua y deduplica notif de aceptado', () => {
    const event = baseEvent({ acceptedAt: '2026-08-03T10:00:00.000Z' });
    const merged = mergeEventActivity(event, [{
      id: 'n1',
      user_id: 'u1',
      level: 'success',
      category: 'events_quote_accepted',
      title: 'Presupuesto aceptado',
      message: 'Ana aceptó',
      entityId: 'ev-1',
      read: false,
      createdAt: '2026-08-03T10:01:00.000Z',
    }]);
    expect(merged.filter((e) => e.title.toLowerCase().includes('aceptado'))).toHaveLength(1);
    expect(merged[0].kind).toBe('quote_accepted');
  });
});
