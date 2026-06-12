import { useCallback, useEffect, useState } from 'react';
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
import { listBankAccounts } from '../lib/bankAccountsApi';
import { getTotalBalance } from '../lib/bankAccountTypes';
import {
  DELIVERY_BRANDS_CHANGED,
  DELIVERY_WORK_CENTERS_CHANGED,
  isDeliveryBusinessType,
  loadDeliveryStores,
} from '../lib/deliverySetup';
import {
  applyTpvCashMetrics,
  computePortfolioMetrics,
  emptyPortfolioMetrics,
  pickPrimaryPdvIdFromList,
  sumFinanceMonth,
  type PortfolioFinanceTotals,
  type PortfolioMetrics,
} from '../lib/portfolioMetrics';
import { computeEbitdaForMonth } from '../lib/ebitdaMetrics';
import { resolveBusinessDataUserId } from '../lib/tenantUserId';
import type { WorkCenter } from '../lib/workCentersApi';
import {
  fetchTeamDashboardSnapshot,
  type TeamDashboardSnapshot,
  EMPTY_TEAM_DASHBOARD_SNAPSHOT,
} from '../lib/teamDashboardApi';

export type PortfolioStore = {
  id: string;
  name: string;
  centerType: string;
  active: boolean;
  city?: string;
  hasPdv: boolean;
};

export type PortfolioBrand = {
  id: string;
  name: string;
  active: boolean;
  isDefault: boolean;
  primaryColor?: string;
  linkedStoreIds: string[];
  linkedStoreNames: string[];
  revenueMonth: number;
  ordersMonth: number;
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
  isDelivery: boolean;
  team: TeamDashboardSnapshot;
};

export type PortfolioTotals = {
  businesses: number;
  brands: number;
  stores: number;
  pdv: number;
  members: number;
  revenueToday: number;
  revenueMonth: number;
  ordersMonth: number;
  activeOrders: number;
  openCashRegisters: number;
  clockedInNow: number;
  pendingVacations: number;
  payslipsThisMonth: number;
};

const EMPTY_FINANCE: PortfolioFinanceTotals = {
  incomeMonth: 0,
  expensesMonth: 0,
  profitMonth: 0,
  ebitdaMonth: 0,
  ebitdaMarginMonth: 0,
  pendingAmount: 0,
  cashBalance: 0,
};

