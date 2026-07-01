import { User } from 'lucide-react';
import {
  formatVentaDate,
  formatVentaPrice,
  SALE_STATUS_TOKEN,
  type VentaListItem,
} from './ventasListData';

type VentasListCardProps = {
  sale: VentaListItem;
  selected: boolean;
  onSelect: () => void;
};

export function VentasListCard({ sale, selected, onSelect }: VentasListCardProps) {
  const statusToken = SALE_STATUS_TOKEN[sale.status];

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-2xl border p-3.5 text-left transition-all duration-150 ${
        selected
          ? 'border-amber-400/90 bg-amber-50/60 shadow-md ring-1 ring-amber-400/25 dark:border-amber-500/60 dark:bg-amber-950/25'
          : 'border-gray-200/90 bg-white hover:border-gray-300 hover:shadow-sm dark:border-gray-700/90 dark:bg-gray-900 dark:hover:border-gray-600'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-semibold tracking-tight text-gray-900 dark:text-gray-100">
          {sale.vehicleLabel || 'Vehículo sin asignar'}
        </p>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusToken.badgeBg} ${statusToken.badgeText}`}
        >
          {statusToken.label}
        </span>
      </div>

      <div className="mt-2 flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
        <User className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{sale.clientName || 'Sin cliente'}</span>
      </div>

      <div className="mt-2 flex items-center justify-between gap-3 text-xs text-gray-500 dark:text-gray-400">
        <span>{formatVentaDate(sale.saleDate)}</span>
        <span className="font-bold tabular-nums text-gray-900 dark:text-gray-100">
          {formatVentaPrice(sale.salePrice)}
        </span>
      </div>
    </button>
  );
}
