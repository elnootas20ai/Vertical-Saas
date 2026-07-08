import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Banknote,
  Clock,
  Loader2,
  Receipt,
  RefreshCw,
  Users,
  UtensilsCrossed,
} from 'lucide-react';
import { toast } from 'sonner';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { resolveBusinessScopeId } from '../../lib/deliverySetup';
import { resolveBusinessDataUserId } from '../../lib/tenantUserId';
import {
  listDiningOrdersRequest,
  listTableTicketStatsRequest,
  type DiningOrder,
  type DiningTableTicketStatRow,
} from '../../lib/salaApi';
import {
  computeRestaurantTotals,
  computeSalesByDay,
  computeSalesByZone,
  computeTopProducts,
  filterBilledOrders,
} from './restaurantReports';

type RangeKey = '7d' | '30d' | '90d';

const RANGES: { key: RangeKey; label: string; days: number }[] = [
  { key: '7d', label: '7 días', days: 7 },
  { key: '30d', label: '30 días', days: 30 },
  { key: '90d', label: '90 días', days: 90 },
];

function rangeStartIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function euro(value: number): string {
  return `${value.toFixed(2)}€`;
}

function KpiCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
      <div className="flex items-center gap-2 text-gray-400">
        {icon}
        <p className="text-xs font-semibold uppercase tracking-wide">{label}</p>
      </div>
      <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-gray-400">{hint}</p> : null}
    </div>
  );
}

/** Informes operativos de restaurante: ventas de sala, productos y ocupación de mesas. */
export function RestaurantReportsPage() {
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const userId = resolveBusinessDataUserId(user, currentBusiness);
  const businessScopeId = resolveBusinessScopeId(currentBusiness);

  const [range, setRange] = useState<RangeKey>('30d');
  const [orders, setOrders] = useState<DiningOrder[]>([]);
  const [tableStats, setTableStats] = useState<DiningTableTicketStatRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const rangeDays = RANGES.find((r) => r.key === range)?.days ?? 30;

  const loadData = useCallback(async (options?: { silent?: boolean }) => {
    if (!userId) return;
    if (options?.silent) setRefreshing(true);
    else setLoading(true);
    try {
      const dateFrom = rangeStartIso(rangeDays);
      const [orderData, statsData] = await Promise.all([
        listDiningOrdersRequest(userId, { status: 'paid,closed', dateFrom }),
        listTableTicketStatsRequest(userId, {
          dateFrom: dateFrom.slice(0, 10),
          businessId: businessScopeId || undefined,
        }).catch(() => [] as DiningTableTicketStatRow[]),
      ]);
      setOrders(orderData);
      setTableStats(statsData);
    } catch {
      toast.error('Error al cargar informes de restaurante');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId, rangeDays, businessScopeId]);

  useEffect(() => { void loadData(); }, [loadData]);

  const billed = useMemo(
    () => filterBilledOrders(orders, businessScopeId),
    [orders, businessScopeId],
  );
  const totals = useMemo(() => computeRestaurantTotals(billed), [billed]);
  const byDay = useMemo(() => computeSalesByDay(billed), [billed]);
  const topProducts = useMemo(() => computeTopProducts(billed), [billed]);
  const byZone = useMemo(() => computeSalesByZone(billed), [billed]);

  const avgTableMinutes = useMemo(() => {
    const rows = tableStats.filter((s) => Number(s.durationMinutes) > 0);
    if (rows.length === 0) return 0;
    const total = rows.reduce((acc, s) => acc + Number(s.durationMinutes), 0);
    return Math.round(total / rows.length);
  }, [tableStats]);

  const maxDaySales = useMemo(
    () => Math.max(1, ...byDay.map((d) => d.sales)),
    [byDay],
  );

  return (
    <Layout title="Informes">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-100 text-violet-600 dark:bg-violet-950/50 dark:text-violet-400">
              <BarChart3 className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Informes del restaurante</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Ventas de sala, productos más vendidos y rotación de mesas.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
              {RANGES.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => setRange(r.key)}
                  className={`px-3 py-2 text-sm font-medium transition-colors ${
                    range === r.key
                      ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                      : 'bg-white text-gray-600 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => void loadData({ silent: true })}
              className="rounded-xl border border-gray-200 p-2.5 text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
              title="Actualizar"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-20 text-gray-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            Cargando informes…
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <KpiCard
                icon={<Banknote className="h-4 w-4" />}
                label="Ventas"
                value={euro(totals.totalSales)}
              />
              <KpiCard
                icon={<Receipt className="h-4 w-4" />}
                label="Tickets"
                value={String(totals.ticketCount)}
              />
              <KpiCard
                icon={<UtensilsCrossed className="h-4 w-4" />}
                label="Ticket medio"
                value={euro(totals.avgTicket)}
              />
              <KpiCard
                icon={<Users className="h-4 w-4" />}
                label="Comensales"
                value={String(totals.totalGuests)}
                hint={totals.totalTips > 0 ? `Propinas: ${euro(totals.totalTips)}` : undefined}
              />
              <KpiCard
                icon={<Clock className="h-4 w-4" />}
                label="Tiempo medio mesa"
                value={avgTableMinutes > 0 ? `${avgTableMinutes} min` : '—'}
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900">
                <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Ventas por día
                </h2>
                {byDay.length === 0 ? (
                  <p className="py-10 text-center text-sm text-gray-400">
                    Sin ventas cobradas en este periodo.
                  </p>
                ) : (
                  <div className="mt-4 space-y-2">
                    {byDay.map((row) => (
                      <div key={row.day} className="flex items-center gap-3">
                        <span className="w-20 shrink-0 text-xs font-medium text-gray-500">
                          {row.day.slice(5)}
                        </span>
                        <div className="h-5 flex-1 overflow-hidden rounded-md bg-gray-100 dark:bg-gray-800">
                          <div
                            className="h-full rounded-md bg-violet-500"
                            style={{ width: `${Math.max(2, (row.sales / maxDaySales) * 100)}%` }}
                          />
                        </div>
                        <span className="w-20 shrink-0 text-right text-xs font-bold text-gray-700 dark:text-gray-200">
                          {euro(row.sales)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900">
                <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Productos más vendidos
                </h2>
                {topProducts.length === 0 ? (
                  <p className="py-10 text-center text-sm text-gray-400">
                    Aún no hay productos vendidos en sala.
                  </p>
                ) : (
                  <table className="mt-3 w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-gray-400">
                        <th className="py-2 font-semibold">Producto</th>
                        <th className="py-2 text-right font-semibold">Uds.</th>
                        <th className="py-2 text-right font-semibold">Importe</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {topProducts.map((row) => (
                        <tr key={row.name}>
                          <td className="py-2 font-medium text-gray-800 dark:text-gray-200">{row.name}</td>
                          <td className="py-2 text-right text-gray-600 dark:text-gray-300">{row.quantity}</td>
                          <td className="py-2 text-right font-bold text-gray-900 dark:text-gray-100">
                            {euro(row.revenue)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900">
              <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Ventas por zona
              </h2>
              {byZone.length === 0 ? (
                <p className="py-10 text-center text-sm text-gray-400">Sin datos de zonas todavía.</p>
              ) : (
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {byZone.map((row) => (
                    <div
                      key={row.zone}
                      className="rounded-xl border border-gray-100 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-950"
                    >
                      <p className="truncate text-xs font-semibold uppercase tracking-wide text-gray-400">
                        {row.zone}
                      </p>
                      <p className="mt-1 text-lg font-bold text-gray-900 dark:text-gray-100">{euro(row.sales)}</p>
                      <p className="text-xs text-gray-500">{row.tickets} tickets</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
