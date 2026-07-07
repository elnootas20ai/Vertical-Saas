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
  quoteSentAt?: string;
  acceptedAt?: string;
  contractedAt?: string;
  finishedAt?: string;
  /** Cobro de señal registrado (sin TPV). */
  depositPaidAt?: string;
  depositPaidAmount?: number;
  depositInvoiceId?: string;
  /** Factura final del evento. */
  finalInvoiceId?: string;
  finalPaidAmount?: number;
  quotePdfSentAt?: string;
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
  { id: 'planificacion', label: 'Planificación', hint: 'Catering, logística, invitados', order: 5 },
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
  { label: string; bg: string; text: string }
> = {
  presupuesto: { label: 'Presupuesto', bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-700 dark:text-slate-300' },
  enviado: { label: 'Enviado', bg: 'bg-sky-50 dark:bg-sky-900/30', text: 'text-sky-700 dark:text-sky-300' },
  aceptado: { label: 'Aceptado', bg: 'bg-emerald-50 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-300' },
  contratado: { label: 'Contratado', bg: 'bg-indigo-50 dark:bg-indigo-900/30', text: 'text-indigo-700 dark:text-indigo-300' },
  planificacion: { label: 'Planificación', bg: 'bg-violet-50 dark:bg-violet-900/30', text: 'text-violet-700 dark:text-violet-300' },
  en_curso: { label: 'En curso', bg: 'bg-amber-50 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-300' },
  finalizado: { label: 'Finalizado', bg: 'bg-gray-100 dark:bg-gray-700/50', text: 'text-gray-600 dark:text-gray-400' },
  cancelado: { label: 'Cancelado', bg: 'bg-red-50 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300' },
};

export function stageOrder(stage: EventContractStage): number {
  return EVENT_CONTRACT_STAGES.find((s) => s.id === stage)?.order ?? 0;
}

export function canAdvanceTo(from: EventContractStage, to: EventContractStage): boolean {
  if (to === 'cancelado') return from !== 'finalizado';
  if (from === 'cancelado' || from === 'finalizado') return false;
  return stageOrder(to) === stageOrder(from) + 1;
}

export function nextStage(stage: EventContractStage): EventContractStage | null {
  const active = EVENT_CONTRACT_STAGES.filter((s) => s.id !== 'cancelado')
    .sort((a, b) => a.order - b.order);
  const idx = active.findIndex((s) => s.id === stage);
  if (idx < 0 || idx >= active.length - 1) return null;
  return active[idx + 1].id;
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
