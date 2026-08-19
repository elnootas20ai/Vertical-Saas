import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AuthUser } from '../lib/authApi';
import type { Business } from '../lib/businessApi';
import type { Brand } from '../lib/brandApi';
import { listBrandsRequest } from '../lib/brandApi';
import {
  filterDeliveryOrdersRequest,
  listTpvRegisterSessionsRequest,
  type PointOfSale,
} from '../lib/deliveryApi';
import { listFinanceMovements } from '../lib/financeApi';
import type { FinanceMovementRecord } from '../lib/financeTypes';
import { backfillDeliveryOrdersFinance } from '../lib/deliveryOrderFinanceSync';
import { listBankAccounts } from '../lib/bankAccountsApi';
import { getTotalBalance } from '../lib/bankAccountTypes';
import {
  DELIVERY_BRANDS_CHANGED,
  DELIVERY_WORK_CENTERS_CHANGED,
  isDeliveryBusinessType,
  loadDeliveryStores,
} from '../lib/deliverySetup';
import { isDeliveryOpsBusinessType, isRestaurantBusinessType } from '../lib/deliveryOpsTypes';
import { loadRestaurantStores } from '../verticals/restaurant/loadRestaurantStores';
import { fetchClientAcquisitionSample } from '../lib/clientAcquisitionSample';
import {
  applyTpvCashMetrics,
  computeCompanyBillingBreakdown,
  computePortfolioClientMetrics,
  computePortfolioMetrics,
  buildStoreOpsPulse,
  computeStoreDeliveryMetrics,
  consolidatePortfolioFinance,
  emptyPortfolioClientMetrics,
  emptyPortfolioMetrics,
  emptyStoreOpsPulse,
  listMonthToDateDayKeys,
  listTrailingDayKeys,
  pickPrimaryPdvIdFromList,
  portfolioOrderFetchFrom,
  prevCalendarMonthKey,
  comparableMonthThroughDay,
  sumFinanceIncomeThroughDay,
  sumFinanceMonthForBusiness,
  type CompanyBillingBreakdown,
  type PortfolioClientMetrics,
  type PortfolioFinanceTotals,
  type PortfolioMetrics,
  type StoreDeliveryMetrics,
  type StoreOpsPulse,
} from '../lib/portfolioMetrics';
import {
  ceoCajaMixFromSessions,
  ceoCajaMonthlyTotals,
  yearMonthFromSession,
  type CeoCajaChannelMix,
} from '../lib/cajaFacturacionExcelExport';
import type { TpvRegisterSession } from '../lib/deliveryApi';
import { localCalendarDayKey } from '../lib/tpvCajaScope';
import { computeEbitdaForMonth } from '../lib/ebitdaMetrics';
import { resolveBusinessDataUserId } from '../lib/tenantUserId';
import type { WorkCenter } from '../lib/workCentersApi';
import {
  fetchTeamDashboardSnapshot,
  type TeamDashboardSnapshot,
  EMPTY_TEAM_DASHBOARD_SNAPSHOT,
} from '../lib/teamDashboardApi';
import {
  usePortfolioDashboardLive,
  type PortfolioReloadOptions,
} from './usePortfolioDashboardLive';
import { VERTIAL_BUSINESSES_CHANGED } from '../lib/businessChangeEvents';

export type { PortfolioReloadOptions };

export type PortfolioStore = {
  id: string;
  name: string;
  centerType: string;
  active: boolean;
  city?: string;
  hasPdv: boolean;
  pdvId?: string;
  delivery: StoreDeliveryMetrics;
  /** Últimos 7 días (comida + €) para el resumen operativo. */
  ops7d: StoreOpsPulse;
  /** Mes en curso hasta hoy. */
  opsMonth: StoreOpsPulse;
};

export type PortfolioBrandStoreBreakdown = {
  storeId: string;
  storeName: string;
  revenueMonth: number;
  revenueToday: number;
  deliveredMonth: number;
  deliveredToday: number;
};

export type PortfolioBrand = {
  id: string;
  name: string;
  active: boolean;
  isDefault: boolean;
  primaryColor?: string;
  linkedStoreIds: string[];
  linkedStoreNames: string[];
  operatesAllStores: boolean;
  revenueMonth: number;
  revenueToday: number;
  ordersMonth: number;
  deliveredMonth: number;
  deliveredToday: number;
  sharePercent: number;
  storeBreakdown: PortfolioBrandStoreBreakdown[];
};

