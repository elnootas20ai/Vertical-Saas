/**
 * Registro de actividad de un evento (ficha individual).
 * Se deriva de timestamps del evento + notificaciones ligadas a ese evento.
 */
import type { EventRecord } from './eventsTypes';
import { formatMoneyEs } from './formatNumberEs';
import type { NotificationRecord } from './notificationApi';

export type EventActivityTone = 'neutral' | 'success' | 'warning' | 'info';

export type EventActivityEntry = {
  id: string;
  at: string;
  title: string;
  detail?: string;
  tone: EventActivityTone;
  kind: string;
};

function pushEntry(
  list: EventActivityEntry[],
  entry: Omit<EventActivityEntry, 'id'> & { id?: string },
) {
  if (!entry.at) return;
  const t = Date.parse(entry.at);
  if (Number.isNaN(t)) return;
  list.push({
    id: entry.id || `${entry.kind}-${entry.at}`,
    at: entry.at,
    title: entry.title,
    detail: entry.detail,
    tone: entry.tone,
    kind: entry.kind,
  });
}

/** Actividad estructural desde la ficha del evento (siempre disponible). */
export function buildEventActivityFromRecord(event: EventRecord | null | undefined): EventActivityEntry[] {
  if (!event?._id) return [];
  const list: EventActivityEntry[] = [];
  const created = String(event.createdAt || '').trim();

  pushEntry(list, {
    kind: 'created',
    at: created,
    title: 'Evento creado',
    detail: event.cliente ? `Cliente: ${event.cliente}` : undefined,
    tone: 'info',
  });

  pushEntry(list, {
    kind: 'quote_sent',
    at: String(event.quoteSentAt || event.quotePdfSentAt || '').trim(),
    title: 'Presupuesto enviado',
    detail: event.clientEmail ? `A ${event.clientEmail}` : undefined,
    tone: 'info',
  });

  pushEntry(list, {
    kind: 'quote_rejected',
    at: String(event.quoteRejectedAt || '').trim(),
    title: 'Presupuesto rechazado',
    detail: 'El cliente rechazó el presupuesto',
    tone: 'warning',
  });

  pushEntry(list, {
    kind: 'quote_accepted',
    at: String(event.acceptedAt || '').trim(),
    title: 'Presupuesto aceptado',
    detail: event.cliente ? `${event.cliente} aceptó el presupuesto` : undefined,
    tone: 'success',
  });

  const depositAmt = Number(event.depositPaidAmount) || 0;
  pushEntry(list, {
    kind: 'deposit_paid',
    at: String(event.depositPaidAt || '').trim(),
    title: 'Señal cobrada',
    detail: depositAmt > 0 ? formatMoneyEs(depositAmt) : undefined,
    tone: 'success',
  });

  pushEntry(list, {
    kind: 'contracted',
    at: String(event.contractedAt || '').trim(),
    title: 'Contrato / contratado',
    detail: 'Pasó a fase contratada',
    tone: 'success',
  });

  pushEntry(list, {
    kind: 'planning',
    at: String(event.planificacionAt || '').trim(),
    title: 'Planificación iniciada',
    tone: 'info',
  });

  const tpvCode = String(event.portableTerminalCode || '').trim();
  pushEntry(list, {
    kind: 'tpv_ready',
    at: String(event.portableTpvAt || '').trim(),
    title: 'TPV del evento listo',
    detail: tpvCode ? `Código ${tpvCode.toUpperCase()}` : undefined,
    tone: 'info',
  });

  pushEntry(list, {
    kind: 'in_progress',
    at: String(event.enCursoAt || '').trim(),
    title: 'Evento en curso',
    detail: 'Día D — operación activa',
    tone: 'info',
  });

  const finalPaid = Number(event.finalPaidAmount) || 0;
  pushEntry(list, {
    kind: 'final_paid',
    at: String(event.finalPaidAt || '').trim(),
    title: 'Cobro final registrado',
    detail: finalPaid > 0 ? formatMoneyEs(finalPaid) : undefined,
    tone: 'success',
  });

  pushEntry(list, {
    kind: 'fully_paid',
    at: String(event.fullyPaidAt || '').trim(),
    title: 'Evento cobrado al completo',
    detail: 'Sin pendiente de cobro',
    tone: 'success',
  });

  pushEntry(list, {
    kind: 'finished',
    at: String(event.finishedAt || '').trim(),
    title: 'Evento finalizado',
    tone: 'success',
  });

  pushEntry(list, {
    kind: 'review_sent',
    at: String(event.reviewInviteSentAt || '').trim(),
    title: 'Invitación de reseña enviada',
    detail: event.clientEmail ? `A ${event.clientEmail}` : undefined,
    tone: 'info',
  });

  pushEntry(list, {
    kind: 'cancelled',
    at: String(event.cancelledAt || '').trim(),
    title: 'Contratación cancelada',
    tone: 'warning',
  });

  return list;
}

