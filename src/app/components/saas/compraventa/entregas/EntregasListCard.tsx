import { User } from 'lucide-react';
import {
  ENTREGA_STATUS_TOKEN,
  formatEntregaDate,
  type EntregaListItem,
} from './entregasListData';

type EntregasListCardProps = {
  entrega: EntregaListItem;
  selected: boolean;
  onSelect: () => void;
};

export function EntregasListCard({ entrega, selected, onSelect }: EntregasListCardProps) {
  const statusToken = ENTREGA_STATUS_TOKEN[entrega.status];

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
          {entrega.vehicleLabel || 'Vehículo sin asignar'}
        </p>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusToken.badgeBg} ${statusToken.badgeText}`}
        >
          {statusToken.label}
        </span>
      </div>

      <div className="mt-2 flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
        <User className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{entrega.clientName || 'Sin cliente'}</span>
      </div>

      <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
          Fecha prevista
        </span>
        <p className="mt-0.5 font-medium text-gray-700 dark:text-gray-300">
          {formatEntregaDate(entrega.expectedDate)}
        </p>
      </div>
    </button>
  );
}
