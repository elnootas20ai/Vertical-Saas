/**
 * Dashboard empresa delivery — tiempos por tienda (solapamiento + bases 20/30),
 * pizzas, pérdida atención rápida y clientes nuevos.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, MapPin, Timer, UserMinus, UserPlus } from 'lucide-react';
import { formatNumberEs } from '../../lib/formatNumberEs';
import { monthOverMonthPct } from '../../lib/portfolioMetrics';
import type { DeliveryOrder } from '../../lib/deliveryApi';
import {
  ORDER_BASELINE_MIN,
  PREP_BASELINE_MIN,
  buildDeliveryOpsInsights,
  formatMinutesEs,
  type BaselineStatus,
  type DeliveryStoreRef,
  type OpsInsightRange,
  type StoreTimingInsights,
  type TimingBucket,
} from './deliveryOpsInsights';

type Props = {
  orders: DeliveryOrder[];
  stores?: DeliveryStoreRef[];
  loading?: boolean;
  /** Layout denso + acordeón de tiendas (móvil). */
  compact?: boolean;
  newClientsMonth?: number | null;
  newClientsPrevMonth?: number | null;
  newClientsToday?: number | null;
  newClientsYesterday?: number | null;
};

function VsBadge({ pct, invert = false }: { pct: number | null; invert?: boolean }) {
  if (pct == null) return null;
  const up = pct >= 0;
  const good = invert ? !up : up;
  const label = `${up ? '+' : ''}${formatNumberEs(pct, { maxFraction: 1 })}%`;
  return (
    <span
      className={`inline-flex rounded px-1 py-0.5 text-[9px] font-bold tabular-nums ${
        good
          ? 'bg-[rgba(34,197,94,0.12)] text-[var(--v-green,#22c55e)]'
          : 'bg-[rgba(225,29,72,0.1)] text-[var(--v-rose,#e11d48)]'
      }`}
    >
      {label}
    </span>
  );
}

function DiffMinutes({ bucket }: { bucket: TimingBucket }) {
  if (bucket.diffMinutes == null) return null;
  const d = bucket.diffMinutes;
  const tone =
    d === 0
      ? 'text-gray-400'
      : d > 0
        ? 'text-[var(--v-rose,#e11d48)]'
        : 'text-[var(--v-green,#22c55e)]';
  return (
    <span className={`text-[9px] font-semibold tabular-nums ${tone}`}>
      {d > 0 ? '+' : ''}
      {formatNumberEs(d, { maxFraction: 1 })}′
    </span>
  );
}

function baselineTone(status: BaselineStatus): string {
  if (status === 'ok') return 'bg-[rgba(34,197,94,0.12)] text-[var(--v-green,#22c55e)]';
  if (status === 'warn') return 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300';
  if (status === 'bad') return 'bg-[rgba(225,29,72,0.1)] text-[var(--v-rose,#e11d48)]';
  return 'bg-gray-100 text-gray-400 dark:bg-gray-800';
}

function baselineShort(status: BaselineStatus, kind: 'prep' | 'order'): string {
  if (status === 'empty') return '—';
  const base = kind === 'prep' ? PREP_BASELINE_MIN : ORDER_BASELINE_MIN;
  if (status === 'ok') return `≤${base}′`;
  if (status === 'warn') return `>${base}′`;
  return `≫${base}′`;
}

/** Tarjeta de un tiempo medio, con su comparativa y objetivo si aplica. */
function TimingTile({
  label,
  sub,
  bucket,
  status,
}: {
  label: string;
  sub: string;
  bucket: TimingBucket;
  status?: BaselineStatus;
}) {
  const tone =
    status === 'ok'
      ? 'border-emerald-100 bg-emerald-50/60 dark:border-emerald-900/40 dark:bg-emerald-950/20'
      : status === 'warn'
        ? 'border-amber-100 bg-amber-50/70 dark:border-amber-900/40 dark:bg-amber-950/20'
        : status === 'bad'
          ? 'border-rose-100 bg-rose-50/70 dark:border-rose-900/40 dark:bg-rose-950/20'
          : 'border-gray-100 bg-gray-50/60 dark:border-gray-800 dark:bg-gray-800/40';
  return (
    <div className={`rounded-lg border px-2 py-1.5 ${tone}`}>
      <p className="truncate text-[9px] font-bold uppercase tracking-wide text-gray-500">
        {label}
      </p>
      <div className="mt-0.5 flex flex-wrap items-center gap-1">
        <span
          className={`text-[13px] font-black tabular-nums ${
            bucket.avgMinutes == null ? 'text-gray-400' : 'text-gray-900 dark:text-gray-100'
          }`}
        >
          {formatMinutesEs(bucket.avgMinutes)}
        </span>
        <VsBadge pct={bucket.pct} invert />
        <DiffMinutes bucket={bucket} />
      </div>
      <p className="text-[9px] leading-tight text-gray-400">{sub}</p>
    </div>
  );
}