function notificationBelongsToEvent(n: NotificationRecord, eventId: string): boolean {
  const eid = String(eventId || '').trim();
  if (!eid) return false;
  if (String(n.entityId || '').trim() === eid) return true;
  const meta = n.metadata && typeof n.metadata === 'object' ? n.metadata : {};
  if (String((meta as { eventId?: string }).eventId || '').trim() === eid) return true;
  const route = String(n.route || '');
  if (route.includes(`/eventos/${encodeURIComponent(eid)}`) || route.includes(`/eventos/${eid}`)) {
    return true;
  }
  return false;
}

function toneFromNotification(n: NotificationRecord): EventActivityTone {
  const level = String(n.level || '');
  if (level === 'success') return 'success';
  if (level === 'warning' || level === 'alert') return 'warning';
  if (level === 'info') return 'info';
  return 'neutral';
}

/** Une ficha + notificaciones del mismo evento (dedup por título+minuto). */
export function mergeEventActivity(
  event: EventRecord | null | undefined,
  notifications: NotificationRecord[] = [],
): EventActivityEntry[] {
  const fromEvent = buildEventActivityFromRecord(event);
  const eventId = String(event?._id || '').trim();
  const fromNotifs: EventActivityEntry[] = [];

  for (const n of notifications) {
    if (!notificationBelongsToEvent(n, eventId)) continue;
    const at = String(n.createdAt || '').trim();
    if (!at) continue;
    fromNotifs.push({
      id: `notif-${n.id || at}`,
      at,
      title: String(n.title || 'Aviso').trim() || 'Aviso',
      detail: String(n.message || '').trim() || undefined,
      tone: toneFromNotification(n),
      kind: `notif:${String(n.category || 'events')}`,
    });
  }

  const merged = [...fromEvent, ...fromNotifs];
  // Dedup suave: mismo kind estructural gana sobre notif equivalente
  const structuralKinds = new Set(fromEvent.map((e) => e.kind));
  const filtered = merged.filter((e) => {
    if (!e.kind.startsWith('notif:')) return true;
    // Si ya hay acceptedAt estructural, no duplicar "Presupuesto aceptado" de notif
    const title = e.title.toLowerCase();
    if (title.includes('aceptado') && structuralKinds.has('quote_accepted')) return false;
    if (title.includes('rechazado') && structuralKinds.has('quote_rejected')) return false;
    if (title.includes('cobrado al completo') && structuralKinds.has('fully_paid')) return false;
    if (title.includes('señal') && structuralKinds.has('deposit_paid')) return false;
    return true;
  });

  filtered.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  return filtered;
}

export function isActivityToday(at: string, now = new Date()): boolean {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return false;
  return (
    d.getFullYear() === now.getFullYear()
    && d.getMonth() === now.getMonth()
    && d.getDate() === now.getDate()
  );
}

export type DashboardActivityEntry = EventActivityEntry & {
  eventId: string;
  eventName: string;
};

/** Actividad reciente de todos los eventos (dashboard). */
export function buildEventsDashboardActivity(
  events: EventRecord[],
  limit = 20,
): DashboardActivityEntry[] {
  const rows: DashboardActivityEntry[] = [];
  for (const event of events || []) {
    if (!event?._id) continue;
    const name = String(event.nombre || 'Evento').trim() || 'Evento';
    for (const entry of buildEventActivityFromRecord(event)) {
      // En dashboard no hace falta el "creado" de cada ficha (ruido).
      if (entry.kind === 'created') continue;
      rows.push({
        ...entry,
        id: `${event._id}:${entry.id}`,
        eventId: event._id,
        eventName: name,
        detail: entry.detail ? `${name} · ${entry.detail}` : name,
      });
    }
  }
  rows.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  return rows.slice(0, Math.max(1, limit));
}
