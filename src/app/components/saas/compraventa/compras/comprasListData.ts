export type PurchaseStatus = 'pendiente' | 'confirmada' | 'completada' | 'cancelada';

export type PurchaseSupplierType = 'proveedor' | 'particular';

export type CompraListItem = {
  id: string;
  vehicleLabel: string;
  status: PurchaseStatus;
  purchaseDate: string;
  purchasePrice: number;
  supplierName: string;
  supplierType: PurchaseSupplierType;
  associatedExpenses?: number;
  vehicleId?: string;
  tradeInId?: string;
  statusHistory?: { id: string; date: string; label: string; note?: string }[];
};

export type CompraSortKey = 'recent' | 'dateDesc' | 'dateAsc' | 'priceDesc' | 'priceAsc';

export const COMPRA_SORT_OPTIONS: { id: CompraSortKey; label: string }[] = [
  { id: 'recent', label: 'Más recientes' },
  { id: 'dateDesc', label: 'Fecha · más reciente' },
  { id: 'dateAsc', label: 'Fecha · más antigua' },
  { id: 'priceDesc', label: 'Precio · mayor' },
  { id: 'priceAsc', label: 'Precio · menor' },
];

export const PURCHASE_STATUS_TOKEN: Record<
  PurchaseStatus,
  { label: string; badgeBg: string; badgeText: string; dot: string }
> = {
  pendiente: {
    label: 'Pendiente',
    dot: 'bg-amber-500',
    badgeBg: 'bg-amber-50',
    badgeText: 'text-amber-700',
  },
  confirmada: {
    label: 'Confirmada',
    dot: 'bg-blue-500',
    badgeBg: 'bg-blue-50',
    badgeText: 'text-blue-700',
  },
  completada: {
    label: 'Completada',
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

export const PURCHASE_STATUS_FILTER_OPTIONS: { id: PurchaseStatus | 'all'; label: string }[] = [
  { id: 'all', label: 'Todos' },
  ...Object.entries(PURCHASE_STATUS_TOKEN).map(([id, token]) => ({
    id: id as PurchaseStatus,
    label: token.label,
  })),
];

export function formatCompraPrice(value: number): string {
  return value.toLocaleString('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  });
}

export function formatCompraDate(value: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function purchaseSupplierLabel(type: PurchaseSupplierType): string {
  return type === 'particular' ? 'Particular' : 'Proveedor';
}
