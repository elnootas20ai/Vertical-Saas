import type { VerticalEntity } from './verticalApiFactory';

/** Fases lineales del flujo de contratación de eventos. */
export type EventContractStage =
  | 'presupuesto'
  | 'enviado'
  | 'aceptado'
  | 'contratado'
  | 'planificacion'
  | 'en_curso'
  | 'finalizado'
  | 'cancelado';

export type EventType =
  | 'boda'
  | 'corporativo'
  | 'cumpleanos'
  | 'conferencia'
  | 'feria'
  | 'gala'
  | 'otro';

export type QuoteLine = {
  id: string;
  concepto: string;
  cantidad: number;
  precioUnitario: number;
  total: number;
  serviceId?: string;
  /** Producto de Carta TPV (cantidad en unidades). */
  catalogItemId?: string;
};

/** Extra a llevar en la hoja de rutas (además del presupuesto). */
export type EventRouteStockLine = {
  id: string;
  name: string;
  qty: number;
  catalogItemId?: string;
  unit?: string;
};

export type EventServiceCategory =
  | 'catering'
  | 'decoracion'
  | 'musica'
  | 'fotografia'
  | 'video'
  | 'alquiler'
  | 'personal'
  | 'transporte'
  | 'coordinacion'
  | 'otro';

export type EventServiceUnit = 'fijo' | 'por_persona' | 'por_hora';

export interface EventServiceRecord extends VerticalEntity {
  nombre: string;
  categoria: EventServiceCategory;
  precio: number;
  unidad: EventServiceUnit;
  descripcion?: string;
  activo: boolean;
}

export interface EventRecord extends VerticalEntity {
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
  presupuesto: number;
  deposito?: number;
  lineasPresupuesto?: string;
  notas?: string;
  estado: EventContractStage;
  /** Máximo alcanzado en el stepper; no baja al volver atrás. */
  furthestEstado?: EventContractStage;
  quoteSentAt?: string;
  acceptedAt?: string;
  contractedAt?: string;
  planificacionAt?: string;
  enCursoAt?: string;
  finishedAt?: string;
  /** Cobro de señal registrado (sin TPV). */
  depositPaidAt?: string;
  depositPaidAmount?: number;
  depositInvoiceId?: string;
  /** Factura final del evento. */
  finalInvoiceId?: string;
  finalPaidAmount?: number;
  quotePdfSentAt?: string;
  linkedQuoteId?: string;
  quoteRejectedAt?: string;
  /** Email de reseña enviado al finalizar. */
  reviewInviteSentAt?: string;
  /** Checklist de planificación (servicios / equipo / lugar). */
  planningChecklist?: string;
  /** Carga extra a llevar (JSON EventRouteStockLine[]) — hoja de rutas. */
  routeExtraStock?: string;
  /** Mando Día D: timeline, checks de carga, equipo, transporte (JSON EventDayOps). */
  dayOps?: string;
  /** PDV temporal auto (TPV tablet del evento). */
  portableWorkCenterId?: string;
  portablePdvId?: string;
  portableTerminalCode?: string;
  portableWarehouseId?: string;
  /** Primera vez que se generó el TPV portátil del evento. */
  portableTpvAt?: string;
  /** Cobro final registrado. */
  finalPaidAt?: string;
  /** Momento en que el pendiente del evento quedó a 0. */
  fullyPaidAt?: string;
  /** Cancelación de la contratación. */
  cancelledAt?: string;
  /** Cantidades ya sembradas en el almacén TPV (JSON Record<catalogItemId, qty>). */
  portableTpvSeededQty?: string;
}

export interface EventQuoteRecord extends VerticalEntity {
  eventId: string;
  eventNombre: string;
  cliente: string;
  lineas: string;
  subtotal: number;
  iva: number;
  total: number;
  estado: 'borrador' | 'enviado' | 'aceptado' | 'rechazado';
  validUntil?: string;
  notas?: string;
}

