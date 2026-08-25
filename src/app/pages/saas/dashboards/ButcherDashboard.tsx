import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  BarChart, Bar, Cell, ResponsiveContainer, Tooltip,
} from 'recharts';
import { Layout } from '../../../components/saas/Layout';
import { useAuth } from '../../../context/AuthContext';
import { useBusiness } from '../../../context/BusinessContext';
import {
  getButcherSalesTodayRequest,
  getButcherOrdersTodayRequest,
} from '../../../lib/butcherApi';
import {
  BUTCHER_DASHBOARD_DEMO,
  type ButcherDashAlert,
  type ButcherDashOrder,
} from '../../../lib/butcherDashboardDemo';
import { shouldUseAdminDashboardDemo } from '../../../lib/adminDashboardDemoGate';
import { AdminDemoChip } from '../../../components/saas/AdminDemoChip';
import {
  Beef, ShoppingCart, ClipboardList, Truck, Scissors, Scale,
  BarChart3, ArrowRight, Loader2, Recycle, Package, LayoutDashboard,
  AlertTriangle, Clock, TrendingUp, Users, ArrowUpRight,
} from 'lucide-react';

type Props = { onSelectGeneral?: () => void };

const LINKS = [
  { label: 'TPV', path: '/saas/vertical/carniceria/tpv', icon: ShoppingCart },
  { label: 'Encargos', path: '/saas/butcher-orders', icon: ClipboardList },
  { label: 'Compras', path: '/saas/vertical/carniceria/compras', icon: Package },
  { label: 'Despiece', path: '/saas/vertical/carniceria/despiece', icon: Scissors },
  { label: 'Repartos', path: '/saas/vertical/carniceria/reparto', icon: Truck },
  { label: 'Básculas', path: '/saas/vertical/carniceria/basculas', icon: Scale },
  { label: 'Merma', path: '/saas/butcher-waste', icon: Recycle },
  { label: 'Informes', path: '/saas/vertical/carniceria/informes', icon: BarChart3 },
  { label: 'Centro ops', path: '/saas/butcher-hub', icon: Beef },
];

