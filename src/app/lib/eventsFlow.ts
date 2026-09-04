import { createVerticalApi } from './verticalApiFactory';
import { resolveBusinessDataUserId } from './tenantUserId';
import type { Business } from './businessApi';
import {
  emptyPlanningChecklist,
  furthestReachedStage,
  parsePlanningChecklist,
  serializePlanningChecklist,
  type EventContractStage,
  type EventPlanningChecklist,
  type EventPlanningWorker,
  type EventQuoteRecord,
  type EventRecord,
  type EventRouteStockLine,
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

/** IVA al final del presupuesto (líneas = base imponible). Catering / comida: 10%. */
export const EVENTS_QUOTE_IVA_RATE = 0.1;
export const EVENTS_QUOTE_IVA_PERCENT = Math.round(EVENTS_QUOTE_IVA_RATE * 100);

export function computeQuoteMoney(lines: QuoteLine[]): {
  subtotal: number;
  iva: number;
  total: number;
} {
  const subtotal = Math.round(computeQuoteTotal(lines) * 100) / 100;
  const iva = Math.round(subtotal * EVENTS_QUOTE_IVA_RATE * 100) / 100;
  const total = Math.round((subtotal + iva) * 100) / 100;
  return { subtotal, iva, total };
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
  /** Equipo previsto en el alta (planificación). */
  workers?: EventPlanningWorker[];
  /** Empresa activa: scope del PDV temporal TPV. */
  business?: Business | null;
};

export async function createEventDraft(
  userId: string,
  input: CreateEventDraftInput,
): Promise<EventRecord> {
  const lineas = await ensureCatalogServicesFromQuoteLines(userId, input.lineas);
  const { subtotal, iva, total } = computeQuoteMoney(lineas);
  const workers = (input.workers || [])
    .map((w) => ({
      id: String(w.id || '').trim(),
      name: String(w.name || '').trim(),
      ok: Boolean(w.ok),
    }))
    .filter((w) => w.id && w.name);
  const checklist = emptyPlanningChecklist();
  if (workers.length > 0) checklist.workers = workers;
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
    lineasPresupuesto: serializeQuoteLines(lineas),
    notas: input.notas || '',
    planningChecklist: serializePlanningChecklist(checklist),
    estado: 'presupuesto',
    furthestEstado: 'presupuesto',
  });

  await quotesApi.create(userId, {
    eventId: item._id,
    eventNombre: item.nombre,
    cliente: item.cliente,
    lineas: serializeQuoteLines(lineas),
    subtotal,
    iva,
    total,
    estado: 'borrador',
    notas: input.notas || '',
  });

  const draft: EventRecord = {
    ...item,
    tipo: normalizeEventType(item.tipo),
    estado: 'presupuesto',
    furthestEstado: 'presupuesto',
    presupuesto: total,
    lineasPresupuesto: serializeQuoteLines(lineas),
  };

  // El PDV temporal se crea al contratar / abrir operación — no al alta ni en borradores
  // (evita llenar el listado de tiendas con 4–5 «Evento · …»).
  return draft;
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
  const cleaned = await ensureCatalogServicesFromQuoteLines(
    userId,
    lines
      .map((line) => patchQuoteLine(line, {}))
      .filter((line) => String(line.concepto || '').trim()),
  );
  if (cleaned.length === 0) {
    throw new Error('Deja al menos una línea con concepto en el presupuesto');
  }
  const { subtotal, iva, total } = computeQuoteMoney(cleaned);
  const updated = await updateEventRecord(userId, event, {
    lineasPresupuesto: serializeQuoteLines(cleaned),
    presupuesto: total,
  });

  try {
    const quotes = await loadEventQuotes(userId, event._id);
    const draft = quotes.find((q) => q.estado === 'borrador');
    const payload = {
      eventId: event._id,
      eventNombre: updated.nombre || event.nombre,
      cliente: updated.cliente || event.cliente,
      lineas: serializeQuoteLines(cleaned),
      subtotal,
      iva,
      total,
      estado: 'borrador' as const,
      notas: updated.notas || event.notas || '',
    };
    if (draft) {
      await quotesApi.update(userId, draft._id, { ...draft, ...payload });
    } else {
      await quotesApi.create(userId, payload);
    }
  } catch {
    /* el envío lee las líneas del evento; el quote vertical es auxiliar */
  }

  const withLines = { ...updated, presupuesto: total, lineasPresupuesto: serializeQuoteLines(cleaned) };
  try {
    const { syncEventPortableTpvStock } = await import('./eventsPortableTpv');
    return await syncEventPortableTpvStock(userId, withLines);
  } catch {
    return withLines;
  }
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

