import { createVerticalApi } from './verticalApiFactory';
import type {
  EventContractStage,
  EventQuoteRecord,
  EventRecord,
  EventServiceRecord,
  EventType,
  QuoteLine,
} from './eventsTypes';

const eventsApi = createVerticalApi<EventRecord>('events', 'events');
const quotesApi = createVerticalApi<EventQuoteRecord>('events', 'quotes');
const servicesApi = createVerticalApi<EventServiceRecord>('events', 'services');

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

export async function loadEvents(userId: string): Promise<EventRecord[]> {
  const list = await eventsApi.list(userId);
  return list.map((item) => ({
    ...item,
    tipo: normalizeEventType(item.tipo),
    estado: normalizeEventStage(item.estado),
    invitados: Number(item.invitados) || 0,
    presupuesto: Number(item.presupuesto) || 0,
    deposito: Number(item.deposito) || 0,
  }));
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
  return {
    ...updated,
    tipo: normalizeEventType(updated.tipo),
    estado: normalizeEventStage(updated.estado),
  };
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
  if (next === 'finalizado') patch.finishedAt = now;
  return updateEventRecord(userId, event, patch);
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