export const EVENT_CONTRACT_STAGES: Array<{
  id: EventContractStage;
  label: string;
  hint: string;
  order: number;
}> = [
  { id: 'presupuesto', label: 'Presupuesto', hint: 'Borrador interno', order: 1 },
  { id: 'enviado', label: 'Enviado', hint: 'Cliente recibe propuesta', order: 2 },
  { id: 'aceptado', label: 'Aceptado', hint: 'Cliente confirma', order: 3 },
  { id: 'contratado', label: 'Contratado', hint: 'Señal / contrato firmado', order: 4 },
  { id: 'planificacion', label: 'Planificación', hint: 'Catering, logística, material', order: 5 },
  { id: 'en_curso', label: 'En curso', hint: 'Día del evento', order: 6 },
  { id: 'finalizado', label: 'Finalizado', hint: 'Cierre operativo', order: 7 },
  { id: 'cancelado', label: 'Cancelado', hint: 'No se realiza', order: 99 },
];

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  boda: 'Boda',
  corporativo: 'Corporativo',
  cumpleanos: 'Cumpleaños',
  conferencia: 'Conferencia',
  feria: 'Feria',
  gala: 'Gala',
  otro: 'Otro',
};

export const EVENT_STAGE_CONFIG: Record<
  EventContractStage,
  { label: string; bg: string; text: string; bar: string }
> = {
  presupuesto: {
    label: 'Presupuesto',
    bg: 'bg-slate-100 dark:bg-slate-800',
    text: 'text-slate-700 dark:text-slate-300',
    bar: 'bg-slate-400',
  },
  enviado: {
    label: 'Enviado',
    bg: 'bg-sky-50 dark:bg-sky-950/40',
    text: 'text-sky-800 dark:text-sky-300',
    bar: 'bg-sky-500',
  },
  aceptado: {
    label: 'Aceptado',
    bg: 'bg-emerald-50 dark:bg-emerald-950/30',
    text: 'text-emerald-800 dark:text-emerald-300',
    bar: 'bg-emerald-500',
  },
  contratado: {
    label: 'Contratado',
    bg: 'bg-blue-50 dark:bg-blue-950/40',
    text: 'text-blue-800 dark:text-blue-300',
    bar: 'bg-[var(--v-blue,#2563eb)]',
  },
  planificacion: {
    label: 'Planificación',
    bg: 'bg-teal-50 dark:bg-teal-950/30',
    text: 'text-teal-800 dark:text-teal-300',
    bar: 'bg-teal-500',
  },
  en_curso: {
    label: 'En curso',
    bg: 'bg-amber-50 dark:bg-amber-950/30',
    text: 'text-amber-800 dark:text-amber-300',
    bar: 'bg-amber-500',
  },
  finalizado: {
    label: 'Finalizado',
    bg: 'bg-stone-100 dark:bg-stone-800/60',
    text: 'text-stone-600 dark:text-stone-400',
    bar: 'bg-stone-400',
  },
  cancelado: {
    label: 'Cancelado',
    bg: 'bg-rose-50 dark:bg-rose-950/30',
    text: 'text-rose-700 dark:text-rose-300',
    bar: 'bg-[var(--v-rose,#e11d48)]',
  },
};

export function stageOrder(stage: EventContractStage): number {
  return EVENT_CONTRACT_STAGES.find((s) => s.id === stage)?.order ?? 0;
}

export function canAdvanceTo(from: EventContractStage, to: EventContractStage): boolean {
  if (to === 'cancelado') return from !== 'finalizado';
  if (from === 'cancelado' || from === 'finalizado') return false;
  return stageOrder(to) === stageOrder(from) + 1;
}

export function canRetreatTo(from: EventContractStage, to: EventContractStage): boolean {
  if (from === 'cancelado' || to === 'cancelado') return false;
  return stageOrder(to) < stageOrder(from) && stageOrder(to) > 0;
}

const STAGE_IDS = new Set(EVENT_CONTRACT_STAGES.map((s) => s.id));

function asContractStage(value: unknown): EventContractStage | null {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'confirmado') return 'aceptado';
  return STAGE_IDS.has(raw as EventContractStage) ? (raw as EventContractStage) : null;
}

export function maxEventStage(a: EventContractStage, b: EventContractStage): EventContractStage {
  if (a === 'cancelado') return b === 'cancelado' ? 'presupuesto' : b;
  if (b === 'cancelado') return a;
  return stageOrder(a) >= stageOrder(b) ? a : b;
}

