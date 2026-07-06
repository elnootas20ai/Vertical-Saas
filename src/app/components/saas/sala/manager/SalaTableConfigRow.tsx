import { Minus, Plus, Pencil, Trash2 } from 'lucide-react';
import type { ExtendedDiningTable } from '../../../../lib/salaStudioTypes';
import {
  TABLE_SIZE_PRESETS,
  inferTableSizePreset,
  type TableSizePreset,
} from '../../../../lib/salaTableSize';
import { SALA_TABLE_LIST_GRID } from './salaTableListLayout';

type Props = {
  table: ExtendedDiningTable;
  onEdit: () => void;
  onSizeChange: (sizePreset: TableSizePreset) => void;
  onCapacityChange: (capacity: number) => void;
  onActiveChange: (active: boolean) => void;
  onDelete: () => void;
};

/** Fila compacta de configuración de mesa — cabe en lista fija sin scroll. */
export function SalaTableConfigRow({
  table,
  onEdit,
  onSizeChange,
  onCapacityChange,
  onActiveChange,
  onDelete,
}: Props) {
  const sizePreset = table.sizePreset || inferTableSizePreset(table.gridW, table.gridH, table.capacity);
  const isActive = table.visible !== false;
  const displayName = String(table.name || `Mesa ${table.number}`).trim();

  const handleDelete = () => {
    if (window.confirm(`¿Eliminar la mesa ${table.number}?`)) onDelete();
  };

  return (
    <div
      className={`${SALA_TABLE_LIST_GRID} border-b border-gray-100 px-3 py-2 last:border-b-0 dark:border-gray-800/80 ${
        isActive ? '' : 'opacity-70'
      }`}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100" title={displayName}>
          {displayName}
        </span>
        <button
          type="button"
          onClick={onEdit}
          title="Editar nombre y notas"
          className="shrink-0 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </div>

      <select
        value={sizePreset}
        onChange={(e) => onSizeChange(e.target.value as TableSizePreset)}
        aria-label={`Tamaño de ${displayName}`}
        className="w-full rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs font-medium text-gray-700 outline-none focus:border-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
      >
        {(Object.keys(TABLE_SIZE_PRESETS) as TableSizePreset[]).map((key) => (
          <option key={key} value={key}>
            {TABLE_SIZE_PRESETS[key].shortLabel}
          </option>
        ))}
      </select>

      <div className="inline-flex w-full items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700">
        <button
          type="button"
          onClick={() => onCapacityChange(Math.max(1, (table.capacity || 1) - 1))}
          className="flex h-7 w-7 shrink-0 items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-800"
          aria-label="Reducir aforo"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <span className="min-w-[1.5rem] flex-1 text-center text-sm font-semibold tabular-nums">
          {table.capacity}
        </span>
        <button
          type="button"
          onClick={() => onCapacityChange(Math.min(20, (table.capacity || 1) + 1))}
          className="flex h-7 w-7 shrink-0 items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-800"
          aria-label="Aumentar aforo"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex justify-center">
        <button
          type="button"
          role="switch"
          aria-checked={isActive}
          aria-label={isActive ? 'Mesa activa en TPV' : 'Mesa inactiva en TPV'}
          onClick={() => onActiveChange(!isActive)}
          className={`relative h-5 w-9 shrink-0 rounded-full transition ${
            isActive ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'
          }`}
        >
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${
              isActive ? 'left-[18px]' : 'left-0.5'
            }`}
          />
        </button>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleDelete}
          title="Eliminar mesa"
          aria-label={`Eliminar ${displayName}`}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
