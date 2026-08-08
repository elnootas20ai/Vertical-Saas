import { RefreshCw } from 'lucide-react';

/**
 * Chip de estado de datos en vivo (SSE) para cabeceras de dashboards.
 * - Tiempo real: SSE conectado (punto verde con pulso).
 * - Actualizando…: refresco en curso sin SSE.
 * - Actualizado HH:MM: último dato conocido.
 */
export function LiveBadge({
  live,
  refreshing,
  updatedAt,
  className = '',
}: {
  live: boolean;
  refreshing?: boolean;
  updatedAt?: Date | null;
  className?: string;
}) {
  if (live) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300 ${className}`}
      >
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        Tiempo real
      </span>
    );
  }
  if (refreshing) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300 ${className}`}
      >
        <RefreshCw className="h-3 w-3 animate-spin" />
        Actualizando…
      </span>
    );
  }
  if (updatedAt && !Number.isNaN(updatedAt.getTime())) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-[11px] font-semibold text-stone-500 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-400 ${className}`}
      >
        <span className="h-2 w-2 rounded-full bg-stone-400" />
        Actualizado{' '}
        {updatedAt.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-[11px] font-semibold text-stone-400 dark:border-stone-800 dark:bg-stone-900 ${className}`}
    >
      <span className="h-2 w-2 animate-pulse rounded-full bg-stone-300" />
      Conectando…
    </span>
  );
}
