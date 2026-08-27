import type { InventoryOrganizerGroup } from '../../lib/inventoryUtils';

export function InventoryTypeFilterRow({
  groups,
  activeId,
  onSelect,
}: {
  groups: InventoryOrganizerGroup[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  if (groups.length === 0) return null;

  return (
    <div
      className="flex gap-1.5 overflow-x-auto pb-0.5 [&::-webkit-scrollbar]:hidden"
      style={{ scrollbarWidth: 'none' }}
    >
      {groups.map((group) => {
        const active = activeId === group.id;
        return (
          <button
            key={group.id}
            type="button"
            onClick={() => onSelect(group.id)}
            className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
              active
                ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
                : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            {group.label}
            <span
              className={`tabular-nums text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                active
                  ? 'bg-white/20 text-inherit dark:bg-gray-900/15'
                  : 'bg-white dark:bg-gray-900 text-gray-400 dark:text-gray-500'
              }`}
            >
              {group.total.toLocaleString('es-ES')}
            </span>
          </button>
        );
      })}
    </div>
  );
}
