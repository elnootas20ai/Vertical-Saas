/**
 * Gráficas de facturación 14 días en el dashboard bar/restaurante.
 * Misma plantilla visual que el dashboard delivery (AreaChart), datos de cuentas cobradas.
 * Carga propia y progresiva: no bloquea el resto del dashboard.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { eachDayOfInterval, format, startOfDay, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { BarChart3, Receipt, RefreshCw } from 'lucide-react';
import { listDiningOrdersRequest, type DiningOrder } from '../../lib/salaApi';
import { formatMoneyEs } from '../../lib/formatNumberEs';
import { saasPathWithBusinessScope } from '../../lib/businessScopeUrl';
import { filterBilledOrders, computeSalesByDay } from './restaurantReports';

type DayPoint = {
  day: string;
  label: string;
  sales: number;
  tickets: number;
};

type Props = {
  userId: string;
  businessId?: string | null;
  businessIdForScope?: string | null;
};

const CACHE_TTL_MS = 90_000;

function cacheKey(businessId: string): string {
  return `vertial_rest_dash_billing_v1:${businessId}`;
}

function readCache(businessId: string): { at: number; orders: DiningOrder[] } | null {
  try {
    const raw = sessionStorage.getItem(cacheKey(businessId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; orders: DiningOrder[] };
    if (!parsed?.at || Date.now() - parsed.at > CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(businessId: string, orders: DiningOrder[]): void {
  try {
    sessionStorage.setItem(cacheKey(businessId), JSON.stringify({ at: Date.now(), orders }));
  } catch {
    /* quota */
  }
}

function build14DaySeries(orders: DiningOrder[], scopeBusinessId?: string | null): DayPoint[] {
  const billed = filterBilledOrders(orders, scopeBusinessId || undefined);
  const byDay = computeSalesByDay(billed);
  const map = new Map(byDay.map((r) => [r.day, r]));
  const end = startOfDay(new Date());
  const start = subDays(end, 13);
  return eachDayOfInterval({ start, end }).map((d) => {
    const day = format(d, 'yyyy-MM-dd');
    const row = map.get(day);
    return {
      day,
      label: format(d, 'd MMM', { locale: es }),
      sales: Number(row?.sales) || 0,
      tickets: Number(row?.tickets) || 0,
    };
  });
}

function ChartSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 animate-pulse">
      {[0, 1].map((i) => (
        <div
          key={i}
          className="overflow-hidden rounded-2xl border-2 border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"
        >
          <div className="border-b border-gray-100 px-5 py-4 dark:border-gray-800">
            <div className="h-4 w-40 rounded bg-gray-100 dark:bg-gray-700" />
          </div>
          <div className="h-48 p-4">
            <div className="h-full w-full rounded-xl bg-gray-100 dark:bg-gray-700" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function RestaurantDashboardBillingCharts({
  userId,
  businessId,
  businessIdForScope,
}: Props) {
  const navigate = useNavigate();
  const scopeId = String(businessIdForScope || businessId || '').trim();
  const cacheId = scopeId || userId;

  const [orders, setOrders] = useState<DiningOrder[]>(() => {
    const cached = cacheId ? readCache(cacheId) : null;
    return cached?.orders || [];
  });
  const [loading, setLoading] = useState(() => orders.length === 0);
  const [refreshing, setRefreshing] = useState(false);
  const loadGenRef = useRef(0);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!userId) return;
    const gen = ++loadGenRef.current;
    const silent = opts?.silent || orders.length > 0;
    if (silent) setRefreshing(true);
    else setLoading(true);

    const end = startOfDay(new Date());
    const start = subDays(end, 13);
    const dateFrom = `${format(start, 'yyyy-MM-dd')}T00:00:00.000Z`;

    try {
      const raw = await listDiningOrdersRequest(userId, {
        dateFrom,
      });
      if (gen !== loadGenRef.current) return;
      const billed = filterBilledOrders(raw, scopeId || undefined);
      setOrders(billed);
      if (cacheId) writeCache(cacheId, billed);
    } catch {
      if (gen === loadGenRef.current && !silent) setOrders([]);
    } finally {
      if (gen === loadGenRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [userId, scopeId, cacheId, orders.length]);

  useEffect(() => {
    void load({ silent: orders.length > 0 });
    // Solo al cambiar empresa/usuario
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, businessId, scopeId]);

  const series = useMemo(
    () => build14DaySeries(orders, scopeId),
    [orders, scopeId],
  );

  const total14 = useMemo(
    () => series.reduce((s, p) => s + p.sales, 0),
    [series],
  );
  const tickets14 = useMemo(
    () => series.reduce((s, p) => s + p.tickets, 0),
    [series],
  );

  const scoped = (path: string) => saasPathWithBusinessScope(path, businessId);

  if (loading && orders.length === 0) {
    return (
      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-bold text-gray-900 dark:text-gray-100">Facturación</p>
            <p className="text-[11px] text-gray-400">Cargando últimos 14 días…</p>
          </div>
        </div>
        <ChartSkeleton />
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-gray-900 dark:text-gray-100">Facturación</p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400">
            Últimos 14 días · {formatMoneyEs(total14)} · {tickets14} cuenta{tickets14 === 1 ? '' : 's'}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => navigate(scoped('/saas/vertical/restaurant/informes'))}
            className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] font-semibold text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Informes
          </button>
          <button
            type="button"
            onClick={() => void load({ silent: true })}
            disabled={refreshing}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-40 dark:hover:bg-gray-800 dark:hover:text-gray-300"
            title="Actualizar"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="overflow-hidden rounded-2xl border-2 border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-gray-800">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-gray-500 dark:text-gray-400" />
              <p className="text-sm font-bold text-gray-900 dark:text-gray-100">
                Facturación (14 días)
              </p>
            </div>
            <span className="text-[9px] font-semibold uppercase tracking-wide text-gray-400 opacity-70">
              14d
            </span>
          </div>
          <div className="h-48 p-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                <defs>
                  <linearGradient id="restSalesGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.06)" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis hide />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const pt = payload[0].payload as DayPoint;
                    return (
                      <div className="rounded-lg bg-gray-900 px-2.5 py-1.5 text-[10px] font-semibold text-white shadow-lg">
                        <span className="mr-1 opacity-60">{pt.label}</span>
                        {formatMoneyEs(pt.sales)}
                      </div>
                    );
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="sales"
                  stroke="#2563eb"
                  strokeWidth={2}
                  fill="url(#restSalesGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border-2 border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-gray-800">
            <div className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-gray-500 dark:text-gray-400" />
              <p className="text-sm font-bold text-gray-900 dark:text-gray-100">
                Cuentas cobradas (14 días)
              </p>
            </div>
            <span className="text-[9px] font-semibold uppercase tracking-wide text-gray-400 opacity-70">
              14d
            </span>
          </div>
          <div className="h-48 p-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                <defs>
                  <linearGradient id="restTicketsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#14b8a6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.06)" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis hide />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const pt = payload[0].payload as DayPoint;
                    return (
                      <div className="rounded-lg bg-gray-900 px-2.5 py-1.5 text-[10px] font-semibold text-white shadow-lg">
                        <span className="mr-1 opacity-60">{pt.label}</span>
                        {pt.tickets} cuenta{pt.tickets === 1 ? '' : 's'}
                      </div>
                    );
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="tickets"
                  stroke="#14b8a6"
                  strokeWidth={2}
                  fill="url(#restTicketsGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </section>
  );
}
