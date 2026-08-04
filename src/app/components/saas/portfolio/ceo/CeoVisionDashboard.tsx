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
import {
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
  ReferenceLine,
} from 'recharts';
import { formatMoneyEs, formatNumberEs } from '../../../../lib/formatNumberEs';
import { SOURCE_LABELS } from '../../../../lib/alertCenterApi';
import { BUSINESS_TYPE_LABELS } from '../../BusinessCarousel';
import type { BusinessType } from '../../../../lib/businessApi';
import {
  deliveryBrandSheet,
  deliveryUnitPulses,
  portfolioVerticalKind,
} from '../portfolioCompanyPulse';
import type { CeoAlertFeedItem } from './useCeoAlertFeed';
import {
  HEALTH_LABEL,
  type CeoCompanyVision,
  type CeoHealthTone,
} from './ceoVisionModel';
import { MomBadge } from './CeoGlanceRail';
import { FlatMom, groupSharePercent, SharePctCell } from './CeoCompanyCompare';

/* ── Top bar ───────────────────────────────────────────────────────── */

export function CeoVisionTopBar({
  companyCount,
  critical,
  attention,
  liveLabel,
  refreshing,
  onRefresh,
}: {
  companyCount: number;
  critical: number;
  attention: number;
  liveLabel?: string | null;
  refreshing?: boolean;
  onRefresh: () => void;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-stone-200/80 bg-white px-4 py-3.5 dark:border-stone-800 dark:bg-stone-950 sm:px-5">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-8 rounded-full bg-[linear-gradient(90deg,#22c55e,#14b8a6,#2563eb)]" />
          <h1 className="vsaas-title text-lg sm:text-xl">Visión general</h1>
        </div>
          <p className="mt-0.5 text-[12px] text-stone-500">
            {companyCount} empresa{companyCount !== 1 ? 's' : ''} del grupo
            {liveLabel ? ` · ${liveLabel}` : ''}
            {' · '}totales consolidados
          </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <CounterPill tone="critical" label="Críticas" value={critical} />
        <CounterPill tone="attention" label="Atención" value={attention} />
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

function CounterPill({
  tone,
  label,
  value,
}: {
  tone: 'critical' | 'attention';
  label: string;
  value: number;
}) {
  const cls =
    tone === 'critical'
      ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300'
      : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300';
  return (
    <div className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 ${cls}`}>
      <span className="text-[10px] font-bold uppercase tracking-wide">{label}</span>
      <span className="text-base font-extrabold tabular-nums">{value}</span>
    </div>
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

/* ── Mapa riesgo × tamaño ──────────────────────────────────────────── */

export function CeoRiskSizeMap({
  visions,
  onOpen,
  compact = false,
}: {
  visions: CeoCompanyVision[];
  onOpen: (businessId: string) => void;
  compact?: boolean;
}) {
  const data = visions.map((v) => ({
    x: Math.max(0, v.income),
    y: v.risk,
    z: Math.max(40, v.staffing * 8 + 40),
    name: v.name,
    id: v.businessId,
    fill: v.brandColor,
    health: v.health,
  }));
  const maxX = Math.max(...data.map((d) => d.x), 1);
  const midX = maxX / 2;

  return (
    <section className="overflow-hidden rounded-2xl border border-stone-200/80 bg-white dark:border-stone-800 dark:bg-stone-950">
      {compact ? null : (
        <div className="border-b border-stone-100 px-4 py-3.5 sm:px-5 dark:border-stone-800">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-stone-500">Tendencia</p>
          <h2 className="mt-0.5 text-base font-bold text-stone-900 dark:text-white">
            Mapa de riesgo y tamaño
          </h2>
          <p className="text-[11px] text-stone-500">
            X = ingresos · Y = riesgo · cuadrante crítico: grande y en problemas
          </p>
        </div>
      )}
      <div className={`px-2 py-3 sm:px-4 ${compact ? 'h-[240px]' : 'h-[280px] sm:h-[320px]'}`}>
        {data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-stone-400">Sin empresas</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 12, right: 16, bottom: 8, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(120,113,108,0.2)" />
              <XAxis
                type="number"
                dataKey="x"
                name="Ingresos"
                tick={{ fontSize: 10, fill: '#78716c' }}
                tickFormatter={(v) =>
                  Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(v)
                }
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="number"
                dataKey="y"
                name="Riesgo"
                domain={[0, 100]}
                tick={{ fontSize: 10, fill: '#78716c' }}
                axisLine={false}
                tickLine={false}
                width={36}
              />
              <ZAxis type="number" dataKey="z" range={[60, 220]} />
              <ReferenceLine y={50} stroke="#d6d3d1" strokeDasharray="4 4" />
              <ReferenceLine x={midX} stroke="#d6d3d1" strokeDasharray="4 4" />
              <Tooltip
                cursor={{ strokeDasharray: '3 3' }}
                formatter={(value: number, name: string) => {
                  if (name === 'Ingresos') return [formatMoneyEs(value), name];
                  if (name === 'Riesgo') return [`${value}/100`, name];
                  return [value, name];
                }}
                labelFormatter={(_, p) => p?.[0]?.payload?.name || ''}
                contentStyle={{ borderRadius: 12, border: '1px solid #e7e5e4', fontSize: 12 }}
              />
              <Scatter
                data={data}
                cursor="pointer"
                onClick={(point) => {
                  const payload = (point as { payload?: { id?: string }; id?: string }) || {};
                  const id = payload.payload?.id || payload.id;
                  if (id) onOpen(id);
                }}
              >
                {data.map((d) => (
                  <Cell
                    key={d.id}
                    fill={d.fill}
                    fillOpacity={d.health === 'critical' ? 0.95 : 0.75}
                    cursor="pointer"
                  />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        )}
      </div>
      <div className="flex flex-wrap gap-3 border-t border-stone-100 px-4 py-2.5 text-[10px] text-stone-500 sm:px-5 dark:border-stone-800">
        <span>↙ Pequeño / estable</span>
        <span>↘ Grande / estable</span>
        <span>↖ Pequeño / riesgo</span>
        <span className="font-bold text-rose-600 dark:text-rose-400">↗ Grande y en problemas</span>
      </div>
    </section>
  );
}

/* ── Líneas por empresa (tabla desktop · filas apiladas móvil) ───────── */

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
  filter,
  onFilter,
  onOpen,
  laborByBiz = {},
  laborLoading = false,
}: {
  visions: CeoCompanyVision[];
  canViewEbitda: boolean;
  filter: 'all' | CeoHealthTone;
  onFilter: (f: 'all' | CeoHealthTone) => void;
  onOpen: (businessId: string) => void;
  laborByBiz?: Record<string, number>;
  laborLoading?: boolean;
}) {
  const filtered =
    filter === 'all' ? visions : visions.filter((v) => v.health === filter);
  const resultLabel = canViewEbitda ? 'EBITDA' : 'Resultado';
  const groupTotal = useMemo(
    () => visions.reduce((s, v) => s + (Number(v.income) || 0), 0),
    [visions],
  );

  return (
    <section>
      <div className="mb-2.5 flex flex-wrap items-end justify-between gap-2 px-0.5 sm:mb-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-stone-500">Empresas</p>
          <h2 className="text-base font-bold text-stone-900 dark:text-white">
            Líneas por empresa
          </h2>
          <p className="text-[11px] text-stone-500">
            % grupo · mes · personal · ingresos · gastos · ticket
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ['all', 'Todas'],
              ['critical', 'Crítico'],
              ['attention', 'Atención'],
              ['stable', 'Estable'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => onFilter(key)}
              className={`rounded-xl border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                filter === key
                  ? 'border-[var(--v-blue,#2563eb)] bg-[var(--v-blue,#2563eb)] text-white'
                  : 'border-stone-200 bg-white text-stone-600 hover:border-blue-200 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-200 px-4 py-10 text-center text-sm text-stone-500 dark:border-stone-700">
          Ninguna empresa en este filtro
        </div>
      ) : (
        <>
          {/* Móvil — jerarquía clara */}
          <ul className="flex flex-col gap-2 md:hidden">
            {filtered.map((v) => {
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
                        <HealthBadge tone={v.health} />
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
                      </span>
                      {v.alertsUnresolved > 0 ? (
                        <span className={v.alertsHigh > 0 ? 'font-bold text-rose-600' : ''}>
                          {v.alertsUnresolved} alerta{v.alertsUnresolved !== 1 ? 's' : ''}
                        </span>
                      ) : null}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>

          {/* Desktop — columnas limpia */}
          <div className="hidden overflow-hidden rounded-2xl border border-stone-200/80 bg-white md:block dark:border-stone-800 dark:bg-stone-950">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-stone-100 bg-stone-50/80 text-[10px] font-bold uppercase tracking-wide text-stone-500 dark:border-stone-800 dark:bg-stone-900/60">
                    <th className="sticky left-0 z-[1] bg-stone-50 px-4 py-2.5 dark:bg-stone-900">Empresa</th>
                    <th className="px-2.5 py-2.5 text-right">% grupo</th>
                    <th className="px-2.5 py-2.5 text-right">Mes</th>
                    <th className="px-2.5 py-2.5 text-right" title="Mismo tramo de días del mes anterior">
                      vs mismo tramo
                    </th>
                    <th className="px-2.5 py-2.5 text-right">Personal</th>
                    <th className="px-2.5 py-2.5 text-right">Ingresos</th>
                    <th className="px-2.5 py-2.5 text-right">Gastos</th>
                    <th className="px-2.5 py-2.5 text-right">Ticket</th>
                    <th className="px-2.5 py-2.5 text-right">{resultLabel}</th>
                    <th className="px-3 py-2.5 text-right">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((v) => {
                    const { result, typeLabel, m, isOps } = companyLineMeta(v, canViewEbitda);
                    const personal = laborByBiz[v.businessId] || 0;
                    const share = groupSharePercent(v.income, groupTotal);
                    return (
                      <tr
                        key={v.businessId}
                        className="cursor-pointer border-b border-stone-100 last:border-0 hover:bg-stone-50/80 dark:border-stone-800 dark:hover:bg-stone-900/50"
                        onClick={() => onOpen(v.businessId)}
                      >
                        <td className="sticky left-0 z-[1] bg-white px-4 py-2.5 dark:bg-stone-950">
                          <div className="flex min-w-[140px] items-center gap-2">
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
                                {v.alertsUnresolved > 0
                                  ? ` · ${v.alertsUnresolved} alert.`
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
                        <td
                          className={`px-2.5 py-2.5 text-right text-[12px] font-extrabold tabular-nums ${
                            result >= 0
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-rose-600'
                          }`}
                        >
                          {formatMoneyEs(result)}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <HealthBadge tone={v.health} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
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

function HealthBadge({ tone }: { tone: CeoHealthTone }) {
  const map = {
    critical: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
    attention: 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
    stable: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  };
  return (
    <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-bold ${map[tone]}`}>
      {HEALTH_LABEL[tone]}
    </span>
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
              <HealthBadge tone={vision.health} />
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

          <div className="grid grid-cols-2 gap-2">
            <MiniStat label="Hoy" value={formatMoneyEs(vision.today)} />
            <MiniStat label="Mes" value={formatMoneyEs(vision.income)} extra={<MomBadge pct={vision.mom} />} />
            <MiniStat label="Año" value={formatMoneyEs(vision.year)} />
            <MiniStat label="Riesgo" value={`${vision.risk}/100`} />
            <MiniStat label="Caja / bancos" value={formatMoneyEs(vision.cash)} />
            <MiniStat label="Pendiente" value={formatMoneyEs(vision.pending)} />
            <MiniStat
              label="Dotación"
              value={`${formatNumberEs(vision.clockedIn, { maxFraction: 0 })} fichados / ${formatNumberEs(vision.staffing, { maxFraction: 0 })}`}
            />
            <MiniStat
              label="Alertas"
              value={`${vision.alertsUnresolved} · ${vision.alertsHigh} críticas`}
              tone={vision.alertsHigh > 0 ? 'bad' : undefined}
            />
          </div>

          {vision.row.isDelivery ? (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <MiniStat label="Cajas abiertas" value={String(vision.row.metrics.openCashRegisters)} />
                <MiniStat label="Ticket medio" value={formatMoneyEs(vision.row.metrics.avgTicketMonth)} />
              </div>
              {deliveryBrandSheet(vision.row, 4).length > 0 ? (
                <div className="rounded-2xl border border-stone-100 px-3 py-2.5 dark:border-stone-800">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-stone-400">
                    Marcas · mes
                  </p>
                  <div className="mt-2 space-y-1.5">
                    {deliveryBrandSheet(vision.row, 4).map((b) => (
                      <div key={b.id} className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="inline-flex min-w-0 items-center gap-1.5">
                          <span
                            className="h-1.5 w-1.5 shrink-0 rounded-full"
                            style={{ backgroundColor: b.color || vision.brandColor }}
                          />
                          <span className="truncate font-semibold text-stone-700 dark:text-stone-200">
                            {b.name}
                          </span>
                        </span>
                        <span className="shrink-0 font-semibold tabular-nums">
                          {formatMoneyEs(b.revenueMonth)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {vision.row.cajaMix && vision.row.cajaMix.total > 0 ? (
            <div className="rounded-2xl border border-stone-100 px-3 py-2.5 dark:border-stone-800">
              <p className="text-[10px] font-bold uppercase tracking-wide text-stone-400">Cierre por canales</p>
              <div className="mt-2 grid grid-cols-2 gap-1.5 text-[11px]">
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
                  .map(([label, amount]) => (
                    <div key={label} className="flex justify-between gap-2">
                      <span className="text-stone-500">{label}</span>
                      <span className="font-semibold tabular-nums">{formatMoneyEs(amount)}</span>
                    </div>
                  ))}
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
