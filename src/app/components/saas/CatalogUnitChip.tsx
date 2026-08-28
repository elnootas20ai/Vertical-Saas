import { formatQtyEs } from '../../lib/formatNumberEs';

/**
 * Chip de unidad (kg, ud, L…) — más visible que texto suelto al lado del nombre/stock.
 * Uso: listas de almacén, carta y proveedores.
 */
export function CatalogUnitChip({
  unit,
  size = 'md',
}: {
  unit?: string | null;
  size?: 'sm' | 'md';
}) {
  const label = String(unit || 'ud').trim() || 'ud';
  const sizeClass =
    size === 'sm'
      ? 'text-[11px] px-1.5 py-0.5 min-w-[1.75rem]'
      : 'text-xs px-2 py-1 min-w-[2rem]';
  return (
    <span
      className={`inline-flex items-center justify-center rounded-md border border-slate-200 bg-slate-100 font-bold uppercase tracking-wide text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 tabular-nums ${sizeClass}`}
      title={`Unidad: ${label}`}
    >
      {label}
    </span>
  );
}

/** Cantidad grande + chip de unidad (fila de inventario / stock). */
export function StockQtyWithUnit({
  quantity,
  unit,
  low,
  className = '',
}: {
  quantity: number | string | null | undefined;
  unit?: string | null;
  low?: boolean;
  className?: string;
}) {
  const qty = Number(quantity) || 0;
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span
        className={`text-base font-bold tabular-nums leading-none ${
          low ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'
        }`}
      >
        {formatQtyEs(qty, 3)}
      </span>
      <CatalogUnitChip unit={unit} />
    </span>
  );
}
