import { Clock } from 'lucide-react';
import {
  getStoreHoursStatus,
  storeHoursStatusLabelEs,
} from '../../lib/workerStoreHours';
import type { WorkCenter } from '../../lib/workCentersApi';

type Props = {
  workCenter: WorkCenter | null | undefined;
  className?: string;
  /** Compacto para cabeceras TPV. */
  compact?: boolean;
};

/**
 * Banner informativo del horario del centro (fuente maestra del local).
 * No bloquea TPV ni fichaje.
 */
export function StoreHoursStatusBanner({ workCenter, className = '', compact = false }: Props) {
  if (!workCenter) return null;
  const today = getStoreHoursStatus(workCenter);
  const label = storeHoursStatusLabelEs(today.status);

  const tone =
    today.status === 'open'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200'
      : today.status === 'no_schedule'
        ? 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300'
        : 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200';

  const detail =
    today.status === 'open'
      ? today.label
      : today.status === 'outside_hours' && today.from && today.to
        ? `Hoy ${today.from} – ${today.to}`
        : today.status === 'closed'
          ? 'Cerrada según horario del centro'
          : 'Configura el horario en el centro de trabajo';

  return (
    <div
      className={`flex items-center gap-2 border px-3 ${compact ? 'py-1.5' : 'py-2'} ${tone} ${className}`}
      role="status"
    >
      <Clock className={`${compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} shrink-0 opacity-80`} aria-hidden />
      <p className={`${compact ? 'text-[11px]' : 'text-xs'} font-medium min-w-0`}>
        <span className="font-bold">{label}</span>
        <span className="opacity-80"> · {detail}</span>
      </p>
    </div>
  );
}
