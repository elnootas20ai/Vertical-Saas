/**
 * Dashboard SaaS bar/restaurante — conectado a datos reales del vertical:
 * sala (mesas), cocina, caja/TPV, reservas, lista de espera, equipo fichado
 * y KPIs financieros del servidor. En vivo vía SSE de sala + polling de respaldo.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Armchair,
  Banknote,
  BookmarkCheck,
  ChefHat,
  Clock,
  Euro,
  LayoutDashboard,
  ListChecks,
  Receipt,
  TrendingUp,
  Users,
  UtensilsCrossed,
  Wallet,
  Zap,
} from 'lucide-react';
import { Layout } from '../../components/saas/Layout';
import { LiveBadge } from '../../components/saas/LiveBadge';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { useSSE } from '../../hooks/useSSE';
import { useLiveClock } from '../../hooks/useLiveClock';
import type { VerticalDashboardProps } from '../../lib/verticalDashboardMap';
import { getAuthHeaders } from '../../lib/authApi';
import { resolveBusinessDataUserId } from '../../lib/tenantUserId';
import { resolveBusinessScopeId } from '../../lib/deliverySetup';
import { localCalendarDayKey } from '../../lib/tpvCajaScope';
import { saasPathWithBusinessScope } from '../../lib/businessScopeUrl';
import { fetchDashboardData, type DashboardServerData } from '../../lib/dashboardApi';
import {
  getFloorConfigRequest,
  listDiningOrdersRequest,
  listDiningTablesRequest,
  type SalaRoomConfig,
} from '../../lib/salaApi';
import { listRestaurantRegisterSessions } from '../../lib/restaurantCajaApi';
import { listWaitlistForBusiness } from '../../lib/restaurantWaitlistApi';
import { isActiveWaitlistStatus } from '../../lib/restaurantWaitlistTypes';
import { listReservations } from '../../lib/restaurantReservationsApi';
import {
  STATUS_CFG,
  type RestaurantReservation,
} from '../../lib/restaurantReservationTypes';
import { listBrandsRequest, type Brand } from '../../lib/brandsApi';
import { fetchActiveNow, type ActiveMember } from '../../lib/clockinsApi';
import { RESTAURANT_OPS_HOME_PATH } from '../../lib/retailOpsPaths';
import {
  shouldUseAdminDashboardDemo,
} from '../../lib/adminDashboardDemoGate';
import { getAdminRestaurantDemoKpis } from '../../lib/adminDashboardDemo';
import { AdminDemoChip } from '../../components/saas/AdminDemoChip';
import {
  buildRestaurantOpsSnapshot,
  formatDwellMinutes,
  type RestaurantOpsPipelineKey,
} from './restaurantOpsSnapshot';
import { RestaurantDashboardBillingCharts } from './RestaurantDashboardBillingCharts';

const LONG_STAY_MIN = 90;

const PIPELINE: Array<{
  key: RestaurantOpsPipelineKey;
  label: string;
  href: string;
  tone: string;
}> = [
  {
    key: 'free',
    label: 'Libres',
    href: '/saas/caja/tpv',
    tone: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
  },
  {
    key: 'occupied',
    label: 'Ocupadas',
    href: '/saas/caja/tpv',
    tone: 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300',
  },
  {
    key: 'kitchen',
    label: 'En cocina',
    href: '/saas/cocina',
    tone: 'border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-300',
  },
  {
    key: 'ready',
    label: 'Listas',
    href: '/saas/cocina',
    tone: 'border-indigo-200 bg-indigo-50 text-indigo-800 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300',
  },
  {
    key: 'to_pay',
    label: 'Por cobrar',
    href: '/saas/caja/tpv',
    tone: 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300',
  },
];

const QUICK = [
  { label: 'Sala', to: '/saas/sala', icon: UtensilsCrossed },
  { label: 'TPV', to: '/saas/caja/tpv', icon: Zap },
  { label: 'Cocina', to: '/saas/cocina', icon: ChefHat },
  { label: 'Caja', to: '/saas/caja', icon: Banknote },
  { label: 'Reservas', to: '/saas/reservations', icon: BookmarkCheck },
  { label: 'Lista espera', to: '/saas/lista-espera', icon: ListChecks },
] as const;

function eur(n: number): string {
  return (Number(n) || 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

/** KPI compacto clicable (mismo lenguaje que RealEstateDashboard). */
function MiniStat({
  icon: Icon,
  iconClass,
  label,
  value,
  sub,
  warn,
  onClick,
}: {
  icon: ComponentType<{ className?: string }>;
  iconClass: string;
  label: string;
  value: string;
  sub?: string;
  warn?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-2 py-1.5 text-left transition-colors ${
        warn
          ? 'border-amber-100 bg-amber-50/70 hover:border-amber-200 dark:border-amber-900/40 dark:bg-amber-950/20'
          : 'border-gray-100 bg-gray-50/60 hover:border-gray-200 dark:border-gray-800 dark:bg-gray-800/40 dark:hover:border-gray-700'
      }`}
    >
      <p className="flex items-center gap-1 truncate text-[9px] font-bold uppercase tracking-wide text-gray-500">
        <Icon className={`h-3 w-3 shrink-0 ${iconClass}`} />
        {label}
      </p>
      <p className="mt-0.5 text-[15px] font-black tabular-nums leading-tight text-gray-900 dark:text-gray-100">
        {value}
      </p>
      {sub ? <p className="text-[9px] leading-tight text-gray-400">{sub}</p> : null}
    </button>
  );
}

function SectionCard({
  icon: Icon,
  title,
  hint,
  action,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  hint?: string;
  action?: { label: string; onClick: () => void };
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-2.5 shadow-sm dark:border-gray-700 dark:bg-gray-900 sm:p-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="h-3.5 w-3.5 shrink-0 text-[var(--v-blue,#2563eb)]" />
          <p className="truncate text-xs font-bold text-gray-900 dark:text-gray-100">{title}</p>
          {hint ? <span className="hidden text-[10px] text-gray-400 sm:inline">{hint}</span> : null}
        </div>
        {action ? (
          <button
            type="button"
            onClick={action.onClick}
            className="rounded-md border border-gray-200 px-2 py-1 text-[10px] font-bold text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            {action.label}
          </button>
        ) : null}
      </div>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-16 animate-pulse rounded-lg border border-gray-100 bg-gray-100 dark:border-gray-800 dark:bg-gray-800"
          />
        ))}
      </div>
      <div className="h-40 animate-pulse rounded-xl border border-gray-100 bg-gray-100 dark:border-gray-800 dark:bg-gray-800" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="h-48 animate-pulse rounded-xl border border-gray-100 bg-gray-100 dark:border-gray-800 dark:bg-gray-800" />
        <div className="h-48 animate-pulse rounded-xl border border-gray-100 bg-gray-100 dark:border-gray-800 dark:bg-gray-800" />
      </div>
    </div>
  );
}

const RESERVATION_UPCOMING_STATUSES = new Set(['pending', 'confirmed', 'arrived', 'delayed']);

export function RestaurantDashboard({ onSelectGeneral }: VerticalDashboardProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentBusiness, businesses } = useBusiness();
  const dataUserId = resolveBusinessDataUserId(user, currentBusiness);
  const businessId = resolveBusinessScopeId(currentBusiness);
  const businessName = String(currentBusiness?.name || '').trim() || 'Bar / restaurante';
  const dayKey = localCalendarDayKey();
  const nowMs = useLiveClock(30_000);

  const [serverData, setServerData] = useState<DashboardServerData | null>(null);
  const [tables, setTables] = useState<Awaited<ReturnType<typeof listDiningTablesRequest>>>([]);
  const [orders, setOrders] = useState<Awaited<ReturnType<typeof listDiningOrdersRequest>>>([]);
  const [sessions, setSessions] = useState<Awaited<ReturnType<typeof listRestaurantRegisterSessions>>>([]);
  const [rooms, setRooms] = useState<SalaRoomConfig[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [waitlistActive, setWaitlistActive] = useState(0);
  const [reservations, setReservations] = useState<RestaurantReservation[]>([]);
  const [activeMembers, setActiveMembers] = useState<ActiveMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasData, setHasData] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [sseOk, setSseOk] = useState(false);
  const loadSeqRef = useRef(0);
  const sseReloadRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (!dataUserId) {
      setLoading(false);
      return;
    }
    const seq = ++loadSeqRef.current;
    setLoading(true);
    try {
      const [server, tablesRow, ordersRow, sessionsRow, waitlistRow, brandsRow, floor, reservationsRow, activeRow] =
        await Promise.all([
          fetchDashboardData(dataUserId).catch(() => null),
          listDiningTablesRequest(dataUserId).catch(() => []),
          listDiningOrdersRequest(dataUserId).catch(() => []),
          listRestaurantRegisterSessions(dataUserId, { businessId }).catch(() => []),
          businessId
            ? listWaitlistForBusiness(dataUserId, businessId).catch(() => [])
            : Promise.resolve([]),
          businessId ? listBrandsRequest(businessId).catch(() => []) : Promise.resolve([]),
          businessId
            ? getFloorConfigRequest(dataUserId, { businessId }).catch(() => null)
            : Promise.resolve(null),
          listReservations(dataUserId, {
            businessId,
            accountBusinessCount: businesses.length || 1,
          }).catch(() => [] as RestaurantReservation[]),
          businessId ? fetchActiveNow(businessId).catch(() => []) : Promise.resolve([]),
        ]);
      if (seq !== loadSeqRef.current) return;
      setServerData(server);
      setTables(tablesRow);
      setOrders(ordersRow);
      setSessions(sessionsRow);
      setBrands(brandsRow);
      setRooms(Array.isArray(floor?.rooms) ? (floor.rooms as SalaRoomConfig[]) : []);
      setWaitlistActive(waitlistRow.filter((w) => isActiveWaitlistStatus(w.status)).length);
      setReservations(reservationsRow);
      setActiveMembers(activeRow);
      setUpdatedAt(new Date());
      setHasData(true);
    } catch (err) {
      if (seq === loadSeqRef.current) console.error('restaurant-dashboard error', err);
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  }, [dataUserId, businessId, businesses.length]);

  useEffect(() => {
    setHasData(false);
    setLoading(true);
  }, [dataUserId, businessId, businesses.length]);

  useEffect(() => {
    void load();
  }, [load]);

  // Polling de respaldo (más corto si el SSE no está conectado).
  useEffect(() => {
    const iv = setInterval(() => {
      void load();
    }, sseOk ? 60_000 : 30_000);
    return () => clearInterval(iv);
  }, [load, sseOk]);

  // SSE de sala: recarga suave (con debounce) al cambiar mesas / comandas.
  const scheduleReload = useCallback(() => {
    if (sseReloadRef.current) clearTimeout(sseReloadRef.current);
    sseReloadRef.current = setTimeout(() => {
      sseReloadRef.current = null;
      void load();
    }, 800);
  }, [load]);

  useEffect(() => () => {
    if (sseReloadRef.current) clearTimeout(sseReloadRef.current);
  }, []);

  const sseToken = useMemo(() => {
    const headers = getAuthHeaders();
    const authHeader = headers.Authorization || headers.authorization;
    if (!authHeader) return null;
    return authHeader.replace(/^Bearer\s+/i, '').trim() || null;
  }, [user?.user_id]);

  const sseHandlers = useMemo(
    () => ({
      'sala:table_status_changed': scheduleReload,
      'sala:table_updated': scheduleReload,
      'sala:tables_bulk_updated': scheduleReload,
      'sala:order_created': scheduleReload,
      'sala:order_updated': scheduleReload,
      'sala:order_closed': scheduleReload,
      'sala:order_cancelled': scheduleReload,
      'sala:comanda_sent': scheduleReload,
      'sala:comanda_status_changed': scheduleReload,
      connected: () => setSseOk(true),
      disconnected: () => setSseOk(false),
      reconnecting: () => {},
    }),
    [scheduleReload],
  );

  useSSE({
    userId: user?.user_id || null,
    token: sseToken,
    businessId,
    handlers: sseHandlers,
    enabled: !!user?.user_id && !!sseToken,
  });

  const snapshot = useMemo(
    () =>
      buildRestaurantOpsSnapshot({
        tables,
        orders,
        sessions,
        brands,
        waitlistActiveCount: waitlistActive,
        businessId,
        dayKey,
        nowMs,
      }),
    [tables, orders, sessions, brands, waitlistActive, businessId, dayKey, nowMs],
  );

  const openDwells = useMemo(
    () => snapshot.tableDwells.filter((d) => d.status === 'open').slice(0, 6),
    [snapshot.tableDwells],
  );
  const closedTodayCount = useMemo(
    () => snapshot.tableDwells.filter((d) => d.status === 'closed').length,
    [snapshot.tableDwells],
  );
  const avgTicketToday = closedTodayCount > 0
    ? Math.round((snapshot.paidTodayEuro / closedTodayCount) * 100) / 100
    : 0;
  const occupancyPct = snapshot.tablesTotal > 0
    ? Math.round((snapshot.pipeline.occupied / snapshot.tablesTotal) * 100)
    : 0;

  const todayReservations = useMemo(
    () =>
      reservations
        .filter(
          (r) =>
            String(r.date || '').slice(0, 10) === dayKey
            && RESERVATION_UPCOMING_STATUSES.has(String(r.status || '')),
        )
        .sort((a, b) => String(a.time || '').localeCompare(String(b.time || ''))),
    [reservations, dayKey],
  );

  const kpis = serverData?.kpis || null;
  const adminDemo = useMemo(() => {
    if (!shouldUseAdminDashboardDemo(user?.email)) return null;
    if (snapshot.tablesTotal > 0 || snapshot.paidTodayEuro > 0) return null;
    if (kpis && Number(kpis.salesToday || 0) > 0) return null;
    return getAdminRestaurantDemoKpis(businessId || 'restaurant');
  }, [user?.email, snapshot.tablesTotal, snapshot.paidTodayEuro, kpis, businessId]);

  const displayPaidToday = adminDemo?.salesToday ?? snapshot.paidTodayEuro;
  const displayClosed = adminDemo?.ticketsToday ?? closedTodayCount;
  const displayAvg = adminDemo?.avgTicket ?? avgTicketToday;
  const displayGuests = adminDemo ? adminDemo.tablesOccupied * 2 : snapshot.guests;
  const displayOcc = adminDemo
    ? Math.round((adminDemo.tablesOccupied / Math.max(1, adminDemo.tablesFree + adminDemo.tablesOccupied)) * 100)
    : occupancyPct;
  const displayReservations = adminDemo?.reservationsToday ?? todayReservations.length;
  const displayWaitlist = adminDemo?.waitlist ?? snapshot.waitlistActive;
  const displayTablesTotal = adminDemo
    ? adminDemo.tablesFree + adminDemo.tablesOccupied
    : snapshot.tablesTotal;
  const displayPipeline = adminDemo
    ? {
        free: adminDemo.tablesFree,
        occupied: adminDemo.tablesOccupied,
        kitchen: adminDemo.kitchenPending,
        ready: 2,
        to_pay: 3,
      }
    : snapshot.pipeline;
  const displayKpis = adminDemo
    ? {
        salesToday: adminDemo.salesToday,
        salesTodayCount: adminDemo.ticketsToday,
        salesMonth: Math.round(adminDemo.salesToday * 22),
        expensesMonth: Math.round(adminDemo.salesToday * 12),
        estimatedProfit: Math.round(adminDemo.salesToday * 10),
      }
    : kpis;

  const scoped = useCallback(
    (path: string) => saasPathWithBusinessScope(path, businessId),
    [businessId],
  );

  return (
    <Layout title="Dashboard" subtitle={businessName}>
      <div className="relative flex flex-col gap-4 pb-8">
        <div className="flex flex-wrap items-center justify-end gap-1.5 -mt-1">
          <AdminDemoChip show={Boolean(adminDemo)} />
          <LiveBadge
            live={sseOk}
            refreshing={loading && hasData}
            updatedAt={updatedAt}
            className="mr-auto"
          />
          <button
            type="button"
            onClick={() => navigate(scoped(RESTAURANT_OPS_HOME_PATH))}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            <UtensilsCrossed className="h-3.5 w-3.5" />
            Centro operativo
          </button>
          {onSelectGeneral ? (
            <button
              type="button"
              onClick={onSelectGeneral}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              <LayoutDashboard className="h-3.5 w-3.5" />
              Vista general
            </button>
          ) : null}
        </div>

        {/* Facturación 14 días: carga propia (no espera el resto del dashboard) */}
        {dataUserId ? (
          <RestaurantDashboardBillingCharts
            userId={dataUserId}
            businessId={businessId}
            businessIdForScope={businessId}
          />
        ) : null}

        {loading && !hasData ? (
          <DashboardSkeleton />
        ) : (
          <>
            {/* Hoy en el local */}
            <SectionCard
              icon={Euro}
              title="Hoy en el local"
              hint="ventas, sala y caja en tiempo real"
            >
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-5">
                <MiniStat
                  icon={Banknote}
                  iconClass="text-emerald-600 dark:text-emerald-400"
                  label="Cobrado hoy"
                  value={eur(displayPaidToday)}
                  sub={`${displayClosed} cuenta${displayClosed === 1 ? '' : 's'} cerrada${displayClosed === 1 ? '' : 's'}`}
                  onClick={() => navigate(scoped('/saas/caja'))}
                />
                <MiniStat
                  icon={Receipt}
                  iconClass="text-blue-600 dark:text-blue-400"
                  label="Ticket medio"
                  value={displayAvg > 0 ? eur(displayAvg) : '—'}
                  sub="por cuenta cerrada hoy"
                  onClick={() => navigate(scoped('/saas/caja'))}
                />
                <MiniStat
                  icon={Armchair}
                  iconClass="text-rose-600 dark:text-rose-400"
                  label="Comensales"
                  value={String(displayGuests)}
                  sub={`ocupación ${displayOcc}%`}
                  onClick={() => navigate(scoped('/saas/sala'))}
                />
                <MiniStat
                  icon={BookmarkCheck}
                  iconClass="text-indigo-600 dark:text-indigo-400"
                  label="Reservas hoy"
                  value={String(displayReservations)}
                  sub="pendientes de sentar"
                  onClick={() => navigate(scoped('/saas/reservations'))}
                />
                <MiniStat
                  icon={ListChecks}
                  iconClass="text-amber-600 dark:text-amber-400"
                  label="Lista espera"
                  value={String(displayWaitlist)}
                  sub="grupos esperando mesa"
                  warn={displayWaitlist > 0}
                  onClick={() => navigate(scoped('/saas/lista-espera'))}
                />
              </div>
            </SectionCard>

            {/* Sala en vivo */}
            <SectionCard
              icon={UtensilsCrossed}
              title="Sala en vivo"
              hint={`${displayTablesTotal} mesas en plano`}
              action={{ label: 'Abrir sala', onClick: () => navigate(scoped('/saas/sala')) }}
            >
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5">
                {PIPELINE.map((p) => {
                  const n = displayPipeline[p.key as keyof typeof displayPipeline] ?? 0;
                  const hot = n > 0;
                  return (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => navigate(scoped(p.href))}
                      className={`rounded-xl border px-3 py-2.5 text-left transition hover:shadow-sm ${
                        hot
                          ? p.tone
                          : 'border-gray-100 bg-gray-50/60 text-gray-400 dark:border-gray-800 dark:bg-gray-800/40'
                      }`}
                    >
                      <div className="text-xl font-black tabular-nums leading-none">{n}</div>
                      <div className="mt-1 text-[10px] font-semibold opacity-90">{p.label}</div>
                    </button>
                  );
                })}
              </div>

              {/* Barra de ocupación */}
              <div className="mt-2.5">
                <div className="mb-1 flex items-center justify-between text-[10px] text-gray-500">
                  <span className="font-semibold">Ocupación de sala</span>
                  <span className="font-black tabular-nums text-gray-800 dark:text-gray-200">
                    {snapshot.pipeline.occupied}/{snapshot.tablesTotal} · {occupancyPct}%
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                  <div
                    className={`h-full rounded-full transition-all ${
                      occupancyPct >= 90
                        ? 'bg-rose-500'
                        : occupancyPct >= 60
                          ? 'bg-amber-500'
                          : 'bg-emerald-500'
                    }`}
                    style={{ width: `${Math.min(100, occupancyPct)}%` }}
                  />
                </div>
              </div>

              {openDwells.length > 0 && (
                <div className="mt-3">
                  <p className="mb-1.5 text-[9px] font-bold uppercase tracking-wide text-gray-400">
                    Mesas con más tiempo
                  </p>
                  <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
                    {openDwells.map((d) => {
                      const long = d.minutes >= LONG_STAY_MIN;
                      return (
                        <button
                          key={`${d.tableId}-${d.startedAt}`}
                          type="button"
                          onClick={() => navigate(scoped('/saas/sala'))}
                          className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors ${
                            long
                              ? 'border-amber-200 bg-amber-50/70 hover:border-amber-300 dark:border-amber-900/50 dark:bg-amber-950/20'
                              : 'border-gray-100 bg-gray-50/60 hover:border-gray-200 dark:border-gray-800 dark:bg-gray-800/40'
                          }`}
                        >
                          <span className="min-w-0 truncate font-semibold text-gray-900 dark:text-gray-100">
                            {d.tableLabel}
                            {d.guests > 0 ? (
                              <span className="ml-1 font-normal text-gray-400">{d.guests} pax</span>
                            ) : null}
                          </span>
                          <span
                            className={`shrink-0 font-mono text-[11px] font-bold tabular-nums ${
                              long ? 'text-amber-700 dark:text-amber-300' : 'text-gray-500'
                            }`}
                          >
                            {formatDwellMinutes(d.minutes)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </SectionCard>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {/* Cocina y caja */}
              <SectionCard
                icon={ChefHat}
                title="Cocina y caja"
                action={{ label: 'Cocina', onClick: () => navigate(scoped('/saas/cocina')) }}
              >
                <div className="grid grid-cols-2 gap-1.5">
                  <MiniStat
                    icon={ChefHat}
                    iconClass="text-orange-600 dark:text-orange-400"
                    label="Tickets cocina"
                    value={String(snapshot.kitchenTickets)}
                    sub={`${snapshot.pipeline.kitchen} en marcha · ${snapshot.pipeline.ready} listas`}
                    onClick={() => navigate(scoped('/saas/cocina'))}
                  />
                  <MiniStat
                    icon={Clock}
                    iconClass="text-red-600 dark:text-red-400"
                    label="Atrasadas"
                    value={String(snapshot.kitchenOvertime)}
                    sub="más de 20 min"
                    warn={snapshot.kitchenOvertime > 0}
                    onClick={() => navigate(scoped('/saas/cocina'))}
                  />
                  <MiniStat
                    icon={Banknote}
                    iconClass="text-emerald-600 dark:text-emerald-400"
                    label="Turnos de caja"
                    value={String(snapshot.cashOpen)}
                    sub={snapshot.cashOpen > 0 ? 'caja abierta' : 'sin turno abierto'}
                    warn={snapshot.cashOpen === 0 && snapshot.pipeline.occupied > 0}
                    onClick={() => navigate(scoped('/saas/caja'))}
                  />
                  <MiniStat
                    icon={Clock}
                    iconClass="text-teal-600 dark:text-teal-400"
                    label="Tiempo en mesa"
                    value={
                      snapshot.avgClosedDwellMinutes != null
                        ? formatDwellMinutes(snapshot.avgClosedDwellMinutes)
                        : '—'
                    }
                    sub="media de cuentas cerradas hoy"
                    onClick={() => navigate(scoped(RESTAURANT_OPS_HOME_PATH))}
                  />
                </div>

                {snapshot.brands.length >= 2 && (
                  <div className="mt-3">
                    <p className="mb-1.5 text-[9px] font-bold uppercase tracking-wide text-gray-400">
                      Marcas · cobrado hoy
                    </p>
                    <ul className="space-y-1">
                      {snapshot.brands.slice(0, 4).map((b) => {
                        const pct = snapshot.paidTodayEuro > 0
                          ? Math.round((b.amount / snapshot.paidTodayEuro) * 100)
                          : 0;
                        return (
                          <li key={b.id} className="flex items-center gap-2 text-xs">
                            <span className="min-w-0 flex-1 truncate font-semibold text-gray-800 dark:text-gray-200">
                              {b.label}
                            </span>
                            <span className="h-1.5 w-20 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                              <span
                                className="block h-full rounded-full bg-[var(--v-blue,#2563eb)]"
                                style={{ width: `${Math.min(100, pct)}%` }}
                              />
                            </span>
                            <span className="w-16 shrink-0 text-right font-black tabular-nums text-gray-900 dark:text-gray-100">
                              {eur(b.amount)}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </SectionCard>

              {/* Reservas de hoy */}
              <SectionCard
                icon={BookmarkCheck}
                title="Reservas de hoy"
                hint="pendientes de sentar"
                action={{ label: 'Todas', onClick: () => navigate(scoped('/saas/reservations')) }}
              >
                {todayReservations.length === 0 ? (
                  <p className="py-4 text-center text-sm text-gray-400">
                    Sin reservas pendientes para hoy.
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {todayReservations.slice(0, 5).map((r) => {
                      const cfg = STATUS_CFG[r.status] || STATUS_CFG.pending;
                      return (
                        <li
                          key={r._id}
                          className="flex items-center gap-2.5 rounded-lg border border-gray-100 bg-gray-50/60 px-2.5 py-1.5 dark:border-gray-800 dark:bg-gray-800/40"
                        >
                          <span className="w-11 shrink-0 font-mono text-xs font-bold tabular-nums text-gray-900 dark:text-gray-100">
                            {r.time || '—'}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-xs font-semibold text-gray-800 dark:text-gray-200">
                            {r.guestName || 'Sin nombre'}
                            <span className="ml-1.5 font-normal text-gray-400">
                              {r.partySize ? `${r.partySize} pax` : ''}
                              {r.tableName ? ` · ${r.tableName}` : ''}
                            </span>
                          </span>
                          <span
                            className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold ${cfg.bg} ${cfg.text} ${cfg.border}`}
                          >
                            {cfg.label}
                          </span>
                        </li>
                      );
                    })}
                    {todayReservations.length > 5 && (
                      <li className="pt-0.5 text-center text-[10px] font-semibold text-gray-400">
                        +{todayReservations.length - 5} más
                      </li>
                    )}
                  </ul>
                )}
              </SectionCard>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {/* Equipo fichado */}
              <SectionCard
                icon={Users}
                title="Equipo ahora"
                hint="fichajes en tiempo real"
                action={{ label: 'Equipo', onClick: () => navigate(scoped('/saas/team')) }}
              >
                {activeMembers.length === 0 ? (
                  <p className="py-4 text-center text-sm text-gray-400">
                    Nadie fichado ahora mismo.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {activeMembers.map((m) => (
                      <span
                        key={m.member_id}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                          m.status === 'break'
                            ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300'
                            : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300'
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            m.status === 'break' ? 'bg-amber-500' : 'bg-emerald-500'
                          }`}
                        />
                        {m.member_name}
                        <span className="font-normal opacity-70">
                          {m.status === 'break' ? 'descanso' : formatDwellMinutes(m.totalMinutes)}
                        </span>
                      </span>
                    ))}
                  </div>
                )}
              </SectionCard>

              {/* Resultado del mes (servidor) */}
              <SectionCard
                icon={TrendingUp}
                title="Resultado del mes"
                hint="ventas, gastos y beneficio estimado"
                action={{
                  label: 'Finanzas',
                  onClick: () => navigate(scoped('/saas/income-expenses')),
                }}
              >
                <div className="grid grid-cols-2 gap-1.5">
                  <MiniStat
                    icon={Euro}
                    iconClass="text-blue-600 dark:text-blue-400"
                    label="Ventas hoy"
                    value={displayKpis ? eur(displayKpis.salesToday) : '—'}
                    sub={displayKpis ? `${displayKpis.salesTodayCount} venta${displayKpis.salesTodayCount === 1 ? '' : 's'}` : undefined}
                    onClick={() => navigate(scoped('/saas/income-expenses'))}
                  />
                  <MiniStat
                    icon={TrendingUp}
                    iconClass="text-emerald-600 dark:text-emerald-400"
                    label="Ventas mes"
                    value={displayKpis ? eur(displayKpis.salesMonth) : '—'}
                    onClick={() => navigate(scoped('/saas/income-expenses'))}
                  />
                  <MiniStat
                    icon={Wallet}
                    iconClass="text-rose-600 dark:text-rose-400"
                    label="Gastos mes"
                    value={displayKpis ? eur(displayKpis.expensesMonth) : '—'}
                    onClick={() => navigate(scoped('/saas/income-expenses'))}
                  />
                  <MiniStat
                    icon={Euro}
                    iconClass="text-indigo-600 dark:text-indigo-400"
                    label="Beneficio est."
                    value={displayKpis ? eur(displayKpis.estimatedProfit) : '—'}
                    warn={!!displayKpis && displayKpis.estimatedProfit < 0}
                    onClick={() => navigate(scoped('/saas/income-expenses'))}
                  />
                </div>
              </SectionCard>
            </div>

            {/* Accesos rápidos */}
            <SectionCard icon={Zap} title="Accesos rápidos">
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {QUICK.map(({ label, to, icon: Icon }) => (
                  <Link
                    key={to}
                    to={scoped(to)}
                    className="flex flex-col items-center gap-1.5 rounded-xl border border-gray-100 bg-gray-50/60 px-2 py-3 text-center transition hover:border-[rgba(37,99,235,0.35)] hover:bg-white dark:border-gray-800 dark:bg-gray-800/40 dark:hover:border-gray-600"
                  >
                    <Icon className="h-5 w-5 text-gray-700 dark:text-gray-200" />
                    <span className="text-xs font-semibold text-gray-900 dark:text-gray-100">
                      {label}
                    </span>
                  </Link>
                ))}
              </div>
            </SectionCard>
          </>
        )}
      </div>
    </Layout>
  );
}