/** Paso más alto ya alcanzado (campo + fechas + estado actual). */
export function furthestReachedStage(
  event: Pick<
    EventRecord,
    | 'estado'
    | 'furthestEstado'
    | 'quoteSentAt'
    | 'quotePdfSentAt'
    | 'acceptedAt'
    | 'contractedAt'
    | 'depositPaidAt'
    | 'planificacionAt'
    | 'enCursoAt'
    | 'finishedAt'
  >,
): EventContractStage {
  const stored = asContractStage(event.furthestEstado);
  const current = asContractStage(event.estado) || 'presupuesto';
  let max = maxEventStage(stored && stored !== 'cancelado' ? stored : 'presupuesto', current);
  if (event.quoteSentAt || event.quotePdfSentAt) max = maxEventStage(max, 'enviado');
  if (event.acceptedAt) max = maxEventStage(max, 'aceptado');
  if (event.contractedAt || event.depositPaidAt) max = maxEventStage(max, 'contratado');
  if (event.planificacionAt) max = maxEventStage(max, 'planificacion');
  if (event.enCursoAt) max = maxEventStage(max, 'en_curso');
  if (event.finishedAt) max = maxEventStage(max, 'finalizado');
  return max === 'cancelado' ? 'presupuesto' : max;
}

export function canJumpToReachedStage(
  from: EventContractStage,
  to: EventContractStage,
  furthest: EventContractStage,
): boolean {
  if (from === 'cancelado' || to === 'cancelado') return false;
  if (from === to) return false;
  return stageOrder(to) > 0 && stageOrder(to) <= stageOrder(furthest);
}

export function nextStage(stage: EventContractStage): EventContractStage | null {
  const active = EVENT_CONTRACT_STAGES.filter((s) => s.id !== 'cancelado')
    .sort((a, b) => a.order - b.order);
  const idx = active.findIndex((s) => s.id === stage);
  if (idx < 0 || idx >= active.length - 1) return null;
  return active[idx + 1].id;
}

export type EventPlanningWorker = { id: string; name: string; ok: boolean };

export type EventPlanningChecklist = {
  venueOk: boolean;
  dateOk: boolean;
  servicesOk: string[];
  workers: EventPlanningWorker[];
};

export function emptyPlanningChecklist(): EventPlanningChecklist {
  return { venueOk: false, dateOk: false, servicesOk: [], workers: [] };
}

export function parsePlanningChecklist(raw: unknown): EventPlanningChecklist {
  const empty = emptyPlanningChecklist();
  if (!raw) return empty;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!parsed || typeof parsed !== 'object') return empty;
    const obj = parsed as Record<string, unknown>;
    const workersRaw = Array.isArray(obj.workers) ? obj.workers : [];
    return {
      venueOk: Boolean(obj.venueOk),
      dateOk: Boolean(obj.dateOk),
      servicesOk: Array.isArray(obj.servicesOk)
        ? obj.servicesOk.map((id) => String(id || '').trim()).filter(Boolean)
        : [],
      workers: workersRaw
        .map((w) => {
          if (!w || typeof w !== 'object') return null;
          const row = w as Record<string, unknown>;
          const name = String(row.name || '').trim();
          const id = String(row.id || '').trim() || `w-${name}`;
          if (!name && !id) return null;
          return { id, name: name || id, ok: Boolean(row.ok) };
        })
        .filter((w): w is EventPlanningWorker => Boolean(w)),
    };
  } catch {
    return empty;
  }
}

export function serializePlanningChecklist(list: EventPlanningChecklist): string {
  return JSON.stringify(list);
}

/** Listo: lugar, fecha, todos los servicios del presupuesto y al menos un trabajador OK. */
export function isEventPlanningReady(
  event: Pick<EventRecord, 'lugar' | 'fecha' | 'lineasPresupuesto' | 'planningChecklist'>,
  lines: QuoteLine[],
): boolean {
  const check = parsePlanningChecklist(event.planningChecklist);
  if (!String(event.lugar || '').trim() || !check.venueOk) return false;
  if (!String(event.fecha || '').trim() || !check.dateOk) return false;
  if (lines.length === 0) return false;
  const ok = new Set(check.servicesOk);
  if (!lines.every((line) => ok.has(line.id))) return false;
  return check.workers.some((w) => w.ok);
}

export const EVENT_SERVICE_CATEGORY_LABELS: Record<EventServiceCategory, string> = {
  catering: 'Catering',
  decoracion: 'Decoración',
  musica: 'Música / DJ',
  fotografia: 'Fotografía',
  video: 'Vídeo',
  alquiler: 'Alquiler',
  personal: 'Personal',
  transporte: 'Transporte',
  coordinacion: 'Coordinación',
  otro: 'Otro',
};

export const EVENT_SERVICE_UNIT_LABELS: Record<EventServiceUnit, string> = {
  fijo: 'Precio fijo',
  por_persona: 'Por persona',
  por_hora: 'Por hora',
};
