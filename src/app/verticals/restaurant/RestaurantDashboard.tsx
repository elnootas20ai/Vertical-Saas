import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Banknote,
  BarChart3,
  BookmarkCheck,
  ChefHat,
  Clock,
  LayoutGrid,
  ListChecks,
  Loader2,
  Receipt,
  RefreshCw,
  UtensilsCrossed,
  Users,
  Zap,
} from 'lucide-react';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { useSSE } from '../../hooks/useSSE';
import { getAuthHeaders } from '../../lib/authApi';
import { resolveBusinessScopeId } from '../../lib/deliverySetup';
import { resolveBusinessDataUserId } from '../../lib/tenantUserId';
import { isOpenDiningOrder } from '../../lib/restaurantTableDisplay';
import { formatDurationMinutes, summarizeTableTicketStats } from '../../lib/restaurantTableStats';
import { listReservations } from '../../lib/restaurantReservationsApi';
import type { RestaurantReservation } from '../../lib/restaurantReservationTypes';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import {
  listDiningOrdersRequest,
  listDiningTablesRequest,
  listTableTicketStatsRequest,
  type DiningOrder,
  type DiningTable,
  type DiningTableTicketStatRow,
} from '../../lib/salaApi';
import { buildKitchenTickets } from './restaurantKitchen';
import { computeRestaurantTotals, filterBilledOrders } from './restaurantReports';

type RestaurantDashboardProps = { onSelectGeneral?: () => void };

interface WaitlistEntry extends VerticalEntity {
  guestName: string;
  partySize: string;
  status: string;
}

const ACTIVE_RESERVATION_STATUSES = new Set(['pending', 'confirmed', 'arrived', 'delayed']);

