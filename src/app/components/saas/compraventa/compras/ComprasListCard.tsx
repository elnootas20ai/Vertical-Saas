import { Building2, User } from 'lucide-react';
import {
  formatCompraDate,
  formatCompraPrice,
  PURCHASE_STATUS_TOKEN,
  purchaseSupplierLabel,
  type CompraListItem,
} from './comprasListData';

type ComprasListCardProps = {
  purchase: CompraListItem;
  selected: boolean;
  onSelect: () => void;
};

export function ComprasListCard({ purchase, selected, onSelect }: ComprasListCardProps) {
  const statusToken = PURCHASE_STATUS_TOKEN[purchase.status];
  const SupplierIcon = purchase.supplierType === 'particular' ? User : Building2;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-2xl border p-3.5 text-left transition-all duration-150 ${
        selected
          ? 'border-[var(--v-blue,#2563eb)] bg-blue-50/70 shadow-md ring-1 ring-blue-500/20 dark:border-blue-500/60 dark:bg-blue-950/30'
          : 'border-slate-200/90 bg-white hover:border-blue-200 hover:shadow-sm dark:border-slate-700/90 dark:bg-slate-900 dark:hover:border-blue-800'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100">
          {purchase.vehicleLabel || 'Vehículo sin asignar'}
        </p>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusToken.badgeBg} ${statusToken.badgeText}`}
        >
          {statusToken.label}
        </span>
      </div>

      <div className="mt-2 flex items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
        <span>{formatCompraDate(purchase.purchaseDate)}</span>
        <span className="font-extrabold tabular-nums text-slate-900 dark:text-slate-100">
          {formatCompraPrice(purchase.purchasePrice)}
        </span>
      </div>

      <div className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
        <SupplierIcon className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">
          {purchaseSupplierLabel(purchase.supplierType)}
          {purchase.supplierName ? ` · ${purchase.supplierName}` : ''}
        </span>
      </div>
    </button>
  );
}
