import { createVerticalApi } from './verticalApiFactory';
import { resolveBusinessDataUserId } from './tenantUserId';
import type { Business } from './businessApi';
import {
  furthestReachedStage,
  serializePlanningChecklist,
  type EventContractStage,
  type EventPlanningChecklist,
  type EventQuoteRecord,
  type EventRecord,
  type EventServiceRecord,
  type EventType,
  type QuoteLine,
} from './eventsTypes';

const eventsApi = createVerticalApi<EventRecord>('events', 'events');
const quotesApi = createVerticalApi<EventQuoteRecord>('events', 'quotes');
const servicesApi = createVerticalApi<EventServiceRecord>('events', 'services');

type AuthLike = { user_id?: string; id?: string } | null | undefined;

/** Misma cuenta que servicios/clientes del negocio (titular si eres miembro del equipo). */
export function resolveEventsUserId(
  authUser: AuthLike,
  business: Business | null | undefined,
): string {
  return resolveBusinessDataUserId(authUser, business)
    || String(authUser?.user_id || authUser?.id || '').trim();
}

export function parseQuoteLines(raw: unknown): QuoteLine[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as QuoteLine[];
  try {
    const parsed = JSON.parse(String(raw));
    return Array.isArray(parsed) ? parsed as QuoteLine[] : [];
  } catch {
    return [];
  }
}

export function serializeQuoteLines(lines: QuoteLine[]): string {
  return JSON.stringify(lines);
}

export function computeQuoteTotal(lines: QuoteLine[]): number {
  return lines.reduce((sum, line) => sum + (Number(line.total) || 0), 0);
}

