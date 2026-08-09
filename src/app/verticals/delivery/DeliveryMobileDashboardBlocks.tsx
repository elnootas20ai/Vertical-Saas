/**
 * Bloques del dashboard empresa delivery para móvil / CeoMobileHome.
 * Ola rápida (KPIs) al entrar; detalle al deslizar + caché corta.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { Hash, Package, RefreshCw, TrendingUp, Wallet } from 'lucide-react';
import type { Brand } from '../../lib/brandApi';
import { listBrandsRequest } from '../../lib/brandApi';
import {
  filterDeliveryOrdersRequest,
  listStaffConsumptionsRequest,
  listTpvRegisterSessionsRequest,
  type DeliveryOrder,
  type TpvRegisterSession,
} from '../../lib/deliveryApi';
import { countsTowardNewClientMetrics } from '../../lib/clientAcquisition';
import { fetchClientAcquisitionSample } from '../../lib/clientAcquisitionSample';
import { formatMoneyEs, formatNumberEs } from '../../lib/formatNumberEs';
import {
  applyTpvCashMetrics,
  buildStoreOpsPulse,
  computePortfolioClientMetrics,
  computePortfolioMetrics,
  listMonthToDateDayKeys,
  listTrailingDayKeys,
  pickPrimaryPdvIdFromList,
  type PortfolioMetrics,
  type StoreOpsPulse,
} from '../../lib/portfolioMetrics';
import { localCalendarDayKey } from '../../lib/tpvCajaScope';
import { VERTIAL_SURFACE_STONE } from '../../lib/vertialUiTokens';
import { CompanyBrandPerformancePanel } from '../../components/saas/CompanyBrandPerformancePanel';
import { PortfolioOpsPulse } from '../../components/saas/PortfolioOpsPulse';
import { MobileLazySection } from '../../components/saas/MobileLazySection';
import { useInViewOnce } from '../../hooks/useInViewOnce';
import { WorkerPayMonthPanel } from './WorkerPayMonthPanel';
import { buildWorkerPayMonthSummary, type WorkerPayMonthSummary } from './workerPayFromTpv';
import { DeliveryOpsInsightsPanel } from './DeliveryOpsInsightsPanel';

export type MobilePdvRef = {
  id: string;
  name: string;
  workCenterId?: string | null;
};

type Props = {
  dataUserId: string;
  businessId: string;
  businessName?: string;
  salesPointId?: string | null;
  stores: Array<{ id: string; name: string }>;
  pdvs?: MobilePdvRef[];
  opsAlertCount?: number;
  onUnpaidSnapshot?: (count: number, amount: number) => void;
};

type CachePayload = {
  at: number;
  orders: DeliveryOrder[];
  brands: Brand[];
  sessions: TpvRegisterSession[];
  workerPay: WorkerPayMonthSummary | null;
  newClientsMonth: number | null;
  newClientsPrevMonth: number | null;
  newClientsToday: number | null;
  newClientsYesterday: number | null;
};

const CACHE_TTL_MS = 90_000;
/** Primera pintura: pocos pedidos, rápido. */
const ORDER_LIMIT_FAST = 800;
/** Segunda ola: mes ant. + mes actual. */
const ORDER_LIMIT_FULL = 2000;

function cacheKey(businessId: string): string {
  return `vertial_mobile_dash_v3:${businessId}`;
}