function todayKey(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function isVisibleActiveTable(table: DiningTable): boolean {
  return table.active !== false && table.visible !== false && table.status !== 'hidden';
}

function isOccupiedTable(table: DiningTable): boolean {
  return ['occupied', 'pending_order', 'served', 'pending_payment'].includes(table.status);
}

function KpiCard({
  icon,
  iconClass,
  label,
  value,
  sub,
  to,
}: {
  icon: React.ReactNode;
  iconClass: string;
  label: string;
  value: string;
  sub?: string;
  to?: string;
}) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => { if (to) navigate(to); }}
      className={`rounded-2xl border border-gray-200 bg-white p-4 text-left dark:border-gray-700 dark:bg-gray-900 ${
        to ? 'transition-shadow hover:shadow-md' : 'cursor-default'
      }`}
    >
      <div className="flex items-center gap-2">
        <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${iconClass}`}>
          {icon}
        </div>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums text-gray-900 dark:text-gray-100">{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{sub}</p> : null}
    </button>
  );
}

const QUICK_ACTIONS = [
  { label: 'Sala', icon: <UtensilsCrossed className="h-4 w-4" />, to: '/saas/sala' },
  { label: 'Cocina', icon: <ChefHat className="h-4 w-4" />, to: '/saas/cocina' },
  { label: 'TPV', icon: <Zap className="h-4 w-4" />, to: '/saas/caja/tpv' },
  { label: 'Caja', icon: <Banknote className="h-4 w-4" />, to: '/saas/caja' },
  { label: 'Reservas', icon: <BookmarkCheck className="h-4 w-4" />, to: '/saas/reservations' },
  { label: 'Informes', icon: <BarChart3 className="h-4 w-4" />, to: '/saas/vertical/restaurant/informes' },
];

/** Dashboard operativo de restaurante: sala, cocina, caja y reservas de hoy con datos reales. */
export function RestaurantDashboard({ onSelectGeneral }: RestaurantDashboardProps) {
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const userId = resolveBusinessDataUserId(user, currentBusiness);
  const authUserId = user?.user_id || user?.id || null;
  const businessScopeId = resolveBusinessScopeId(currentBusiness);
  const waitlistApi = useMemo(() => createVerticalApi<WaitlistEntry>('restaurant', 'waitlist'), []);

  const [orders, setOrders] = useState<DiningOrder[]>([]);
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [tableStats, setTableStats] = useState<DiningTableTicketStatRow[]>([]);
  const [reservations, setReservations] = useState<RestaurantReservation[]>([]);
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sseOk, setSseOk] = useState(false);
  const hasLoadedRef = useRef(false);

  const loadData = useCallback(async (options?: { silent?: boolean }) => {
    if (!userId) return;
    const silent = options?.silent ?? hasLoadedRef.current;
    if (!silent) setLoading(true);
    else setRefreshing(true);
    const today = todayKey();
    try {
      const [orderData, tableData, statsData, reservationData, waitlistData] = await Promise.all([
        listDiningOrdersRequest(userId, { dateFrom: `${today}T00:00:00.000Z` }),
        listDiningTablesRequest(userId),
        listTableTicketStatsRequest(userId, {
          dateFrom: today,
          dateTo: today,
          businessId: businessScopeId || undefined,
        }).catch(() => [] as DiningTableTicketStatRow[]),
        listReservations(userId).catch(() => [] as RestaurantReservation[]),
        waitlistApi.list(userId).catch(() => [] as WaitlistEntry[]),
      ]);
      setOrders(orderData);
      setTables(tableData);
      setTableStats(statsData);
      setReservations(reservationData);
      setWaitlist(waitlistData);
      hasLoadedRef.current = true;
    } catch {
      // fallo puntual de red: se reintenta en el siguiente refresco
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId, businessScopeId, waitlistApi]);

  useEffect(() => { void loadData(); }, [loadData]);

  const sseToken = useMemo(() => {
    const headers = getAuthHeaders();
    const authHeader = headers.Authorization || headers.authorization;
    if (!authHeader) return null;
    return authHeader.replace(/^Bearer\s+/i, '').trim() || null;
  }, [authUserId]);

  const sseHandlers = useMemo(
    () => ({
      'sala:order_created': () => void loadData({ silent: true }),
      'sala:order_updated': () => void loadData({ silent: true }),
      'sala:comanda_sent': () => void loadData({ silent: true }),
      'sala:table_status_changed': () => void loadData({ silent: true }),
      connected: () => setSseOk(true),
      disconnected: () => setSseOk(false),
      reconnecting: () => setSseOk(false),
    }),
    [loadData],
  );

  useSSE({
    userId: authUserId,
    token: sseToken,
    businessId: currentBusiness?.business_id || null,
    handlers: sseHandlers,
    enabled: !!authUserId && !!userId,
  });

  useEffect(() => {
    if (sseOk) return;
    const iv = setInterval(() => void loadData({ silent: true }), 30000);
    return () => clearInterval(iv);
  }, [sseOk, loadData]);

  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden) void loadData({ silent: true });
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [loadData]);

  const scopedOrders = useMemo(
    () => orders.filter((o) => !businessScopeId || !o.businessId || o.businessId === businessScopeId),
    [orders, businessScopeId],
  );
  const openAccounts = useMemo(
    () => scopedOrders.filter((o) => isOpenDiningOrder(o) && Number(o.total || 0) > 0),
    [scopedOrders],
  );
  const openTotal = useMemo(
    () => openAccounts.reduce((s, o) => s + Number(o.total || 0), 0),
    [openAccounts],
  );
  const billedToday = useMemo(
    () => filterBilledOrders(scopedOrders, businessScopeId),
    [scopedOrders, businessScopeId],
  );
  const todayTotals = useMemo(() => computeRestaurantTotals(billedToday), [billedToday]);
  const kitchenCount = useMemo(
    () => buildKitchenTickets(scopedOrders, businessScopeId).length,
    [scopedOrders, businessScopeId],
  );
  const daySummary = useMemo(() => summarizeTableTicketStats(tableStats), [tableStats]);

  const visibleTables = useMemo(() => tables.filter(isVisibleActiveTable), [tables]);
  const occupiedTables = useMemo(() => visibleTables.filter(isOccupiedTable), [visibleTables]);

  const todayReservations = useMemo(() => {
    const today = todayKey();
    return reservations
      .filter((r) => String(r.date || '').slice(0, 10) === today)
      .filter((r) => ACTIVE_RESERVATION_STATUSES.has(String(r.status || '')))
      .sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')));
  }, [reservations]);

  const waitingNow = useMemo(
    () => waitlist.filter((w) => w.status === 'esperando' || w.status === 'avisado'),
    [waitlist],
  );

  const businessName = currentBusiness?.name || 'Restaurante';

  return (
    <Layout title="Dashboard">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">{businessName}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Operativa de hoy · sala, cocina y caja en vivo
              {sseOk ? '' : ' · actualizando cada 30 s'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void loadData({ silent: true })}
              className="rounded-xl border border-gray-200 p-2.5 text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
              title="Actualizar"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            {onSelectGeneral ? (
              <button
                type="button"
                onClick={() => onSelectGeneral()}
                className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                <LayoutGrid className="h-4 w-4" />
                Vista general
              </button>
            ) : null}
          </div>
        </header>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-20 text-gray-500" aria-busy="true">
            <Loader2 className="h-6 w-6 animate-spin" />
            Cargando datos del restaurante…
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <KpiCard
                icon={<Banknote className="h-4 w-4" />}
                iconClass="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400"
                label="Ventas hoy"
                value={`${todayTotals.totalSales.toFixed(2)} €`}
                sub={`${todayTotals.ticketCount} tickets cobrados`}
                to="/saas/caja"
              />
              <KpiCard
                icon={<Receipt className="h-4 w-4" />}
                iconClass="bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400"
                label="Cuentas abiertas"
                value={String(openAccounts.length)}
                sub={`${openTotal.toFixed(2)} € pendientes de cobro`}
                to="/saas/sala"
              />
              <KpiCard
                icon={<ChefHat className="h-4 w-4" />}
                iconClass="bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400"
                label="En cocina"
                value={String(kitchenCount)}
                sub="Comandas activas"
                to="/saas/cocina"
              />
              <KpiCard
                icon={<UtensilsCrossed className="h-4 w-4" />}
                iconClass="bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400"
                label="Mesas ocupadas"
                value={visibleTables.length > 0 ? `${occupiedTables.length}/${visibleTables.length}` : '—'}
                sub={
                  visibleTables.length > 0
                    ? `${Math.round((occupiedTables.length / visibleTables.length) * 100)}% de ocupación`
                    : 'Configura la sala'
                }
                to="/saas/sala"
              />
            </div>

            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <KpiCard
                icon={<BarChart3 className="h-4 w-4" />}
                iconClass="bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400"
                label="Ticket medio"
                value={todayTotals.ticketCount > 0 ? `${todayTotals.avgTicket.toFixed(2)} €` : '—'}
                to="/saas/vertical/restaurant/informes"
              />
              <KpiCard
                icon={<Clock className="h-4 w-4" />}
                iconClass="bg-cyan-50 text-cyan-600 dark:bg-cyan-950/40 dark:text-cyan-400"
                label="Media mesa"
                value={daySummary.avgDurationMinutes > 0 ? formatDurationMinutes(daySummary.avgDurationMinutes) : '—'}
                to="/saas/vertical/restaurant/informes"
              />
              <KpiCard
                icon={<BookmarkCheck className="h-4 w-4" />}
                iconClass="bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400"
                label="Reservas hoy"
                value={String(todayReservations.length)}
                sub={todayReservations[0] ? `Próxima: ${todayReservations[0].time || '—'}` : 'Sin reservas pendientes'}
                to="/saas/reservations"
              />
              <KpiCard
                icon={<ListChecks className="h-4 w-4" />}
                iconClass="bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400"
                label="Lista de espera"
                value={String(waitingNow.length)}
                sub={waitingNow.length > 0 ? 'Clientes esperando mesa' : 'Nadie en cola'}
                to="/saas/lista-espera"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
              <span className="mr-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Acceso rápido
              </span>
              {QUICK_ACTIONS.map((action) => (
                <Link
                  key={action.to}
                  to={action.to}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-900/40 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  {action.icon}
                  {action.label}
                </Link>
              ))}
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900">
                <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  <Receipt className="h-4 w-4" />
                  Cuentas abiertas
                </h2>
                {openAccounts.length === 0 ? (
                  <p className="py-8 text-center text-sm text-gray-400">No hay cuentas abiertas ahora mismo.</p>
                ) : (
                  <ul className="mt-3 divide-y divide-gray-100 dark:divide-gray-800">
                    {openAccounts.slice(0, 8).map((o) => (
                      <li key={o._id} className="flex items-center justify-between py-2.5 text-sm">
                        <div>
                          <p className="font-semibold text-gray-900 dark:text-gray-100">
                            {o.tableName || `Mesa ${o.tableNumber}`}
                          </p>
                          <p className="text-xs text-gray-500">
                            {o.guests ? `${o.guests} pers.` : ''}{o.zone ? ` · ${o.zone}` : ''}
                          </p>
                        </div>
                        <span className="font-bold tabular-nums text-gray-900 dark:text-gray-100">
                          {Number(o.total || 0).toFixed(2)} €
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900">
                <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  <BookmarkCheck className="h-4 w-4" />
                  Reservas de hoy
                </h2>
                {todayReservations.length === 0 ? (
                  <p className="py-8 text-center text-sm text-gray-400">Sin reservas activas para hoy.</p>
                ) : (
                  <ul className="mt-3 divide-y divide-gray-100 dark:divide-gray-800">
                    {todayReservations.slice(0, 8).map((r) => (
                      <li key={r._id} className="flex items-center justify-between py-2.5 text-sm">
                        <div>
                          <p className="font-semibold text-gray-900 dark:text-gray-100">{r.guestName || 'Reserva'}</p>
                          <p className="text-xs text-gray-500">
                            {r.partySize ? `${r.partySize} pers.` : ''}
                            {r.tableName ? ` · ${r.tableName}` : r.preferredZone ? ` · ${r.preferredZone}` : ''}
                          </p>
                        </div>
                        <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-bold text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
                          {r.time || '—'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900">
                <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  <Users className="h-4 w-4" />
                  Lista de espera
                </h2>
                {waitingNow.length === 0 ? (
                  <p className="py-8 text-center text-sm text-gray-400">Nadie esperando mesa.</p>
                ) : (
                  <ul className="mt-3 divide-y divide-gray-100 dark:divide-gray-800">
                    {waitingNow.slice(0, 8).map((w, index) => (
                      <li key={w._id} className="flex items-center justify-between py-2.5 text-sm">
                        <div className="flex items-center gap-3">
                          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-xs font-bold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                            #{index + 1}
                          </span>
                          <div>
                            <p className="font-semibold text-gray-900 dark:text-gray-100">{w.guestName}</p>
                            <p className="text-xs text-gray-500">{w.partySize ? `${w.partySize} pers.` : ''}</p>
                          </div>
                        </div>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                            w.status === 'avisado'
                              ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                              : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                          }`}
                        >
                          {w.status === 'avisado' ? 'Avisado' : 'En espera'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