export function emptyQuoteLine(): QuoteLine {
  return {
    id: `line-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    concepto: '',
    cantidad: 1,
    precioUnitario: 0,
    total: 0,
  };
}

/** Precio/cantidad ES: 85,50 · 1.250,00 · 85.5 */
export function parseQuoteAmount(raw: unknown): number {
  const s = String(raw ?? '')
    .trim()
    .replace(/€/gi, '')
    .replace(/\s/g, '');
  if (!s) return 0;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  const normalized =
    lastComma > lastDot
      ? s.replace(/\./g, '').replace(',', '.')
      : s.replace(',', '.');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

export function patchQuoteLine(line: QuoteLine, patch: Partial<QuoteLine>): QuoteLine {
  const next = { ...line, ...patch };
  const cantidad = Number(next.cantidad) || 0;
  const precioUnitario = Number(next.precioUnitario) || 0;
  next.cantidad = cantidad;
  next.precioUnitario = precioUnitario;
  next.total = cantidad * precioUnitario;
  return next;
}

export function quoteLinesAreEqual(a: QuoteLine[], b: QuoteLine[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((line, i) => {
    const other = b[i];
    return (
      line.id === other.id
      && String(line.concepto || '').trim() === String(other.concepto || '').trim()
      && Number(line.cantidad) === Number(other.cantidad)
      && Number(line.precioUnitario) === Number(other.precioUnitario)
      && Number(line.total) === Number(other.total)
    );
  });
}

export function normalizeEventType(value: unknown): EventType {
  const raw = String(value || '').trim().toLowerCase();
  const map: Record<string, EventType> = {
    boda: 'boda',
    corporativo: 'corporativo',
    cumpleanos: 'cumpleanos',
    'cumpleaños': 'cumpleanos',
    conferencia: 'conferencia',
    feria: 'feria',
    gala: 'gala',
  };
  return map[raw] || 'otro';
}

export function normalizeEventStage(value: unknown): EventContractStage {
  const raw = String(value || '').trim().toLowerCase();
  const legacy: Record<string, EventContractStage> = {
    planificacion: 'planificacion',
    confirmado: 'aceptado',
    en_curso: 'en_curso',
    finalizado: 'finalizado',
    cancelado: 'cancelado',
  };
  if (legacy[raw]) return legacy[raw];
  const allowed: EventContractStage[] = [
    'presupuesto', 'enviado', 'aceptado', 'contratado',
    'planificacion', 'en_curso', 'finalizado', 'cancelado',
  ];
  return allowed.includes(raw as EventContractStage) ? (raw as EventContractStage) : 'presupuesto';
}

function mapEventRecord(item: EventRecord): EventRecord {
  const estado = normalizeEventStage(item.estado);
  let furthest = estado;
  try {
    furthest = furthestReachedStage({
      ...item,
      estado,
      furthestEstado: item.furthestEstado
        ? normalizeEventStage(item.furthestEstado)
        : undefined,
    });
  } catch {
    furthest = estado;
  }
  return {
    ...item,
    tipo: normalizeEventType(item.tipo),
    estado,
    furthestEstado: furthest,
    invitados: Number(item.invitados) || 0,
    presupuesto: Number(item.presupuesto) || 0,
    deposito: Number(item.deposito) || 0,
  };
}

export async function loadEvents(userId: string): Promise<EventRecord[]> {
  const list = await eventsApi.list(userId);
  const rows = Array.isArray(list) ? list : [];
  return rows.map((item) => {
    try {
      return mapEventRecord(item);
    } catch {
      return {
        ...item,
        tipo: normalizeEventType(item.tipo),
        estado: normalizeEventStage(item.estado),
        invitados: Number(item.invitados) || 0,
        presupuesto: Number(item.presupuesto) || 0,
        deposito: Number(item.deposito) || 0,
      };
    }
  });
}

export async function loadEventById(userId: string, eventId: string): Promise<EventRecord | null> {
  const list = await loadEvents(userId);
  return list.find((e) => e._id === eventId) ?? null;
}

export type CreateEventDraftInput = {
  nombre: string;
  tipo: EventType;
  fecha: string;
  lugar: string;
  cliente: string;
  clientId?: string;
  clientEmail?: string;
  clientTelefono?: string;
  venueId?: string;
  invitados: number;
  lineas: QuoteLine[];
  deposito?: number;
  notas?: string;
};

export async function createEventDraft(
  userId: string,
  input: CreateEventDraftInput,
): Promise<EventRecord> {
  const total = computeQuoteTotal(input.lineas);
  const now = new Date().toISOString();
  const item = await eventsApi.create(userId, {
    nombre: input.nombre.trim(),
    tipo: input.tipo,
    fecha: input.fecha,
    lugar: input.lugar.trim(),
    cliente: input.cliente.trim(),
    clientId: input.clientId || '',
    clientEmail: input.clientEmail || '',
    clientTelefono: input.clientTelefono || '',
    venueId: input.venueId || '',
    invitados: input.invitados,
    presupuesto: total,
    deposito: Number(input.deposito) || 0,
    lineasPresupuesto: serializeQuoteLines(input.lineas),
    notas: input.notas || '',
    estado: 'presupuesto',
    furthestEstado: 'presupuesto',
  });

  await quotesApi.create(userId, {
    eventId: item._id,
    eventNombre: item.nombre,
    cliente: item.cliente,
    lineas: serializeQuoteLines(input.lineas),
    subtotal: total,
    iva: Math.round(total * 0.21 * 100) / 100,
    total,
    estado: 'borrador',
    notas: input.notas || '',
  });

  return {
    ...item,
    tipo: normalizeEventType(item.tipo),
    estado: 'presupuesto',
    furthestEstado: 'presupuesto',
    presupuesto: total,
  };
}

export async function updateEventRecord(
  userId: string,
  event: EventRecord,
  patch: Partial<EventRecord>,
): Promise<EventRecord> {
  const updated = await eventsApi.update(userId, event._id, {
    ...event,
    ...patch,
  });
  const estado = normalizeEventStage(updated.estado);
  return {
    ...updated,
    tipo: normalizeEventType(updated.tipo),
    estado,
    furthestEstado: furthestReachedStage({
      ...event,
      ...updated,
      estado,
      furthestEstado: updated.furthestEstado || event.furthestEstado,
    }),
  };
}

export async function saveEventQuoteLines(
  userId: string,
  event: EventRecord,
  lines: QuoteLine[],
): Promise<EventRecord> {
  const cleaned = lines
    .map((line) => patchQuoteLine(line, {}))
    .filter((line) => String(line.concepto || '').trim());
  if (cleaned.length === 0) {
    throw new Error('Deja al menos una línea con concepto en el presupuesto');
  }
  const total = computeQuoteTotal(cleaned);
  const updated = await updateEventRecord(userId, event, {
    lineasPresupuesto: serializeQuoteLines(cleaned),
    presupuesto: total,
  });

  try {
    const quotes = await loadEventQuotes(userId, event._id);
    const linked = quotes[0];
    if (linked) {
      await quotesApi.update(userId, linked._id, {
        ...linked,
        lineas: serializeQuoteLines(cleaned),
        subtotal: total,
        iva: Math.round(total * 0.21 * 100) / 100,
        total,
      });
    }
  } catch {
    /* el envío lee las líneas del evento; el quote vertical es auxiliar */
  }

  return { ...updated, presupuesto: total, lineasPresupuesto: serializeQuoteLines(cleaned) };
}

export async function saveEventPlanningChecklist(
  userId: string,
  event: EventRecord,
  checklist: EventPlanningChecklist,
): Promise<EventRecord> {
  return updateEventRecord(userId, event, {
    planningChecklist: serializePlanningChecklist(checklist),
  });
}

export async function advanceEventStage(
  userId: string,
  event: EventRecord,
  next: EventContractStage,
): Promise<EventRecord> {
  const now = new Date().toISOString();
  const patch: Partial<EventRecord> = { estado: next };
  if (next === 'enviado') patch.quoteSentAt = now;
  if (next === 'aceptado') patch.acceptedAt = now;
  if (next === 'contratado') patch.contractedAt = now;
  if (next === 'planificacion') patch.planificacionAt = now;
  if (next === 'en_curso') patch.enCursoAt = now;
  if (next === 'finalizado') patch.finishedAt = now;
  patch.furthestEstado = next === 'cancelado'
    ? furthestReachedStage(event)
    : furthestReachedStage({ ...event, ...patch });
  return updateEventRecord(userId, event, patch);
}

export async function retreatEventStage(
  userId: string,
  event: EventRecord,
  previous: EventContractStage,
): Promise<EventRecord> {
  return updateEventRecord(userId, event, {
    estado: previous,
    furthestEstado: furthestReachedStage(event),
  });
}

export async function jumpToReachedStage(
  userId: string,
  event: EventRecord,
  target: EventContractStage,
): Promise<EventRecord> {
  return updateEventRecord(userId, event, {
    estado: target,
    furthestEstado: furthestReachedStage(event),
  });
}

export async function loadEventQuotes(userId: string, eventId: string): Promise<EventQuoteRecord[]> {
  const list = await quotesApi.list(userId);
  return list.filter((q) => q.eventId === eventId);
}

export async function loadEventServices(userId: string, activeOnly = true): Promise<EventServiceRecord[]> {
  const list = await servicesApi.list(userId);
  return list
    .filter((s) => !activeOnly || s.activo !== false)
    .map((s) => ({
      ...s,
      precio: Number(s.precio) || 0,
      activo: s.activo !== false,
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

export function quoteLineFromService(service: EventServiceRecord, invitados: number): QuoteLine {
  const cantidad = service.unidad === 'por_persona' ? Math.max(1, invitados || 1) : 1;
  const precioUnitario = Number(service.precio) || 0;
  return {
    id: `line-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    concepto: service.nombre,
    cantidad,
    precioUnitario,
    total: cantidad * precioUnitario,
    serviceId: service._id,
  };
}

export function eventDisplayLabel(event: Pick<EventRecord, 'nombre' | 'cliente' | 'fecha'>): string {
  const date = event.fecha
    ? new Date(event.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
    : 'Sin fecha';
  return `${event.nombre} · ${event.cliente} · ${date}`;
}
