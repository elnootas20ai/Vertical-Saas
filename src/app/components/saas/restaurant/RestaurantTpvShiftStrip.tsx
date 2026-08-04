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

  const metrics = [
    {
      icon: TrendingUp,
      label: 'Ventas',
      value: shiftSales > 0
        ? shiftSales.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })
        : '—',
      highlight: false,
    },
    {
      icon: Receipt,
      label: 'Abiertas',
      value: openAccounts.length > 0
        ? `${openAccounts.length} · ${openTotal.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}`
        : '0',
      highlight: openAccounts.length > 0,
    },
    {
      icon: Clock,
      label: 'Media',
      value: avgMinutes != null ? formatOccupiedTime(avgMinutes) ?? '—' : '—',
      highlight: false,
    },
    {
      icon: Users,
      label: 'Sala',
      value: `${summary.availableCount} lib · ${summary.occupiedCount} oc.`,
      sub: busiestLabel ? `Máx. ${busiestLabel}` : undefined,
      highlight: false,
    },
  ];

  return (
    <div
      className={`shrink-0 border-t border-stone-200 bg-white/95 backdrop-blur-sm dark:border-stone-700 dark:bg-stone-950/95 pb-[max(0.25rem,env(safe-area-inset-bottom))] ${
        compact ? 'px-2 py-1.5' : 'px-3 py-2'
      }`}
    >
      <div className="flex gap-2 overflow-x-auto scrollbar-hide">
        {metrics.map((metric) => (
          <ShiftMetric key={metric.label} compact={compact} {...metric} />
        ))}
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
      className={`shrink-0 flex min-w-[7.5rem] max-w-[11rem] flex-1 items-center gap-2 rounded-lg border px-2.5 py-1.5 ${
        highlight
          ? 'border-violet-200 bg-violet-50/90 dark:border-violet-800 dark:bg-violet-950/40'
          : 'border-stone-200 bg-stone-50/90 dark:border-stone-700 dark:bg-stone-900/60'
      }`}
    >
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
          highlight
            ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300'
            : 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300'
        }`}
      >
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[9px] font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
          {label}
        </p>
        <p
          className={`truncate font-bold tabular-nums ${
            highlight ? 'text-violet-700 dark:text-violet-300' : 'text-stone-900 dark:text-stone-100'
          } ${compact ? 'text-xs' : 'text-sm'}`}
        >
          {value}
        </p>
        {sub ? <p className="truncate text-[9px] text-stone-400">{sub}</p> : null}
      </div>
    </div>
  );
}
