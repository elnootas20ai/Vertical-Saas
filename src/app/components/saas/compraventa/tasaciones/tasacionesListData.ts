export type TasacionStatus = 'pendiente' | 'negociacion' | 'aceptada' | 'rechazada';

export type TasacionListItem = {
  id: string;
  vehicleLabel: string;
  status: TasacionStatus;
  ownerName: string;
  appraisalDate: string;
  requestedPrice: number;
  make?: string;
  model?: string;
  year?: number;
  mileage?: number;
  licensePlate?: string;
  vin?: string;
  fuel?: string;
  transmission?: string;
  color?: string;
  ownerPhone?: string;
  ownerEmail?: string;
  recommendedPrice?: number;
  observations?: string;
  linkedVehicleId?: string;
  linkedAcquisitionId?: string;
  clientId?: string;
  statusHistory?: { id: string; date: string; label: string; note?: string }[];
};

export type TasacionSortKey = 'recent' | 'dateDesc' | 'dateAsc' | 'priceDesc' | 'priceAsc';

export const TASACION_SORT_OPTIONS: { id: TasacionSortKey; label: string }[] = [
  { id: 'recent', label: 'Más recientes' },
  { id: 'dateDesc', label: 'Fecha · más reciente' },
  { id: 'dateAsc', label: 'Fecha · más antigua' },
  { id: 'priceDesc', label: 'Precio · mayor' },
  { id: 'priceAsc', label: 'Precio · menor' },
];

export const TASACION_STATUS_TOKEN: Record<
  TasacionStatus,
  { label: string; badgeBg: string; badgeText: string; dot: string }
> = {
  pendiente: {
    label: 'Pendiente',
    dot: 'bg-amber-500',
    badgeBg: 'bg-amber-50',
    badgeText: 'text-amber-700',
  },
  negociacion: {
    label: 'En negociación',
    dot: 'bg-violet-500',
    badgeBg: 'bg-violet-50',
    badgeText: 'text-violet-700',
  },
  aceptada: {
    label: 'Aceptada',
    dot: 'bg-emerald-500',
    badgeBg: 'bg-emerald-50',
    badgeText: 'text-emerald-700',
  },
  rechazada: {
    label: 'Rechazada',
    dot: 'bg-slate-400',
    badgeBg: 'bg-slate-100',
    badgeText: 'text-slate-600',
  },
};

export const TASACION_STATUS_FILTER_OPTIONS: { id: TasacionStatus | 'all'; label: string }[] = [
  { id: 'all', label: 'Todos' },
  ...Object.entries(TASACION_STATUS_TOKEN).map(([id, token]) => ({
    id: id as TasacionStatus,
    label: token.label,
  })),
];

export function formatTasacionPrice(value: number): string {
  return value.toLocaleString('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  });
}

export function formatTasacionDate(value: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatTasacionMileage(value?: number): string {
  if (value == null || value <= 0) return '—';
  return `${value.toLocaleString('es-ES')} km`;
}

export function formatTasacionYear(value?: number): string {
  if (value == null || value <= 0) return '—';
  return String(value);
}
