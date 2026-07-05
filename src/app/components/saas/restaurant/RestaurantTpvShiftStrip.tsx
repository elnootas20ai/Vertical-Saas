import { Clock, Receipt, TrendingUp, Users } from 'lucide-react';
import type { TpvRegisterSession } from '../../../lib/deliveryApi';
import { buildTpvRegisterSummary } from '../../../lib/tpvCajaMath';
import { formatOccupiedTime } from '../../../lib/restaurantTableDisplay';
import type { RestaurantSummary } from '../../../lib/salaStudioTypes';
import type { RestaurantTableLiveInfo } from '../../../lib/restaurantTableDisplay';

type Props = {
  registerSession?: TpvRegisterSession | null;
  summary: RestaurantSummary;
  liveByTableId: Map<string, RestaurantTableLiveInfo>;
  compact?: boolean;
};

export function RestaurantTpvShiftStrip({
  registerSession,
  summary,
  liveByTableId,
  compact = false,
}: Props) {
  const shiftSales = registerSession ? buildTpvRegisterSummary(registerSession).totalSales : 0;
  const openAccounts = [...liveByTableId.values()].filter((l) => l.hasOpenAccount);
  const openTotal = openAccounts.reduce((s, l) => s + l.openTotal, 0);

  const occupiedMinutes = [...liveByTableId.values()]
    .map((l) => l.occupiedMinutes)
    .filter((m): m is number => m != null && m > 0);
  const avgMinutes =
    occupiedMinutes.length > 0
      ? Math.round(occupiedMinutes.reduce((a, b) => a + b, 0) / occupiedMinutes.length)
      : null;

  const busiest = [...liveByTableId.entries()]
    .filter(([, l]) => (l.occupiedMinutes ?? 0) > 0)
    .sort((a, b) => (b[1].occupiedMinutes ?? 0) - (a[1].occupiedMinutes ?? 0))[0];

  const busiestLabel =
    busiest && busiest[1].occupiedMinutes
      ? `+${formatOccupiedTime(busiest[1].occupiedMinutes)}`
      : undefined;

  return (
    <div
      className={`shrink-0 border-t border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-950 pb-[max(0.25rem,env(safe-area-inset-bottom))] ${
        compact ? 'px-2 py-2' : 'px-3 py-3'
      }`}
    >
      <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-stone-400 dark:text-stone-500">
        Resumen del turno
      </p>
      <div className={`grid gap-2 ${compact ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2 sm:grid-cols-4'}`}>
        <ShiftMetric
          icon={TrendingUp}
          label="Ventas caja"
          value={shiftSales > 0 ? `${shiftSales.toFixed(2)} €` : '—'}
          compact={compact}
        />
        <ShiftMetric
          icon={Receipt}
          label="Cuentas abiertas"
          value={openAccounts.length > 0 ? `${openAccounts.length} · ${openTotal.toFixed(2)} €` : '0'}
          highlight={openAccounts.length > 0}
          compact={compact}
        />
        <ShiftMetric
          icon={Clock}
          label="Media ocupación"
          value={avgMinutes != null ? formatOccupiedTime(avgMinutes) ?? '—' : '—'}
          compact={compact}
        />
        <ShiftMetric
          icon={Users}
          label="Sala ahora"
          value={`${summary.availableCount} lib · ${summary.occupiedCount} oc.`}
          sub={busiestLabel ? `Máx. ${busiestLabel}` : undefined}
          compact={compact}
        />
      </div>
    </div>
  );
}

function ShiftMetric({
  icon: Icon,
  label,
  value,
  sub,
  highlight = false,
  compact,
}: {
  icon: typeof TrendingUp;
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
  compact?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border px-2.5 py-2 min-h-[52px] ${
        highlight
          ? 'border-violet-200 bg-violet-50/80 dark:border-violet-800 dark:bg-violet-950/30'
          : 'border-stone-200 bg-stone-50/80 dark:border-stone-700 dark:bg-stone-900/50'
      }`}
    >
      <div className="flex items-center gap-1 text-[10px] text-stone-500 dark:text-stone-400">
        <Icon className="h-3 w-3 shrink-0" />
        <span className="truncate">{label}</span>
      </div>
      <p
        className={`mt-0.5 font-bold tabular-nums truncate ${
          highlight ? 'text-violet-700 dark:text-violet-300' : 'text-stone-900 dark:text-stone-100'
        } ${compact ? 'text-sm' : 'text-base'}`}
      >
        {value}
      </p>
      {sub ? <p className="text-[9px] text-stone-400 truncate mt-0.5">{sub}</p> : null}
    </div>
  );
}