export type PortfolioBusiness = {
  businessId: string;
  business: Business;
  brands: PortfolioBrand[];
  stores: PortfolioStore[];
  memberCount: number;
  brandCount: number;
  storeCount: number;
  pdvCount: number;
  pdvIds: string[];
  metrics: PortfolioMetrics;
  finance: PortfolioFinanceTotals;
  clients: PortfolioClientMetrics;
  billing: CompanyBillingBreakdown | null;
  isDelivery: boolean;
  isRestaurant: boolean;
  team: TeamDashboardSnapshot;
  /** Mix cierre por canales (sesiones de caja del mes). */
  cajaMix: CeoCajaChannelMix | null;
  /** Sesiones del mes (export Excel CEO). */
  cajaSessionsMonth: TpvRegisterSession[];
  /** Totales mensuales recientes (COMPARATIVA lite). */
  cajaMonthlyTotals: Array<{ yearMonth: string; label: string; total: number }>;
};

export type PortfolioTotals = {
  businesses: number;
  brands: number;
  stores: number;
  pdv: number;
  members: number;
  revenueToday: number;
  revenueMonth: number;
  revenuePrevMonth: number;
  ordersMonth: number;
  ordersPrevMonth: number;
  deliveredToday: number;
  deliveredMonth: number;
  deliveredPrevMonth: number;
  activeOrders: number;
  openCashRegisters: number;
  clockedInNow: number;
  pendingVacations: number;
  payslipsThisMonth: number;
  totalClients: number;
  newClientsMonth: number;
  newClientsPrevMonth: number;
  pizzasToday: number;
  burgersToday: number;
  tacosToday: number;
  kebabsToday: number;
};

const EMPTY_FINANCE: PortfolioFinanceTotals = {
  incomeMonth: 0,
  expensesMonth: 0,
  incomePrevMonth: 0,
  incomePrevMonthMtd: 0,
  expensesPrevMonth: 0,
  profitMonth: 0,
  ebitdaMonth: 0,
  ebitdaMarginMonth: 0,
  pendingAmount: 0,
  cashBalance: 0,
};

const EMPTY_STORE_DELIVERY: StoreDeliveryMetrics = {
  deliveredToday: 0,
  deliveredMonth: 0,
  revenueMonth: 0,
  activeOrders: 0,
};

function buildPlaceholderRow(business: Business): PortfolioBusiness {
  return {
    businessId: business.business_id,
    business,
    brands: [],
    stores: [],
    memberCount: business.members?.length ?? 0,
    brandCount: 0,
    storeCount: 0,
    pdvCount: 0,
    pdvIds: [],
    metrics: emptyPortfolioMetrics(),
    finance: { ...EMPTY_FINANCE },
    clients: emptyPortfolioClientMetrics(),
    billing: null,
    isDelivery: isDeliveryBusinessType(business.businessType),
    isRestaurant: isRestaurantBusinessType(business.businessType),
    team: { ...EMPTY_TEAM_DASHBOARD_SNAPSHOT, totalMembers: business.members?.length ?? 0 },
    cajaMix: null,
    cajaSessionsMonth: [],
    cajaMonthlyTotals: [],
  };
}

