export type EntregaStatus = 'pendiente' | 'preparando' | 'lista' | 'entregada';

export type EntregaChecklistKey =
  | 'documentationReady'
  | 'keysDelivered'
  | 'warrantyDelivered'
  | 'vehicleInspected'
  | 'cleaningDone'
  | 'fuelDeposit'
  | 'accessoriesIncluded'
  | 'clientSignature';

export type EntregaListItem = {
  id: string;
  vehicleLabel: string;
  clientName: string;
  expectedDate: string;
  status: EntregaStatus;
  salesPerson?: string;
  observations?: string;
  checklist?: Partial<Record<EntregaChecklistKey, boolean>>;
};

export type EntregaSortKey = 'recent' | 'dateDesc' | 'dateAsc';

export const ENTREGA_SORT_OPTIONS: { id: EntregaSortKey; label: string }[] = [
  { id: 'recent', label: 'Más recientes' },
  { id: 'dateDesc', label: 'Fecha · más próxima' },
  { id: 'dateAsc', label: 'Fecha · más lejana' },
];

export const ENTREGA_STATUS_TOKEN: Record<
  EntregaStatus,
  { label: string; badgeBg: string; badgeText: string; dot: string }
> = {
  pendiente: {
    label: 'Pendiente',
    dot: 'bg-amber-500',
    badgeBg: 'bg-amber-50',
    badgeText: 'text-amber-700',
  },
  preparando: {
    label: 'Preparando entrega',
    dot: 'bg-blue-500',
    badgeBg: 'bg-blue-50',
    badgeText: 'text-blue-700',
  },
  lista: {
    label: 'Lista para entregar',
    dot: 'bg-violet-500',
    badgeBg: 'bg-violet-50',
    badgeText: 'text-violet-700',
  },
  entregada: {
    label: 'Entregada',
    dot: 'bg-emerald-500',
    badgeBg: 'bg-emerald-50',
    badgeText: 'text-emerald-700',
  },
};

export const ENTREGA_STATUS_FILTER_OPTIONS: { id: EntregaStatus | 'all'; label: string }[] = [
  { id: 'all', label: 'Todos' },
  ...Object.entries(ENTREGA_STATUS_TOKEN).map(([id, token]) => ({
    id: id as EntregaStatus,
    label: token.label,
  })),
];

export const ENTREGA_CHECKLIST_ITEMS: { id: EntregaChecklistKey; label: string }[] = [
  { id: 'documentationReady', label: 'Documentación preparada' },
  { id: 'keysDelivered', label: 'Llaves entregadas' },
  { id: 'warrantyDelivered', label: 'Garantía entregada' },
  { id: 'vehicleInspected', label: 'Vehículo revisado' },
  { id: 'cleaningDone', label: 'Limpieza realizada' },
  { id: 'fuelDeposit', label: 'Depósito de combustible' },
  { id: 'accessoriesIncluded', label: 'Accesorios incluidos' },
  { id: 'clientSignature', label: 'Firma del cliente' },
];

export function formatEntregaDate(value: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function entregaChecklistProgress(item: EntregaListItem): { done: number; total: number } {
  const total = ENTREGA_CHECKLIST_ITEMS.length;
  const done = ENTREGA_CHECKLIST_ITEMS.filter(
    ({ id }) => item.checklist?.[id] === true,
  ).length;
  return { done, total };
}
