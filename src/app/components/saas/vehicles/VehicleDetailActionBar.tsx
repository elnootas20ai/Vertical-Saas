import { Archive, Pencil, Trash2 } from 'lucide-react';

const ACTIONS = [
  { id: 'edit', label: 'Editar', icon: Pencil },
  { id: 'archive', label: 'Archivar', icon: Archive },
  { id: 'delete', label: 'Eliminar', icon: Trash2, danger: true },
] as const;

type VehicleDetailActionBarProps = {
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
  disabled?: boolean;
};

export function VehicleDetailActionBar({
  onEdit,
  onArchive,
  onDelete,
  disabled = false,
}: VehicleDetailActionBarProps) {
  const handlers = {
    edit: onEdit,
    archive: onArchive,
    delete: onDelete,
  };

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
              onClick={handlers[action.id]}
              className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
                action.danger
                  ? 'border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300'
                  : 'border border-gray-200/90 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" strokeWidth={2} />
              {action.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
