/**
 * Centro operativo bar/restaurante — hub propio (no DeliveryOps).
 * Selector de local + vista «En directo» (todos los PDV), como delivery.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  Armchair,
  Banknote,
  BookmarkCheck,
  ChefHat,
  Clock,
  ListChecks,
  RefreshCw,
  Store,
  UtensilsCrossed,
  Zap,
} from 'lucide-react';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { useActiveStoreScope } from '../../context/ActiveStoreScopeContext';
import { useLiveClock } from '../../hooks/useLiveClock';
import { resolveBusinessDataUserId } from '../../lib/tenantUserId';
import { resolveBusinessScopeId } from '../../lib/deliverySetup';
import { localCalendarDayKey } from '../../lib/tpvCajaScope';
import {
  getFloorConfigRequest,
  listDiningOrdersRequest,
  listDiningTablesRequest,
  type SalaRoomConfig,
} from '../../lib/salaApi';
import { listRestaurantRegisterSessions } from '../../lib/restaurantCajaApi';
import { listWaitlistForBusiness } from '../../lib/restaurantWaitlistApi';
import { isActiveWaitlistStatus } from '../../lib/restaurantWaitlistTypes';
import { listBrandsRequest, type Brand } from '../../lib/brandsApi';
import { saasPathWithBusinessScope } from '../../lib/businessScopeUrl';
import { diningOrdersToShiftDeliveryOrders } from '../../lib/restaurantShiftOrderMap';
import { pointOfSaleDisplayLabel, type PointOfSale } from '../../lib/deliveryApi';
import { coerceSelectedPdvId } from '../../lib/deliveryOpsPdvSelection';
import {
  RESTAURANT_OPS_LIVE_ALL_FILTER,
  notifyRestaurantActiveStoreChanged,
  readRestaurantOpsSelectedPdvId,
  readRestaurantOpsViewMode,
  writeRestaurantOpsSelectedPdvId,
  writeRestaurantOpsViewMode,
  type RestaurantOpsViewMode,
} from './restaurantOpsPdvSelection';
import { CompanyBrandPerformancePanel } from '../../components/saas/CompanyBrandPerformancePanel';
import {
  buildRestaurantOpsSnapshot,
  formatDwellMinutes,
  scopeRestaurantOpsByPdv,
  type RestaurantOpsPipelineKey,
  type RestaurantOpsSnapshot,
} from './restaurantOpsSnapshot';

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
    tone: 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300',
  },
  {
    key: 'occupied',
    label: 'Ocupadas',
    href: '/saas/caja/tpv',
    tone: 'bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-300',
  },
  {
    key: 'kitchen',
    label: 'En cocina',
    href: '/saas/cocina',
    tone: 'bg-orange-50 border-orange-200 text-orange-800 dark:bg-orange-950/40 dark:border-orange-800 dark:text-orange-300',
  },
  {
    key: 'ready',
    label: 'Listas',
    href: '/saas/cocina',
    tone: 'bg-indigo-50 border-indigo-200 text-indigo-800 dark:bg-indigo-950/40 dark:border-indigo-800 dark:text-indigo-300',
  },
  {
    key: 'to_pay',
    label: 'Por cobrar',
    href: '/saas/caja/tpv',
    tone: 'bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-300',
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
  return n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

function RestaurantOpsPdvLiveColumn({
  pdv,
  snapshot,
  onFocusStore,
  onPipelineNavigate,
}: {
  pdv: PointOfSale;
  snapshot: RestaurantOpsSnapshot;
  onFocusStore: (pdvId: string) => void;
  onPipelineNavigate: (href: string) => void;
}) {
  const label = pointOfSaleDisplayLabel(pdv);
  return (
    <div className="relative flex min-h-0 flex-col overflow-hidden rounded-2xl border border-stone-200/90 bg-white shadow-sm transition-all hover:border-teal-300/70 hover:shadow-md dark:border-stone-700 dark:bg-stone-900 dark:hover:border-teal-700/60">
      <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-teal-500 to-cyan-500" aria-hidden />
      <div className="flex items-start justify-between gap-2 py-3 pl-3.5 pr-3">
        <div className="min-w-0">
          <p className="mb-0.5 text-[10px] font-bold uppercase tracking-wider text-teal-700/80 dark:text-teal-400/90">
            Local
          </p>
          <p className="truncate text-base font-bold leading-tight text-stone-900 dark:text-stone-50">
            {label}
          </p>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs tabular-nums text-stone-500 dark:text-stone-400">
            <span className="font-semibold text-stone-800 dark:text-stone-200">
              {snapshot.pipeline.occupied} ocupadas
            </span>
            <span className="text-stone-300 dark:text-stone-600">·</span>
            <span className="font-semibold text-emerald-700 dark:text-emerald-400">
              {eur(snapshot.paidTodayEuro)}
            </span>
            {snapshot.cashOpen > 0 ? (
              <>
                <span className="text-stone-300 dark:text-stone-600">·</span>
                <span className="font-semibold text-teal-700 dark:text-teal-400">Caja abierta</span>
              </>
            ) : null}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onFocusStore(pdv._id)}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-teal-200 bg-teal-50/80 px-2.5 py-1.5 text-[11px] font-bold text-teal-800 transition-colors hover:bg-teal-100 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-300 dark:hover:bg-teal-900/50"
        >
          Ver detalle
        </button>
      </div>
      <div className="grid grid-cols-5 gap-1.5 px-3 pb-3">
        {PIPELINE.map((p) => {
          const n = snapshot.pipeline[p.key];
          const hot = n > 0;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => {
                onFocusStore(pdv._id);
                onPipelineNavigate(p.href);
              }}
              className={`rounded-xl border px-1 py-2 text-center transition hover:opacity-95 ${
                hot
                  ? p.tone
                  : 'border-stone-100 bg-stone-50/80 dark:border-stone-800 dark:bg-stone-800/50'
              }`}
            >
              <div className={`text-lg font-black tabular-nums leading-none ${hot ? '' : 'text-stone-400'}`}>
                {n}
              </div>
              <div className={`mt-1 truncate text-[9px] font-semibold opacity-90 ${hot ? '' : 'text-stone-400'}`}>
                {p.label}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function RestaurantOpsCenter() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const activeStoreScope = useActiveStoreScope();
  const dataUserId = resolveBusinessDataUserId(user, currentBusiness);
  const businessId = resolveBusinessScopeId(currentBusiness);
  const businessName = String(currentBusiness?.name || '').trim() || 'Bar / restaurante';
  const dayKey = localCalendarDayKey();
  const nowMs = useLiveClock(30_000);

  const activePdvs = useMemo(
    () =>
      (activeStoreScope.pointsOfSale.length > 0
        ? activeStoreScope.pointsOfSale
        : activeStoreScope.allPointsOfSale
      ).filter((p) => p.active !== false),
    [activeStoreScope.pointsOfSale, activeStoreScope.allPointsOfSale],
  );

  const [viewMode, setViewMode] = useState<RestaurantOpsViewMode>('single');
  const [selectedPdvId, setSelectedPdvId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasData, setHasData] = useState(false);
  const [tables, setTables] = useState<Awaited<ReturnType<typeof listDiningTablesRequest>>>([]);
  const [orders, setOrders] = useState<Awaited<ReturnType<typeof listDiningOrdersRequest>>>([]);
  const [sessions, setSessions] = useState<Awaited<ReturnType<typeof listRestaurantRegisterSessions>>>([]);
  const [rooms, setRooms] = useState<SalaRoomConfig[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [waitlistActive, setWaitlistActive] = useState(0);
  const loadSeqRef = useRef(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Solo al cambiar de empresa/cuenta: no re-aplicar bodegeta en cada refresh de PDVs.
  useEffect(() => {
    if (!businessId || !dataUserId) return;
    const mode = readRestaurantOpsViewMode(businessId, dataUserId);
    setViewMode(mode);
    const saved = readRestaurantOpsSelectedPdvId(businessId, dataUserId);
    setSelectedPdvId(
      coerceSelectedPdvId(activePdvs, saved || activeStoreScope.activeSalesPointId),
    );
    // activePdvs / activeSalesPointId a propósito fuera: si no, cada reload te devuelve a la 1ª tienda.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo hidratar al entrar en el negocio
  }, [businessId, dataUserId]);

  // Si el usuario cambia tienda desde Topbar/sidebar, alinear el filtro del ops.
  useEffect(() => {
    const fromScope = String(activeStoreScope.activeSalesPointId || '').trim();
    if (!fromScope) return;
    setSelectedPdvId((prev) => (prev === fromScope ? prev : fromScope));
  }, [activeStoreScope.activeSalesPointId]);

  const handleViewModeChange = useCallback(
    (mode: RestaurantOpsViewMode, salesPointId?: string) => {
      if (!businessId || !dataUserId) return;
      setViewMode(mode);
      writeRestaurantOpsViewMode(businessId, dataUserId, mode);
      if (mode === 'live_all') return;
      const id = coerceSelectedPdvId(activePdvs, salesPointId || selectedPdvId);
      if (!id) return;
      setSelectedPdvId(id);
      writeRestaurantOpsSelectedPdvId(businessId, dataUserId, id);
      activeStoreScope.setActiveSalesPoint(id);
      notifyRestaurantActiveStoreChanged();
    },
    [businessId, dataUserId, activePdvs, selectedPdvId, activeStoreScope],
  );

  const load = useCallback(async () => {
    if (!dataUserId) {
      setLoading(false);
      return;
    }
    const seq = ++loadSeqRef.current;
    try {
      const [tablesRow, ordersRow, sessionsRow, waitlistRow, brandsRow, floor] = await Promise.all([
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
      ]);
      if (seq !== loadSeqRef.current) return;
      setTables(tablesRow);
      setOrders(ordersRow);
      setSessions(sessionsRow);
      setBrands(brandsRow);
      setRooms(Array.isArray(floor?.rooms) ? (floor.rooms as SalaRoomConfig[]) : []);
      setWaitlistActive(
        waitlistRow.filter((w) => isActiveWaitlistStatus(w.status)).length,
      );
      setHasData(true);
    } catch (err) {
      if (seq === loadSeqRef.current) console.error('restaurant-ops error', err);
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  }, [dataUserId, businessId]);

  useEffect(() => {
    setHasData(false);
    setLoading(true);
  }, [dataUserId, businessId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    pollRef.current = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      void load();
    }, 30_000);
    const onVis = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [load]);

  const effectivePdvId = useMemo(
    () => coerceSelectedPdvId(activePdvs, selectedPdvId || activeStoreScope.activeSalesPointId),
    [activePdvs, selectedPdvId, activeStoreScope.activeSalesPointId],
  );

  const isLiveAll = viewMode === 'live_all' && activePdvs.length > 1;

  const scopedInputs = useMemo(() => {
    if (isLiveAll || !effectivePdvId) {
      return { tables, orders, sessions };
    }
    return scopeRestaurantOpsByPdv({
      tables,
      orders,
      sessions,
      rooms,
      pdvId: effectivePdvId,
    });
  }, [isLiveAll, effectivePdvId, tables, orders, sessions, rooms]);

  const snapshot = useMemo(
    () => buildRestaurantOpsSnapshot({
      tables: scopedInputs.tables,
      orders: scopedInputs.orders,
      sessions: scopedInputs.sessions,
      brands,
      waitlistActiveCount: waitlistActive,
      businessId,
      dayKey,
      nowMs,
    }),
    [scopedInputs, brands, waitlistActive, businessId, dayKey, nowMs],
  );

  const liveSnapshots = useMemo(() => {
    if (!isLiveAll) return [] as Array<{ pdv: PointOfSale; snap: RestaurantOpsSnapshot }>;
    return activePdvs.map((pdv) => {
      const scoped = scopeRestaurantOpsByPdv({
        tables,
        orders,
        sessions,
        rooms,
        pdvId: pdv._id,
      });
      return {
        pdv,
        snap: buildRestaurantOpsSnapshot({
          tables: scoped.tables,
          orders: scoped.orders,
          sessions: scoped.sessions,
          brands,
          waitlistActiveCount: waitlistActive,
          businessId,
          dayKey,
          nowMs,
        }),
      };
    });
  }, [isLiveAll, activePdvs, tables, orders, sessions, rooms, brands, waitlistActive, businessId, dayKey, nowMs]);

  const openDwells = useMemo(
    () => snapshot.tableDwells.filter((d) => d.status === 'open').slice(0, 12),
    [snapshot.tableDwells],
  );
  const closedDwells = useMemo(
    () => snapshot.tableDwells.filter((d) => d.status === 'closed').slice(0, 8),
    [snapshot.tableDwells],
  );

  const brandPanelOrders = useMemo(
    () => diningOrdersToShiftDeliveryOrders(scopedInputs.orders),
    [scopedInputs.orders],
  );

  const storeLabel = useMemo(() => {
    if (isLiveAll) return 'En directo · todos los locales';
    const pdv = activePdvs.find((p) => p._id === effectivePdvId);
    return pdv ? pointOfSaleDisplayLabel(pdv) : '';
  }, [isLiveAll, activePdvs, effectivePdvId]);

  const scoped = (path: string) => saasPathWithBusinessScope(path, businessId);

  const selectValue = isLiveAll
    ? RESTAURANT_OPS_LIVE_ALL_FILTER
    : effectivePdvId && activePdvs.some((p) => p._id === effectivePdvId)
      ? effectivePdvId
      : '';

  return (
    <Layout title="Centro operativo">
      <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-stone-500 dark:text-stone-400">
              <Activity className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-wide">Centro operativo</span>
            </div>
            <h1 className="mt-1 truncate text-xl font-semibold text-stone-900 dark:text-stone-50">
              {businessName}
            </h1>
            <p className="mt-0.5 text-sm text-stone-500 dark:text-stone-400">
              Hoy · sala, cocina y caja
              {storeLabel ? ` · ${storeLabel}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={() => { void load(); }}
            className="shrink-0 rounded-md border border-transparent p-2 text-stone-500 transition-colors hover:border-stone-200 hover:bg-white/80 hover:text-stone-800 dark:text-stone-400 dark:hover:border-stone-600 dark:hover:bg-stone-800 dark:hover:text-stone-100"
            title="Actualizar"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {activePdvs.length > 0 ? (
          <div className="rounded-xl border border-stone-200/90 bg-white/95 px-3 py-2 shadow-sm dark:border-stone-700 dark:bg-stone-900/90">
            {activePdvs.length > 1 ? (
              <select
                className="min-w-[12rem] rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-stone-900 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100 dark:focus:border-stone-400"
                value={selectValue}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === RESTAURANT_OPS_LIVE_ALL_FILTER) {
                    handleViewModeChange('live_all');
                    return;
                  }
                  handleViewModeChange('single', v || undefined);
                }}
              >
                <option value={RESTAURANT_OPS_LIVE_ALL_FILTER}>En directo · todas</option>
                {activePdvs.map((p) => (
                  <option key={p._id} value={p._id}>
                    {pointOfSaleDisplayLabel(p)}
                  </option>
                ))}
              </select>
            ) : (
              <div
                className="inline-flex items-center gap-2 rounded-lg border border-stone-900/25 bg-stone-50 px-3 py-2 text-sm font-medium text-stone-900 dark:border-stone-400/30 dark:bg-stone-800/90 dark:text-stone-100"
                title="Local activo"
              >
                <Store className="h-4 w-4 shrink-0 opacity-80" />
                <span className="max-w-[14rem] truncate">{pointOfSaleDisplayLabel(activePdvs[0])}</span>
              </div>
            )}
          </div>
        ) : null}

        {loading && !hasData ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-stone-300 border-t-stone-900 dark:border-stone-600 dark:border-t-stone-100" />
          </div>
        ) : (
          <>
            {isLiveAll ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {liveSnapshots.map(({ pdv, snap }) => (
                  <RestaurantOpsPdvLiveColumn
                    key={pdv._id}
                    pdv={pdv}
                    snapshot={snap}
                    onFocusStore={(id) => handleViewModeChange('single', id)}
                    onPipelineNavigate={(href) => navigate(scoped(href))}
                  />
                ))}
              </div>
            ) : (
              <>
                {snapshot.alerts.length > 0 && (
                  <div className="space-y-2">
                    {snapshot.alerts.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => navigate(scoped(a.href))}
                        className={`flex w-full items-start gap-3 rounded-2xl border px-3.5 py-3 text-left transition hover:opacity-95 ${
                          a.severity === 'danger'
                            ? 'border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100'
                            : 'border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100'
                        }`}
                      >
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold">{a.title}</p>
                          <p className="text-xs opacity-80">{a.detail}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {PIPELINE.map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => navigate(scoped(p.href))}
                      className={`rounded-2xl border px-3 py-3 text-left transition hover:shadow-sm ${p.tone}`}
                    >
                      <div className="font-mono text-2xl font-bold tabular-nums">
                        {snapshot.pipeline[p.key]}
                      </div>
                      <div className="mt-0.5 text-[11px] font-semibold opacity-90">{p.label}</div>
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    { label: 'Comensales', value: String(snapshot.guests), icon: Armchair },
                    { label: 'Comandas abiertas', value: String(snapshot.openOrders), icon: UtensilsCrossed },
                    { label: 'Tickets cocina', value: String(snapshot.kitchenTickets), icon: ChefHat },
                    { label: 'Cobrado hoy', value: eur(snapshot.paidTodayEuro), icon: Banknote },
                  ].map((k) => (
                    <div
                      key={k.label}
                      className="rounded-2xl border border-stone-200 bg-white px-3 py-3 dark:border-stone-700 dark:bg-stone-900"
                    >
                      <div className="flex items-center gap-1.5 text-stone-500 dark:text-stone-400">
                        <k.icon className="h-3.5 w-3.5" />
                        <span className="text-[11px] font-semibold">{k.label}</span>
                      </div>
                      <p className="mt-1 font-mono text-lg font-bold text-stone-900 dark:text-stone-50">
                        {k.value}
                      </p>
                    </div>
                  ))}
                </div>

                {businessId ? (
                  <CompanyBrandPerformancePanel
                    businessId={businessId}
                    brands={brands}
                    orders={brandPanelOrders}
                    loading={loading && !hasData}
                    variant="restaurant"
                  />
                ) : null}

                <div className="rounded-2xl border border-stone-200 bg-white p-3 dark:border-stone-700 dark:bg-stone-900">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-stone-500">
                      <Clock className="h-3.5 w-3.5" />
                      Tiempo en mesa
                    </div>
                    {snapshot.avgClosedDwellMinutes != null && (
                      <p className="text-[11px] text-stone-500">
                        Media hoy (cerradas):{' '}
                        <b className="font-mono text-stone-800 dark:text-stone-200">
                          {formatDwellMinutes(snapshot.avgClosedDwellMinutes)}
                        </b>
                      </p>
                    )}
                  </div>
                  {openDwells.length === 0 && closedDwells.length === 0 ? (
                    <p className="py-2 text-sm text-stone-400">Sin mesas con tiempo registrado hoy.</p>
                  ) : (
                    <div className="space-y-3">
                      {openDwells.length > 0 && (
                        <div>
                          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-rose-600 dark:text-rose-400">
                            Ahora en sala
                          </p>
                          <ul className="space-y-1">
                            {openDwells.map((d) => (
                              <li
                                key={`open-${d.tableId}-${d.startedAt}`}
                                className="flex items-center justify-between gap-2 rounded-lg border border-rose-100 bg-rose-50/50 px-2.5 py-1.5 text-sm dark:border-rose-900/50 dark:bg-rose-950/20"
                              >
                                <span className="min-w-0 truncate font-semibold text-stone-900 dark:text-stone-100">
                                  {d.tableLabel}
                                  {d.guests > 0 ? (
                                    <span className="ml-1.5 text-[11px] font-normal text-stone-500">
                                      {d.guests} pax
                                    </span>
                                  ) : null}
                                </span>
                                <span className="shrink-0 font-mono text-xs font-bold text-rose-700 dark:text-rose-300">
                                  {formatDwellMinutes(d.minutes)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {closedDwells.length > 0 && (
                        <div>
                          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-stone-500">
                            Cerradas hoy (entrada → salida)
                          </p>
                          <ul className="space-y-1">
                            {closedDwells.map((d) => (
                              <li
                                key={`closed-${d.tableId}-${d.endedAt}`}
                                className="flex items-center justify-between gap-2 rounded-lg border border-stone-100 bg-stone-50 px-2.5 py-1.5 text-sm dark:border-stone-800 dark:bg-stone-950/40"
                              >
                                <span className="min-w-0 truncate font-medium text-stone-800 dark:text-stone-200">
                                  {d.tableLabel}
                                </span>
                                <span className="shrink-0 font-mono text-xs font-semibold text-stone-600 dark:text-stone-300">
                                  {formatDwellMinutes(d.minutes)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}

            <div className="rounded-2xl border border-stone-200 bg-white p-3 dark:border-stone-700 dark:bg-stone-900">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-stone-500">
                <Clock className="h-3.5 w-3.5" />
                Accesos rápidos
              </div>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {QUICK.map(({ label, to, icon: Icon }) => (
                  <Link
                    key={to}
                    to={scoped(to)}
                    className="flex flex-col items-center gap-1.5 rounded-xl border border-stone-100 bg-stone-50 px-2 py-3 text-center transition hover:border-stone-300 dark:border-stone-800 dark:bg-stone-950/50 dark:hover:border-stone-600"
                  >
                    <Icon className="h-5 w-5 text-stone-700 dark:text-stone-200" />
                    <span className="text-xs font-semibold text-stone-900 dark:text-stone-50">{label}</span>
                  </Link>
                ))}
              </div>
            </div>

            <p className="text-center text-[11px] text-stone-400">
              {isLiveAll
                ? `${activePdvs.length} locales en directo`
                : `Caja ${snapshot.cashOpen > 0
                  ? `abierta (${snapshot.cashOpen} turno${snapshot.cashOpen === 1 ? '' : 's'})`
                  : 'sin turno abierto'}`}
              {' · '}
              {isLiveAll
                ? `${liveSnapshots.reduce((s, x) => s + x.snap.tablesTotal, 0)} mesas`
                : `${snapshot.tablesTotal} mesas en plano`}
            </p>
          </>
        )}
      </div>
    </Layout>
  );
}