function MetricChip({
  label,
  value,
  badge,
  sub,
  muted,
}: {
  label: string;
  value: string;
  badge?: ReactNode;
  sub?: ReactNode;
  muted?: boolean;
}) {
  return (
    <span className="inline-flex min-w-0 items-baseline gap-1 text-[11px]">
      <span className="shrink-0 text-gray-400">{label}</span>
      <span
        className={`font-bold tabular-nums ${
          muted ? 'text-gray-400' : 'text-gray-900 dark:text-gray-100'
        }`}
      >
        {value}
      </span>
      {badge}
      {sub}
    </span>
  );
}

function StoreTimingBlock({
  store,
  vsLabel,
  highlight,
  compact,
  defaultOpen,
}: {
  store: StoreTimingInsights;
  vsLabel: string;
  highlight?: boolean;
  compact?: boolean;
  defaultOpen?: boolean;
}) {
  const empty = store.deliveredCount === 0;
  const [open, setOpen] = useState(Boolean(defaultOpen));

  const body = empty ? null : (
    <div className="mt-2 space-y-2">
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-5">
        <TimingTile
          label="Espera del cliente"
          sub={`pedido → entregado · objetivo ≤${ORDER_BASELINE_MIN}′`}
          bucket={store.times.total}
          status={store.vsOrderBase}
        />
        <TimingTile
          label="Preparación"
          sub={`cocina + montaje · objetivo ≤${PREP_BASELINE_MIN}′`}
          bucket={store.times.prep}
          status={store.vsPrepBase}
        />
        <TimingTile
          label="Montaje"
          sub="hasta pedido listo"
          bucket={store.times.assembly}
        />
        <TimingTile
          label="Reparto"
          sub="ida estimada al cliente"
          bucket={store.times.delivery}
        />
        <TimingTile
          label="Horno pizzas"
          sub="solo pedidos con pizza"
          bucket={store.times.pizzaKitchen}
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-gray-100 pt-1.5 text-[10px] text-gray-500 dark:border-gray-800">
        <span>
          <strong className="tabular-nums text-gray-800 dark:text-gray-200">
            {formatNumberEs(store.deliveredCount, { maxFraction: 0 })}
          </strong>{' '}
          entrega{store.deliveredCount === 1 ? '' : 's'}
        </span>
        {store.busyMinutes != null ? (
          <span>
            cocina activa{' '}
            <strong className="tabular-nums text-gray-800 dark:text-gray-200">
              {formatMinutesEs(store.busyMinutes)}
            </strong>
          </span>
        ) : null}
        {store.ordersPerBusyHour != null ? (
          <span>
            ritmo{' '}
            <strong className="tabular-nums text-gray-800 dark:text-gray-200">
              {formatNumberEs(store.ordersPerBusyHour, { maxFraction: 1 })} ped/h
            </strong>
          </span>
        ) : null}
        {store.parallelFactor != null ? (
          <span title="Pedidos que se preparan a la vez de media">
            en paralelo{' '}
            <strong className="tabular-nums text-gray-800 dark:text-gray-200">
              ×{formatNumberEs(store.parallelFactor, { maxFraction: 1 })}
            </strong>
          </span>
        ) : null}
        {store.peakConcurrency > 0 ? (
          <span title="Máximo de pedidos preparándose a la vez">
            pico{' '}
            <strong className="tabular-nums text-gray-800 dark:text-gray-200">
              {formatNumberEs(store.peakConcurrency, { maxFraction: 0 })} a la vez
            </strong>
          </span>
        ) : null}
        {!compact && store.throughputVsBaseline != null ? (
          <span title={`Capacidad real vs una línea de cocina que hace 1 pedido cada ${PREP_BASELINE_MIN} min`}>
            capacidad{' '}
            <strong className="tabular-nums text-gray-800 dark:text-gray-200">
              ×{formatNumberEs(store.throughputVsBaseline, { maxFraction: 1 })} vs 1 línea
            </strong>
          </span>
        ) : null}
        <span className="sr-only">{vsLabel}</span>
      </div>
    </div>
  );

  const header = (
    <div className="flex w-full min-w-0 items-center justify-between gap-2">
      <div className="min-w-0 flex items-center gap-1.5">
        <MapPin className="h-3 w-3 shrink-0 text-[var(--v-blue,#2563eb)]" />
        <span className="truncate text-[11px] font-semibold text-gray-900 dark:text-gray-100">
          {store.storeName}
        </span>
        <span className="shrink-0 text-[9px] text-gray-400">
          {empty
            ? 'Sin entregas'
            : `${formatNumberEs(store.deliveredCount, { maxFraction: 0 })} ent.`}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {!empty ? (
          <>
            <span
              className={`rounded px-1 py-0.5 text-[9px] font-bold ${baselineTone(store.vsPrepBase)}`}
              title={`Preparación media vs objetivo de ${PREP_BASELINE_MIN} min`}
            >
              Prep {baselineShort(store.vsPrepBase, 'prep')}
            </span>
            <span
              className={`rounded px-1 py-0.5 text-[9px] font-bold ${baselineTone(store.vsOrderBase)}`}
              title={`Espera media del cliente vs objetivo de ${ORDER_BASELINE_MIN} min`}
            >
              Cliente {baselineShort(store.vsOrderBase, 'order')}
            </span>
          </>
        ) : null}
        {!empty ? (
          <span className="hidden shrink-0 text-[9px] font-bold text-[var(--v-blue,#2563eb)] sm:inline">
            {open ? 'Ocultar' : 'Ver detalle'}
          </span>
        ) : null}
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 dark:border-gray-600 dark:bg-gray-800">
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </span>
      </div>
    </div>
  );

  return (
    <div
      className={`rounded-lg border ${
        highlight
          ? 'border-blue-100 bg-blue-50/40 dark:border-blue-900/40 dark:bg-blue-950/20'
          : 'border-gray-100 dark:border-gray-800'
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`w-full rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/60 ${compact ? 'min-h-9' : ''}`}
      >
        {header}
      </button>
      {open ? <div className="px-2 pb-2">{body}</div> : null}
    </div>
  );
}

export function DeliveryOpsInsightsPanel({
  orders,
  stores = [],
  loading = false,
  compact = false,
  newClientsMonth = null,
  newClientsPrevMonth = null,
  newClientsToday = null,
  newClientsYesterday = null,
}: Props) {
  const navigate = useNavigate();
  const [range, setRange] = useState<OpsInsightRange>('month');

  const insights = useMemo(
    () => buildDeliveryOpsInsights(orders, range, undefined, stores),
    [orders, range, stores],
  );

  const newClients =
    range === 'day' ? (newClientsToday ?? null) : (newClientsMonth ?? null);
  const newClientsPrev =
    range === 'day' ? (newClientsYesterday ?? null) : (newClientsPrevMonth ?? null);
  const newClientsPct =
    newClients != null && newClientsPrev != null
      ? monthOverMonthPct(newClients, newClientsPrev)
      : null;

  const rangeLabel = range === 'day' ? 'Día' : 'Mes';

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-2.5 shadow-sm dark:border-gray-700 dark:bg-gray-900 sm:p-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <div className="min-w-0 flex items-center gap-2">
          <Timer className="h-3.5 w-3.5 shrink-0 text-[var(--v-blue,#2563eb)]" />
          <p className="truncate text-xs font-bold text-gray-900 dark:text-gray-100">
            Tiempos de entrega · {rangeLabel.toLowerCase()}
          </p>
          <span className="hidden text-[10px] text-gray-400 sm:inline">
            Objetivo: preparar en ≤{PREP_BASELINE_MIN} min y servir en ≤{ORDER_BASELINE_MIN} min
            · comparado con {insights.vsLabel}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 dark:border-gray-600 dark:bg-gray-900/50">
            {(['day', 'month'] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setRange(key)}
                className={`rounded-md px-2 py-1 text-[10px] font-bold transition-colors ${
                  compact ? 'min-h-9 px-2.5' : ''
                } ${
                  range === key
                    ? 'bg-[var(--v-blue,#2563eb)] text-white'
                    : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
                }`}
              >
                {key === 'day' ? 'Día' : 'Mes'}
              </button>
            ))}
          </div>
          {!compact ? (
            <button
              type="button"
              onClick={() => navigate('/saas/delivery-ops')}
              className="rounded-md border border-gray-200 px-2 py-1 text-[10px] font-bold text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              Ops
            </button>
          ) : null}
        </div>
      </div>

      {loading ? (
        <p className="mt-2 text-xs text-gray-500">Cargando…</p>
      ) : (
        <div className="mt-2 space-y-2">
          <div className="space-y-1.5">
            <StoreTimingBlock
              store={insights.overall}
              vsLabel={insights.vsLabel}
              highlight
              compact={compact}
              defaultOpen
            />
            {insights.byStore.map((store) => (
              <StoreTimingBlock
                key={store.storeId}
                store={store}
                vsLabel={insights.vsLabel}
                compact={compact}
                defaultOpen={false}
              />
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-gray-100 pt-1.5 dark:border-gray-800">
            <span className="text-[9px] font-bold uppercase tracking-wide text-gray-400">
              Comida vendida (uds)
            </span>
            <MetricChip
              label="Pizzas"
              value={formatNumberEs(insights.food.pizzas, { maxFraction: 1 })}
              badge={<VsBadge pct={insights.food.pizzasPct} />}
            />
            <MetricChip
              label="Burgers"
              value={formatNumberEs(insights.food.burgers, { maxFraction: 1 })}
              badge={
                <VsBadge
                  pct={monthOverMonthPct(insights.food.burgers, insights.food.burgersPrev)}
                />
              }
            />
            <MetricChip
              label="Tacos"
              value={formatNumberEs(insights.food.tacos, { maxFraction: 1 })}
              badge={
                <VsBadge
                  pct={monthOverMonthPct(insights.food.tacos, insights.food.tacosPrev)}
                />
              }
            />
          </div>

          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1.5 border-t border-gray-100 pt-1.5 dark:border-gray-800">
            <div className="min-w-0">
              <p className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide text-gray-400">
                <UserPlus className="h-3 w-3" />
                Clientes nuevos
              </p>
              <div className="mt-0.5 flex items-center gap-1.5">
                <span className="text-xs font-black tabular-nums text-gray-900 dark:text-gray-100">
                  {newClients != null
                    ? formatNumberEs(newClients, { maxFraction: 0 })
                    : '—'}
                </span>
                <VsBadge pct={newClientsPct} />
                {newClientsPrev != null && newClientsPrev > 0 ? (
                  <span className="text-[9px] text-gray-400">
                    {insights.vsLabel}: {formatNumberEs(newClientsPrev, { maxFraction: 0 })}
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => navigate('/saas/clients')}
                  className="text-[10px] font-bold text-[var(--v-blue,#2563eb)] hover:underline"
                >
                  Ver
                </button>
              </div>
            </div>

            <div className="min-w-0">
              <p
                className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide text-[var(--v-rose,#e11d48)]"
                title="Pedidos atendidos solo con nombre, sin teléfono: no quedan guardados como cliente"
              >
                <UserMinus className="h-3 w-3" />
                Pedidos sin ficha de cliente
              </p>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-black tabular-nums text-gray-900 dark:text-gray-100">
                  {formatNumberEs(insights.clients.lostQuickAttention, { maxFraction: 0 })}
                </span>
                <VsBadge pct={insights.clients.lostPct} invert />
                <span className="text-[9px] text-gray-400">
                  {formatNumberEs(insights.clients.lostSharePercent, { maxFraction: 1 })}% de los pedidos
                  {insights.clients.lostQuickAttentionPrev > 0
                    ? ` · ${insights.vsLabel}: ${formatNumberEs(insights.clients.lostQuickAttentionPrev, { maxFraction: 0 })}`
                    : ''}
                </span>
              </div>
              <p className="mt-0.5 text-[9px] text-gray-400">
                Se cobraron sin teléfono, así que no entran en tu lista de clientes.
              </p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
