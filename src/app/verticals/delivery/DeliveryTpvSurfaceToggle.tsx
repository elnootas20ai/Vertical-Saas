/**
 * Interruptor Pedidos | Mesas en el TPV delivery (misma caja / misma tienda).
 * Solo se muestra si el negocio ya tiene mapa de sala.
 */
import { LayoutGrid, Truck } from 'lucide-react';

export type DeliveryTpvSurface = 'pedidos' | 'mesas';

type Props = {
  value: DeliveryTpvSurface;
  onChange: (next: DeliveryTpvSurface) => void;
};

export function DeliveryTpvSurfaceToggle({ value, onChange }: Props) {
  return (
    <div className="shrink-0 flex justify-center border-b border-stone-200 bg-white px-2 py-1 dark:border-stone-700 dark:bg-stone-900">
      <div
        className="inline-flex w-full max-w-xs rounded-lg border border-stone-200 bg-stone-50 p-0.5 dark:border-stone-700 dark:bg-stone-950/60"
        role="tablist"
        aria-label="Modo TPV"
      >
        <button
          type="button"
          role="tab"
          aria-selected={value === 'pedidos'}
          onClick={() => onChange('pedidos')}
          className={`inline-flex min-h-8 flex-1 items-center justify-center gap-1 rounded-md px-2.5 text-xs font-semibold transition-colors ${
            value === 'pedidos'
              ? 'bg-white text-stone-900 shadow-sm dark:bg-stone-800 dark:text-stone-50'
              : 'text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200'
          }`}
        >
          <Truck className="h-3.5 w-3.5 shrink-0" />
          Pedidos
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={value === 'mesas'}
          onClick={() => onChange('mesas')}
          className={`inline-flex min-h-8 flex-1 items-center justify-center gap-1 rounded-md px-2.5 text-xs font-semibold transition-colors ${
            value === 'mesas'
              ? 'bg-white text-stone-900 shadow-sm dark:bg-stone-800 dark:text-stone-50'
              : 'text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200'
          }`}
        >
          <LayoutGrid className="h-3.5 w-3.5 shrink-0" />
          Mesas
        </button>
      </div>
    </div>
  );
}