const ORDER_CFG = {
  pendiente: { label: 'Pendiente', bg: 'bg-amber-50 dark:bg-amber-950/30', text: 'text-amber-700 dark:text-amber-300', dot: 'bg-amber-500' },
  preparando: { label: 'Preparando', bg: 'bg-blue-50 dark:bg-blue-950/30', text: 'text-blue-700 dark:text-blue-300', dot: 'bg-blue-500' },
  listo: { label: 'Listo', bg: 'bg-emerald-50 dark:bg-emerald-950/30', text: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500' },
} as const;

function formatEur(n: number) {
  return n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

function mapOrderStatus(status?: string): ButcherDashOrder['estado'] {
  const s = String(status || '').toLowerCase();
  if (s === 'ready' || s === 'listo') return 'listo';
  if (s === 'preparing' || s === 'preparando') return 'preparando';
  return 'pendiente';
}

export function ButcherDashboard({ onSelectGeneral }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const userId = user?.user_id || user?.id || '';
  const [loading, setLoading] = useState(true);
  const [revenue, setRevenue] = useState(0);
  const [tickets, setTickets] = useState(0);
  const [liveOrders, setLiveOrders] = useState<ButcherDashOrder[]>([]);
  const [usingDemo, setUsingDemo] = useState(false);

  const load = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    setLoading(true);
    try {
      const [sales, orders] = await Promise.all([
        getButcherSalesTodayRequest(userId).catch(() => null),
        getButcherOrdersTodayRequest(userId).catch(() => null),
      ]);
      const rev = Number(sales?.stats?.totalRevenue ?? 0);
      const tix = Number(sales?.stats?.count ?? 0);
      const list = Array.isArray(orders?.orders) ? orders.orders : [];
      const mapped: ButcherDashOrder[] = list
        .filter((o: { status?: string }) =>
          !['picked_up', 'delivered', 'cancelled'].includes(String(o.status || '')))
        .slice(0, 8)
        .map((o: {
          _id?: string; orderNumber?: string; clientName?: string; status?: string;
          pickupTime?: string; total?: number;
          items?: { productName?: string }[];
        }) => ({
          id: o.orderNumber || String(o._id || '').slice(-8) || '—',
          cliente: o.clientName || 'Cliente',
          productos: (o.items || []).map((it) => it.productName).filter(Boolean).join(', ') || '—',
          hora: o.pickupTime || '—',
          estado: mapOrderStatus(o.status),
          total: Number(o.total || 0),
        }));

      const empty = rev <= 0 && tix <= 0 && mapped.length === 0;
      if (empty && shouldUseAdminDashboardDemo(user?.email)) {
        setUsingDemo(true);
        setRevenue(BUTCHER_DASHBOARD_DEMO.revenue);
        setTickets(BUTCHER_DASHBOARD_DEMO.tickets);
        setLiveOrders(BUTCHER_DASHBOARD_DEMO.orders);
      } else {
        setUsingDemo(false);
        setRevenue(rev);
        setTickets(tix);
        setLiveOrders(mapped);
      }
    } finally {
      setLoading(false);
    }
  }, [userId, user?.email]);

  useEffect(() => { void load(); }, [load]);

  const links = useMemo(() => {
    if (currentBusiness?.ownDeliveryEnabled) return LINKS;
    return LINKS.filter((l) => l.path !== '/saas/vertical/carniceria/reparto');
  }, [currentBusiness?.ownDeliveryEnabled]);

  const demo = BUTCHER_DASHBOARD_DEMO;
  const pendingOrders = usingDemo ? demo.pendingOrders : liveOrders.length;
  const ticketMedio = usingDemo
    ? demo.ticketMedio
    : (tickets > 0 ? revenue / tickets : 0);
  const hourly = usingDemo ? demo.hourly : [];
  const alerts: ButcherDashAlert[] = usingDemo ? demo.alerts : [];
  const topCuts = usingDemo ? demo.topCuts : [];
  const recentSales = usingDemo ? demo.recentSales : [];
  const maxHourly = Math.max(...hourly.map((h) => h.importe), 1);

  return (
    <Layout title="Carnicería" subtitle={currentBusiness?.name || 'Panel vertical'}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm text-stone-500 dark:text-stone-400">
            Resumen del día · operativa carnicería
          </p>
          {usingDemo && <AdminDemoChip show />}
        </div>
        {onSelectGeneral && (
          <button
            type="button"
            onClick={onSelectGeneral}
            className="inline-flex items-center gap-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 px-3.5 py-2 text-xs font-semibold text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors"
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            Ver dashboard general
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-stone-400" /></div>
      ) : (
        <div className="space-y-5">
          {/* KPIs */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <button
              type="button"
              onClick={() => navigate('/saas/butcher-sales')}
              className="text-left rounded-2xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 p-4 hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
            >
              <div className="flex items-start justify-between mb-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">Ventas hoy</p>
                <span className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center">
                  <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                </span>
              </div>
              <p className="text-2xl font-bold text-stone-900 dark:text-white tracking-tight">{formatEur(revenue)}</p>
              <p className="text-xs text-stone-400 mt-1 flex items-center gap-1">
                {usingDemo && <ArrowUpRight className="w-3 h-3 text-emerald-600" />}
                {tickets} tickets · media {formatEur(ticketMedio)}
              </p>
            </button>

            <button
              type="button"
              onClick={() => navigate('/saas/butcher-orders')}
              className="text-left rounded-2xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 p-4 hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
            >
              <div className="flex items-start justify-between mb-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">Encargos activos</p>
                <span className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center">
                  <ClipboardList className="w-4 h-4 text-[var(--v-blue,#2563eb)]" />
                </span>
              </div>
              <p className="text-2xl font-bold text-stone-900 dark:text-white tracking-tight">{pendingOrders}</p>
              <p className="text-xs text-stone-400 mt-1">
                {usingDemo ? `${demo.clientsToday} clientes hoy` : 'Pendientes de entrega'}
              </p>
            </button>

            <button
              type="button"
              onClick={() => navigate('/saas/butcher-waste')}
              className="text-left rounded-2xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 p-4 hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
            >
              <div className="flex items-start justify-between mb-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">Merma hoy</p>
                <span className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-950/40 flex items-center justify-center">
                  <Recycle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                </span>
              </div>
              <p className="text-2xl font-bold text-stone-900 dark:text-white tracking-tight">
                {usingDemo ? `${demo.mermaKg.toLocaleString('es-ES')} kg` : '—'}
              </p>
              <p className="text-xs text-stone-400 mt-1">
                {usingDemo ? `${demo.mermaPct.toLocaleString('es-ES')} % sobre ventas` : 'Sin datos aún'}
              </p>
            </button>

            <button
              type="button"
              onClick={() => navigate('/saas/butcher-hub')}
              className="text-left rounded-2xl border border-blue-200 dark:border-blue-800 bg-blue-50/60 dark:bg-blue-950/25 p-4 hover:border-blue-400 transition-colors"
            >
              <div className="flex items-start justify-between mb-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--v-blue,#2563eb)]">Centro ops</p>
                <span className="w-8 h-8 rounded-xl bg-white dark:bg-stone-900 flex items-center justify-center">
                  <Beef className="w-4 h-4 text-[var(--v-blue,#2563eb)]" />
                </span>
              </div>
              <p className="text-sm font-bold text-stone-900 dark:text-white mt-1">
                {usingDemo
                  ? `${demo.stockCritico} stock crítico · ${demo.lotesCaducan} lotes FEFO`
                  : 'Abrir operativa completa'}
              </p>
              <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[var(--v-blue,#2563eb)]">
                Ir al hub <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </button>
          </div>

          {/* Chart + alerts */}
          <div className="grid lg:grid-cols-5 gap-4">
            <section className="lg:col-span-3 rounded-2xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="text-sm font-bold text-stone-900 dark:text-white">Ventas por hora</h2>
                  <p className="text-[11px] text-stone-400">Mostrador · hoy</p>
                </div>
                {usingDemo && (
                  <span className="text-[10px] text-stone-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Preview
                  </span>
                )}
              </div>
              {hourly.length > 0 ? (
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={hourly} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barCategoryGap="18%">
                      <Tooltip
                        cursor={{ fill: 'rgba(37,99,235,0.06)', radius: 4 }}
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const pt = payload[0].payload as { hora: string; importe: number; tickets: number };
                          return (
                            <div className="bg-stone-900 text-white text-[10px] font-semibold px-2.5 py-1.5 rounded-lg shadow-lg">
                              <span className="opacity-60 mr-1.5">{pt.hora}</span>
                              {formatEur(pt.importe)} · {pt.tickets} tk
                            </div>
                          );
                        }}
                      />
                      <Bar dataKey="importe" radius={[4, 4, 0, 0]} maxBarSize={28}>
                        {hourly.map((h) => (
                          <Cell
                            key={h.hora}
                            fill="#2563eb"
                            fillOpacity={0.25 + (h.importe / maxHourly) * 0.75}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-sm text-stone-400 py-10 text-center">Sin tickets aún hoy</p>
              )}
            </section>

            <section className="lg:col-span-2 rounded-2xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold text-stone-900 dark:text-white">Alertas</h2>
                <AlertTriangle className="w-4 h-4 text-amber-500" />
              </div>
              {alerts.length === 0 ? (
                <p className="text-sm text-stone-400 py-8 text-center">Sin alertas activas</p>
              ) : (
                <ul className="space-y-2">
                  {alerts.map((a) => (
                    <li key={a.id}>
                      <button
                        type="button"
                        onClick={() => navigate(a.route)}
                        className={`w-full text-left rounded-xl border-l-4 px-3 py-2.5 transition-colors hover:brightness-95 dark:hover:brightness-110 ${
                          a.severity === 'error'
                            ? 'border-l-[#E11D48] bg-rose-50 dark:bg-rose-950/30'
                            : a.severity === 'warning'
                              ? 'border-l-amber-500 bg-amber-50 dark:bg-amber-950/30'
                              : 'border-l-blue-400 bg-blue-50 dark:bg-blue-950/30'
                        }`}
                      >
                        <p className="text-xs font-medium text-stone-800 dark:text-stone-200 leading-snug">{a.message}</p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {/* Orders + top cuts / sales */}
          <div className="grid lg:grid-cols-2 gap-4">
            <section className="rounded-2xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold text-stone-900 dark:text-white">Encargos de hoy</h2>
                <button
                  type="button"
                  onClick={() => navigate('/saas/butcher-orders')}
                  className="text-[11px] font-semibold text-[var(--v-blue,#2563eb)] hover:underline"
                >
                  Ver todos
                </button>
              </div>
              {liveOrders.length === 0 ? (
                <p className="text-sm text-stone-400 py-8 text-center">Sin encargos activos</p>
              ) : (
                <ul className="divide-y divide-stone-100 dark:divide-stone-800">
                  {liveOrders.map((o) => {
                    const cfg = ORDER_CFG[o.estado];
                    return (
                      <li key={o.id} className="py-2.5 flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-stone-900 dark:text-white">{o.id}</span>
                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold ${cfg.bg} ${cfg.text}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                              {cfg.label}
                            </span>
                          </div>
                          <p className="text-xs text-stone-600 dark:text-stone-300 mt-0.5 truncate">{o.cliente}</p>
                          <p className="text-[11px] text-stone-400 truncate">{o.productos}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-xs font-bold text-stone-900 dark:text-white">{formatEur(o.total)}</p>
                          <p className="text-[10px] text-stone-400">{o.hora}</p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="rounded-2xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold text-stone-900 dark:text-white">
                  {usingDemo ? 'Top cortes hoy' : 'Últimas ventas'}
                </h2>
                <Users className="w-4 h-4 text-stone-400" />
              </div>
              {usingDemo ? (
                <ul className="space-y-2">
                  {topCuts.map((c, i) => (
                    <li key={c.nombre} className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-lg bg-stone-100 dark:bg-stone-800 text-[10px] font-bold text-stone-500 flex items-center justify-center">
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-stone-900 dark:text-white truncate">{c.nombre}</p>
                        <p className="text-[10px] text-stone-400">{c.kg.toLocaleString('es-ES')} kg</p>
                      </div>
                      <p className="text-xs font-bold text-stone-900 dark:text-white">{formatEur(c.importe)}</p>
                    </li>
                  ))}
                </ul>
              ) : recentSales.length > 0 ? (
                <ul className="divide-y divide-stone-100 dark:divide-stone-800">
                  {recentSales.map((s) => (
                    <li key={s.ticket} className="py-2 flex justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-stone-900 dark:text-white">{s.ticket}</p>
                        <p className="text-[11px] text-stone-400 truncate">{s.productos}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-bold">{formatEur(s.total)}</p>
                        <p className="text-[10px] text-stone-400">{s.hora}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-stone-400 py-8 text-center">Aún no hay tickets hoy</p>
              )}
            </section>
          </div>

          {/* Quick links */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-500 mb-2">Accesos rápidos</p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {links.map((l) => (
                <button
                  key={l.path}
                  type="button"
                  onClick={() => navigate(l.path)}
                  className="flex items-center gap-3 p-4 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 hover:border-blue-300 dark:hover:border-blue-700 text-left transition"
                >
                  <l.icon className="w-5 h-5 text-[var(--v-blue,#2563eb)]" />
                  <span className="font-semibold text-sm text-stone-900 dark:text-stone-100">{l.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
