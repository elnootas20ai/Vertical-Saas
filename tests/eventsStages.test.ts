import { describe, expect, it } from 'vitest';
import {
  canAdvanceTo,
  canJumpToReachedStage,
  canRetreatTo,
  furthestReachedStage,
  isEventPlanningReady,
  type EventRecord,
} from '../src/app/lib/eventsTypes';
import { dwellMsInStage, formatDurationEs, inCourseSnapshot, pipelineSnapshot, buildEventStageMetrics } from '../src/app/lib/eventsStageTiming';

describe('event stage movement', () => {
  it('avanza solo al siguiente', () => {
    expect(canAdvanceTo('enviado', 'aceptado')).toBe(true);
    expect(canAdvanceTo('contratado', 'planificacion')).toBe(true);
    expect(canAdvanceTo('enviado', 'contratado')).toBe(false);
  });

  it('permite volver a un paso anterior', () => {
    expect(canRetreatTo('aceptado', 'enviado')).toBe(true);
    expect(canRetreatTo('aceptado', 'presupuesto')).toBe(true);
    expect(canRetreatTo('contratado', 'aceptado')).toBe(true);
    expect(canRetreatTo('enviado', 'aceptado')).toBe(false);
    expect(canRetreatTo('cancelado', 'presupuesto')).toBe(false);
  });

  it('mantiene el máximo alcanzado al retroceder', () => {
    expect(furthestReachedStage({
      estado: 'enviado',
      acceptedAt: '2026-01-01T00:00:00.000Z',
    })).toBe('aceptado');
    expect(furthestReachedStage({
      estado: 'presupuesto',
      furthestEstado: 'planificacion',
    })).toBe('planificacion');
    expect(furthestReachedStage({
      estado: 'presupuesto',
      quoteSentAt: '2026-01-01T00:00:00.000Z',
      acceptedAt: '2026-01-02T00:00:00.000Z',
    })).toBe('aceptado');
  });

  it('permite saltar adelante hasta el máximo ya hecho', () => {
    expect(canJumpToReachedStage('enviado', 'aceptado', 'aceptado')).toBe(true);
    expect(canJumpToReachedStage('presupuesto', 'planificacion', 'planificacion')).toBe(true);
    expect(canJumpToReachedStage('enviado', 'contratado', 'aceptado')).toBe(false);
    expect(canJumpToReachedStage('aceptado', 'aceptado', 'aceptado')).toBe(false);
  });
});

describe('event planning checklist', () => {
  it('está listo solo con lugar, fecha, servicios y un trabajador OK', () => {
    const lines = [{ id: 's1', concepto: 'Catering', cantidad: 1, precioUnitario: 10, total: 10 }];
    expect(isEventPlanningReady({
      lugar: 'Sala',
      fecha: '2026-08-20',
      planningChecklist: JSON.stringify({
        venueOk: true,
        dateOk: true,
        servicesOk: ['s1'],
        workers: [{ id: 'u1', name: 'Ana', ok: true }],
      }),
    }, lines)).toBe(true);
    expect(isEventPlanningReady({
      lugar: 'Sala',
      fecha: '2026-08-20',
      planningChecklist: JSON.stringify({
        venueOk: true,
        dateOk: true,
        servicesOk: ['s1'],
        workers: [],
      }),
    }, lines)).toBe(false);
  });
});

describe('event stage timing', () => {
  it('formatea duraciones', () => {
    expect(formatDurationEs(30_000)).toBe('ahora');
    expect(formatDurationEs(5 * 60_000)).toBe('5 min');
    expect(formatDurationEs(3 * 3_600_000)).toBe('3 h');
    expect(formatDurationEs(3 * 24 * 3_600_000)).toBe('3 d');
  });

  it('mide el tiempo en el paso actual', () => {
    const start = '2026-08-18T08:00:00.000Z';
    const now = Date.parse('2026-08-18T10:00:00.000Z');
    expect(dwellMsInStage({
      estado: 'aceptado',
      acceptedAt: start,
    } as EventRecord, 'aceptado', now)).toBe(2 * 3_600_000);
  });

  it('suma tiempo y dinero de los eventos en curso', () => {
    const now = Date.parse('2026-08-18T12:00:00.000Z');
    const snap = inCourseSnapshot([
      {
        estado: 'en_curso',
        presupuesto: 1000,
        depositPaidAmount: 200,
        enCursoAt: '2026-08-18T10:00:00.000Z',
      } as EventRecord,
      {
        estado: 'contratado',
        presupuesto: 5000,
      } as EventRecord,
    ], now);
    expect(snap.count).toBe(1);
    expect(snap.budget).toBe(1000);
    expect(snap.collected).toBe(200);
    expect(snap.avgDwellMs).toBe(2 * 3_600_000);
  });

  it('cuenta cartera y métricas por paso', () => {
    const now = Date.parse('2026-08-18T12:00:00.000Z');
    const events = [
      { estado: 'enviado', presupuesto: 800, quoteSentAt: '2026-08-18T08:00:00.000Z' },
      { estado: 'contratado', presupuesto: 1200, contractedAt: '2026-08-18T09:00:00.000Z' },
    ] as EventRecord[];
    const pipe = pipelineSnapshot(events);
    expect(pipe.count).toBe(1);
    expect(pipe.budget).toBe(1200);
    const enviado = buildEventStageMetrics(events, now).find((s) => s.id === 'enviado');
    expect(enviado?.count).toBe(1);
    expect(enviado?.budget).toBe(800);
    expect(enviado?.avgDwellMs).toBe(4 * 3_600_000);
  });
});
