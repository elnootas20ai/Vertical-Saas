import { createVerticalApi } from './verticalApiFactory';
import type { EventRecord } from './eventsTypes';

export type EventPlanningSnapshot = {
  guests: { total: number; confirmed: number; pending: number; rejected: number };
  logistics: { total: number; pending: number; inProgress: number; completed: number };
  catering: { total: number; confirmed: number };
  vendors: { total: number };
  readinessPct: number;
};

type NamedEntity = { evento?: string; eventId?: string; nombre?: string };

function matchesEvent(item: NamedEntity, event: EventRecord): boolean {
  const eventId = String(event._id || '').trim();
  const eventName = String(event.nombre || '').trim().toLowerCase();
  if (eventId && String(item.eventId || '').trim() === eventId) return true;
  const ref = String(item.evento || item.nombre || '').trim().toLowerCase();
  return Boolean(eventName && ref === eventName);
}

export async function loadEventPlanningSnapshot(
  userId: string,
  event: EventRecord,
): Promise<EventPlanningSnapshot> {
  const guestsApi = createVerticalApi<{ evento?: string; eventId?: string; confirmacion?: string }>('events', 'guests');
  const logisticsApi = createVerticalApi<{ evento?: string; eventId?: string; estado?: string }>('events', 'logistics');
  const cateringApi = createVerticalApi<{ evento?: string; eventId?: string; estado?: string }>('events', 'catering');
  const vendorsApi = createVerticalApi<{ evento?: string; eventId?: string }>('events', 'vendors');

  const [guests, logistics, catering, vendors] = await Promise.all([
    guestsApi.list(userId).catch(() => []),
    logisticsApi.list(userId).catch(() => []),
    cateringApi.list(userId).catch(() => []),
    vendorsApi.list(userId).catch(() => []),
  ]);

  const g = guests.filter((x) => matchesEvent(x, event));
  const l = logistics.filter((x) => matchesEvent(x, event));
  const c = catering.filter((x) => matchesEvent(x, event));
  const v = vendors.filter((x) => matchesEvent(x, event));

  const logisticsCompleted = l.filter((t) => t.estado === 'completado').length;
  const logisticsPending = l.filter((t) => t.estado === 'pendiente' || t.estado === 'bloqueado').length;
  const logisticsInProgress = l.filter((t) => t.estado === 'en_proceso').length;

  const guestConfirmed = g.filter((x) => x.confirmacion === 'confirmado').length;
  const guestPending = g.filter((x) => x.confirmacion === 'pendiente').length;
  const guestRejected = g.filter((x) => x.confirmacion === 'rechazado').length;

  const cateringConfirmed = c.filter((x) => x.estado === 'confirmado').length;

  const checkpoints = [
    g.length > 0,
    l.length > 0,
    c.length > 0 || v.length > 0,
    l.length === 0 || logisticsCompleted >= Math.ceil(l.length * 0.6),
    guestConfirmed > 0 || g.length === 0,
  ];
  const readinessPct = Math.round((checkpoints.filter(Boolean).length / checkpoints.length) * 100);

  return {
    guests: { total: g.length, confirmed: guestConfirmed, pending: guestPending, rejected: guestRejected },
    logistics: {
      total: l.length,
      pending: logisticsPending,
      inProgress: logisticsInProgress,
      completed: logisticsCompleted,
    },
    catering: { total: c.length, confirmed: cateringConfirmed },
    vendors: { total: v.length },
    readinessPct,
  };
}

export function filterEventsForToday(events: EventRecord[]): EventRecord[] {
  const today = new Date().toISOString().slice(0, 10);
  return events.filter((e) => String(e.fecha || '').startsWith(today));
}

export function filterEventsThisWeek(events: EventRecord[]): EventRecord[] {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return events.filter((e) => {
    const d = Date.parse(String(e.fecha || ''));
    return !Number.isNaN(d) && d >= start.getTime() && d < end.getTime();
  });
}

export type WorkerLogisticsTask = {
  _id: string;
  evento: string;
  tarea: string;
  responsable: string;
  fechaLimite: string;
  estado: string;
  prioridad: string;
  eventId?: string;
};

export async function loadWorkerLogisticsTasks(
  userId: string,
  workerName: string,
): Promise<WorkerLogisticsTask[]> {
  const logisticsApi = createVerticalApi<WorkerLogisticsTask>('events', 'logistics');
  const list = await logisticsApi.list(userId).catch(() => []);
  const name = workerName.trim().toLowerCase();
  return list
    .filter((t) => t.estado !== 'completado')
    .filter((t) => !name || String(t.responsable || '').trim().toLowerCase().includes(name))
    .sort((a, b) => String(a.fechaLimite || '').localeCompare(String(b.fechaLimite || '')));
}
