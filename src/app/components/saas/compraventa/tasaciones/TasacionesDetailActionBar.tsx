import { Check, Pencil, Plus, Trash2, XCircle } from 'lucide-react';

const ACTIONS = [
  { id: 'edit', label: 'Editar', icon: Pencil },
  { id: 'accept', label: 'Aceptar', icon: Check, primary: true },
  { id: 'reject', label: 'Rechazar', icon: XCircle },
  { id: 'delete', label: 'Eliminar', icon: Trash2, danger: true },
] as const;

type TasacionesDetailActionBarProps = {
  showActions?: boolean;
  disabled?: boolean;
  onAction?: (actionId: typeof ACTIONS[number]['id']) => void;
};

export function TasacionesDetailActionBar({
  showActions = false,
  disabled = false,
  onAction,
}: TasacionesDetailActionBarProps) {
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
                  ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/25 hover:bg-emerald-700'
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

export function TasacionesNewButton({
  disabled = false,
  onClick,
}: {
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-gray-900 px-3.5 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900"
    >
      <Plus className="h-4 w-4" />
      Nueva tasación
    </button>
  );
}