function readCache(businessId: string): CachePayload | null {
  try {
    const raw = sessionStorage.getItem(cacheKey(businessId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachePayload;
    if (!parsed?.at || Date.now() - parsed.at > CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(businessId: string, payload: CachePayload): void {
  try {
    sessionStorage.setItem(cacheKey(businessId), JSON.stringify(payload));
  } catch {
    /* quota */
  }
}

/** Desde el 1 del mes anterior (KPI MoM + pulse mes + marcas día/mes). */
function mobileOrdersFromIso(todayKey: string): string {
  const [y, m] = todayKey.split('-').map(Number);
  const prev = new Date(y, m - 2, 1);
  const yy = prev.getFullYear();
  const mm = String(prev.getMonth() + 1).padStart(2, '0');
  return `${yy}-${mm}-01T00:00:00.000Z`;
}

/** Ventana corta para primera pintura (últimos 14 días). */
function mobileOrdersFastFromIso(todayKey: string): string {
  const [y, m, d] = todayKey.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - 14);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}T00:00:00.000Z`;
}

export function DeliveryMobileDashboardBlocks({
  dataUserId,
  businessId,
  businessName = 'Empresa',
  salesPointId,
  stores,
  pdvs = [],
  opsAlertCount = 0,
  onUnpaidSnapshot,
}: Props) {
  const navigate = useNavigate();
  const pdvKey = useMemo(
    () => (pdvs.length ? pdvs : stores.map((s) => ({ id: s.id, name: s.name, workCenterId: s.id })))
      .map((p) => `${p.id}|${p.workCenterId || ''}`)
      .join(','),
    [pdvs, stores],
  );
  const pdvSources = useMemo((): MobilePdvRef[] => {
    if (pdvs.length > 0) return pdvs;
    return stores.map((s) => ({ id: s.id, name: s.name, workCenterId: s.id }));
  }, [pdvs, stores]);

  const cached = useMemo(() => (businessId ? readCache(businessId) : null), [businessId]);
  const [loading, setLoading] = useState(!cached);
  const [refreshing, setRefreshing] = useState(false);
  const [heavyReady, setHeavyReady] = useState(Boolean(cached?.orders?.length));
  const [orders, setOrders] = useState<DeliveryOrder[]>(() => cached?.orders || []);
  const [brands, setBrands] = useState<Brand[]>(() => cached?.brands || []);
  const [tpvSessions, setTpvSessions] = useState<TpvRegisterSession[]>(() => cached?.sessions || []);
  const [workerPay, setWorkerPay] = useState<WorkerPayMonthSummary | null>(() => cached?.workerPay ?? null);
  const [pulses7d, setPulses7d] = useState<StoreOpsPulse[]>([]);
  const [pulsesMonth, setPulsesMonth] = useState<StoreOpsPulse[]>([]);
  const [newClientsMonth, setNewClientsMonth] = useState<number | null>(() => cached?.newClientsMonth ?? null);
  const [newClientsPrevMonth, setNewClientsPrevMonth] = useState<number | null>(
    () => cached?.newClientsPrevMonth ?? null,
  );
  const [newClientsToday, setNewClientsToday] = useState<number | null>(() => cached?.newClientsToday ?? null);
  const [newClientsYesterday, setNewClientsYesterday] = useState<number | null>(
    () => cached?.newClientsYesterday ?? null,
  );
  const loadGen = useRef(0);
  const heavyStarted = useRef(Boolean(cached?.orders?.length));
  const { ref: heavyGateRef, visible: wantHeavy } = useInViewOnce({
    rootMargin: '120px 0px',
  });

  const rebuildPulses = useCallback(
    (list: DeliveryOrder[], sessions: TpvRegisterSession[] = tpvSessions) => {
      const todayKey = localCalendarDayKey();
      const keys7d = listTrailingDayKeys(todayKey, 7);
      const keysMonth = listMonthToDateDayKeys(todayKey);
      const buildPulses = (dayKeys: string[]): StoreOpsPulse[] =>
        pdvSources
          .filter((p) => p.id)
          .map((p) => {
            const wcId = String(p.workCenterId || '').trim() || p.id;
            return buildStoreOpsPulse(list, {
              storeId: wcId,
              storeName: p.name,
              businessId,
              businessName,
              pdvId: p.id,
              workCenterId: wcId,
              todayKey,
              dayKeys,
              sessions,
            });
          })
          .filter((p) => Boolean(p.pdvId));
      setPulses7d(buildPulses(keys7d));
      setPulsesMonth(buildPulses(keysMonth));
    },
    [pdvSources, businessId, businessName, tpvSessions],
  );

  useEffect(() => {
    if (orders.length || tpvSessions.length) rebuildPulses(orders, tpvSessions);
  }, [orders, tpvSessions, rebuildPulses]);

  useEffect(() => {
    if (!onUnpaidSnapshot) return;
    const activeStatuses = new Set(['nuevo', 'cocina', 'listo', 'en_reparto', 'incident']);
    const unpaid = orders.filter((o) => {
      if (salesPointId && String(o.salesPointId || '').trim() !== salesPointId) return false;
      if (!activeStatuses.has(String(o.status || '').toLowerCase())) return false;
      const st = String(o.paymentStatus || '').toLowerCase();
      return st === 'pending' || st === 'partial';
    });
    const amount = unpaid.reduce((s, o) => s + Number(o.totalAmount || 0), 0);
    onUnpaidSnapshot(unpaid.length, amount);
  }, [orders, salesPointId, onUnpaidSnapshot]);

  const load = useCallback(async (opts?: { soft?: boolean; forceHeavy?: boolean }) => {
    if (!dataUserId || !businessId) {
      setLoading(false);
      return;
    }
    const soft = Boolean(opts?.soft);
    const forceHeavy = Boolean(opts?.forceHeavy);
    const gen = ++loadGen.current;
    if (soft || forceHeavy) setRefreshing(true);
    if (soft) heavyStarted.current = false;
    else if (!orders.length) setLoading(true);

    const todayKey = localCalendarDayKey();
    const monthKey = todayKey.slice(0, 7);
    const monthEnd = `${todayKey}T23:59:59.999Z`;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = localCalendarDayKey(yesterday);

    try {
      // Ola 0 — rápida: 14 días + marcas + sesiones lite → KPIs ya visibles
      const [fastOrders, sessionList, brandList] = await Promise.all([
        filterDeliveryOrdersRequest(dataUserId, {
          dateFrom: mobileOrdersFastFromIso(todayKey),
          dateTo: monthEnd,
          limit: ORDER_LIMIT_FAST,
          businessId,
        }).catch(() => ({ orders: [] as DeliveryOrder[], total: 0 })),
        listTpvRegisterSessionsRequest(dataUserId, { businessId, lite: true }).catch(() => []),
        listBrandsRequest(businessId).catch(() => [] as Brand[]),
      ]);
      if (gen !== loadGen.current) return;

      let list = Array.isArray(fastOrders.orders) ? fastOrders.orders : [];
      const sessions = Array.isArray(sessionList) ? sessionList : [];
      setOrders(list);
      setTpvSessions(sessions);
      setBrands(Array.isArray(brandList) ? brandList : []);
      setLoading(false);

      const shouldHeavy = forceHeavy || soft || wantHeavy || Boolean(cached?.orders?.length);
      if (shouldHeavy) {
        heavyStarted.current = true;
        // Ola 1 — mes ant. completo (marcas / pulse mes) en segundo plano
        const fullOrders = await filterDeliveryOrdersRequest(dataUserId, {
          dateFrom: mobileOrdersFromIso(todayKey),
          dateTo: monthEnd,
          limit: ORDER_LIMIT_FULL,
          businessId,
        }).catch(() => ({ orders: list, total: list.length }));
        if (gen !== loadGen.current) return;
        list = Array.isArray(fullOrders.orders) ? fullOrders.orders : list;
        setOrders(list);
        setHeavyReady(true);

        // Ola 2 — CRM + pagos trabajadores
        const [consumptions, clientSample] = await Promise.all([
          listStaffConsumptionsRequest(dataUserId, { month: monthKey }).catch(() => ({
            items: [],
            summary: { count: 0, total: 0, cashNowTotal: 0, payrollTotal: 0 },
          })),
          fetchClientAcquisitionSample(dataUserId, {
            monthKey,
            businessId,
          }).catch(() => ({ totalClients: 0, sample: [] })),
        ]);
        if (gen !== loadGen.current) return;

        const pay = buildWorkerPayMonthSummary(sessions, monthKey, consumptions.items || []);
        setWorkerPay(pay);

        const clientMetrics = computePortfolioClientMetrics(clientSample.sample || [], monthKey);
        let newToday = 0;
        let newYest = 0;
        for (const client of clientSample.sample || []) {
          if (!countsTowardNewClientMetrics(client)) continue;
          const raw = client.createdAt;
          const iso = raw instanceof Date ? raw.toISOString() : String(raw || '');
          if (!iso) continue;
          const day = localCalendarDayKey(new Date(iso));
          if (day === todayKey) newToday += 1;
          else if (day === yesterdayKey) newYest += 1;
        }
        setNewClientsMonth(clientMetrics.newClientsMonth);
        setNewClientsPrevMonth(clientMetrics.newClientsPrevMonth);
        setNewClientsToday(newToday);
        setNewClientsYesterday(newYest);

        writeCache(businessId, {
          at: Date.now(),
          orders: list,
          brands: Array.isArray(brandList) ? brandList : [],
          sessions,
          workerPay: pay,
          newClientsMonth: clientMetrics.newClientsMonth,
          newClientsPrevMonth: clientMetrics.newClientsPrevMonth,
          newClientsToday: newToday,
          newClientsYesterday: newYest,
        });
      }
    } finally {
      if (gen === loadGen.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [dataUserId, businessId, orders.length, wantHeavy, cached]);

  useEffect(() => {
    void load({ soft: Boolean(cached), forceHeavy: Boolean(cached?.orders?.length) });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on tenant / PDV set, not every render
  }, [dataUserId, businessId, pdvKey]);

  useEffect(() => {
    if (!wantHeavy || !dataUserId || !businessId) return;
    if (heavyReady || heavyStarted.current || loading) return;
    void load({ forceHeavy: true });
  }, [wantHeavy, dataUserId, businessId, heavyReady, loading, load]);

  const scopedOrders = useMemo(() => {
    if (!salesPointId) return orders;
    return orders.filter((o) => String(o.salesPointId || '').trim() === salesPointId);
  }, [orders, salesPointId]);

  const scopedStores = useMemo(() => {
    if (salesPointId) {
      const one = stores.find((s) => s.id === salesPointId);
      return one ? [one] : stores;
    }
    return stores;
  }, [stores, salesPointId]);

  const metrics: PortfolioMetrics | null = useMemo(() => {
    const allPdvIds =
      pdvSources.map((p) => p.id).filter(Boolean).length > 0
        ? pdvSources.map((p) => p.id).filter(Boolean)
        : stores.map((s) => s.id).filter(Boolean);
    if (!allPdvIds.length) return null;
    const todayKey = localCalendarDayKey();
    const createdAtById = new Map(pdvSources.map((p) => [p.id, ''] as const));
    const primary = pickPrimaryPdvIdFromList(allPdvIds, createdAtById);
    const wcScope = new Set(
      pdvSources.map((p) => String(p.workCenterId || p.id).trim()).filter(Boolean),
    );
    let m = computePortfolioMetrics(
      orders,
      allPdvIds,
      primary,
      todayKey,
      wcScope.size ? wcScope : undefined,
    );
    if (tpvSessions.length) {
      m = applyTpvCashMetrics(m, tpvSessions, allPdvIds, todayKey);
    }
    return m;
  }, [orders, pdvSources, stores, tpvSessions]);

  const hasPulses = heavyReady && (pulses7d.length > 0 || pulsesMonth.length > 0);
  const showKpiSkeleton = loading && !metrics;

  return (
    <div className="space-y-3">
      <section className={`${VERTIAL_SURFACE_STONE} p-3`}>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-wide text-stone-500">
            Hoy · empresa
            {loading || refreshing ? (
              <span className="ml-2 font-medium normal-case text-stone-400">cargando…</span>
            ) : null}
          </p>
          <button
            type="button"
            onClick={() => navigate('/saas/delivery-ops')}
            className="text-[11px] font-semibold text-[var(--v-blue,#2563eb)]"
          >
            Operativa →
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {showKpiSkeleton ? (
            <>
              <KpiSkeleton label="Ventas hoy" />
              <KpiSkeleton label="Ventas mes" />
              <KpiSkeleton label="Activos" />
              <KpiSkeleton label="Alertas ops" />
            </>
          ) : metrics ? (
            <>
              <KpiTile
                icon={<Wallet className="h-3.5 w-3.5" />}
                label="Ventas hoy"
                value={formatMoneyEs(metrics.revenueToday)}
                sub={`${formatNumberEs(metrics.deliveredToday, { maxFraction: 0 })} entregas`}
                onClick={() => navigate('/saas/delivery-ops')}
              />
              <KpiTile
                icon={<TrendingUp className="h-3.5 w-3.5" />}
                label="Ventas mes"
                value={formatMoneyEs(metrics.revenueMonth)}
                sub={`${formatNumberEs(metrics.deliveredMonth, { maxFraction: 0 })} entregas`}
                onClick={() => navigate('/saas/sales-metrics')}
              />
              <KpiTile
                icon={<Package className="h-3.5 w-3.5" />}
                label="Activos"
                value={String(metrics.activeOrders)}
                sub={`${formatNumberEs(metrics.ordersToday, { maxFraction: 0 })} pedidos hoy`}
                warn={metrics.activeOrders > 0}
                onClick={() => navigate('/saas/delivery-ops')}
              />
              <KpiTile
                icon={<Hash className="h-3.5 w-3.5" />}
                label="En foco"
                value={String(opsAlertCount)}
                sub={opsAlertCount > 0 ? 'Caja / cobros' : 'Sin pendientes'}
                warn={opsAlertCount > 0}
                onClick={() => navigate('/saas/delivery-ops')}
              />
            </>
          ) : null}
        </div>
      </section>

      <div ref={heavyGateRef} />
      <MobileLazySection
        rootMargin="80px 0px"
        eagerFromMd={false}
        placeholder={
          <div className={`${VERTIAL_SURFACE_STONE} px-4 py-5 text-center text-[11px] text-stone-400`}>
            Desliza para cargar marcas y detalle…
          </div>
        }
      >
        {hasPulses ? (
          <PortfolioOpsPulse
            pulses7d={pulses7d}
            pulsesMonth={pulsesMonth}
            singleBusiness
            compact
            businessId={businessId}
            brands={brands}
            orders={orders}
            refreshButton={
              <button
                type="button"
                onClick={() => void load({ soft: true })}
                disabled={loading || refreshing}
                className="min-h-9 rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-600 disabled:opacity-40 dark:hover:bg-stone-800"
                title="Actualizar"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading || refreshing ? 'animate-spin' : ''}`} />
              </button>
            }
          />
        ) : refreshing || wantHeavy ? (
          <div className={`${VERTIAL_SURFACE_STONE} px-4 py-6 text-center text-xs text-stone-400`}>
            Cargando resumen por tienda…
          </div>
        ) : null}

        {heavyReady || brands.length > 0 ? (
          <div className="mt-3 space-y-3">
            <CompanyBrandPerformancePanel
              businessId={businessId}
              brands={brands}
              orders={scopedOrders}
              loading={loading && brands.length === 0}
              compact
            />
            <WorkerPayMonthPanel
              summary={workerPay}
              loading={!workerPay && (loading || refreshing)}
              compact
            />
            {heavyReady ? (
              <DeliveryOpsInsightsPanel
                orders={scopedOrders}
                stores={scopedStores}
                loading={loading && orders.length === 0}
                compact
                newClientsMonth={newClientsMonth}
                newClientsPrevMonth={newClientsPrevMonth}
                newClientsToday={newClientsToday}
                newClientsYesterday={newClientsYesterday}
              />
            ) : null}
          </div>
        ) : null}
      </MobileLazySection>
    </div>
  );
}