function mapStores(
  workCenters: WorkCenter[],
  pdvWorkCenterIds: Set<string>,
): PortfolioStore[] {
  return workCenters
    .filter(
      (wc) =>
        !wc.deletedAt &&
        (wc.centerType === 'punto_de_venta' || wc.centerType === 'almacen'),
    )
    .map((wc) => ({
      id: wc._id,
      name: wc.name,
      centerType: wc.centerType,
      active: wc.active !== false,
      city: wc.city,
      hasPdv: pdvWorkCenterIds.has(wc._id),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

function enrichBrandsWithRevenue(
  brands: PortfolioBrand[],
  metrics: PortfolioMetrics,
): PortfolioBrand[] {
  return brands.map((b) => {
    const rev = metrics.revenueByBrand[b.id] ?? 0;
    const orders = metrics.deliveredMonth > 0 && rev > 0 ? Math.max(1, Math.round(rev / (metrics.avgTicketMonth || 1))) : 0;
    return { ...b, revenueMonth: Math.round(rev * 100) / 100, ordersMonth: orders };
  });
}

function buildBrandRows(brands: Brand[], stores: PortfolioStore[]): PortfolioBrand[] {
  const storeById = new Map(stores.map((s) => [s.id, s.name]));
  return brands
    .filter((b) => !b.deletedAt)
    .map((b) => {
      const linkedStoreIds = (b.salesPointIds ?? [])
        .map((id) => String(id || '').trim())
        .filter(Boolean);
      return {
        id: b._id,
        name: b.name,
        active: b.active !== false,
        isDefault: Boolean(b.isDefault),
        primaryColor: b.primaryColor,
        linkedStoreIds,
        linkedStoreNames: linkedStoreIds
          .map((id) => storeById.get(id))
          .filter((n): n is string => Boolean(n)),
        revenueMonth: 0,
        ordersMonth: 0,
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

export function usePortfolioOverview(
  user: AuthUser | null | undefined,
  businesses: Business[],
) {
  const [rows, setRows] = useState<PortfolioBusiness[]>([]);
  const [finance, setFinance] = useState<PortfolioFinanceTotals>(EMPTY_FINANCE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!user?.user_id || businesses.length === 0) {
      setRows([]);
      setFinance(EMPTY_FINANCE);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    const todayKey = new Date().toISOString().slice(0, 10);
    const monthKey = todayKey.slice(0, 7);
    const monthStart = `${monthKey}-01T00:00:00.000Z`;
    const monthEnd = `${todayKey}T23:59:59.999Z`;

    try {
      const structures = await Promise.all(
        businesses.map(async (business) => {
          const dataUserId = resolveBusinessDataUserId(user, business);
          const isDelivery = isDeliveryBusinessType(business.businessType);
          const [brandsRaw, deliveryState] = await Promise.all([
            listBrandsRequest(business.business_id).catch(() => [] as Brand[]),
            dataUserId && isDelivery
              ? loadDeliveryStores(user, business, { accountBusinessCount: businesses.length }).catch(() => ({
                  dataUserId: '',
                  workCenters: [] as WorkCenter[],
                  pointsOfSale: [] as PointOfSale[],
                }))
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
          const stores = mapStores(deliveryState.workCenters, pdvWcIds);
          const pdvIds = deliveryState.pointsOfSale
            .filter((p) => p.active !== false)
            .map((p) => p._id);

          return {
            business,
            dataUserId,
            isDelivery,
            stores,
            brandsRaw,
            pdvIds,
            pointsOfSale: deliveryState.pointsOfSale,
          };
        }),
      );

      const ownerId = String(user.user_id || '').trim();
      const [financeMovements, bankAccounts] = await Promise.all([
        listFinanceMovements(ownerId).catch(() => []),
        listBankAccounts(ownerId).catch(() => []),
      ]);
      const financeTotals = sumFinanceMonth(financeMovements, monthKey);
      financeTotals.cashBalance = getTotalBalance(bankAccounts);
      const ebitdaTotals = computeEbitdaForMonth(financeMovements, monthKey, { level: 'all' });
      financeTotals.ebitdaMonth = ebitdaTotals.ebitda;
      financeTotals.ebitdaMarginMonth = ebitdaTotals.ebitdaMargin;

      const ordersByUser = new Map<
        string,
        Awaited<ReturnType<typeof filterDeliveryOrdersRequest>>['orders']
      >();
      const sessionsByUser = new Map<
        string,
        Awaited<ReturnType<typeof listTpvRegisterSessionsRequest>>
      >();

      const uniqueDataUsers = [
        ...new Set(
          structures
            .filter((s) => s.isDelivery && s.dataUserId)
            .map((s) => s.dataUserId),
        ),
      ];

      await Promise.all(
        uniqueDataUsers.map(async (dataUserId) => {
          const [orderResult, sessions] = await Promise.all([
            filterDeliveryOrdersRequest(dataUserId, {
              dateFrom: monthStart,
              dateTo: monthEnd,
              limit: 3000,
            }).catch(() => ({ orders: [], total: 0 })),
            listTpvRegisterSessionsRequest(dataUserId).catch(() => []),
          ]);
          ordersByUser.set(dataUserId, orderResult.orders);
          sessionsByUser.set(dataUserId, sessions);
        }),
      );

      const loaded: PortfolioBusiness[] = await Promise.all(
        structures.map(async (s) => {
          const brandsBase = buildBrandRows(s.brandsRaw, s.stores);
          let metrics = emptyPortfolioMetrics();

          if (s.isDelivery && s.dataUserId && s.pdvIds.length > 0) {
            const orders = ordersByUser.get(s.dataUserId) || [];
            const sessions = sessionsByUser.get(s.dataUserId) || [];
            const createdMap = pdvCreatedAtMap(s.pointsOfSale);
            const primaryPdv = pickPrimaryPdvIdFromList(s.pdvIds, createdMap);
            metrics = computePortfolioMetrics(orders, s.pdvIds, primaryPdv, todayKey);
            metrics = applyTpvCashMetrics(metrics, sessions, s.pdvIds);
          }

          const brands = enrichBrandsWithRevenue(brandsBase, metrics);
          const members = (s.business.members || []).map((m) => ({
            user_id: m.user_id,
            fullName: m.fullName,
          }));
          const team = await fetchTeamDashboardSnapshot(s.business.business_id, members).catch(
            () => ({ ...EMPTY_TEAM_DASHBOARD_SNAPSHOT, totalMembers: members.length }),
          );

          return {
            businessId: s.business.business_id,
            business: s.business,
            brands,
            stores: s.stores,
            memberCount: s.business.members?.length ?? 0,
            brandCount: brands.length,
            storeCount: s.stores.length,
            pdvCount: s.pdvIds.length,
            pdvIds: s.pdvIds,
            metrics,
            isDelivery: s.isDelivery,
            team,
          };
        }),
      );

      setFinance(financeTotals);
      setRows(loaded.sort((a, b) => a.business.name.localeCompare(b.business.name, 'es')));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el panorama');
      setRows([]);
      setFinance(EMPTY_FINANCE);
    } finally {
      setLoading(false);
    }
  }, [user, businesses]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const onChange = () => void reload();
    window.addEventListener(DELIVERY_WORK_CENTERS_CHANGED, onChange);
    window.addEventListener(DELIVERY_BRANDS_CHANGED, onChange);
    return () => {
      window.removeEventListener(DELIVERY_WORK_CENTERS_CHANGED, onChange);
      window.removeEventListener(DELIVERY_BRANDS_CHANGED, onChange);
    };
  }, [reload]);

  const totals: PortfolioTotals = {
    businesses: rows.length,
    brands: rows.reduce((s, r) => s + r.brandCount, 0),
    stores: rows.reduce((s, r) => s + r.storeCount, 0),
    pdv: rows.reduce((s, r) => s + r.pdvCount, 0),
    members: rows.reduce((s, r) => s + r.memberCount, 0),
    revenueToday: rows.reduce((s, r) => s + r.metrics.revenueToday, 0),
    revenueMonth: rows.reduce((s, r) => s + r.metrics.revenueMonth, 0),
    ordersMonth: rows.reduce((s, r) => s + r.metrics.ordersMonth, 0),
    activeOrders: rows.reduce((s, r) => s + r.metrics.activeOrders, 0),
    openCashRegisters: rows.reduce((s, r) => s + r.metrics.openCashRegisters, 0),
    clockedInNow: rows.reduce((s, r) => s + r.team.clockedInNow, 0),
    pendingVacations: rows.reduce((s, r) => s + r.team.pendingVacationRequests, 0),
    payslipsThisMonth: rows.reduce((s, r) => s + r.team.payslipsThisMonth, 0),
  };

  return { rows, totals, finance, loading, error, reload };
}
