/**
 * Día D operativo (hoja de ruta eventos): timeline, carga, equipo, transporte.
 * Persistido en event.dayOps (JSON).
 */
import type { EventRecord, EventRouteStockLine, QuoteLine } from './eventsTypes';
import { parsePlanningChecklist } from './eventsTypes';

function parseJsonArray(raw: unknown): Record<string, unknown>[] {
  if (!raw) return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((row) => row && typeof row === 'object') as Record<string, unknown>[];
  } catch {
    return [];
  }
}

function parseQuoteLinesLocal(raw: unknown): QuoteLine[] {
  return parseJsonArray(raw).map((r, i) => ({
    id: String(r.id || `line-${i}`),
    concepto: String(r.concepto || ''),
    cantidad: Number(r.cantidad) || 0,
    precioUnitario: Number(r.precioUnitario) || 0,
    total: Number(r.total) || 0,
    serviceId: String(r.serviceId || '').trim() || undefined,
    catalogItemId: String(r.catalogItemId || '').trim() || undefined,
  }));
}

function parseRouteExtraLocal(raw: unknown): EventRouteStockLine[] {
  return parseJsonArray(raw)
    .map((r) => {
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
}

export type DayPhaseId =
  | 'almacen'
  | 'carga'
  | 'salida'
  | 'llegada'
  | 'montaje'
  | 'evento'
  | 'vuelta';

export type DayPhase = {
  id: DayPhaseId;
  plannedTime: string;
  done: boolean;
  doneAt?: string;
  note: string;
};

export type DayCargoStatus = 'pendiente' | 'cogido' | 'furgon' | 'sitio';

export type DayCargoLine = {
  id: string;
  name: string;
  qty: number;
  catalogItemId?: string;
  source: 'pedido' | 'extra';
  status: DayCargoStatus;
};

export type DayCrewMember = {
  id: string;
  name: string;
  role: string;
  arriveTime: string;
  isDriver: boolean;
  checkedIn: boolean;
};

export type DayTransport = {
  vehicleLabel: string;
  plate: string;
  notes: string;
};

export type EventDayOps = {
  phases: DayPhase[];
  cargo: DayCargoLine[];
  crew: DayCrewMember[];
  transport: DayTransport;
  brief: string;
};

export const DAY_PHASE_META: Array<{ id: DayPhaseId; label: string; hint: string }> = [
  { id: 'almacen', label: 'Almacén', hint: 'Recoger mercancía' },
  { id: 'carga', label: 'Carga', hint: 'Meter en furgón' },
  { id: 'salida', label: 'Salida', hint: 'Dejar base' },
  { id: 'llegada', label: 'Llegada', hint: 'En el lugar' },
  { id: 'montaje', label: 'Montaje', hint: 'Preparar' },
  { id: 'evento', label: 'Evento', hint: 'En directo' },
  { id: 'vuelta', label: 'Vuelta', hint: 'Cierre y retorno' },
];

export const DAY_CREW_ROLES = [
  'Conductor',
  'Ayudante',
  'Montaje',
  'Barra / TPV',
  'Coordinación',
  'Otro',
] as const;

export const CARGO_STATUS_FLOW: DayCargoStatus[] = ['pendiente', 'cogido', 'furgon', 'sitio'];

export const CARGO_STATUS_LABEL: Record<DayCargoStatus, string> = {
  pendiente: 'Pendiente',
  cogido: 'Cogido',
  furgon: 'En furgón',
  sitio: 'En sitio',
};

function emptyTransport(): DayTransport {
  return { vehicleLabel: '', plate: '', notes: '' };
}

export function defaultDayPhases(): DayPhase[] {
  return DAY_PHASE_META.map((p) => ({
    id: p.id,
    plannedTime: '',
    done: false,
    note: '',
  }));
}

export function emptyDayOps(): EventDayOps {
  return {
    phases: defaultDayPhases(),
    cargo: [],
    crew: [],
    transport: emptyTransport(),
    brief: '',
  };
}

function parseCargoStatus(raw: unknown): DayCargoStatus {
  const s = String(raw || '').trim();
  if (s === 'cogido' || s === 'furgon' || s === 'sitio' || s === 'pendiente') return s;
  if (raw === true) return 'cogido';
  return 'pendiente';
}

export function parseDayOps(raw: unknown): EventDayOps {
  const empty = emptyDayOps();
  if (!raw) return empty;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!parsed || typeof parsed !== 'object') return empty;
    const obj = parsed as Record<string, unknown>;

    const phasesRaw = Array.isArray(obj.phases) ? obj.phases : [];
    const byId = new Map<string, DayPhase>();
    for (const row of phasesRaw) {
      if (!row || typeof row !== 'object') continue;
      const r = row as Record<string, unknown>;
      const id = String(r.id || '').trim() as DayPhaseId;
      if (!DAY_PHASE_META.some((m) => m.id === id)) continue;
      byId.set(id, {
        id,
        plannedTime: String(r.plannedTime || '').trim().slice(0, 5),
        done: Boolean(r.done),
        doneAt: String(r.doneAt || '').trim() || undefined,
        note: String(r.note || '').trim(),
      });
    }
    const phases = DAY_PHASE_META.map(
      (m) => byId.get(m.id) || { id: m.id, plannedTime: '', done: false, note: '' },
    );

    const cargo: DayCargoLine[] = (Array.isArray(obj.cargo) ? obj.cargo : [])
      .map((row) => {
        if (!row || typeof row !== 'object') return null;
        const r = row as Record<string, unknown>;
        const name = String(r.name || '').trim();
        const id = String(r.id || '').trim() || `cargo-${name}`;
        const qty = Math.max(0, Math.floor(Number(r.qty) || 0));
        if (!name || qty <= 0) return null;
        const source = r.source === 'extra' ? 'extra' : 'pedido';
        return {
          id,
          name,
          qty,
          catalogItemId: String(r.catalogItemId || '').trim() || undefined,
          source,
          status: parseCargoStatus(r.status ?? r.picked),
        } satisfies DayCargoLine;
      })
      .filter((x): x is DayCargoLine => Boolean(x));

    const crew: DayCrewMember[] = (Array.isArray(obj.crew) ? obj.crew : [])
      .map((row) => {
        if (!row || typeof row !== 'object') return null;
        const r = row as Record<string, unknown>;
        const name = String(r.name || '').trim();
        const id = String(r.id || '').trim() || `crew-${name}`;
        if (!name) return null;
        return {
          id,
          name,
          role: String(r.role || '').trim() || 'Otro',
          arriveTime: String(r.arriveTime || '').trim().slice(0, 5),
          isDriver: Boolean(r.isDriver),
          checkedIn: Boolean(r.checkedIn),
        } satisfies DayCrewMember;
      })
      .filter((x): x is DayCrewMember => Boolean(x));

    const tr = (obj.transport && typeof obj.transport === 'object'
      ? (obj.transport as Record<string, unknown>)
      : {}) as Record<string, unknown>;

    return {
      phases,
      cargo,
      crew,
      transport: {
        vehicleLabel: String(tr.vehicleLabel || '').trim(),
        plate: String(tr.plate || '').trim(),
        notes: String(tr.notes || '').trim(),
      },
      brief: String(obj.brief || '').trim(),
    };
  } catch {
    return empty;
  }
}