function KpiSkeleton({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-stone-100 bg-stone-50 p-3 dark:border-stone-800 dark:bg-stone-950/40">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-400">{label}</p>
      <div className="mt-2 h-5 w-16 animate-pulse rounded bg-stone-200 dark:bg-stone-700" />
      <div className="mt-1.5 h-2.5 w-20 animate-pulse rounded bg-stone-100 dark:bg-stone-800" />
    </div>
  );
}

function KpiTile({
  icon,
  label,
  value,
  sub,
  warn,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  sub: string;
  warn?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border p-3 text-left transition-colors active:scale-[0.99] ${
        warn
          ? 'border-rose-200 bg-rose-50/80 dark:border-rose-900/40 dark:bg-rose-950/20'
          : 'border-stone-100 bg-stone-50 dark:border-stone-800 dark:bg-stone-950/40'
      }`}
    >
      <div className={`mb-1 flex items-center gap-1.5 ${warn ? 'text-rose-600' : 'text-stone-500'}`}>
        {icon}
        <span className="text-[10px] font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <p
        className={`text-base font-black tabular-nums leading-tight ${
          warn ? 'text-rose-700 dark:text-rose-400' : 'text-stone-900 dark:text-stone-100'
        }`}
      >
        {value}
      </p>
      <p className="mt-0.5 text-[10px] text-stone-500">{sub}</p>
    </button>
  );
}
