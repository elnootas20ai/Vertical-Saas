import { Banknote, Pencil, Plus, Tag, Truck, XCircle } from 'lucide-react';

const ACTIONS = [
  { id: 'edit', label: 'Editar', icon: Pencil },
  { id: 'reserve', label: 'Reservar', icon: Tag },
  { id: 'confirm', label: 'Confirmar venta', icon: Banknote },
  { id: 'deliver', label: 'Entregar', icon: Truck, primary: true },
  { id: 'cancel', label: 'Cancelar', icon: XCircle, danger: true },
] as const;

export type VentaActionId = (typeof ACTIONS)[number]['id'];

type VentasDetailActionBarProps = {
  showActions?: boolean;
  disabled?: boolean;
  onAction?: (actionId: VentaActionId) => void;
};

export function VentasDetailActionBar({
  showActions = false,
  disabled = false,
  onAction,
}: VentasDetailActionBarProps) {
  if (!showActions) return null;

  return (
    <div className="shrink-0 border-b border-gray-200/80 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-950">
      <div className="flex gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {ACTIONS.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.id}
              type="button"
              disabled={disabled}
              onClick={() => onAction?.(action.id)}
              className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
                action.primary
                  ? 'bg-amber-500 text-white shadow-sm shadow-amber-500/25 hover:bg-amber-600'
                  : action.danger
                    ? 'border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400'
                    : 'border border-gray-200/90 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" strokeWidth={action.primary ? 2.25 : 2} />
              {action.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

type VentasNewSaleButtonProps = {
  disabled?: boolean;
  onClick?: () => void;
};

export function VentasNewSaleButton({ disabled = false, onClick }: VentasNewSaleButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-gray-900 px-3.5 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900"
    >
      <Plus className="h-4 w-4" />
      Nueva venta
    </button>
  );
}
