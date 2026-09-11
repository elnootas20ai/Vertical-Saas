import { ChevronRight } from 'lucide-react';
import type { InventoryOrganizerGroup } from '../../lib/inventoryUtils';

function normalizeChipColor(raw: string | undefined): string | undefined {
  const c = String(raw || '').trim();
  if (!c) return undefined;
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c)) return c;
  return undefined;
}

function formatCount(n: number): string {
  return n.toLocaleString('es-ES');
}

/**
 * Misma piel que Carta: grid de organizadores (Bebidas, Envases…).
 * Un toque abre el listado de esa categoría.
 * Stats por organizador (correcto / bajo / sin stock) para orientar.
 */
export function InventoryTypeFilterRow({
  groups,
  activeId: _activeId,
  onSelect,
}: {
  groups: InventoryOrganizerGroup[];
  activeId?: string;
  onSelect: (id: string) => void;
}) {
  if (groups.length === 0) return null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
      {groups.map((group) => {
        const color = normalizeChipColor(group.color);
        const outCount = group.out + group.negative;
        return (
          <button
            key={group.id}
            type="button"
            onClick={() => onSelect(group.id)}
            className="group flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-sm transition-all hover:border-blue-300 hover:shadow-md dark:border-gray-700 dark:bg-gray-800 dark:hover:border-blue-700"
          >
            <div className="flex items-center justify-between w-full">
              <span
                className={
                  color
                    ? 'flex h-10 w-10 items-center justify-center rounded-full text-xs font-bold'
                    : 'flex h-10 w-10 items-center justify-center rounded-full bg-stone-100 text-xs font-bold text-stone-500 dark:bg-stone-700 dark:text-stone-200'
                }
                style={color ? { backgroundColor: `${color}22`, color } : undefined}
              >
                {group.label.slice(0, 2).toUpperCase()}
              </span>
              <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-[var(--v-blue,#2563eb)] group-hover:translate-x-0.5 transition-all shrink-0" />
            </div>
            <div className="min-w-0 w-full space-y-2">
              <div>
                <p className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate group-hover:text-[var(--v-blue,#2563eb)]">
                  {group.label}
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 tabular-nums">
                  {formatCount(group.total)} artículo{group.total !== 1 ? 's' : ''}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-gray-100 pt-2 dark:border-gray-700/80">
                <span className="inline-flex items-baseline gap-1 tabular-nums">
                  <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400">
                    {formatCount(group.ok)}
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                    ok
                  </span>
                </span>
                <span className="text-gray-200 dark:text-gray-700" aria-hidden>
                  ·
                </span>
                <span className="inline-flex items-baseline gap-1 tabular-nums">
                  <span
                    className={`text-sm font-bold ${
                      group.low > 0
                        ? 'text-amber-700 dark:text-amber-400'
                        : 'text-gray-500 dark:text-gray-400'
                    }`}
                  >
                    {formatCount(group.low)}
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                    bajo
                  </span>
                </span>
                <span className="text-gray-200 dark:text-gray-700" aria-hidden>
                  ·
                </span>
                <span className="inline-flex items-baseline gap-1 tabular-nums">
                  <span
                    className={`text-sm font-bold ${
                      outCount > 0
                        ? 'text-red-700 dark:text-red-400'
                        : 'text-gray-500 dark:text-gray-400'
                    }`}
                  >
                    {formatCount(outCount)}
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                    sin
                  </span>
                </span>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