function mapStores(
  workCenters: WorkCenter[],
  pdvWorkCenterIds: Set<string>,
  pdvByWorkCenterId: Map<string, string>,
  orders: Awaited<ReturnType<typeof filterDeliveryOrdersRequest>>['orders'],
  todayKey: string,
  monthKey: string,
  businessId: string,
  businessName: string,
  sessions: TpvRegisterSession[] = [],
): PortfolioStore[] {
  const keys7d = listTrailingDayKeys(todayKey, 7);
  const keysMonth = listMonthToDateDayKeys(todayKey);
  return workCenters
    .filter(
      (wc) =>
        !wc.deletedAt &&
        (wc.centerType === 'punto_de_venta' || wc.centerType === 'almacen'),
    )
    .map((wc) => {
      const pdvId = pdvByWorkCenterId.get(wc._id);
      const delivery = pdvId
        ? computeStoreDeliveryMetrics(orders, pdvId, todayKey, monthKey, wc._id)
        : EMPTY_STORE_DELIVERY;
      const pulseBase = {
        storeId: wc._id,
        storeName: wc.name,
        businessId,
        businessName,
        pdvId: pdvId || '',
        workCenterId: wc._id,
        todayKey,
        sessions,
      };
      const ops7d = pdvId
        ? buildStoreOpsPulse(orders, { ...pulseBase, dayKeys: keys7d })
        : emptyStoreOpsPulse({
            storeId: wc._id,
            storeName: wc.name,
            businessId,
            businessName,
          });
      const opsMonth = pdvId
        ? buildStoreOpsPulse(orders, { ...pulseBase, dayKeys: keysMonth })
        : emptyStoreOpsPulse({
            storeId: wc._id,
            storeName: wc.name,
            businessId,
            businessName,
          });
      return {
        id: wc._id,
        name: wc.name,
        centerType: wc.centerType,
        active: wc.active !== false,
        city: wc.city,
        hasPdv: pdvWorkCenterIds.has(wc._id),
        pdvId,
        delivery,
        ops7d,
        opsMonth,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

function enrichBrandsWithBilling(
  brands: PortfolioBrand[],
  billing: CompanyBillingBreakdown | null,
  storeNameById: Map<string, string>,
): PortfolioBrand[] {
  const billingByBrand = new Map((billing?.brands ?? []).map((b) => [b.brandId, b]));
  return brands.map((brand) => {
    const row = billingByBrand.get(brand.id);
    const storeBreakdown: PortfolioBrandStoreBreakdown[] = (row?.stores ?? []).map((cell) => ({
      storeId: cell.storeId,
      storeName: storeNameById.get(cell.storeId) || 'Tienda',
      revenueMonth: cell.revenueMonth,
      revenueToday: cell.revenueToday,
      deliveredMonth: cell.deliveredMonth,
      deliveredToday: cell.deliveredToday,
    }));
    return {
      ...brand,
      revenueMonth: row?.revenueMonth ?? 0,
      revenueToday: row?.revenueToday ?? 0,
      deliveredMonth: row?.deliveredMonth ?? 0,
      deliveredToday: row?.deliveredToday ?? 0,
      ordersMonth: row?.deliveredMonth ?? 0,
      sharePercent: row?.sharePercent ?? 0,
      storeBreakdown,
    };
  }).sort((a, b) => b.revenueMonth - a.revenueMonth);
}

function buildBrandRows(brands: Brand[], stores: PortfolioStore[], totalStores: number): PortfolioBrand[] {
  const storeById = new Map(stores.map((s) => [s.id, s.name]));
  return brands
    .filter((b) => !b.deletedAt)
    .map((b) => {
      const rawIds = (b.salesPointIds ?? [])
        .map((id) => String(id || '').trim())
        .filter(Boolean);
      const linkedStoreIds = rawIds.filter((id) => storeById.has(id));
      const operatesAllStores = totalStores > 0 && (rawIds.length === 0 || linkedStoreIds.length >= totalStores);
      const effectiveIds = operatesAllStores ? stores.map((s) => s.id) : linkedStoreIds;
      return {
        id: b._id,
        name: b.name,
        active: b.active !== false,
        isDefault: Boolean(b.isDefault),
        primaryColor: b.primaryColor,
        linkedStoreIds: effectiveIds,
        linkedStoreNames: effectiveIds
          .map((id) => storeById.get(id))
          .filter((n): n is string => Boolean(n)),
        operatesAllStores,
        revenueMonth: 0,
        revenueToday: 0,
        ordersMonth: 0,
        deliveredMonth: 0,
        deliveredToday: 0,
        sharePercent: 0,
        storeBreakdown: [],
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

function pdvCreatedAtMap(pointsOfSale: PointOfSale[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const p of pointsOfSale) {
    m.set(p._id, String(p.createdAt || ''));
  }
  return m;
}

function wcIdsForPdvs(
  pdvIds: string[],
  pdvToWc: Map<string, string>,
): Set<string> {
  const ids = new Set<string>();
  for (const pdvId of pdvIds) {
    const wc = pdvToWc.get(pdvId);
    if (wc) ids.add(wc);
  }
  return ids;
}

/** Finanzas + EBITDA reales del mes para una empresa (incluye legacy sin businessId si solo hay una). */
function financeForBusiness(
  movements: FinanceMovementRecord[],
  monthKey: string,
  businessId: string,
  accountBusinessCount: number,
  todayKey: string,
): PortfolioFinanceTotals {
  const prevMonthKey = prevCalendarMonthKey(monthKey);
  const base = sumFinanceMonthForBusiness(movements, monthKey, businessId);
  const prev = sumFinanceMonthForBusiness(movements, prevMonthKey, businessId);
  let scoped = movements.filter(
    (m) => String(m.businessId || '').replace(/^business:/, '').trim() === businessId,
  );
  if (accountBusinessCount === 1) {
    scoped = [
      ...scoped,
      ...movements.filter((m) => !String(m.businessId || '').replace(/^business:/, '').trim()),
    ];
  }
  const throughDay = comparableMonthThroughDay(todayKey, prevMonthKey);
  const incomePrevMonthMtd = sumFinanceIncomeThroughDay(scoped, prevMonthKey, throughDay);
  const ebitda = computeEbitdaForMonth(scoped, monthKey, { level: 'all' });
  return {
    ...base,
    incomePrevMonth: prev.incomeMonth,
    incomePrevMonthMtd,
    expensesPrevMonth: prev.expensesMonth,
    ebitdaMonth: Math.round(ebitda.ebitda * 100) / 100,
    ebitdaMarginMonth: Math.round(ebitda.ebitdaMargin * 10) / 10,
  };
}

async function loadClientMetricsForBusiness(
  dataUserId: string,
  businessId: string,
  monthKey: string,
): Promise<PortfolioClientMetrics> {
  // Capado: nunca descargar ~6k clientes (Pau). Eso saturaba API/TPV tras el deploy.
  const { totalClients, sample } = await fetchClientAcquisitionSample(dataUserId, {
    monthKey,
    businessId,
  }).catch(() => ({ totalClients: 0, sample: [] }));

  const metrics = computePortfolioClientMetrics(sample, monthKey);
  return {
    ...metrics,
    totalClients: totalClients || sample.length,
  };
}

export function usePortfolioOverview(
  user: AuthUser | null | undefined,
  businesses: Business[],
  options?: { live?: boolean },
) {
  const [rows, setRows] = useState<PortfolioBusiness[]>([]);
  const [finance, setFinance] = useState<PortfolioFinanceTotals>(EMPTY_FINANCE);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const businessesRef = useRef(businesses);
  businessesRef.current = businesses;
  const reloadInflightRef = useRef<Promise<void> | null>(null);
  const reloadSeqRef = useRef(0);
  const suppressLiveRefreshRef = useRef(false);
  const hasLoadedOnceRef = useRef(false);
  const rowsCacheRef = useRef<PortfolioBusiness[]>([]);
  const teamFetchedAtRef = useRef(0);

  const businessIdsKey = useMemo(
    () =>
      [...businesses.map((b) => b.business_id).filter(Boolean)]
        .sort()
        .join('|'),
    [businesses],
  );

  const reload = useCallback(async (reloadOpts?: PortfolioReloadOptions) => {
    const silent = reloadOpts?.silent === true;
    const businessesSnapshot = businessesRef.current;
    const force = reloadOpts?.force === true;
    /** SSE / poll: no re-pedir equipo ni clientes (caro y casi no cambia en 90s). */
    const skipSlowSecondary = silent && !force;

    if (reloadInflightRef.current && !force) {
      if (silent) return reloadInflightRef.current;
      await reloadInflightRef.current;
    }
    if (force) {
      reloadSeqRef.current += 1;
      reloadInflightRef.current = null;
    }

    const run = async () => {
    const seq = ++reloadSeqRef.current;
    suppressLiveRefreshRef.current = true;

    if (!user?.user_id || businessesSnapshot.length === 0) {
      if (seq !== reloadSeqRef.current) return;
      setRows([]);
      setFinance(EMPTY_FINANCE);
      setLoading(false);
      setIsRefreshing(false);
      setError(null);
      suppressLiveRefreshRef.current = false;
      return;
    }

    const showFullScreenLoad = !silent && !hasLoadedOnceRef.current;
    if (silent || hasLoadedOnceRef.current) setIsRefreshing(true);
    else if (showFullScreenLoad) setLoading(true);
    setError(null);

    const todayKey = localCalendarDayKey();
    const monthKey = todayKey.slice(0, 7);
    const monthEnd = `${todayKey}T23:59:59.999Z`;
    const orderFetchFrom = portfolioOrderFetchFrom(monthKey);
    let loaded: PortfolioBusiness[] = [];

    try {
      const structures = await Promise.all(
        businessesSnapshot.map(async (business) => {
          const dataUserId = resolveBusinessDataUserId(user, business);
          const isDelivery = isDeliveryBusinessType(business.businessType);
          const isRestaurant = isRestaurantBusinessType(business.businessType);
          const isOps = isDeliveryOpsBusinessType(business.businessType);
          const [brandsRaw, deliveryState] = await Promise.all([
            listBrandsRequest(business.business_id).catch(() => [] as Brand[]),
            dataUserId && isOps
              ? (isRestaurant
                ? loadRestaurantStores(user, business, businessesSnapshot, { accountBusinessCount: businessesSnapshot.length }).catch(() => ({
                    dataUserId: '',
                    workCenters: [] as WorkCenter[],
                    pointsOfSale: [] as PointOfSale[],
                  }))
                : loadDeliveryStores(user, business, { accountBusinessCount: businessesSnapshot.length }).catch(() => ({
                    dataUserId: '',
                    workCenters: [] as WorkCenter[],
                    pointsOfSale: [] as PointOfSale[],
                  })))
              : Promise.resolve({
                  dataUserId: '',
                  workCenters: [] as WorkCenter[],
                  pointsOfSale: [] as PointOfSale[],
                }),
          ]);

          const pdvWcIds = new Set(
            deliveryState.pointsOfSale
              .map((p) => String(p.workCenterId || '').trim())
              .filter(Boolean),
          );
          const pdvByWorkCenterId = new Map<string, string>();
          for (const p of deliveryState.pointsOfSale) {
            const wcId = String(p.workCenterId || '').trim();
            if (wcId) pdvByWorkCenterId.set(wcId, p._id);
          }
          const pdvIds = deliveryState.pointsOfSale
            .filter((p) => p.active !== false)
            .map((p) => p._id);
          return {
            business,
            dataUserId,
            isDelivery,
            isRestaurant,
            isOps,
            workCenters: deliveryState.workCenters,
            pdvWcIds,
            pdvByWorkCenterId,
            brandsRaw,
            pdvIds,
            pointsOfSale: deliveryState.pointsOfSale,
          };
        }),
      );

      const ownerId = String(user.user_id || '').trim();
      let financeMovements: FinanceMovementRecord[] = [];
      let bankAccounts: Awaited<ReturnType<typeof listBankAccounts>> = [];
      let financeLoadWarning: string | null = null;
      try {
        [financeMovements, bankAccounts] = await Promise.all([
          listFinanceMovements(ownerId).catch(() => []),
          listBankAccounts(ownerId).catch(() => []),
        ]);
      } catch {
        financeLoadWarning = 'No se pudieron cargar las finanzas consolidadas';
        financeMovements = [];
        bankAccounts = [];
      }

      const ordersByUser = new Map<
        string,
        Awaited<ReturnType<typeof filterDeliveryOrdersRequest>>['orders']
      >();
      const sessionsByUser = new Map<
        string,
        Awaited<ReturnType<typeof listTpvRegisterSessionsRequest>>
      >();

      const uniqueOpsUsers = [
        ...new Set(
          structures
            .filter((s) => s.isOps && s.dataUserId)
            .map((s) => s.dataUserId),
        ),
      ];
      const uniqueDeliveryUsers = [
        ...new Set(
          structures
            .filter((s) => s.isDelivery && s.dataUserId)
            .map((s) => s.dataUserId),
        ),
      ];

      await Promise.all(
        uniqueOpsUsers.map(async (dataUserId) => {
          const sessions = await listTpvRegisterSessionsRequest(dataUserId, {
            dateFrom: orderFetchFrom,
          }).catch(() => []);
          sessionsByUser.set(dataUserId, sessions);
        }),
      );
      await Promise.all(
        uniqueDeliveryUsers.map(async (dataUserId) => {
          const orderResult = await filterDeliveryOrdersRequest(dataUserId, {
            dateFrom: orderFetchFrom,
            dateTo: monthEnd,
            limit: 3000,
          }).catch(() => ({ orders: [], total: 0 }));
          ordersByUser.set(dataUserId, orderResult.orders);
        }),
      );

      // Conectar pedidos cobrados del mes → finanzas (empresa/tienda) antes de calcular filas.
      await Promise.all(
        structures
          .filter((s) => s.isDelivery && s.dataUserId)
          .map(async (s) => {
            const orders = ordersByUser.get(s.dataUserId) || [];
            if (orders.length === 0) return;
            const pdvToWc = new Map<string, string>();
            const wcNames = new Map<string, string>();
            for (const p of s.pointsOfSale) {
              const wcId = String(p.workCenterId || '').trim();
              if (wcId) pdvToWc.set(p._id, wcId);
            }
            for (const wc of s.workCenters) {
              wcNames.set(wc.id, wc.name);
            }
            try {
              await backfillDeliveryOrdersFinance(
                s.dataUserId,
                orders,
                {
                  businessId: s.business.business_id,
                  businessName: s.business.name,
                  pdvToWorkCenterId: pdvToWc,
                  workCenterNameById: wcNames,
                },
                monthKey,
              );
            } catch {
              /* no tumbar el portfolio */
            }
          }),
      );

      try {
        financeMovements = await listFinanceMovements(ownerId).catch(() => financeMovements);
      } catch {
        /* keep previous */
      }

      const financeTotals = consolidatePortfolioFinance(
        financeMovements,
        monthKey,
        businessesSnapshot.map((b) => b.business_id),
        todayKey,
      );
      financeTotals.cashBalance = getTotalBalance(bankAccounts);
      const scopedForEbitda =
        businessesSnapshot.length > 1
          ? financeMovements.filter((m) => {
              const bid = String(m.businessId || '').replace(/^business:/, '').trim();
              return bid && businessesSnapshot.some((b) => b.business_id === bid);
            })
          : financeMovements;
      try {
        const ebitdaTotals = computeEbitdaForMonth(scopedForEbitda, monthKey, { level: 'all' });
        financeTotals.ebitdaMonth = ebitdaTotals.ebitda;
        financeTotals.ebitdaMarginMonth = ebitdaTotals.ebitdaMargin;
      } catch {
        financeLoadWarning = financeLoadWarning || 'EBITDA no disponible en este momento';
      }

      loaded = await Promise.all(
        structures.map(async (s) => {
          const orders = s.isDelivery && s.dataUserId ? ordersByUser.get(s.dataUserId) || [] : [];
          const sessionsForStores =
            s.isOps && s.dataUserId ? sessionsByUser.get(s.dataUserId) || [] : [];
          const stores = mapStores(
            s.workCenters,
            s.pdvWcIds,
            s.pdvByWorkCenterId,
            orders,
            todayKey,
            monthKey,
            s.business.business_id,
            s.business.name || 'Empresa',
            sessionsForStores,
          );
          const brandsBase = buildBrandRows(s.brandsRaw, stores, stores.length);
          let metrics = emptyPortfolioMetrics();
          let billing: CompanyBillingBreakdown | null = null;

          if (s.isOps && s.dataUserId && (s.pdvIds.length > 0 || stores.length > 0)) {
            const sessions = sessionsByUser.get(s.dataUserId) || [];
            const createdMap = pdvCreatedAtMap(s.pointsOfSale);
            const primaryPdv = pickPrimaryPdvIdFromList(s.pdvIds, createdMap);
            const pdvToWc = new Map<string, string>();
            for (const p of s.pointsOfSale) {
              const wcId = String(p.workCenterId || '').trim();
              if (wcId) pdvToWc.set(p._id, wcId);
            }
            const wcScope = stores.length > 0
              ? new Set(stores.map((st) => st.id))
              : wcIdsForPdvs(s.pdvIds, pdvToWc);
            if (s.isDelivery) {
              metrics = computePortfolioMetrics(orders, s.pdvIds, primaryPdv, todayKey, wcScope);
              const activeByStore = new Map(stores.map((st) => [st.id, st.delivery.activeOrders]));
              billing = computeCompanyBillingBreakdown(
                orders,
                brandsBase.map((b) => b.id),
                stores.map((st) => ({ id: st.id, pdvId: st.pdvId })),
                s.pdvIds,
                primaryPdv,
                pdvToWc,
                todayKey,
                activeByStore,
              );
            }
            metrics = applyTpvCashMetrics(metrics, sessions, s.pdvIds, todayKey);
          }

          const pdvSet = new Set(s.pdvIds.map((id) => String(id || '').trim()).filter(Boolean));
          const sessionsForBiz = (s.dataUserId ? sessionsByUser.get(s.dataUserId) || [] : []).filter(
            (sess) => pdvSet.size === 0 || pdvSet.has(String(sess.pointOfSaleId || '').trim()),
          );
          const cajaSessionsMonth = sessionsForBiz.filter(
            (sess) => yearMonthFromSession(sess) === monthKey,
          );
          const cajaMixRaw =
            s.isDelivery && sessionsForBiz.length > 0
              ? ceoCajaMixFromSessions(sessionsForBiz, monthKey)
              : null;
          const cajaMix =
            cajaMixRaw
            && (cajaMixRaw.total > 0 || cajaMixRaw.pizza > 0 || cajaMixRaw.burger > 0 || cajaMixRaw.taco > 0)
              ? cajaMixRaw
              : null;
          const cajaMonthlyTotals = s.isDelivery
            ? ceoCajaMonthlyTotals(sessionsForBiz, 12)
            : [];

          const storeNameById = new Map(stores.map((st) => [st.id, st.name]));
          const brands = enrichBrandsWithBilling(brandsBase, billing, storeNameById);
          const members = (s.business.members || []).map((m) => ({
            user_id: m.user_id,
            fullName: m.fullName,
          }));

          const prevRow = rowsCacheRef.current.find((r) => r.businessId === s.business.business_id);
          const teamFreshEnough =
            skipSlowSecondary
            && prevRow?.team
            && Date.now() - teamFetchedAtRef.current < 120_000;
          const team = teamFreshEnough
            ? prevRow.team
            : await fetchTeamDashboardSnapshot(s.business.business_id, members).catch(
                () => ({ ...EMPTY_TEAM_DASHBOARD_SNAPSHOT, totalMembers: members.length }),
              );

          const rowFinance = financeForBusiness(
            financeMovements,
            monthKey,
            s.business.business_id,
            businessesSnapshot.length,
            todayKey,
          );
          const clients =
            skipSlowSecondary && prevRow?.clients
              ? prevRow.clients
              : s.dataUserId
                ? await loadClientMetricsForBusiness(s.dataUserId, s.business.business_id, monthKey).catch(
                    () => emptyPortfolioClientMetrics(),
                  )
                : emptyPortfolioClientMetrics();

          return {
            businessId: s.business.business_id,
            business: s.business,
            brands,
            stores,
            memberCount: s.business.members?.length ?? 0,
            brandCount: brands.length,
            storeCount: stores.length,
            pdvCount: s.pdvIds.length,
            pdvIds: s.pdvIds,
            metrics,
            finance: rowFinance,
            clients,
            billing,
            isDelivery: s.isDelivery,
            isRestaurant: s.isRestaurant,
            team,
            cajaMix,
            cajaSessionsMonth,
            cajaMonthlyTotals,
          };
        }),
      );

      if (seq !== reloadSeqRef.current) return;
      setFinance(financeTotals);
      // Más activa primero (como Comparativa entre empresas · ventas), luego nombre.
      const sortedLoaded = loaded.sort((a, b) => (
        (b.metrics.revenueMonth || 0) - (a.metrics.revenueMonth || 0)
        || a.business.name.localeCompare(b.business.name, 'es')
      ));
      rowsCacheRef.current = sortedLoaded;
      if (!skipSlowSecondary) teamFetchedAtRef.current = Date.now();
      setRows(sortedLoaded);
      setLastUpdatedAt(new Date());
      setError(financeLoadWarning);
      hasLoadedOnceRef.current = true;
    } catch (e) {
      if (seq !== reloadSeqRef.current) return;
      setError(e instanceof Error ? e.message : 'No se pudo cargar el panorama');
      if (loaded.length > 0) {
        setRows(loaded.sort((a, b) => (
          (b.metrics.revenueMonth || 0) - (a.metrics.revenueMonth || 0)
          || a.business.name.localeCompare(b.business.name, 'es')
        )));
        hasLoadedOnceRef.current = true;
      } else {
        setRows([]);
        setFinance(EMPTY_FINANCE);
      }
    } finally {
      if (seq !== reloadSeqRef.current) return;
      setLoading(false);
      setIsRefreshing(false);
      suppressLiveRefreshRef.current = false;
    }
    };

    let promise!: Promise<void>;
    promise = run().finally(() => {
      if (reloadInflightRef.current === promise) {
        reloadInflightRef.current = null;
      }
    });
    reloadInflightRef.current = promise;
    await promise;
  }, [user?.user_id, businessIdsKey]);

  const { liveSseOk, scheduleSilentRefresh } = usePortfolioDashboardLive({
    enabled: options?.live ?? false,
    authUserId: user?.user_id ?? null,
    onRefresh: reload,
  });

  const reloadRef = useRef(reload);
  reloadRef.current = reload;

  // Carga inicial y cuando cambia la lista de empresas (no en cada re-render del callback).
  useEffect(() => {
    if (!user?.user_id || !businessIdsKey) {
      setLoading(false);
      setIsRefreshing(false);
      return;
    }
    hasLoadedOnceRef.current = false;
    void reloadRef.current();
  }, [user?.user_id, businessIdsKey]);

  // Incluir de inmediato empresas nuevas en el portfolio (métricas en 0 hasta que termine reload).
  useEffect(() => {
    if (businesses.length === 0) return;
    const businessIds = new Set(businesses.map((b) => b.business_id).filter(Boolean));
    setRows((prev) => {
      const byId = new Map(prev.map((r) => [r.businessId, r]));
      let changed = false;
      for (const business of businesses) {
        const id = business.business_id;
        if (!id || byId.has(id)) continue;
        byId.set(id, buildPlaceholderRow(business));
        changed = true;
      }
      const next = [...byId.values()].filter((r) => businessIds.has(r.businessId));
      if (!changed && next.length === prev.length) return prev;
      return next.sort((a, b) => (
        (b.metrics.revenueMonth || 0) - (a.metrics.revenueMonth || 0)
        || a.business.name.localeCompare(b.business.name, 'es')
      ));
    });
  }, [businessIdsKey, businesses]);

  useEffect(() => {
    if (!options?.live) return;
    const onChange = () => {
      if (suppressLiveRefreshRef.current) return;
      scheduleSilentRefresh();
    };
    window.addEventListener(DELIVERY_WORK_CENTERS_CHANGED, onChange);
    window.addEventListener(DELIVERY_BRANDS_CHANGED, onChange);
    window.addEventListener(VERTIAL_BUSINESSES_CHANGED, onChange);
    return () => {
      window.removeEventListener(DELIVERY_WORK_CENTERS_CHANGED, onChange);
      window.removeEventListener(DELIVERY_BRANDS_CHANGED, onChange);
      window.removeEventListener(VERTIAL_BUSINESSES_CHANGED, onChange);
    };
  }, [options?.live, scheduleSilentRefresh]);

  const totals: PortfolioTotals = {
    businesses: Math.max(rows.length, businesses.length),
    brands: rows.reduce((s, r) => s + r.brandCount, 0),
    stores: rows.reduce((s, r) => s + r.storeCount, 0),
    pdv: rows.reduce((s, r) => s + r.pdvCount, 0),
    members: rows.reduce((s, r) => s + r.memberCount, 0),
    revenueToday: rows.reduce((s, r) => s + r.metrics.revenueToday, 0),
    revenueMonth: rows.reduce((s, r) => s + r.metrics.revenueMonth, 0),
    revenuePrevMonth: rows.reduce((s, r) => s + r.metrics.revenuePrevMonth, 0),
    ordersMonth: rows.reduce((s, r) => s + r.metrics.ordersMonth, 0),
    ordersPrevMonth: rows.reduce((s, r) => s + r.metrics.ordersPrevMonth, 0),
    deliveredToday: rows.reduce((s, r) => s + r.metrics.deliveredToday, 0),
    deliveredMonth: rows.reduce((s, r) => s + r.metrics.deliveredMonth, 0),
    deliveredPrevMonth: rows.reduce((s, r) => s + r.metrics.deliveredPrevMonth, 0),
    activeOrders: rows.reduce((s, r) => s + r.metrics.activeOrders, 0),
    openCashRegisters: rows.reduce((s, r) => s + r.metrics.openCashRegisters, 0),
    clockedInNow: rows.reduce((s, r) => s + r.team.clockedInNow, 0),
    pendingVacations: rows.reduce((s, r) => s + r.team.pendingVacationRequests, 0),
    payslipsThisMonth: rows.reduce((s, r) => s + r.team.payslipsThisMonth, 0),
    totalClients: rows.reduce((s, r) => s + r.clients.totalClients, 0),
    newClientsMonth: rows.reduce((s, r) => s + r.clients.newClientsMonth, 0),
    newClientsPrevMonth: rows.reduce((s, r) => s + r.clients.newClientsPrevMonth, 0),
    pizzasToday: rows.reduce((s, r) => s + (r.metrics.pizzasToday || 0), 0),
    burgersToday: rows.reduce((s, r) => s + (r.metrics.burgersToday || 0), 0),
    tacosToday: rows.reduce((s, r) => s + (r.metrics.tacosToday || 0), 0),
    kebabsToday: rows.reduce((s, r) => s + (r.metrics.kebabsToday || 0), 0),
  };

  return { rows, totals, finance, loading, isRefreshing, lastUpdatedAt, liveSseOk, error, reload };
}
