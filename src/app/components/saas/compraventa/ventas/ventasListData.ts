export type SaleStatus = 'reserva' | 'confirmada' | 'entregada' | 'cancelada';

export type VentaListItem = {
  id: string;
  vehicleLabel: string;
  status: SaleStatus;
  clientName: string;
  saleDate: string;
  salePrice: number;
  sellerName?: string;
  purchasePrice?: number;
  expenses?: number;
  reservationAmount?: number;
  financing?: boolean;
  paymentMethod?: string;
  expectedDeliveryDate?: string;
};

export type VentaSortKey = 'recent' | 'dateDesc' | 'dateAsc' | 'priceDesc' | 'priceAsc';

export const VENTA_SORT_OPTIONS: { id: VentaSortKey; label: string }[] = [
  { id: 'recent', label: 'Más recientes' },
  { id: 'dateDesc', label: 'Fecha · más reciente' },
  { id: 'dateAsc', label: 'Fecha · más antigua' },
  { id: 'priceDesc', label: 'Precio · mayor' },
  { id: 'priceAsc', label: 'Precio · menor' },
];

export const SALE_STATUS_TOKEN: Record<
  SaleStatus,
  { label: string; badgeBg: string; badgeText: string; dot: string }
> = {
  reserva: {
    label: 'Reserva',
    dot: 'bg-violet-500',
    badgeBg: 'bg-violet-50',
    badgeText: 'text-violet-700',
  },
  confirmada: {
    label: 'Confirmada',
    dot: 'bg-blue-500',
    badgeBg: 'bg-blue-50',
    badgeText: 'text-blue-700',
  },
  entregada: {
    label: 'Entregada',
    dot: 'bg-emerald-500',
    badgeBg: 'bg-emerald-50',
    badgeText: 'text-emerald-700',
  },
  cancelada: {
    label: 'Cancelada',
    dot: 'bg-slate-400',
    badgeBg: 'bg-slate-100',
    badgeText: 'text-slate-600',
  },
};

export const SALE_STATUS_FILTER_OPTIONS: { id: SaleStatus | 'all'; label: string }[] = [
  { id: 'all', label: 'Todos' },
  ...Object.entries(SALE_STATUS_TOKEN).map(([id, token]) => ({
    id: id as SaleStatus,
    label: token.label,
  })),
];

export function formatVentaPrice(value: number): string {
  return value.toLocaleString('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  });
}

export function formatVentaDate(value: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function ventaEstimatedProfit(item: VentaListItem): number {
  const purchase = item.purchasePrice ?? 0;
  const expenses = item.expenses ?? 0;
  return item.salePrice - purchase - expenses;
}