export function serializeDayOps(ops: EventDayOps): string {
  return JSON.stringify(ops);
}

/** Une pedido + extras en líneas de carga (conserva status si ya existían). */
export function buildCargoFromEvent(
  event: EventRecord,
  existing: DayCargoLine[] = [],
): DayCargoLine[] {
  const prev = new Map(existing.map((c) => [c.id, c]));
  const out: DayCargoLine[] = [];

  const pedido = parseQuoteLinesLocal(event.lineasPresupuesto);
  for (const line of pedido) {
    const name = String(line.concepto || '').trim();
    const qty = Math.max(0, Math.floor(Number(line.cantidad) || 0));
    if (!name || qty <= 0) continue;
    const id = `pedido-${line.id || line.catalogItemId || name}`;
    const old = prev.get(id);
    out.push({
      id,
      name,
      qty,
      catalogItemId: String(line.catalogItemId || '').trim() || undefined,
      source: 'pedido',
      status: old?.status || 'pendiente',
    });
  }

  const extras = parseRouteExtraLocal(event.routeExtraStock);
  for (const line of extras) {
    const name = String(line.name || '').trim();
    const qty = Math.max(0, Math.floor(Number(line.qty) || 0));
    if (!name || qty <= 0) continue;
    const id = `extra-${line.id || line.catalogItemId || name}`;
    const old = prev.get(id);
    out.push({
      id,
      name,
      qty,
      catalogItemId: String(line.catalogItemId || '').trim() || undefined,
      source: 'extra',
      status: old?.status || 'pendiente',
    });
  }

  return out;
}

/** Equipo desde planificación; conserva rol/hora/checks del Día D. */
export function buildCrewFromEvent(
  event: EventRecord,
  existing: DayCrewMember[] = [],
): DayCrewMember[] {
  const prev = new Map(existing.map((c) => [c.id, c]));
  const workers = parsePlanningChecklist(event.planningChecklist).workers;
  if (workers.length === 0 && existing.length > 0) return existing;

  return workers.map((w) => {
    const old = prev.get(w.id);
    return {
      id: w.id,
      name: w.name,
      role: old?.role || (old?.isDriver ? 'Conductor' : 'Ayudante'),
      arriveTime: old?.arriveTime || '',
      isDriver: old?.isDriver || false,
      checkedIn: old?.checkedIn || false,
    };
  });
}