/** Eventos activos donde tiene sentido asignar equipo (no cancelados). */
export function listAssignableEvents(events: EventRecord[]): EventRecord[] {
  return events
    .filter((e) => e.estado !== 'cancelado')
    .slice()
    .sort((a, b) => String(a.fecha || '').localeCompare(String(b.fecha || '')));
}

/**
 * Evento al que va un trabajador (checklist de planificación del centro de eventos).
 * Si hay varios, prioriza fecha en la semana indicada y luego el más próximo.
 */
export function findWorkerAssignedEvent(
  events: EventRecord[],
  workerId: string,
  opts?: { weekStart?: string; weekEnd?: string },
): EventRecord | null {
  const id = String(workerId || '').trim();
  if (!id) return null;
  const hits = events.filter((e) => {
    if (e.estado === 'cancelado') return false;
    const workers = parsePlanningChecklist(e.planningChecklist).workers;
    return workers.some((w) => w.id === id);
  });
  if (!hits.length) return null;
  const weekStart = opts?.weekStart || '';
  const weekEnd = opts?.weekEnd || weekStart;
  if (weekStart) {
    const inWeek = hits.filter((e) => {
      const f = String(e.fecha || '').slice(0, 10);
      return f && f >= weekStart && f <= weekEnd;
    });
    if (inWeek.length) {
      return inWeek.slice().sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)))[0];
    }
  }
  return hits.slice().sort((a, b) => String(a.fecha || '').localeCompare(String(b.fecha || '')))[0];
}

/**
 * Asigna (o quita) un trabajador al equipo de un evento.
 * Misma fuente que Planificación del centro de eventos: planningChecklist.workers.
 */
export async function assignWorkerToEventPlanning(
  userId: string,
  events: EventRecord[],
  worker: { id: string; name: string },
  eventId: string | null,
): Promise<EventRecord[]> {
  const workerId = String(worker.id || '').trim();
  const workerName = String(worker.name || '').trim() || workerId;
  if (!workerId) return events;

  const nextEvents = [...events];
  for (let i = 0; i < nextEvents.length; i++) {
    const ev = nextEvents[i];
    const checklist = parsePlanningChecklist(ev.planningChecklist);
    const prev = checklist.workers.find((w) => w.id === workerId);
    const shouldHave = Boolean(eventId && ev._id === eventId);

    if (shouldHave) {
      if (prev?.ok && prev.name === workerName) continue;
      const workers = [
        ...checklist.workers.filter((w) => w.id !== workerId),
        { id: workerId, name: workerName, ok: true },
      ];
      nextEvents[i] = await saveEventPlanningChecklist(userId, ev, { ...checklist, workers });
      continue;
    }

    if (!prev) continue;
    nextEvents[i] = await saveEventPlanningChecklist(userId, ev, {
      ...checklist,
      workers: checklist.workers.filter((w) => w.id !== workerId),
    });
  }
  return nextEvents;
}

export async function advanceEventStage(
  userId: string,
  event: EventRecord,
  next: EventContractStage,
): Promise<EventRecord> {
  const prevEstado = String(event.estado || '');
  const now = new Date().toISOString();
  const patch: Partial<EventRecord> = { estado: next };
  if (next === 'enviado') patch.quoteSentAt = now;
  if (next === 'aceptado') patch.acceptedAt = now;
  if (next === 'contratado') patch.contractedAt = now;
  if (next === 'planificacion') patch.planificacionAt = now;
  if (next === 'en_curso') patch.enCursoAt = now;
  if (next === 'finalizado') patch.finishedAt = now;
  if (next === 'cancelado') patch.cancelledAt = now;
  patch.furthestEstado = next === 'cancelado'
    ? furthestReachedStage(event)
    : furthestReachedStage({ ...event, ...patch });
  const updated = await updateEventRecord(userId, event, patch);
  if (next === 'aceptado' && prevEstado !== 'aceptado') {
    const { notifyEventQuoteAccepted } = await import('./eventsNotifications');
    void notifyEventQuoteAccepted(userId, updated);
  }
  // Al aceptar (o entrar en fases operativas) el Día D queda listo para tocar.
  const unlockDayOps =
    next === 'aceptado'
    || next === 'contratado'
    || next === 'planificacion'
    || next === 'en_curso';
  if (unlockDayOps) {
    try {
      const { ensureEventDayOps } = await import('./eventsDayOps');
      return await ensureEventDayOps(userId, updated);
    } catch {
      return updated;
    }
  }
  return updated;
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
  const updated = await updateEventRecord(userId, event, {
    estado: target,
    furthestEstado: furthestReachedStage(event),
  });
  const unlock =
    target === 'aceptado'
    || target === 'contratado'
    || target === 'planificacion'
    || target === 'en_curso'
    || target === 'finalizado';
  if (unlock && !String(updated.dayOps || '').trim()) {
    try {
      const { ensureEventDayOps } = await import('./eventsDayOps');
      return await ensureEventDayOps(userId, updated);
    } catch {
      return updated;
    }
  }
  return updated;
}

