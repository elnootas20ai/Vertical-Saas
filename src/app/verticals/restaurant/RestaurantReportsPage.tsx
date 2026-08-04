/**
 * Informes de sala: ventas cobradas desde cuentas de mesa (no placeholder).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Calendar,
  Download,
  Loader2,
  RefreshCw,
  Users,
  Euro,
  Receipt,
  MapPin,
  UserRound,
  Clock3,
} from 'lucide-react';
import { toast } from 'sonner';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { resolveBusinessDataUserId } from '../../lib/tenantUserId';
import { resolveBusinessScopeId } from '../../lib/deliverySetup';
import { listDiningOrdersRequest, type DiningOrder } from '../../lib/salaApi';
import {
  listRestaurantRegisterSessions,
  type TpvRegisterSession,
} from '../../lib/restaurantCajaApi';
import { localCalendarDayKey, registerSessionOrderLoadBounds } from '../../lib/tpvCajaScope';
import {
  computeRestaurantTotals,
  computeSalesByDay,
  computeSalesByWaiter,
  computeSalesByZone,
  computeTopProducts,
  exportRestaurantReportCsv,
  filterBilledOrders,
  filterOrdersForRegisterSession,
  formatRegisterSessionLabel,
} from './restaurantReports';

type DatePreset = 'hoy' | '7d' | 'mes' | '30d';

function formatEur(n: number): string {
  return n.toLocaleString('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function applyPreset(preset: DatePreset): { from: string; to: string } {
  const today = localCalendarDayKey();
  const now = new Date(`${today}T12:00:00`);
  const ms = (d: number) => {
    const x = new Date(now);
    x.setDate(x.getDate() - d);
    return x.toISOString().slice(0, 10);
  };
  switch (preset) {
    case 'hoy':
      return { from: today, to: today };
    case '7d':
      return { from: ms(6), to: today };
    case 'mes':
      return { from: `${today.slice(0, 7)}-01`, to: today };
    case '30d':
      return { from: ms(29), to: today };
    default:
      return { from: today, to: today };
  }
}

const PRESETS: { id: DatePreset; label: string }[] = [
  { id: 'hoy', label: 'Hoy' },
  { id: '7d', label: '7 días' },
  { id: 'mes', label: 'Este mes' },
  { id: '30d', label: '30 días' },
];

function Kpi({
  title,
  value,
  sub,
  icon,
}: {
  title: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900">
      <div className="mb-2 inline-flex rounded-xl bg-stone-100 p-2 text-stone-700 dark:bg-stone-800 dark:text-stone-200">
        {icon}
      </div>
      <p className="text-xl font-bold tabular-nums text-stone-900 dark:text-stone-50">{value}</p>
      <p className="mt-0.5 text-xs font-semibold text-stone-500">{title}</p>
      {sub ? <p className="mt-0.5 text-[11px] text-stone-400">{sub}</p> : null}
    </div>
  );
}

export function RestaurantReportsPage() {
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const userId = resolveBusinessDataUserId(user, currentBusiness) || user?.user_id || user?.id || '';
  const businessId = resolveBusinessScopeId(currentBusiness) || '';

  const [preset, setPreset] = useState<DatePreset>('hoy');
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<DiningOrder[]>([]);
  const [sessions, setSessions] = useState<TpvRegisterSession[]>([]);
  const [sessionId, setSessionId] = useState('');

  const range = useMemo(() => applyPreset(preset), [preset]);
  const selectedSession = useMemo(
    () => sessions.find((s) => s._id === sessionId) || null,
    [sessions, sessionId],
  );

  const load = useCallback(async () => {
    if (!userId) {
      setOrders([]);
      setSessions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      let dateFrom = `${range.from}T00:00:00.000Z`;
      let dateTo = `${range.to}T23:59:59.999Z`;
      const [listed, sessList] = await Promise.all([
        listDiningOrdersRequest(userId, { dateFrom, dateTo }),
        listRestaurantRegisterSessions(userId, { businessId }).catch(() => [] as TpvRegisterSession[]),
      ]);

      const sortedSessions = [...(sessList || [])].sort((a, b) =>
        String(b.openedAt || '').localeCompare(String(a.openedAt || '')),
      );
      setSessions(sortedSessions);

      let activeSession = sortedSessions.find((s) => s._id === sessionId) || null;
      if (sessionId && !activeSession) {
        setSessionId('');
        activeSession = null;
      }

      if (activeSession) {
        const bounds = registerSessionOrderLoadBounds(activeSession);
        dateFrom = bounds.from;
        dateTo = bounds.to;
        const scoped = await listDiningOrdersRequest(userId, { dateFrom, dateTo });
        const billed = filterBilledOrders(scoped || [], businessId);
        setOrders(filterOrdersForRegisterSession(billed, activeSession));
      } else {
        setOrders(filterBilledOrders(listed || [], businessId));
      }
    } catch {
      setOrders([]);
      toast.error('No se pudieron cargar los informes de sala');
    } finally {
      setLoading(false);
    }
  }, [userId, businessId, range.from, range.to, sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleSessions = useMemo(() => {
    const fromMs = Date.parse(`${range.from}T00:00:00`);
    const toMs = Date.parse(`${range.to}T23:59:59.999`);
    return sessions.filter((s) => {
      const opened = Date.parse(String(s.openedAt || ''));
      if (!Number.isFinite(opened)) return true;
      if (Number.isFinite(fromMs) && opened < fromMs - 12 * 60 * 60 * 1000) return false;
      if (Number.isFinite(toMs) && opened > toMs + 12 * 60 * 60 * 1000) return false;
      return true;
    });
  }, [sessions, range.from, range.to]);

  const totals = useMemo(() => computeRestaurantTotals(orders), [orders]);
  const byDay = useMemo(() => computeSalesByDay(orders), [orders]);
  const byZone = useMemo(() => computeSalesByZone(orders), [orders]);
  const byWaiter = useMemo(() => computeSalesByWaiter(orders), [orders]);
  const topProducts = useMemo(() => computeTopProducts(orders, 12), [orders]);
  const maxDaySales = Math.max(1, ...byDay.map((d) => d.sales));

  const handleExportCsv = () => {
    if (orders.length === 0) {
      toast.info('No hay datos para exportar');
      return;
    }
    const shiftTag = selectedSession
      ? `-turno-${String(selectedSession._id || '').slice(-6)}`
      : '';
    exportRestaurantReportCsv({
      filename: `informes-sala-${range.from}_${range.to}${shiftTag}.csv`,
      headers: ['Sección', 'Clave', 'Tickets', 'Ventas', 'Extra'],
      rows: [
        ...byDay.map((r) => ['día', r.day, r.tickets, r.sales.toFixed(2), '']),
        ...byZone.map((r) => ['zona', r.zone, r.tickets, r.sales.toFixed(2), '']),
        ...byWaiter.map((r) => ['camarero', r.waiterName, r.tickets, r.sales.toFixed(2), `propinas ${r.tips.toFixed(2)}`]),
        ...topProducts.map((r) => ['producto', r.name, r.quantity, r.revenue.toFixed(2), '']),
      ],
    });
    toast.success('CSV exportado');
  };

  return (
    <Layout title="Informes" subtitle="Ventas de sala · cuentas cobradas">
      <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setPreset(p.id);
                  setSessionId('');
                }}
                className={`inline-flex h-9 items-center gap-1 rounded-lg border px-3 text-xs font-semibold ${
                  preset === p.id
                    ? 'border-stone-900 bg-stone-900 text-white dark:border-stone-100 dark:bg-stone-100 dark:text-stone-900'
                    : 'border-stone-200 bg-white text-stone-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200'
                }`}
              >
                {p.id === 'hoy' ? <Calendar className="h-3.5 w-3.5" /> : null}
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={loading || orders.length === 0}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-stone-200 px-3 text-xs font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-50 dark:border-stone-700 dark:text-stone-200"
            >
              <Download className="h-3.5 w-3.5" />
              Exportar CSV
            </button>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-stone-200 px-3 text-xs font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-50 dark:border-stone-700 dark:text-stone-200"
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Actualizar
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Clock3 className="h-4 w-4 text-stone-500" />
          <label className="text-xs font-semibold text-stone-600 dark:text-stone-300" htmlFor="informe-turno">
            Turno de caja
          </label>
          <select
            id="informe-turno"
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
            className="h-9 min-w-[220px] flex-1 rounded-lg border border-stone-200 bg-white px-2.5 text-xs font-medium text-stone-800 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 sm:max-w-md"
          >
            <option value="">Todos los turnos del periodo</option>
            {visibleSessions.map((s) => (
              <option key={s._id} value={s._id}>
                {formatRegisterSessionLabel(s)}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi
            title="Ventas"
            value={formatEur(totals.totalSales)}
            icon={<Euro className="h-4 w-4" />}
            sub={
              selectedSession
                ? formatRegisterSessionLabel(selectedSession)
                : `${range.from === range.to ? range.from : `${range.from} → ${range.to}`}`
            }
          />
          <Kpi
            title="Tickets"
            value={String(totals.ticketCount)}
            icon={<Receipt className="h-4 w-4" />}
            sub={`Media ${formatEur(totals.avgTicket)}`}
          />
          <Kpi
            title="Comensales"
            value={String(totals.totalGuests)}
            icon={<Users className="h-4 w-4" />}
          />
          <Kpi
            title="Propinas"
            value={formatEur(totals.totalTips)}
            icon={<BarChart3 className="h-4 w-4" />}
          />
        </div>

        {loading && orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-stone-500">
            <Loader2 className="h-7 w-7 animate-spin" />
            <p className="text-sm">Cargando informes…</p>
          </div>
        ) : orders.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-300 bg-white px-5 py-12 text-center dark:border-stone-700 dark:bg-stone-900">
            <p className="text-sm font-medium text-stone-800 dark:text-stone-100">
              Sin ventas cobradas en este periodo
            </p>
            <p className="mt-1 text-xs text-stone-500">
              {selectedSession
                ? 'Este turno no tiene cobros de mesa vinculados en caja.'
                : 'Cuando cobres mesas en el TPV, verás aquí totales, zonas y productos.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <section className="rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900">
              <h2 className="mb-3 text-sm font-semibold text-stone-900 dark:text-stone-50">
                Ventas por día
              </h2>
              <ul className="space-y-2">
                {byDay.map((row) => (
                  <li key={row.day}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="font-medium text-stone-700 dark:text-stone-200">{row.day}</span>
                      <span className="tabular-nums text-stone-500">
                        {formatEur(row.sales)} · {row.tickets} tickets
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
                      <div
                        className="h-full rounded-full bg-emerald-500"
                        style={{ width: `${Math.max(6, (row.sales / maxDaySales) * 100)}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900">
              <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-stone-900 dark:text-stone-50">
                <MapPin className="h-4 w-4" />
                Por zona
              </h2>
              {byZone.length === 0 ? (
                <p className="text-xs text-stone-500">Sin datos de zona</p>
              ) : (
                <ul className="divide-y divide-stone-100 dark:divide-stone-800">
                  {byZone.map((row) => (
                    <li
                      key={row.zone}
                      className="flex items-center justify-between gap-2 py-2 text-sm"
                    >
                      <span className="font-medium text-stone-800 dark:text-stone-100">{row.zone}</span>
                      <span className="tabular-nums text-stone-500">
                        {formatEur(row.sales)} · {row.tickets}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-2xl border border-stone-200 bg-white p-4 lg:col-span-2 dark:border-stone-700 dark:bg-stone-900">
              <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-stone-900 dark:text-stone-50">
                <UserRound className="h-4 w-4" />
                Por camarero
              </h2>
              {byWaiter.length === 0 ? (
                <p className="text-xs text-stone-500">Sin datos de camarero</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[320px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-stone-200 text-xs uppercase tracking-wide text-stone-500 dark:border-stone-700">
                        <th className="pb-2 font-semibold">Camarero</th>
                        <th className="pb-2 text-right font-semibold">Cobros</th>
                        <th className="pb-2 text-right font-semibold">Ventas</th>
                        <th className="pb-2 text-right font-semibold">Propinas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byWaiter.map((row) => (
                        <tr
                          key={row.waiterId}
                          className="border-b border-stone-100 last:border-0 dark:border-stone-800"
                        >
                          <td className="py-2 font-medium text-stone-900 dark:text-stone-50">
                            {row.waiterName}
                          </td>
                          <td className="py-2 text-right tabular-nums text-stone-600 dark:text-stone-300">
                            {row.tickets}
                          </td>
                          <td className="py-2 text-right tabular-nums text-stone-600 dark:text-stone-300">
                            {formatEur(row.sales)}
                          </td>
                          <td className="py-2 text-right tabular-nums text-stone-600 dark:text-stone-300">
                            {formatEur(row.tips)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-stone-200 bg-white p-4 lg:col-span-2 dark:border-stone-700 dark:bg-stone-900">
              <h2 className="mb-3 text-sm font-semibold text-stone-900 dark:text-stone-50">
                Top productos
              </h2>
              {topProducts.length === 0 ? (
                <p className="text-xs text-stone-500">Sin líneas de producto</p>
              ) : (
                <ul className="divide-y divide-stone-100 dark:divide-stone-800">
                  {topProducts.map((row) => (
                    <li
                      key={row.name}
                      className="flex items-center justify-between gap-2 py-2 text-sm"
                    >
                      <span className="font-medium text-stone-800 dark:text-stone-100">{row.name}</span>
                      <span className="tabular-nums text-stone-500">
                        ×{row.quantity} · {formatEur(row.revenue)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </div>
    </Layout>
  );
}
