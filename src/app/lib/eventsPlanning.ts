import { createVerticalApi } from './verticalApiFactory';
import type { EventRecord } from './eventsTypes';

export type EventPlanningSnapshot = {
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
  const logisticsApi = createVerticalApi<{ evento?: string; eventId?: string; estado?: string }>('events', 'logistics');
  const cateringApi = createVerticalApi<{ evento?: string; eventId?: string; estado?: string }>('events', 'catering');
  const vendorsApi = createVerticalApi<{ evento?: string; eventId?: string }>('events', 'vendors');

  const [logistics, catering, vendors] = await Promise.all([
    logisticsApi.list(userId).catch(() => []),
    cateringApi.list(userId).catch(() => []),
    vendorsApi.list(userId).catch(() => []),
  ]);

  const l = logistics.filter((x) => matchesEvent(x, event));
  const c = catering.filter((x) => matchesEvent(x, event));
  const v = vendors.filter((x) => matchesEvent(x, event));

  const logisticsCompleted = l.filter((t) => t.estado === 'completado').length;
  const logisticsPending = l.filter((t) => t.estado === 'pendiente' || t.estado === 'bloqueado').length;
  const logisticsInProgress = l.filter((t) => t.estado === 'en_proceso').length;
  const cateringConfirmed = c.filter((x) => x.estado === 'confirmado').length;

  const checkpoints = [
    l.length > 0,
    c.length > 0 || v.length > 0,
    l.length === 0 || logisticsCompleted >= Math.ceil(l.length * 0.6),
  ];
  const readinessPct = Math.round((checkpoints.filter(Boolean).length / Math.max(1, checkpoints.length)) * 100);

  return {
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
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  const startIso = start.toISOString().slice(0, 10);
  const endIso = end.toISOString().slice(0, 10);
  return events.filter((e) => {
    const day = String(e.fecha || '').slice(0, 10);
    return day >= startIso && day <= endIso;
  });
}

export type WorkerLogisticsTask = {
  _id: string;
  tarea: string;
  evento: string;
  eventId?: string;
  fechaLimite?: string;
  prioridad?: string;
  estado?: string;
  responsable?: string;
};

export async function loadWorkerLogisticsTasks(
  userId: string,
  workerName: string,
): Promise<WorkerLogisticsTask[]> {
  const logisticsApi = createVerticalApi<WorkerLogisticsTask>('events', 'logistics');
  const all = await logisticsApi.list(userId).catch(() => [] as WorkerLogisticsTask[]);
  const name = String(workerName || '').trim().toLowerCase();
  if (!name) return all.filter((t) => t.estado !== 'completado');
  return all.filter((t) => {
    if (t.estado === 'completado') return false;
    const resp = String(t.responsable || '').trim().toLowerCase();
    return !resp || resp.includes(name) || name.includes(resp);
  });
}
