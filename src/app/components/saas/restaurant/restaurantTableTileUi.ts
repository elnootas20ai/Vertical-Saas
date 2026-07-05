import type { ExtendedDiningTable } from '../../../lib/salaStudioTypes';
import type { RestaurantTableLiveInfo } from '../../../lib/restaurantTableDisplay';

export type TableTileVisualStatus = ExtendedDiningTable['status'];

export const TABLE_STATUS_SHORT: Record<string, string> = {
  available: 'Libre',
  occupied: 'Ocupada',
  pending_order: 'Pedido',
  pending_payment: 'Cobrar',
  served: 'Servida',
  reserved: 'Reserva',
  unavailable: 'Fuera',
  hidden: '—',
};

/** Clases de tarjeta: disponible = neutro; color solo cuando requiere atención. */
export function tableTileSurfaceClass(
  visualStatus: TableTileVisualStatus,
  opts: { selected?: boolean; hasAccount?: boolean; disabled?: boolean },
): string {
  const base =
    'relative flex flex-col justify-between rounded-xl border transition-all touch-manipulation active:scale-[0.98] overflow-hidden min-h-[72px] min-w-[72px]';

  if (opts.disabled) {
    return `${base} border-stone-200 bg-stone-100/80 opacity-50 cursor-not-allowed dark:border-stone-700 dark:bg-stone-900/50`;
  }
  if (opts.selected) {
    return `${base} border-stone-800 bg-white ring-2 ring-stone-400/40 shadow-md dark:border-stone-300 dark:bg-stone-800 dark:ring-stone-500/30`;
  }
  if (opts.hasAccount || visualStatus === 'pending_payment') {
    return `${base} border-violet-400 bg-violet-50/90 dark:border-violet-500/60 dark:bg-violet-950/40`;
  }
  if (visualStatus === 'occupied') {
    return `${base} border-amber-400 bg-amber-50/80 dark:border-amber-500/50 dark:bg-amber-950/30`;
  }
  if (visualStatus === 'pending_order') {
    return `${base} border-yellow-400 bg-yellow-50/80 dark:border-yellow-500/50 dark:bg-yellow-950/25`;
  }
  if (visualStatus === 'reserved') {
    return `${base} border-indigo-400 bg-indigo-50/70 dark:border-indigo-500/45 dark:bg-indigo-950/25`;
  }
  if (visualStatus === 'served') {
    return `${base} border-sky-400 bg-sky-50/70 dark:border-sky-500/45 dark:bg-sky-950/25`;
  }
  if (visualStatus === 'unavailable') {
    return `${base} border-stone-200 bg-stone-100/80 opacity-60 cursor-not-allowed dark:border-stone-700 dark:bg-stone-900/50`;
  }
  // available — neutro
  return `${base} border-stone-200 bg-white hover:border-stone-300 hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900/60 dark:hover:border-stone-600 dark:hover:bg-stone-900`;
}

export function tableStatusAccentColor(
  visualStatus: TableTileVisualStatus,
  hasAccount: boolean,
): string | null {
  if (hasAccount || visualStatus === 'pending_payment') return '#7c3aed';
  if (visualStatus === 'occupied') return '#d97706';
  if (visualStatus === 'pending_order') return '#ca8a04';
  if (visualStatus === 'reserved') return '#4f46e5';
  if (visualStatus === 'served') return '#0284c7';
  if (visualStatus === 'available') return null;
  return '#78716c';
}

export function isTableActive(
  visualStatus: TableTileVisualStatus,
  hasAccount: boolean,
): boolean {
  if (hasAccount) return true;
  return !['available', 'unavailable', 'hidden'].includes(visualStatus);
}

export function tableSecondaryLine(
  table: ExtendedDiningTable,
  live: RestaurantTableLiveInfo | undefined,
  visualStatus: TableTileVisualStatus,
): string {
  const guests = table.currentGuests > 0 ? table.currentGuests : table.capacity;
  const status = live?.hasOpenAccount
    ? 'Cobrar'
    : TABLE_STATUS_SHORT[visualStatus] || visualStatus;
  return `${guests}p · ${status}`;
}

/** Color de barra de ocupación por zona según ratio 0–1. */
export function occupancyBarColor(ratio: number): string {
  if (ratio >= 0.95) return 'bg-red-500';
  if (ratio >= 0.75) return 'bg-amber-500';
  if (ratio >= 0.5) return 'bg-yellow-500';
  return 'bg-emerald-500';
}
