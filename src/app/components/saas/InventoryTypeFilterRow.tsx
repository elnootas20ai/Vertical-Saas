import type { InventoryOrganizerGroup } from '../../lib/inventoryUtils';

export function InventoryTypeFilterRow({
  groups,
  activeId,
  onSelect,
  totalAll,
}: {
  groups: InventoryOrganizerGroup[];
  activeId: string;
  onSelect: (id: string) => void;
  totalAll: number;
}) {
  const pills: Array<{ id: string; label: string; count: number }> = [
    { id: '', label: 'Todos', count: totalAll },
    ...groups.map((g) => ({ id: g.id, label: g.label, count: g.total })),
  ];

  return (
    <div
      className="flex gap-1.5 overflow-x-auto pb-0.5 [&::-webkit-scrollbar]:hidden"
      style={{ scrollbarWidth: 'none' }}
    >
      {pills.map((pill) => {
        const active = activeId === pill.id;
        return (
          <button
            key={pill.id || 'all'}
            type="button"
            onClick={() => onSelect(pill.id)}
            className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
              active
                ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
                : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            {pill.label}
            <span
              className={`tabular-nums text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                active
                  ? 'bg-white/20 text-inherit dark:bg-gray-900/15'
                  : 'bg-white dark:bg-gray-900 text-gray-400 dark:text-gray-500'
              }`}
            >
              {pill.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