export async function loadEventQuotes(userId: string, eventId: string): Promise<EventQuoteRecord[]> {
  const list = await loadAllEventQuotes(userId);
  return list.filter((q) => q.eventId === eventId);
}

export async function loadAllEventQuotes(userId: string): Promise<EventQuoteRecord[]> {
  const list = await quotesApi.list(userId);
  return Array.isArray(list) ? list : [];
}

export type EventQuoteListKind = 'borrador' | 'enviado' | 'aceptado' | 'rechazado';

export type EventQuoteListRow = {
  id: string;
  eventId: string;
  nombre: string;
  cliente: string;
  lugar: string;
  tipo: EventType;
  kind: EventQuoteListKind;
  importe: number;
  date: string;
};

export function quoteKindFromEstado(estado: string | undefined, rejected?: boolean): EventQuoteListKind {
  if (estado === 'enviado') return 'enviado';
  if (estado === 'aceptado') return 'aceptado';
  if (estado === 'rechazado' || rejected) return 'rechazado';
  return 'borrador';
}

export function buildEventQuoteListRows(
  events: EventRecord[],
  quotes: EventQuoteRecord[],
): EventQuoteListRow[] {
  const byId = new Map(events.map((e) => [e._id, e]));
  const rows: EventQuoteListRow[] = [];
  const quotedEventIds = new Set<string>();

  for (const quote of quotes) {
    const event = byId.get(quote.eventId);
    if (event?.estado === 'cancelado') continue;
    quotedEventIds.add(quote.eventId);
    const kind = quoteKindFromEstado(quote.estado);
    rows.push({
      id: quote._id,
      eventId: quote.eventId,
      nombre: String(quote.eventNombre || event?.nombre || 'Presupuesto'),
      cliente: String(quote.cliente || event?.cliente || ''),
      lugar: String(event?.lugar || ''),
      tipo: event ? normalizeEventType(event.tipo) : 'otro',
      kind,
      importe: Number(quote.total) || Number(event?.presupuesto) || 0,
      date: String(
        kind === 'enviado' ? (event?.quoteSentAt || quote.updatedAt)
          : kind === 'aceptado' ? (event?.acceptedAt || quote.updatedAt)
            : kind === 'rechazado' ? (event?.quoteRejectedAt || quote.updatedAt)
              : (quote.updatedAt || quote.createdAt || event?.updatedAt || ''),
      ),
    });
  }

  for (const event of events) {
    if (event.estado === 'cancelado') continue;
    if (quotedEventIds.has(event._id)) continue;
    if (!['presupuesto', 'enviado', 'aceptado'].includes(event.estado) && !event.quoteRejectedAt) continue;
    const kind = quoteKindFromEstado(event.estado, Boolean(event.quoteRejectedAt && event.estado === 'presupuesto'));
    rows.push({
      id: event._id,
      eventId: event._id,
      nombre: event.nombre,
      cliente: event.cliente,
      lugar: event.lugar || '',
      tipo: normalizeEventType(event.tipo),
      kind,
      importe: Number(event.presupuesto) || 0,
      date: String(
        kind === 'enviado' ? (event.quoteSentAt || event.updatedAt)
          : kind === 'aceptado' ? (event.acceptedAt || event.updatedAt)
            : kind === 'rechazado' ? (event.quoteRejectedAt || event.updatedAt)
              : (event.updatedAt || event.createdAt || ''),
      ),
    });
  }

  return rows;
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

function normalizeServiceName(name: string): string {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Si en un presupuesto se escribe un servicio que no está en el catálogo,
 * lo crea en Servicios para que quede en el historial del negocio.
 */
export async function ensureCatalogServicesFromQuoteLines(
  userId: string,
  lines: QuoteLine[],
): Promise<QuoteLine[]> {
  let catalog: EventServiceRecord[] = [];
  try {
    catalog = await loadEventServices(userId, false);
  } catch {
    return lines;
  }

  const byId = new Map(catalog.map((s) => [s._id, s]));
  const byName = new Map(catalog.map((s) => [normalizeServiceName(s.nombre), s]));
  const next: QuoteLine[] = [];

  for (const line of lines) {
    const nombre = String(line.concepto || '').trim();
    if (!nombre) {
      next.push(line);
      continue;
    }
    if (line.serviceId && byId.has(line.serviceId)) {
      next.push(line);
      continue;
    }
    const key = normalizeServiceName(nombre);
    const existing = byName.get(key);
    if (existing) {
      next.push({ ...line, serviceId: existing._id });
      continue;
    }
    try {
      const created = await servicesApi.create(userId, {
        nombre,
        categoria: 'otro',
        precio: Number(line.precioUnitario) || 0,
        unidad: 'fijo',
        descripcion: '',
        activo: true,
      });
      const mapped: EventServiceRecord = {
        ...created,
        precio: Number(created.precio) || 0,
        activo: created.activo !== false,
      };
      byId.set(mapped._id, mapped);
      byName.set(key, mapped);
      next.push({ ...line, serviceId: mapped._id });
    } catch {
      next.push(line);
    }
  }

  return next;
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

/** Línea de presupuesto desde producto de Servicios → Productos. */
export function quoteLineFromCatalogItem(
  item: { _id: string; name: string; unitPrice?: number; unit?: string },
  qty = 1,
): QuoteLine {
  const cantidad = Math.max(1, Math.floor(Number(qty) || 1));
  const precioUnitario = Number(item.unitPrice) || 0;
  const unit = String(item.unit || '').trim();
  return {
    id: `line-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    concepto: unit ? `${item.name} (${unit})` : item.name,
    cantidad,
    precioUnitario,
    total: cantidad * precioUnitario,
    catalogItemId: item._id,
  };
}

export function parseRouteExtraStock(raw: unknown): EventRouteStockLine[] {
  if (!raw) return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row) => {
        if (!row || typeof row !== 'object') return null;
        const r = row as Record<string, unknown>;
        const name = String(r.name || '').trim();
        const id = String(r.id || '').trim() || `stk-${name}`;
        const qty = Math.max(0, Number(r.qty) || 0);
        if (!name || qty <= 0) return null;
        return {
          id,
          name,
          qty,
          catalogItemId: String(r.catalogItemId || '').trim() || undefined,
          unit: String(r.unit || '').trim() || undefined,
        } satisfies EventRouteStockLine;
      })
      .filter((x): x is EventRouteStockLine => Boolean(x));
  } catch {
    return [];
  }
}

export function serializeRouteExtraStock(lines: EventRouteStockLine[]): string {
  return JSON.stringify(lines);
}

export async function saveEventRouteExtraStock(
  userId: string,
  event: EventRecord,
  lines: EventRouteStockLine[],
): Promise<EventRecord> {
  const updated = await updateEventRecord(userId, event, {
    routeExtraStock: serializeRouteExtraStock(lines),
  });
  try {
    const { syncEventPortableTpvStock } = await import('./eventsPortableTpv');
    return await syncEventPortableTpvStock(userId, updated);
  } catch {
    return updated;
  }
}

export async function saveEventDayOps(
  userId: string,
  event: EventRecord,
  ops: import('./eventsDayOps').EventDayOps,
): Promise<EventRecord> {
  const { serializeDayOps } = await import('./eventsDayOps');
  return updateEventRecord(userId, event, {
    dayOps: serializeDayOps(ops),
  });
}

export function eventDisplayLabel(event: Pick<EventRecord, 'nombre' | 'cliente' | 'fecha'>): string {
  const date = event.fecha
    ? new Date(event.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
    : 'Sin fecha';
  return `${event.nombre} · ${event.cliente} · ${date}`;
}
