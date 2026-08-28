import type { CSSProperties } from 'react';
import type { InventoryOrganizerGroup } from '../../lib/inventoryUtils';

function normalizeChipColor(raw: string | undefined): string | undefined {
  const c = String(raw || '').trim();
  if (!c) return undefined;
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c)) return c;
  return undefined;
}

/** Estilo solo si hay color configurado; sin color = clases neutras (sin defaults inventados). */
function optionalChipStyle(color: string | undefined, active: boolean): CSSProperties | undefined {
  const c = normalizeChipColor(color);
  if (!c) return undefined;
  if (active) {
    return { backgroundColor: c, color: '#fff', borderColor: c };
  }
  return {
    backgroundColor: `${c}1a`,
    color: c,
    borderColor: `${c}66`,
  };
}

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
        const colored = optionalChipStyle(group.color, active);
        return (
          <button
            key={group.id}
            type="button"
            onClick={() => onSelect(group.id)}
            style={colored}
            className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap border ${
              colored
                ? 'border-solid'
                : active
                  ? 'border-transparent bg-gray-900 text-white dark:bg-white dark:text-gray-900'
                  : 'border-transparent bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            {group.label}
            <span
              className={`tabular-nums text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                colored
                  ? active
                    ? 'bg-white/20 text-inherit'
                    : 'bg-white/70 dark:bg-black/20 text-inherit'
                  : active
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
