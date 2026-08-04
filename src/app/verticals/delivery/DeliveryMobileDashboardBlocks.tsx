/**
 * Bloques del dashboard empresa delivery para móvil / CeoMobileHome.
 * Carga pedidos (empresa), marcas, pagos TPV, CRM y resumen operativo compacto.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { Brand } from '../../lib/brandApi';
import { listBrandsRequest } from '../../lib/brandApi';
import {
  filterDeliveryOrdersRequest,
  listStaffConsumptionsRequest,
  listTpvRegisterSessionsRequest,
  type DeliveryOrder,
} from '../../lib/deliveryApi';
import { countsTowardNewClientMetrics } from '../../lib/clientAcquisition';
import { fetchClientAcquisitionSample } from '../../lib/clientAcquisitionSample';
import {
  buildStoreOpsPulse,
  computePortfolioClientMetrics,
  listMonthToDateDayKeys,
  listTrailingDayKeys,
  type StoreOpsPulse,
} from '../../lib/portfolioMetrics';
import { localCalendarDayKey } from '../../lib/tpvCajaScope';
import { CompanyBrandPerformancePanel } from '../../components/saas/CompanyBrandPerformancePanel';
import { PortfolioOpsPulse } from '../../components/saas/PortfolioOpsPulse';
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
  /** Filtrar paneles de marcas/tiempos a un PDV (opcional). */
  salesPointId?: string | null;
  stores: Array<{ id: string; name: string }>;
  /** PDVs con workCenter para resumen operativo / comparativa. */
  pdvs?: MobilePdvRef[];
};

export function DeliveryMobileDashboardBlocks({
  dataUserId,
  businessId,
  businessName = 'Empresa',
  salesPointId,
  stores,
  pdvs = [],
}: Props) {
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [workerPay, setWorkerPay] = useState<WorkerPayMonthSummary | null>(null);
  const [pulses7d, setPulses7d] = useState<StoreOpsPulse[]>([]);
  const [pulsesMonth, setPulsesMonth] = useState<StoreOpsPulse[]>([]);
  const [newClientsMonth, setNewClientsMonth] = useState<number | null>(null);
  const [newClientsPrevMonth, setNewClientsPrevMonth] = useState<number | null>(null);
  const [newClientsToday, setNewClientsToday] = useState<number | null>(null);
  const [newClientsYesterday, setNewClientsYesterday] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!dataUserId || !businessId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const todayKey = localCalendarDayKey();
    const monthKey = todayKey.slice(0, 7);
    const yearKey = todayKey.slice(0, 4);
    const prevYearKey = String(Number(yearKey) - 1);
    const orderFetchFrom = `${prevYearKey}-01-01T00:00:00.000Z`;
    const monthEnd = `${todayKey}T23:59:59.999Z`;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = localCalendarDayKey(yesterday);

    try {
      const [orderResult, tpvSessions, consumptions, brandList, clientSample] =
        await Promise.all([
          // Empresa completa: hace falta para Test1 vs Badalona
          filterDeliveryOrdersRequest(dataUserId, {
            dateFrom: orderFetchFrom,
            dateTo: monthEnd,
            limit: 5000,
            businessId,
          }).catch(() => ({ orders: [] as DeliveryOrder[], total: 0 })),
          listTpvRegisterSessionsRequest(dataUserId, { businessId }).catch(() => []),
          listStaffConsumptionsRequest(dataUserId, { month: monthKey }).catch(() => ({
            items: [],
            summary: { count: 0, total: 0, cashNowTotal: 0, payrollTotal: 0 },
          })),
          listBrandsRequest(businessId).catch(() => [] as Brand[]),
          fetchClientAcquisitionSample(dataUserId, {
            monthKey,
            businessId,
          }).catch(() => ({ totalClients: 0, sample: [] })),
        ]);

      const list = Array.isArray(orderResult.orders) ? orderResult.orders : [];
      setOrders(list);
      setBrands(Array.isArray(brandList) ? brandList : []);
      setWorkerPay(
        buildWorkerPayMonthSummary(tpvSessions || [], monthKey, consumptions.items || []),
      );

      const keys7d = listTrailingDayKeys(todayKey, 7);
      const keysMonth = listMonthToDateDayKeys(todayKey);
      const pulseSources: MobilePdvRef[] =
        pdvs.length > 0
          ? pdvs
          : stores.map((s) => ({ id: s.id, name: s.name, workCenterId: s.id }));

      const buildPulses = (dayKeys: string[]): StoreOpsPulse[] =>
        pulseSources
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
            });
          })
          .filter((p) => Boolean(p.pdvId));

      setPulses7d(buildPulses(keys7d));
      setPulsesMonth(buildPulses(keysMonth));

      const metrics = computePortfolioClientMetrics(clientSample.sample || [], monthKey);
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
      setNewClientsMonth(metrics.newClientsMonth);
      setNewClientsPrevMonth(metrics.newClientsPrevMonth);
      setNewClientsToday(newToday);
      setNewClientsYesterday(newYest);
    } finally {
      setLoading(false);
    }
  }, [dataUserId, businessId, businessName, pdvs, stores]);

  useEffect(() => {
    void load();
  }, [load]);

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

  if (loading && orders.length === 0 && !workerPay) {
    return (
      <div className="flex justify-center py-8">
        <RefreshCw className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    );
  }

  const hasPulses = pulses7d.length > 0 || pulsesMonth.length > 0;

  return (
    <div className="space-y-3">
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
              onClick={() => void load()}
              disabled={loading}
              className="min-h-9 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-40 dark:hover:bg-gray-800"
              title="Actualizar"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          }
        />
      ) : null}

      <CompanyBrandPerformancePanel
        businessId={businessId}
        brands={brands}
        orders={scopedOrders}
        loading={loading && brands.length === 0}
        compact
      />
      <WorkerPayMonthPanel
        summary={workerPay}
        loading={loading && !workerPay}
        compact
      />
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
    </div>
  );
}
