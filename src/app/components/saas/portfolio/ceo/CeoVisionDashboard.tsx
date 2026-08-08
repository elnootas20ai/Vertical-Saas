import { useMemo, type ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Building2,
  Minus,
  RefreshCw,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { formatMoneyEs, formatNumberEs } from '../../../../lib/formatNumberEs';
import { LiveBadge } from '../../LiveBadge';
import { SOURCE_LABELS } from '../../../../lib/alertCenterApi';
import { BUSINESS_TYPE_LABELS } from '../../BusinessCarousel';
import type { BusinessType } from '../../../../lib/businessApi';
import {
  deliveryBrandSheet,
  deliveryUnitPulses,
  portfolioVerticalKind,
} from '../portfolioCompanyPulse';
import type { CeoAlertFeedItem } from './useCeoAlertFeed';
import type { CeoCompanyVision } from './ceoVisionModel';
import { MomBadge } from './CeoGlanceRail';
import { FlatMom, groupSharePercent, SharePctCell } from './CeoCompanyCompare';
import { useScrollPagination } from '../../../../hooks/useInViewOnce';

/* ── Top bar ───────────────────────────────────────────────────────── */

export function CeoVisionTopBar({
  companyCount,
  critical,
  live,
  updatedAt,
  refreshing,
  onRefresh,
}: {
  companyCount: number;
  critical: number;
  live?: boolean;
  updatedAt?: Date | null;
  refreshing?: boolean;
  onRefresh: () => void;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-stone-200/80 bg-white px-4 py-3.5 dark:border-stone-800 dark:bg-stone-950 sm:px-5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="h-1.5 w-8 rounded-full bg-[linear-gradient(90deg,#22c55e,#14b8a6,#2563eb)]" />
          <h1 className="vsaas-title text-lg sm:text-xl">Visión general</h1>
          <LiveBadge live={Boolean(live)} refreshing={refreshing} updatedAt={updatedAt} />
        </div>
          <p className="mt-0.5 text-[12px] text-stone-500">
            {companyCount} empresa{companyCount !== 1 ? 's' : ''} del grupo
            {' · '}totales consolidados
          </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {/* Solo críticas reales (docs/finanzas). Sin «Salud / Atención N». */}
        {critical > 0 ? (
          <div className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
            <span className="text-[10px] font-bold uppercase tracking-wide">Críticas</span>
            <span className="text-base font-extrabold tabular-nums">{critical}</span>
          </div>
        ) : null}
        <button
          type="button"
          onClick={onRefresh}
          className="vsaas-btn-ghost !min-h-9 !py-1.5"
          aria-busy={refreshing}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </div>
    </header>
  );
}

/* ── Alert hero feed ───────────────────────────────────────────────── */

export function CeoAlertHeroFeed({
  items,
  loading,
  onOpenAlert,
  onOpenBusiness,
}: {
  items: CeoAlertFeedItem[];
  loading: boolean;
  onOpenAlert: (item: CeoAlertFeedItem) => void;
  onOpenBusiness: (businessId: string) => void;
}) {
  return (
    <section className="flex h-full min-h-[320px] flex-col overflow-hidden rounded-3xl border border-stone-200/80 bg-white dark:border-stone-800 dark:bg-stone-950">
      <div className="border-b border-stone-100 px-4 py-3.5 sm:px-5 dark:border-stone-800">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-rose-600 dark:text-rose-400">
          Urgente
        </p>
        <h2 className="mt-0.5 text-base font-bold text-stone-900 dark:text-white">
          Alertas activas
        </h2>
        <p className="text-[11px] text-stone-500">Ordenadas por severidad · toca para detalle</p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && items.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-stone-400">
            <RefreshCw className="h-5 w-5 animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center px-4 text-center">
            <p className="text-sm font-semibold text-stone-600 dark:text-stone-300">Sin alertas activas</p>
            <p className="mt-1 text-xs text-stone-400">El grupo está en calma operativa</p>
          </div>
        ) : (
          <ul className="divide-y divide-stone-100 dark:divide-stone-800">
            {items.map((item) => (
              <li key={`${item.businessId}:${item.id}`}>
                <button
                  type="button"
                  onClick={() => onOpenAlert(item)}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-stone-50 dark:hover:bg-stone-900/60 sm:px-5"
                >
                  <AlertTriangle
                    className={`mt-0.5 h-4 w-4 shrink-0 ${
                      item.priority === 'high'
                        ? 'text-rose-500'
                        : item.priority === 'medium'
                          ? 'text-amber-500'
                          : 'text-stone-400'
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-bold text-stone-900 dark:text-white">
                      {item.title}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-stone-500">
                      <button
                        type="button"
                        className="font-semibold text-[var(--v-blue,#2563eb)] hover:underline"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenBusiness(item.businessId);
                        }}
                      >
                        {item.businessName}
                      </button>
                      {' · '}
                      {SOURCE_LABELS[item.source] || item.source}
                    </p>
                  </div>
                  <SeverityChip priority={item.priority} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function SeverityChip({ priority }: { priority: string }) {
  const map: Record<string, string> = {
    high: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
    medium: 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
    low: 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300',
  };
  const label = priority === 'high' ? 'Crítica' : priority === 'medium' ? 'Media' : 'Baja';
  return (
    <span className={`shrink-0 rounded-lg px-2 py-0.5 text-[10px] font-bold ${map[priority] || map.low}`}>
      {label}
    </span>
  );
}

/* ── Portfolio consolidado ─────────────────────────────────────────── */

export function CeoPortfolioConsolidated({
  totalIncome,
  totalFinanceIncome,
  totalExpenses,
  totalResult,
  resultLabel,
  totalCash,
  totalPending,
  totalStaff,
}: {
  totalIncome: number;
  totalFinanceIncome: number;
  totalExpenses: number;
  totalResult: number;
  resultLabel: string;
  totalCash: number;
  totalPending: number;
  totalStaff: number;
}) {
  return (
    <section className="flex h-full min-h-[280px] flex-col overflow-hidden rounded-3xl border border-stone-200/80 bg-white dark:border-stone-800 dark:bg-stone-950">
      <div className="border-b border-stone-100 px-4 py-3.5 sm:px-5 dark:border-stone-800">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-stone-500">Agregado</p>
        <h2 className="mt-0.5 text-base font-bold text-stone-900 dark:text-white">
          Portafolio consolidado
        </h2>
        <p className="text-[11px] text-stone-500">Totales del grupo · mes en curso</p>
      </div>

      <div className="grid flex-1 grid-cols-2 gap-2 p-4 sm:grid-cols-3 sm:gap-3 sm:p-5">
        <MetricTile
          icon={<Wallet className="h-3.5 w-3.5" />}
          label="Facturación"
          value={formatMoneyEs(totalIncome)}
        />
        <MetricTile label="Ingresos" value={formatMoneyEs(totalFinanceIncome)} />
        <MetricTile label="Gastos" value={formatMoneyEs(totalExpenses)} />
        <MetricTile
          label={resultLabel}
          value={formatMoneyEs(totalResult)}
          tone={totalResult >= 0 ? 'ok' : 'bad'}
        />
        <MetricTile
          icon={<Building2 className="h-3.5 w-3.5" />}
          label="Caja / bancos"
          value={formatMoneyEs(totalCash)}
        />
        <MetricTile label="Pendiente" value={formatMoneyEs(totalPending)} />
        <MetricTile
          icon={<Users className="h-3.5 w-3.5" />}
          label="Dotación"
          value={formatNumberEs(totalStaff, { maxFraction: 0 })}
        />
      </div>
    </section>
  );
}

function MetricTile({
  icon,
  label,
  value,
  tone,
}: {
  icon?: ReactNode;
  label: string;
  value: string;
  tone?: 'ok' | 'bad';
}) {
  return (
    <div className="rounded-2xl border border-stone-100 bg-stone-50/80 px-2.5 py-2.5 dark:border-stone-800 dark:bg-stone-900/50">
      <div className="flex items-center gap-1 text-stone-500">
        {icon}
        <span className="text-[9px] font-bold uppercase tracking-wide">{label}</span>
      </div>
      <p
        className={`mt-1 truncate text-sm font-extrabold tabular-nums sm:text-base ${
          tone === 'ok'
            ? 'text-emerald-700 dark:text-emerald-400'
            : tone === 'bad'
              ? 'text-rose-600'
              : 'text-stone-900 dark:text-white'
        }`}
      >
        {value}
      </p>
    </div>
  );
}

/* ── Semana vs semana ──────────────────────────────────────────────── */

export function CeoWeekAlertComparator({
  visions,
  deltas,
  onOpen,
}: {
  visions: CeoCompanyVision[];
  deltas: Record<
    string,
    { current: number; previous: number | null; delta: number | null; trend: 'up' | 'down' | 'flat' | 'unknown' }
  >;
  onOpen: (businessId: string) => void;
}) {
  return (
    <section>
      <div className="mb-2.5 px-0.5">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-stone-500">Tendencia</p>
        <h2 className="text-base font-bold text-stone-900 dark:text-white">
          Alertas · semana vs semana
        </h2>
        <p className="text-[11px] text-stone-500">
          Mejora / empeora / estable respecto a la semana anterior
        </p>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {visions.map((v) => {
          const d = deltas[v.businessId];
          const trend = d?.trend || 'unknown';
          return (
            <button
              key={v.businessId}
              type="button"
              onClick={() => onOpen(v.businessId)}
              className="rounded-2xl border border-stone-200/80 bg-white px-3.5 py-3 text-left transition-colors hover:border-blue-200 dark:border-stone-800 dark:bg-stone-950 dark:hover:border-blue-900"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: v.brandColor }}
                    />
                    <p className="truncate text-[13px] font-bold text-stone-900 dark:text-white">
                      {v.name}
                    </p>
                  </div>
                  <p className="mt-1 text-[11px] text-stone-500">
                    {v.alertsUnresolved} activa{v.alertsUnresolved !== 1 ? 's' : ''}
                    {v.alertsHigh > 0 ? ` · ${v.alertsHigh} críticas` : ''}
                  </p>
                </div>
                <TrendBadge trend={trend} />
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function TrendBadge({ trend }: { trend: 'up' | 'down' | 'flat' | 'unknown' }) {
  if (trend === 'up') {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-lg bg-rose-50 px-2 py-1 text-[10px] font-bold text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
        <ArrowUpRight className="h-3 w-3" /> Empeora
      </span>
    );
  }
  if (trend === 'down') {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-lg bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
        <ArrowDownRight className="h-3 w-3" /> Mejora
      </span>
    );
  }
  if (trend === 'flat') {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-lg bg-stone-100 px-2 py-1 text-[10px] font-bold text-stone-600 dark:bg-stone-800 dark:text-stone-300">
        <Minus className="h-3 w-3" /> Igual
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 rounded-lg bg-stone-50 px-2 py-1 text-[10px] font-bold text-stone-400 dark:bg-stone-900">
      Sin baseline
    </span>
  );
}

/* ── Líneas por empresa (tabla desktop · filas apiladas móvil) ───────── */

/** Margen del mes: resultado / ingresos contables. null si no hay ingresos. */
function marginPercent(result: number, financeIncome: number): number | null {
  if (!(financeIncome > 0)) return null;
  return (result / financeIncome) * 100;
}

function MarginCell({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-[12px] text-stone-400">—</span>;
  return (
    <span
      className={`text-[12px] font-extrabold tabular-nums ${
        pct >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600'
      }`}
    >
      {formatNumberEs(pct, { maxFraction: 0 })}%
    </span>
  );
}

/** Posición en el ranking por facturación del mes (1 = la que más factura). */
function RankBadge({ rank }: { rank: number }) {
  const cls =
    rank === 1
      ? 'bg-[var(--v-blue,#2563eb)] text-white'
      : rank <= 3
        ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300'
        : 'bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400';
  return (
    <span
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[10px] font-extrabold tabular-nums ${cls}`}
      aria-label={`Puesto ${rank}`}
    >
      {rank}
    </span>
  );
}

function companyLineMeta(v: CeoCompanyVision, canViewEbitda: boolean) {
  const result = canViewEbitda ? v.ebitda : v.profit;
  const typeLabel =
    BUSINESS_TYPE_LABELS[v.row.business.businessType as BusinessType]
    || v.verticalLabel;
  const kind = portfolioVerticalKind(v.row);
  const m = v.row.metrics;
  const isOps = kind === 'delivery' || kind === 'restaurant';
  const units = kind === 'delivery' ? deliveryUnitPulses(v.row) : [];
  const brands = kind === 'delivery' ? deliveryBrandSheet(v.row, 0) : [];
  const year = Number(v.year) || 0;
  const unitsLabel =
    units.length > 0
      ? units.map((u) => `${u.label} ${formatNumberEs(u.value, { maxFraction: 0 })}`).join(' · ')
      : '';
  const brandsLabel =
    brands.length > 0
      ? brands
          .slice(0, 4)
          .map((b) => `${b.name} ${formatMoneyEs(b.revenueMonth)}`)
          .join(' · ')
          + (brands.length > 4 ? ` · +${brands.length - 4}` : '')
      : '';
  return { result, typeLabel, kind, m, isOps, year, unitsLabel, brandsLabel };
}

export function CeoCompanyTable({
  visions,
  canViewEbitda,
  onOpen,
  laborByBiz = {},
  laborLoading = false,
}: {
  visions: CeoCompanyVision[];
  canViewEbitda: boolean;
  onOpen: (businessId: string) => void;
  laborByBiz?: Record<string, number>;
  laborLoading?: boolean;
}) {
  const resultLabel = canViewEbitda ? 'EBITDA' : 'Resultado';
  const groupTotal = useMemo(
    () => visions.reduce((s, v) => s + (Number(v.income) || 0), 0),
    [visions],
  );
  const groupTotals = useMemo(() => {
    const t = {
      today: 0,
      financeIncome: 0,
      expenses: 0,
      result: 0,
      personal: 0,
      clockedIn: 0,
      staffing: 0,
    };
    for (const v of visions) {
      t.today += Number(v.today) || 0;
      t.financeIncome += Number(v.financeIncome) || 0;
      t.expenses += Number(v.expenses) || 0;
      t.result += Number(canViewEbitda ? v.ebitda : v.profit) || 0;
      t.personal += Number(laborByBiz[v.businessId]) || 0;
      t.clockedIn += Number(v.clockedIn) || 0;
      t.staffing += Number(v.staffing) || 0;
    }
    return t;
  }, [visions, canViewEbitda, laborByBiz]);
  const {
    visibleItems: mobileVisions,
    hasMore: mobileHasMore,
    sentinelRef: mobileSentinelRef,
    shown: mobileShown,
    total: mobileTotal,
  } = useScrollPagination(visions, 6);

  return (
    <section>
      <div className="mb-2.5 flex flex-wrap items-end justify-between gap-2 px-0.5 sm:mb-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-stone-500">Empresas</p>
          <h2 className="text-base font-bold text-stone-900 dark:text-white">
            Líneas por empresa
          </h2>
          <p className="text-[11px] text-stone-500">
            Ranking por facturación del mes · de más a menos
          </p>
        </div>
      </div>

      {visions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-200 px-4 py-10 text-center text-sm text-stone-500 dark:border-stone-700">
          Sin empresas
        </div>
      ) : (
        <>
          {/* Móvil y tablet — tarjetas (2 columnas desde sm) con paginación al bajar */}
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:hidden">
            {mobileVisions.map((v, idx) => {
              const { result, typeLabel, m, isOps } = companyLineMeta(v, canViewEbitda);
              const personal = laborByBiz[v.businessId] || 0;
              const share = groupSharePercent(v.income, groupTotal);
              return (
                <li key={v.businessId}>
                  <button
                    type="button"
                    onClick={() => onOpen(v.businessId)}
                    className="w-full rounded-2xl border border-stone-200/80 bg-white px-3 py-2.5 text-left dark:border-stone-800 dark:bg-stone-950"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <RankBadge rank={idx + 1} />
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: v.brandColor }}
                        />
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-bold text-stone-900 dark:text-white">
                            {v.name}
                          </p>
                          <p className="truncate text-[10px] font-semibold text-stone-400">
                            {typeLabel}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <FlatMom pct={v.mom} />
                      </div>
                    </div>

                    <div className="mt-2 flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-[9px] font-bold uppercase tracking-wide text-stone-400">
                          Mes · % grupo
                        </p>
                        <div className="mt-0.5 flex items-baseline gap-2">
                          <span className="text-[16px] font-extrabold tabular-nums text-stone-900 dark:text-white">
                            {formatMoneyEs(v.income)}
                          </span>
                          <span className="text-[12px] font-bold tabular-nums text-[var(--v-blue,#2563eb)]">
                            {share != null
                              ? `${formatNumberEs(share, { maxFraction: 0 })}%`
                              : '—'}
                          </span>
                        </div>
                        {share != null ? (
                          <div className="mt-1 h-1 max-w-[140px] overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
                            <div
                              className="h-full rounded-full bg-[var(--v-blue,#2563eb)]"
                              style={{ width: `${Math.max(4, Math.min(100, share))}%` }}
                            />
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-2.5 grid grid-cols-2 gap-1.5">
                      <MobileStat
                        label="Hoy"
                        value={v.today > 0 ? formatMoneyEs(v.today) : '—'}
                        emphasize
                      />
                      <MobileStat
                        label="Equipo"
                        value={
                          v.staffing > 0
                            ? `${formatNumberEs(v.clockedIn, { maxFraction: 0 })}/${formatNumberEs(v.staffing, { maxFraction: 0 })} fichados`
                            : '—'
                        }
                      />
                      <MobileStat
                        label="Pago trabajadores"
                        value={
                          laborLoading && personal === 0
                            ? '…'
                            : personal > 0
                              ? formatMoneyEs(personal)
                              : '—'
                        }
                        emphasize
                      />
                      <MobileStat
                        label="Ticket"
                        value={isOps && m.avgTicketMonth > 0 ? formatMoneyEs(m.avgTicketMonth) : '—'}
                      />
                      <MobileStat label="Ingresos" value={formatMoneyEs(v.financeIncome)} />
                      <MobileStat label="Gastos" value={formatMoneyEs(v.expenses)} />
                    </div>

                    <div className="mt-1.5 flex items-center justify-between text-[10px] text-stone-500">
                      <span>
                        {resultLabel}{' '}
                        <span
                          className={`font-bold tabular-nums ${
                            result >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600'
                          }`}
                        >
                          {formatMoneyEs(result)}
                        </span>
                        {marginPercent(result, v.financeIncome) != null ? (
                          <span className="ml-1 tabular-nums">
                            · {formatNumberEs(marginPercent(result, v.financeIncome) as number, { maxFraction: 0 })}% margen
                          </span>
                        ) : null}
                      </span>
                      {v.alertsHigh > 0 ? (
                        <span className="font-bold text-rose-600">
                          {v.alertsHigh} crítica{v.alertsHigh !== 1 ? 's' : ''}
                        </span>
                      ) : null}
                    </div>
                  </button>
                </li>
              );
            })}
            {mobileHasMore ? (
              <li
                ref={mobileSentinelRef}
                className="sm:col-span-2"
                aria-label={`Cargando más empresas (${mobileShown}/${mobileTotal})`}
              >
                <div className="grid animate-pulse grid-cols-1 gap-2 sm:grid-cols-2">
                  {[0, 1].map((i) => (
                    <div
                      key={i}
                      className="rounded-2xl border border-stone-200/80 bg-white px-3 py-3 dark:border-stone-800 dark:bg-stone-950"
                    >
                      <div className="flex items-center gap-2">
                        <div className="h-5 w-5 rounded-md bg-stone-200 dark:bg-stone-800" />
                        <div className="h-3.5 w-32 rounded bg-stone-200 dark:bg-stone-800" />
                        <div className="ml-auto h-3.5 w-14 rounded bg-stone-100 dark:bg-stone-900" />
                      </div>
                      <div className="mt-2.5 grid grid-cols-2 gap-1.5">
                        <div className="h-9 rounded-xl bg-stone-100 dark:bg-stone-900" />
                        <div className="h-9 rounded-xl bg-stone-100 dark:bg-stone-900" />
                      </div>
                    </div>
                  ))}
                </div>
              </li>
            ) : null}
          </ul>

          {/* Total del grupo — visible también en móvil/tablet (en desktop va en la tabla) */}
          <div className="mt-2 rounded-2xl border border-stone-200/80 bg-stone-50/80 px-3 py-2.5 dark:border-stone-800 dark:bg-stone-900/50 lg:hidden">
            <p className="text-[9px] font-bold uppercase tracking-wide text-stone-500">
              Total grupo
            </p>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="text-[15px] font-extrabold tabular-nums text-stone-900 dark:text-white">
                {formatMoneyEs(groupTotal)}
                <span className="ml-1 text-[10px] font-bold text-stone-400">mes</span>
              </span>
              {groupTotals.today > 0 ? (
                <span className="text-[12px] font-bold tabular-nums text-stone-700 dark:text-stone-200">
                  {formatMoneyEs(groupTotals.today)}
                  <span className="ml-1 text-[10px] font-semibold text-stone-400">hoy</span>
                </span>
              ) : null}
              <span
                className={`text-[12px] font-bold tabular-nums ${
                  groupTotals.result >= 0
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-rose-600'
                }`}
              >
                {formatMoneyEs(groupTotals.result)}
                <span className="ml-1 text-[10px] font-semibold text-stone-400">
                  {resultLabel.toLowerCase()}
                </span>
              </span>
              {groupTotals.staffing > 0 ? (
                <span className="text-[12px] font-bold tabular-nums text-stone-700 dark:text-stone-200">
                  {formatNumberEs(groupTotals.clockedIn, { maxFraction: 0 })}/
                  {formatNumberEs(groupTotals.staffing, { maxFraction: 0 })}
                  <span className="ml-1 text-[10px] font-semibold text-stone-400">fichados</span>
                </span>
              ) : null}
            </div>
          </div>

          {/* Desktop — columnas limpia (tablet usa tarjetas) */}
          <div className="hidden overflow-hidden rounded-2xl border border-stone-200/80 bg-white lg:block dark:border-stone-800 dark:bg-stone-950">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1080px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-stone-100 bg-stone-50/80 text-[10px] font-bold uppercase tracking-wide text-stone-500 dark:border-stone-800 dark:bg-stone-900/60">
                    <th className="sticky left-0 z-[1] bg-stone-50 px-4 py-2.5 dark:bg-stone-900">Empresa</th>
                    <th className="px-2.5 py-2.5 text-right">% grupo</th>
                    <th className="px-2.5 py-2.5 text-right">Hoy</th>
                    <th className="px-2.5 py-2.5 text-right">Mes</th>
                    <th className="px-2.5 py-2.5 text-right" title="Mismo tramo de días del mes anterior">
                      vs mismo tramo
                    </th>
                    <th className="px-2.5 py-2.5 text-right">Personal</th>
                    <th className="px-2.5 py-2.5 text-right">Ingresos</th>
                    <th className="px-2.5 py-2.5 text-right">Gastos</th>
                    <th className="px-2.5 py-2.5 text-right">Ticket</th>
                    <th className="px-2.5 py-2.5 text-right" title="Resultado del mes / ingresos contables">
                      Margen
                    </th>
                    <th className="px-2.5 py-2.5 text-right">{resultLabel}</th>
                    <th className="px-2.5 py-2.5 text-right" title="Fichados ahora / plantilla">
                      Equipo
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visions.map((v, idx) => {
                    const { result, typeLabel, m, isOps } = companyLineMeta(v, canViewEbitda);
                    const personal = laborByBiz[v.businessId] || 0;
                    const share = groupSharePercent(v.income, groupTotal);
                    const margin = marginPercent(result, v.financeIncome);
                    return (
                      <tr
                        key={v.businessId}
                        className="cursor-pointer border-b border-stone-100 last:border-0 hover:bg-stone-50/80 dark:border-stone-800 dark:hover:bg-stone-900/50"
                        onClick={() => onOpen(v.businessId)}
                      >
                        <td className="sticky left-0 z-[1] bg-white px-4 py-2.5 dark:bg-stone-950">
                          <div className="flex min-w-[160px] items-center gap-2">
                            <RankBadge rank={idx + 1} />
                            <span
                              className="h-2 w-2 shrink-0 rounded-full"
                              style={{ backgroundColor: v.brandColor }}
                            />
                            <div className="min-w-0">
                              <p className="truncate text-[12px] font-bold text-stone-900 dark:text-white">
                                {v.name}
                              </p>
                              <p className="truncate text-[10px] font-semibold text-stone-400">
                                {typeLabel}
                                {v.alertsHigh > 0
                                  ? ` · ${v.alertsHigh} crítica${v.alertsHigh !== 1 ? 's' : ''}`
                                  : ''}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-2.5 py-2.5 text-right">
                          <div className="inline-flex justify-end">
                            <SharePctCell pct={share} />
                          </div>
                        </td>
                        <td className="px-2.5 py-2.5 text-right text-[12px] font-semibold tabular-nums text-stone-700 dark:text-stone-200">
                          {v.today > 0 ? formatMoneyEs(v.today) : '—'}
                        </td>
                        <td className="px-2.5 py-2.5 text-right text-[12px] font-extrabold tabular-nums text-stone-900 dark:text-white">
                          {formatMoneyEs(v.income)}
                        </td>
                        <td className="px-2.5 py-2.5 text-right">
                          <span className="inline-flex justify-end">
                            <FlatMom pct={v.mom} />
                          </span>
                        </td>
                        <td className="px-2.5 py-2.5 text-right text-[12px] font-extrabold tabular-nums text-stone-900 dark:text-white">
                          {laborLoading && personal === 0
                            ? '…'
                            : personal > 0
                              ? formatMoneyEs(personal)
                              : '—'}
                        </td>
                        <td className="px-2.5 py-2.5 text-right text-[12px] font-semibold tabular-nums text-stone-700 dark:text-stone-200">
                          {formatMoneyEs(v.financeIncome)}
                        </td>
                        <td className="px-2.5 py-2.5 text-right text-[12px] font-semibold tabular-nums text-stone-700 dark:text-stone-200">
                          {formatMoneyEs(v.expenses)}
                        </td>
                        <td className="px-2.5 py-2.5 text-right text-[12px] font-semibold tabular-nums text-stone-700 dark:text-stone-200">
                          {isOps && m.avgTicketMonth > 0 ? formatMoneyEs(m.avgTicketMonth) : '—'}
                        </td>
                        <td className="px-2.5 py-2.5 text-right">
                          <MarginCell pct={margin} />
                        </td>
                        <td
                          className={`px-2.5 py-2.5 text-right text-[12px] font-extrabold tabular-nums ${
                            result >= 0
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-rose-600'
                          }`}
                        >
                          {formatMoneyEs(result)}
                        </td>
                        <td className="px-2.5 py-2.5 text-right text-[12px] font-semibold tabular-nums text-stone-700 dark:text-stone-200">
                          {v.staffing > 0
                            ? `${formatNumberEs(v.clockedIn, { maxFraction: 0 })}/${formatNumberEs(v.staffing, { maxFraction: 0 })}`
                            : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-stone-200 bg-stone-50/80 dark:border-stone-700 dark:bg-stone-900/60">
                    <td className="sticky left-0 z-[1] bg-stone-50 px-4 py-2.5 text-[11px] font-extrabold uppercase tracking-wide text-stone-600 dark:bg-stone-900 dark:text-stone-300">
                      Total grupo
                    </td>
                    <td className="px-2.5 py-2.5 text-right text-[12px] font-extrabold tabular-nums text-stone-900 dark:text-white">
                      100%
                    </td>
                    <td className="px-2.5 py-2.5 text-right text-[12px] font-extrabold tabular-nums text-stone-900 dark:text-white">
                      {groupTotals.today > 0 ? formatMoneyEs(groupTotals.today) : '—'}
                    </td>
                    <td className="px-2.5 py-2.5 text-right text-[12px] font-extrabold tabular-nums text-stone-900 dark:text-white">
                      {formatMoneyEs(groupTotal)}
                    </td>
                    <td className="px-2.5 py-2.5" />
                    <td className="px-2.5 py-2.5 text-right text-[12px] font-extrabold tabular-nums text-stone-900 dark:text-white">
                      {groupTotals.personal > 0 ? formatMoneyEs(groupTotals.personal) : '—'}
                    </td>
                    <td className="px-2.5 py-2.5 text-right text-[12px] font-extrabold tabular-nums text-stone-900 dark:text-white">
                      {formatMoneyEs(groupTotals.financeIncome)}
                    </td>
                    <td className="px-2.5 py-2.5 text-right text-[12px] font-extrabold tabular-nums text-stone-900 dark:text-white">
                      {formatMoneyEs(groupTotals.expenses)}
                    </td>
                    <td className="px-2.5 py-2.5" />
                    <td className="px-2.5 py-2.5 text-right">
                      <MarginCell pct={marginPercent(groupTotals.result, groupTotals.financeIncome)} />
                    </td>
                    <td
                      className={`px-2.5 py-2.5 text-right text-[12px] font-extrabold tabular-nums ${
                        groupTotals.result >= 0
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-rose-600'
                      }`}
                    >
                      {formatMoneyEs(groupTotals.result)}
                    </td>
                    <td className="px-2.5 py-2.5 text-right text-[12px] font-extrabold tabular-nums text-stone-900 dark:text-white">
                      {groupTotals.staffing > 0
                        ? `${formatNumberEs(groupTotals.clockedIn, { maxFraction: 0 })}/${formatNumberEs(groupTotals.staffing, { maxFraction: 0 })}`
                        : '—'}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function MobileStat({
  label,
  value,
  valueNode,
  emphasize,
  tone,
}: {
  label: string;
  value?: string;
  valueNode?: ReactNode;
  emphasize?: boolean;
  tone?: 'ok' | 'bad';
}) {
  return (
    <div className="rounded-xl border border-stone-100 bg-stone-50/80 px-2 py-1.5 dark:border-stone-800 dark:bg-stone-900/50">
      <p className="text-[9px] font-bold uppercase tracking-wide text-stone-400">{label}</p>
      {valueNode ? (
        <div className="mt-0.5">{valueNode}</div>
      ) : (
        <p
          className={`mt-0.5 truncate text-[12px] font-extrabold tabular-nums ${
            tone === 'ok'
              ? 'text-emerald-700 dark:text-emerald-400'
              : tone === 'bad'
                ? 'text-rose-600'
                : emphasize
                  ? 'text-stone-900 dark:text-white'
                  : 'text-stone-700 dark:text-stone-200'
          }`}
        >
          {value}
        </p>
      )}
    </div>
  );
}

function MiniStat({
  label,
  value,
  extra,
  tone,
}: {
  label: string;
  value: string;
  extra?: ReactNode;
  tone?: 'bad' | 'warn';
}) {
  return (
    <div className="rounded-xl border border-stone-100 px-2 py-1.5 dark:border-stone-800">
      <p className="text-[9px] font-bold uppercase tracking-wide text-stone-400">{label}</p>
      <div className="mt-0.5 flex flex-wrap items-center gap-1">
        <p
          className={`text-[12px] font-extrabold tabular-nums ${
            tone === 'bad'
              ? 'text-rose-600'
              : tone === 'warn'
                ? 'text-amber-700'
                : 'text-stone-900 dark:text-white'
          }`}
        >
          {value}
        </p>
        {extra}
      </div>
    </div>
  );
}

/* ── Drawer detalle ────────────────────────────────────────────────── */

function DrawerSectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-stone-400">{children}</p>
  );
}

function DrawerSparkline({ points, color }: { points: number[]; color: string }) {
  const data = (points || []).filter((v) => Number.isFinite(v));
  if (data.length < 2 || !data.some((v) => v > 0)) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const span = max - min || 1;
  const w = 92;
  const h = 30;
  const step = w / (data.length - 1);
  const path = data
    .map(
      (v, i) =>
        `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(h - 2 - ((v - min) / span) * (h - 4)).toFixed(1)}`,
    )
    .join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden className="shrink-0 opacity-80">
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CeoCompanyDrawer({
  vision,
  alert,
  open,
  onClose,
  onEnter,
  onOpenOps,
  onOpenAlerts,
}: {
  vision: CeoCompanyVision | null;
  alert: CeoAlertFeedItem | null;
  open: boolean;
  onClose: () => void;
  onEnter: (businessId: string) => void;
  onOpenOps: (businessId: string) => void;
  onOpenAlerts: () => void;
}) {
  if (!open || !vision) return null;

  const typeLabel =
    BUSINESS_TYPE_LABELS[vision.row.business.businessType as BusinessType]
    || vision.verticalLabel;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <aside
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-stone-200 bg-white shadow-2xl dark:border-stone-800 dark:bg-stone-950"
        role="dialog"
        aria-label={`Detalle ${vision.name}`}
      >
        <div className="h-1.5 w-full shrink-0" style={{ backgroundColor: vision.brandColor }} />
        <div className="flex items-start justify-between gap-3 border-b border-stone-100 px-5 py-4 dark:border-stone-800">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-lg font-bold text-stone-900 dark:text-white">{vision.name}</h2>
            </div>
            <p className="mt-0.5 text-[12px] text-stone-500">{typeLabel}</p>
          </div>
          <button type="button" onClick={onClose} className="vsaas-btn-ghost !min-h-9 !px-2">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {alert ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50/80 px-3.5 py-3 dark:border-rose-900 dark:bg-rose-950/30">
              <p className="text-[10px] font-bold uppercase tracking-wide text-rose-600">Alerta seleccionada</p>
              <p className="mt-1 text-sm font-bold text-stone-900 dark:text-white">{alert.title}</p>
              {alert.message ? (
                <p className="mt-1 text-[12px] text-stone-600 dark:text-stone-300">{alert.message}</p>
              ) : null}
            </div>
          ) : null}

          {/* Héroe: facturación del mes con tendencia */}
          <div
            className="rounded-2xl border border-stone-100 px-3.5 py-3 dark:border-stone-800"
            style={{
              background: `linear-gradient(135deg, color-mix(in srgb, ${vision.brandColor} 7%, transparent), transparent 60%)`,
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <DrawerSectionLabel>Facturación del mes</DrawerSectionLabel>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <p className="text-2xl font-black tabular-nums text-stone-900 dark:text-white">
                    {formatMoneyEs(vision.income)}
                  </p>
                  <MomBadge pct={vision.mom} />
                </div>
              </div>
              <DrawerSparkline points={vision.pulse} color={vision.brandColor} />
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
              <span className="text-stone-500">
                Hoy{' '}
                <strong className="tabular-nums text-stone-900 dark:text-white">
                  {formatMoneyEs(vision.today)}
                </strong>
              </span>
              <span className="text-stone-500">
                Año{' '}
                <strong className="tabular-nums text-stone-900 dark:text-white">
                  {formatMoneyEs(vision.year)}
                </strong>
              </span>
            </div>
          </div>

          {/* Resultado del mes (si hay contabilidad) */}
          {vision.financeIncome > 0 || vision.expenses > 0 ? (
            <div className="rounded-2xl border border-stone-100 px-3.5 py-3 dark:border-stone-800">
              <DrawerSectionLabel>Resultado del mes</DrawerSectionLabel>
              <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                <div>
                  <p className="text-stone-400">Ingresos</p>
                  <p className="mt-0.5 font-extrabold tabular-nums text-stone-900 dark:text-white">
                    {formatMoneyEs(vision.financeIncome)}
                  </p>
                </div>
                <div>
                  <p className="text-stone-400">Gastos</p>
                  <p className="mt-0.5 font-extrabold tabular-nums text-stone-900 dark:text-white">
                    {formatMoneyEs(vision.expenses)}
                  </p>
                </div>
                <div>
                  <p className="text-stone-400">Resultado</p>
                  <p
                    className={`mt-0.5 font-extrabold tabular-nums ${
                      vision.profit >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600'
                    }`}
                  >
                    {formatMoneyEs(vision.profit)}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {/* Dinero disponible y pendiente */}
          <div className="grid grid-cols-2 gap-2">
            <MiniStat label="Caja / bancos" value={formatMoneyEs(vision.cash)} />
            <MiniStat
              label="Pendiente de cobro"
              value={formatMoneyEs(vision.pending)}
              tone={vision.pending > 0 ? 'warn' : undefined}
            />
          </div>

          {/* Equipo ahora */}
          <div className="rounded-2xl border border-stone-100 px-3.5 py-3 dark:border-stone-800">
            <div className="flex items-center justify-between gap-2">
              <DrawerSectionLabel>Equipo ahora</DrawerSectionLabel>
              <span className="inline-flex items-center gap-1.5 text-[12px] font-bold tabular-nums text-stone-900 dark:text-white">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    vision.clockedIn > 0 ? 'bg-emerald-500' : 'bg-stone-300 dark:bg-stone-700'
                  }`}
                />
                {formatNumberEs(vision.clockedIn, { maxFraction: 0 })} de{' '}
                {formatNumberEs(vision.staffing, { maxFraction: 0 })} fichados
              </span>
            </div>
            {vision.staffing > 0 ? (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-[width]"
                  style={{
                    width: `${Math.min(100, Math.round((vision.clockedIn / vision.staffing) * 100))}%`,
                  }}
                />
              </div>
            ) : null}
          </div>

          {vision.alertsHigh > 0 || vision.alertsUnresolved > 0 ? (
            <MiniStat
              label="Alertas abiertas"
              value={
                vision.alertsHigh > 0
                  ? `${formatNumberEs(vision.alertsUnresolved, { maxFraction: 0 })} (${formatNumberEs(vision.alertsHigh, { maxFraction: 0 })} críticas)`
                  : formatNumberEs(vision.alertsUnresolved, { maxFraction: 0 })
              }
              tone={vision.alertsHigh > 0 ? 'bad' : undefined}
            />
          ) : null}

          {vision.row.isDelivery ? (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <MiniStat
                  label="Cajas abiertas"
                  value={String(vision.row.metrics.openCashRegisters)}
                />
                <MiniStat
                  label="Ticket medio"
                  value={formatMoneyEs(vision.row.metrics.avgTicketMonth)}
                />
              </div>
              {(() => {
                const brands = deliveryBrandSheet(vision.row, 4);
                if (brands.length === 0) return null;
                const brandTotal = brands.reduce((s, b) => s + Math.max(0, b.revenueMonth), 0);
                return (
                  <div className="rounded-2xl border border-stone-100 px-3.5 py-3 dark:border-stone-800">
                    <DrawerSectionLabel>Marcas · mes</DrawerSectionLabel>
                    <div className="mt-2 space-y-2">
                      {brands.map((b) => {
                        const share =
                          brandTotal > 0
                            ? Math.round((Math.max(0, b.revenueMonth) / brandTotal) * 100)
                            : 0;
                        const color = b.color || vision.brandColor;
                        return (
                          <div key={b.id}>
                            <div className="flex items-center justify-between gap-2 text-[11px]">
                              <span className="inline-flex min-w-0 items-center gap-1.5">
                                <span
                                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                                  style={{ backgroundColor: color }}
                                />
                                <span className="truncate font-semibold text-stone-700 dark:text-stone-200">
                                  {b.name}
                                </span>
                                <span className="shrink-0 text-stone-400 tabular-nums">
                                  {share}%
                                </span>
                              </span>
                              <span className="shrink-0 font-semibold tabular-nums">
                                {formatMoneyEs(b.revenueMonth)}
                              </span>
                            </div>
                            <div className="mt-1 h-1 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
                              <div
                                className="h-full rounded-full"
                                style={{ width: `${share}%`, backgroundColor: color }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>
          ) : null}

          {vision.row.cajaMix && vision.row.cajaMix.total > 0 ? (
            <div className="rounded-2xl border border-stone-100 px-3.5 py-3 dark:border-stone-800">
              <DrawerSectionLabel>Cierre por canales</DrawerSectionLabel>
              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
                {(
                  [
                    ['Efectivo', vision.row.cajaMix.efectivo],
                    ['TPV', vision.row.cajaMix.tpv],
                    ['App', vision.row.cajaMix.app],
                    ['Glovo', vision.row.cajaMix.glovo],
                    ['Uber', vision.row.cajaMix.uber],
                    ['Just Eat', vision.row.cajaMix.justEat],
                  ] as const
                )
                  .filter(([, a]) => a > 0)
                  .map(([label, amount]) => {
                    const pct = Math.round((amount / vision.row.cajaMix!.total) * 100);
                    return (
                      <div key={label} className="flex items-baseline justify-between gap-2">
                        <span className="text-stone-500">{label}</span>
                        <span className="shrink-0">
                          <span className="font-semibold tabular-nums">
                            {formatMoneyEs(amount)}
                          </span>
                          <span className="ml-1 text-[10px] text-stone-400 tabular-nums">
                            {pct}%
                          </span>
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2 border-t border-stone-100 px-5 py-4 dark:border-stone-800">
          <button
            type="button"
            onClick={() => onEnter(vision.businessId)}
            className="vsaas-btn-advance flex-1 !min-h-11"
          >
            Entrar
            <ArrowRight className="h-4 w-4" />
          </button>
          {vision.row.isDelivery ? (
            <button
              type="button"
              onClick={() => onOpenOps(vision.businessId)}
              className="vsaas-btn-ghost !min-h-11"
            >
              Ops
            </button>
          ) : null}
          <button type="button" onClick={onOpenAlerts} className="vsaas-btn-ghost !min-h-11">
            Alertas
          </button>
        </div>
      </aside>
    </>
  );
}