/** Hidrata dayOps con pedido/equipo actuales sin perder checks. */
export function hydrateDayOpsFromEvent(event: EventRecord): EventDayOps {
  const base = parseDayOps(event.dayOps);
  return {
    ...base,
    phases: base.phases.length ? base.phases : defaultDayPhases(),
    cargo: buildCargoFromEvent(event, base.cargo),
    crew: buildCrewFromEvent(event, base.crew),
  };
}

export function nextCargoStatus(status: DayCargoStatus): DayCargoStatus {
  const idx = CARGO_STATUS_FLOW.indexOf(status);
  if (idx < 0 || idx >= CARGO_STATUS_FLOW.length - 1) return 'pendiente';
  return CARGO_STATUS_FLOW[idx + 1];
}

export function dayOpsProgress(ops: EventDayOps): {
  phasesDone: number;
  phasesTotal: number;
  cargoDone: number;
  cargoTotal: number;
  crewDone: number;
  crewTotal: number;
  pct: number;
} {
  const phasesTotal = ops.phases.length;
  const phasesDone = ops.phases.filter((p) => p.done).length;
  const cargoTotal = ops.cargo.length;
  const cargoDone = ops.cargo.filter((c) => c.status === 'sitio').length;
  const crewTotal = ops.crew.length;
  const crewDone = ops.crew.filter((c) => c.checkedIn).length;
  const total = phasesTotal + cargoTotal + crewTotal;
  const done = phasesDone + cargoDone + crewDone;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return { phasesDone, phasesTotal, cargoDone, cargoTotal, crewDone, crewTotal, pct };
}

export function currentPhaseId(ops: EventDayOps): DayPhaseId | null {
  const open = ops.phases.find((p) => !p.done);
  return open?.id || (ops.phases.length ? ops.phases[ops.phases.length - 1].id : null);
}

function foldPerson(s: string): string {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

/** Encuentra la fila del trabajador en el Día D (id o nombre). */
export function findDayOpsCrewMember(
  ops: EventDayOps,
  opts: { workerId?: string; workerName?: string },
): DayCrewMember | null {
  const id = String(opts.workerId || '').trim();
  const name = foldPerson(opts.workerName || '');
  if (id) {
    const byId = ops.crew.find((c) => c.id === id);
    if (byId) return byId;
  }
  if (name) {
    const byName = ops.crew.find((c) => foldPerson(c.name) === name);
    if (byName) return byName;
  }
  return null;
}

/** Eventos donde el trabajador está en planificación o en crew del Día D. */
export function filterEventsForWorkerDayOps(
  events: EventRecord[],
  opts: { workerId?: string; workerName?: string },
): EventRecord[] {
  const id = String(opts.workerId || '').trim();
  const name = foldPerson(opts.workerName || '');
  if (!id && !name) return [];

  return events.filter((e) => {
    if (e.estado === 'cancelado') return false;
    const ops = hydrateDayOpsFromEvent(e);
    if (findDayOpsCrewMember(ops, opts)) return true;
    const workers = parsePlanningChecklist(e.planningChecklist).workers;
    return workers.some((w) => {
      if (id && w.id === id) return true;
      if (name && foldPerson(w.name) === name) return true;
      return false;
    });
  });
}

/** Activa / refresca el Día D (cargo+equipo) y lo guarda en el evento. Idempotente. */
export async function ensureEventDayOps(
  userId: string,
  event: EventRecord,
): Promise<EventRecord> {
  const uid = String(userId || '').trim();
  if (!uid || !event?._id) return event;

  const hydrated = hydrateDayOpsFromEvent(event);
  const serialized = serializeDayOps(hydrated);
  if (String(event.dayOps || '') === serialized) {
    return { ...event, dayOps: serialized };
  }

  const { createVerticalApi } = await import('./verticalApiFactory');
  const eventsApi = createVerticalApi<EventRecord>('events', 'events');
  const updated = await eventsApi.update(uid, event._id, {
    ...event,
    dayOps: serialized,
  });
  return { ...event, ...updated, dayOps: serialized };
}

/** Semilla mínima para el servidor (aceptación por link del cliente). */
export function seedDayOpsJsonForEvent(event: {
  lineasPresupuesto?: unknown;
  routeExtraStock?: unknown;
  planningChecklist?: unknown;
  dayOps?: unknown;
}): string {
  const fake = event as EventRecord;
  return serializeDayOps(hydrateDayOpsFromEvent(fake));
}

