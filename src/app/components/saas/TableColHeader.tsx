/**
 * TableColHeader — Cabecera de columna reutilizable con:
 *   · Ordenación asc / desc / ninguna (clic en etiqueta)
 *   · Filtro multiselección + búsqueda (clic en icono funnel)
 *
 * Uso:
 *   <TableColHeader
 *     label="Estado"
 *     sortKey="stage"
 *     sortState={sortState}
 *     onSort={setSortState}
 *     filterOptions={stageOptions}
 *     filterSelected={filterStage}
 *     onFilterToggle={v => setFilterStage(s => toggleSet(s, v))}
 *     onFilterClear={() => setFilterStage(new Set())}
 *   />
 */

import { useState, useRef, useEffect } from 'react';
import {
  ChevronsUpDown, ChevronUp, ChevronDown,
  Filter, Search, X, Check,
} from 'lucide-react';

export type SortDir = 'asc' | 'desc' | null;

export interface SortState {
  key: string;
  dir: SortDir;
}

interface TableColHeaderProps {
  /** Text shown in the header */
  label: string;
  /** Sort key — used to match against SortState.key. Omit to disable sorting. */
  sortKey?: string;
  sortState?: SortState;
  onSort?: (s: SortState) => void;
  /** Filter options — omit to disable the filter dropdown */
  filterOptions?: { value: string; label: string }[];
  filterSelected?: Set<string>;
  onFilterToggle?: (v: string) => void;
  onFilterClear?: () => void;
  /** Extra classes on the outer <th> */
  className?: string;
  align?: 'left' | 'right';
}

export function TableColHeader({
  label,
  sortKey,
  sortState,
  onSort,
  filterOptions,
  filterSelected,
  onFilterToggle,
  onFilterClear,
  className = '',
  align = 'left',
}: TableColHeaderProps) {
  const [filterOpen, setFilterOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setFilterOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const isSortActive = sortKey && sortState?.key === sortKey && sortState.dir !== null;
  const dir = isSortActive ? sortState!.dir : null;

  const handleSort = () => {
    if (!sortKey || !onSort) return;
    const next: SortDir = dir === null ? 'asc' : dir === 'asc' ? 'desc' : null;
    onSort({ key: sortKey, dir: next });
  };

  const filteredOpts = (filterOptions ?? []).filter(o =>
    o.label.toLowerCase().includes(q.toLowerCase())
  );
  const selCount = filterSelected?.size ?? 0;
  const hasFilter = filterOptions && filterOptions.length > 0;

  const SortIcon = dir === 'asc' ? ChevronUp : dir === 'desc' ? ChevronDown : ChevronsUpDown;

  return (
    <th
      className={`px-5 py-3 text-${align} select-none ${className}`}
    >
      <div className={`flex items-center gap-1.5 ${align === 'right' ? 'justify-end' : ''}`}>

        {/* ── Label + sort icon ──────────────────────────── */}
        {sortKey ? (
          <button
            onClick={handleSort}
            className={`group flex items-center gap-1 transition-colors ${
              isSortActive ? 'text-blue-600' : 'text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <span className="text-xs font-semibold uppercase tracking-wider whitespace-nowrap">
              {label}
            </span>
            <SortIcon
              className={`w-3.5 h-3.5 flex-shrink-0 transition-colors ${
                isSortActive ? 'text-blue-600' : 'text-gray-300 group-hover:text-gray-500'
              }`}
            />
          </button>
        ) : (
          <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider whitespace-nowrap">
            {label}
          </span>
        )}

        {/* ── Filter icon + dropdown ─────────────────────── */}
        {hasFilter && (
          <div className="relative" ref={ref}>
            <button
              onClick={() => setFilterOpen(v => !v)}
              title="Filtrar"
              className={`flex items-center justify-center transition-colors ${
                selCount > 0 ? 'text-blue-600' : 'text-gray-300 hover:text-gray-500'
              }`}
            >
              {selCount > 0 ? (
                <span className="flex items-center justify-center w-4 h-4 bg-blue-600 text-white text-[9px] font-bold rounded-full leading-none">
                  {selCount}
                </span>
              ) : (
                <Filter className="w-3 h-3" />
              )}
            </button>

            {filterOpen && (
              <div className="absolute top-full left-0 mt-2 z-50 bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 w-56 overflow-hidden">
                {/* Search */}
                <div className="p-2 border-b border-gray-100 dark:border-gray-800">
                  <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 rounded-xl px-2.5 py-2">
                    <Search className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                    <input
                      autoFocus
                      value={q}
                      onChange={e => setQ(e.target.value)}
                      placeholder="Buscar…"
                      className="flex-1 bg-transparent text-xs text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 outline-none"
                    />
                    {q && (
                      <button onClick={() => setQ('')}>
                        <X className="w-3 h-3 text-gray-400 dark:text-gray-500 hover:text-gray-600" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Options list */}
                <div className="max-h-52 overflow-y-auto py-1">
                  {filteredOpts.length === 0 ? (
                    <p className="px-4 py-3 text-xs text-gray-400 dark:text-gray-500 text-center">Sin resultados</p>
                  ) : (
                    filteredOpts.map(opt => {
                      const active = filterSelected?.has(opt.value) ?? false;
                      return (
                        <button
                          key={opt.value}
                          onClick={() => onFilterToggle?.(opt.value)}
                          className={`w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 text-left transition-colors ${active ? 'bg-blue-50' : ''}`}
                        >
                          <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                            active ? 'bg-blue-600 border-blue-600' : 'border-gray-300'
                          }`}>
                            {active && <Check className="w-2.5 h-2.5 text-white" />}
                          </div>
                          <span className={`text-sm truncate ${active ? 'font-semibold text-blue-700' : 'text-gray-700 dark:text-gray-300'}`}>
                            {opt.label}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>

                {/* Clear */}
                {selCount > 0 && (
                  <div className="border-t border-gray-100 dark:border-gray-800 p-2">
                    <button
                      onClick={() => { onFilterClear?.(); setFilterOpen(false); }}
                      className="w-full py-1.5 text-xs font-medium text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      Limpiar selección ({selCount})
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </th>
  );
}

// ─── Helper: apply sort to any array ──────────────────────────────────────────

export function applySortToArray<T>(
  arr: T[],
  sortState: SortState,
  getVal: (item: T, key: string) => string | number | null | undefined
): T[] {
  if (!sortState.dir) return arr;
  const { key, dir } = sortState;
  return [...arr].sort((a, b) => {
    const va = getVal(a, key) ?? '';
    const vb = getVal(b, key) ?? '';
    let cmp = 0;
    if (typeof va === 'number' && typeof vb === 'number') {
      cmp = va - vb;
    } else {
      cmp = String(va).localeCompare(String(vb), 'es', { sensitivity: 'base' });
    }
    return dir === 'asc' ? cmp : -cmp;
  });
}
