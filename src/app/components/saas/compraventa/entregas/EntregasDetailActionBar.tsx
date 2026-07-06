import { CheckCircle2, ClipboardList, Pencil, Printer } from 'lucide-react';

const ACTIONS = [
  { id: 'prepare', label: 'Preparar entrega', icon: ClipboardList },
  { id: 'edit', label: 'Editar', icon: Pencil },
  { id: 'print', label: 'Imprimir documentación', icon: Printer },
  { id: 'deliver', label: 'Marcar como entregado', icon: CheckCircle2, primary: true },
] as const;

export type EntregaActionId = (typeof ACTIONS)[number]['id'];

type EntregasDetailActionBarProps = {
  showActions?: boolean;
  disabled?: boolean;
  onAction?: (actionId: EntregaActionId) => void;
};

export function EntregasDetailActionBar({
  showActions = false,
  disabled = false,
  onAction,
}: EntregasDetailActionBarProps) {
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
