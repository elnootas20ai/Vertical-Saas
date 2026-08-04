import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import {
  getButcherOrdersTodayRequest,
  getButcherSalesStatsRequest,
  listButcherClientsRequest,
  type ButcherOrder,
  type SalesStats,
} from '../../lib/butcherApi';
import {
  getButcherWasteSummaryRequest,
  createButcherWasteRequest,
  type WasteSummary,
} from '../../lib/butcherWasteApi';
import { createVerticalDashboardApi, createVerticalApi, type VerticalDashboardData, type VerticalEntity } from '../../lib/verticalApiFactory';
import { toast } from 'sonner';
import {
  BarChart, Bar, Cell, ResponsiveContainer, Tooltip,
  AreaChart, Area, XAxis, CartesianGrid,
} from 'recharts';
import {
  Beef, ShoppingCart, Package, AlertTriangle, Scale, Thermometer,
  TrendingUp, TrendingDown, DollarSign, Wallet, UserCheck, Clock,
  ArrowRight, ArrowUpRight, ArrowDownRight, Minus, Bell, CheckCircle,
  RefreshCw, ScanBarcode, Truck, ClipboardList, Receipt,
  Store, Users, Calendar, FileText, BarChart3, Boxes, Trash2,
  ChevronDown, Eye, Settings2, Shield, Zap, Timer, Euro, Loader2,
  Percent, Scissors,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

type UserRole = 'gerente' | 'trabajador';
type AlertSeverity = 'error' | 'warning' | 'info';

interface ButcherAlert {
  id: string;
  type: 'stock_bajo' | 'lote_caducidad' | 'merma_alta' | 'precio_desactualizado' | 'caja_pendiente';
  severity: AlertSeverity;
  message: string;
  route: string;
  timestamp: Date;
}

/** Lote FEFO canónico (`bt_lote`) para panel caducidad Hub */
interface OpsLot extends VerticalEntity {
  codigoLote?: string;
  productoId?: string;
  producto?: string;
  fechaCaducidad?: string;
  kgDisponibles?: number;
  kgRecibidos?: number;
  costePorKg?: number;
  estado?: string;
}

interface WorkerPerf {
  nombre: string;
  avatar: string;
  ventasHoy: number;
  ingresosHoy: number;
  ticketsHoy: number;
  mermaKg: number;
  horaEntrada: string;
}

interface HourlySale {
  hora: string;
  importe: number;
  tickets: number;
}

interface DailyWaste {
  dia: string;
  label: string;
  kg: number;
}

function routeForButcherType(t: string): string {
  switch (t) {
    case 'bt_ticket': return '/saas/butcher-sales';
    case 'bt_product':
    case 'bt_catalog': return '/saas/butcher-products';
    case 'bt_stock_entry': return '/saas/butcher-inventory';
    case 'bt_lote': return '/saas/butcher-traceability';
    case 'bt_supplier': return '/saas/butcher-suppliers';
    default: return '/saas/dashboard';
  }
}

function butcherAlertsFromActivity(activity: VerticalDashboardData['recentActivity']): ButcherAlert[] {
  return activity.slice(0, 12).map((a) => ({
    id: a.id,
    type: 'stock_bajo',
    severity: 'info' as AlertSeverity,
    message: `${a.type}: ${String(a.summary || a.id)}`,
    route: routeForButcherType(a.type),
    timestamp: new Date(a.updatedAt || a.createdAt || Date.now()),
  }));
}

function buildHourlyFromButcherActivity(activity: VerticalDashboardData['recentActivity']): HourlySale[] {
  const today = new Date().toISOString().slice(0, 10);
  const byHour: Record<number, { tickets: number; importe: number }> = {};
  for (const a of activity) {
    if (a.type !== 'bt_ticket') continue;
    const d = a.updatedAt || a.createdAt;
    if (!d || String(d).slice(0, 10) !== today) continue;
    const h = new Date(d).getHours();
    if (!byHour[h]) byHour[h] = { tickets: 0, importe: 0 };
    byHour[h].tickets += 1;
    byHour[h].importe += 1;
  }
  const hours = Object.keys(byHour).map(Number).sort((x, y) => x - y);
  if (!hours.length) return [];
  return hours.map((h) => {
    const t = byHour[h].tickets;
    return {
      hora: `${String(h).padStart(2, '0')}:00`,
      importe: t,
      tickets: t,
    };
  });
}

function workersFromButcherActivity(activity: VerticalDashboardData['recentActivity'], ticketCount: number): WorkerPerf[] {
  const n = activity.filter(a => a.type === 'bt_ticket').length;
  const total = n || ticketCount;
  if (total <= 0) return [];
  return [{
    nombre: 'Actividad TPV (CouchDB Ops)',
    avatar: 'TP',
    ventasHoy: total,
    ingresosHoy: 0,
    ticketsHoy: total,
    mermaKg: 0,
    horaEntrada: '—',
  }];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatEur(n: number) {
  return n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

const ALERT_STYLES: Record<AlertSeverity, { border: string; bg: string; dot: string; text: string; icon: string }> = {
  error:   { border: 'border-l-red-500',   bg: 'bg-red-50 dark:bg-red-950/30',    dot: 'bg-red-500',   text: 'text-red-700 dark:text-red-400',   icon: 'text-red-500' },
  warning: { border: 'border-l-amber-500', bg: 'bg-amber-50 dark:bg-amber-950/30', dot: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-400', icon: 'text-amber-500' },
  info:    { border: 'border-l-blue-400',  bg: 'bg-blue-50 dark:bg-blue-950/30',   dot: 'bg-blue-400',  text: 'text-blue-700 dark:text-blue-400',  icon: 'text-blue-400' },
};

const ORDER_STATUS_CFG = {
  pendiente:  { label: 'Pendiente',  dot: 'bg-amber-500',   bg: 'bg-amber-50 dark:bg-amber-900/30',   text: 'text-amber-700 dark:text-amber-300' },
  preparando: { label: 'Preparando', dot: 'bg-blue-500',    bg: 'bg-blue-50 dark:bg-blue-900/30',     text: 'text-blue-700 dark:text-blue-300' },
  listo:      { label: 'Listo',      dot: 'bg-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-300' },
} as const;

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KPICard({
  title, value, sub, icon, iconBg, iconColor, trend, onClick, miniChart,
}: {
  title: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  trend?: { value: string; up: boolean | null };
  onClick?: () => void;
  miniChart?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-2xl p-4 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm transition-all group"
    >
      <div className="flex items-stretch gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between mb-1.5">
            <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{title}</p>
            <div className={`w-8 h-8 ${iconBg} rounded-xl flex items-center justify-center flex-shrink-0`}>
              <span className={iconColor}>{icon}</span>
            </div>
          </div>
          <p className="text-xl sm:text-2xl font-black text-gray-900 dark:text-gray-100 leading-none">{value}</p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {trend && (
              <span className={`flex items-center gap-0.5 text-[11px] font-bold ${
                trend.up === true ? 'text-emerald-600' : trend.up === false ? 'text-red-500' : 'text-gray-400'
              }`}>
                {trend.up === true ? <ArrowUpRight className="w-3 h-3" /> : trend.up === false ? <ArrowDownRight className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                {trend.value}
              </span>
            )}
            <span className="text-[11px] text-gray-400 dark:text-gray-500">{sub}</span>
          </div>
        </div>
        {miniChart && <div className="w-16 flex-shrink-0 flex items-end">{miniChart}</div>}
      </div>
    </button>
  );
}

// ─── Quick Access Button ─────────────────────────────────────────────────────

function QuickAccessBtn({ label, icon, route, color, bg }: {
  label: string; icon: React.ReactNode; route: string; color: string; bg: string;
}) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate(route)}
      className={`${bg} rounded-2xl p-3 flex flex-col items-center gap-1.5 hover:scale-[1.03] active:scale-[0.97] transition-all`}
    >
      <span className={color}>{icon}</span>
      <span className="text-[10px] font-semibold text-gray-700 dark:text-gray-300 text-center leading-tight">{label}</span>
    </button>
  );
}

// ─── Mini Hourly Bar Chart ───────────────────────────────────────────────────

function HourlySalesChart({ data }: { data: HourlySale[] }) {
  if (!data.length) return null;
  const lastIdx = data.length - 1;
  return (
    <div className="h-full w-full min-h-[3rem]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 2, right: 1, left: 1, bottom: 1 }} barCategoryGap="20%">
          <Tooltip
            cursor={{ fill: 'rgba(0,0,0,0.06)', radius: 3 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const pt = payload[0].payload as HourlySale;
              return (
                <div className="bg-gray-900 text-white text-[10px] font-semibold px-2 py-1 rounded-lg shadow-lg whitespace-nowrap">
                  <span className="opacity-60 mr-1">{pt.hora}</span>
                  {formatEur(pt.importe)} · {pt.tickets} tickets
                </div>
              );
            }}
          />
          <Bar dataKey="importe" radius={[2, 2, 0, 0]} maxBarSize={14}>
            {data.map((_, idx) => (
              <Cell key={idx} fill="#dc2626" fillOpacity={idx === lastIdx ? 1 : 0.2 + (idx / lastIdx) * 0.6} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ═════════════════════════════════════════════════════════════════════════════

export function ButcherHub() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { userId } = useApp();
  const dashApi = useMemo(() => createVerticalDashboardApi('butcher-ops'), []);
  const authUserId = user?.user_id || user?.id || '';

  const [dashData, setDashData] = useState<VerticalDashboardData | null>(null);
  const [dashLoading, setDashLoading] = useState(true);

  const [role, setRole] = useState<UserRole>('gerente');
  const [filterTienda, setFilterTienda] = useState('todas');

  const [liveOrders, setLiveOrders] = useState<ButcherOrder[]>([]);
  const [liveSalesStats, setLiveSalesStats] = useState<SalesStats | null>(null);
  const [liveClientCount, setLiveClientCount] = useState(0);
  const [liveWasteSummary, setLiveWasteSummary] = useState<WasteSummary | null>(null);
  const [expiringBatches, setExpiringBatches] = useState<OpsLot[]>([]);
  const [expiryBusy, setExpiryBusy] = useState<string | null>(null);
  const catalogApi = useMemo(() => createVerticalApi<{ _id: string; nombre?: string; precioKg?: number }>('butcher-ops', 'catalog'), []);
  const lotsApi = useMemo(() => createVerticalApi<OpsLot>('butcher-ops', 'traceability'), []);

  const loadDashData = useCallback(async (opts?: { silent?: boolean }) => {
    if (!authUserId) {
      setDashData(null);
      if (!opts?.silent) setDashLoading(false);
      return;
    }
    if (!opts?.silent) setDashLoading(true);
    try {
      const d = await dashApi.load(authUserId);
      setDashData(d);
    } catch {
      setDashData(null);
    } finally {
      if (!opts?.silent) setDashLoading(false);
    }
  }, [dashApi, authUserId]);

  useEffect(() => {
    void loadDashData();
  }, [loadDashData]);

  const loadExpiringBatches = useCallback(async () => {
    if (!authUserId) return;
    try {
      const lots = await lotsApi.list(authUserId);
      const now = Date.now();
      const horizonMs = 3 * 86_400_000;
      const list = lots.filter((b) => {
        const estado = String(b.estado || 'activo').toLowerCase();
        if (estado === 'bloqueado' || estado === 'caducado' || estado === 'agotado') return false;
        if (!(Number(b.kgDisponibles || 0) > 0)) return false;
        if (!b.fechaCaducidad) return false;
        const exp = new Date(b.fechaCaducidad).getTime();
        if (Number.isNaN(exp)) return false;
        return exp <= now + horizonMs;
      }).sort((a, b) =>
        String(a.fechaCaducidad).localeCompare(String(b.fechaCaducidad)),
      );
      setExpiringBatches(list.slice(0, 12));
    } catch {
      setExpiringBatches([]);
    }
  }, [authUserId, lotsApi]);

  useEffect(() => {
    if (!userId) return;
    getButcherOrdersTodayRequest(userId).then((r) => { if (r.ok) setLiveOrders(r.orders || []); }).catch(() => {});
    getButcherSalesStatsRequest(userId).then((r) => { if (r.ok) setLiveSalesStats(r.stats); }).catch(() => {});
    listButcherClientsRequest(userId).then((r) => { if (r.ok) setLiveClientCount((r.clients || []).length); }).catch(() => {});
    const today = new Date().toISOString().slice(0, 10);
    const monthStart = today.slice(0, 7) + '-01';
    getButcherWasteSummaryRequest(userId, monthStart, today).then((r) => { if (r.ok) setLiveWasteSummary(r.summary); }).catch(() => {});
    void loadExpiringBatches();
  }, [userId, loadExpiringBatches]);

  const handleExpiryMarkdown = async (batch: OpsLot) => {
    if (!authUserId) return;
    setExpiryBusy(`${batch._id}:rebajar`);
    try {
      const catalog = await catalogApi.list(authUserId);
      const match = catalog.find((p) =>
        p._id === batch.productoId
        || String(p.nombre || '').toLowerCase() === String(batch.producto || '').toLowerCase(),
      );
      if (!match) {
        toast.error('No encontré el corte en el catálogo TPV');
        return;
      }
      const next = Math.round(Number(match.precioKg || 0) * 0.8 * 100) / 100;
      await catalogApi.update(authUserId, match._id, {
        precioKg: next,
        precioActualizado: true,
      } as any);
      toast.success(`Rebaja 20%: ${batch.producto || 'corte'} → ${next.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}/kg`);
    } catch {
      toast.error('No se pudo rebajar el precio');
    } finally {
      setExpiryBusy(null);
    }
  };

  const handleExpiryWaste = async (batch: OpsLot) => {
    if (!userId) return;
    setExpiryBusy(`${batch._id}:merma`);
    try {
      const kg = Math.max(0.01, Number(batch.kgDisponibles || batch.kgRecibidos || 0));
      const wr = await createButcherWasteRequest(userId, {
        productId: batch.productoId,
        productName: batch.producto,
        catalogItemId: batch.productoId,
        catalogItemName: batch.producto,
        batchId: batch._id,
        opsLotId: batch._id,
        wasteKg: kg,
        wasteType: 'caducado',
        reason: `Caducidad lote ${batch.codigoLote || batch._id}`,
        date: new Date().toISOString().slice(0, 10),
        costPriceAtTime: Number(batch.costePorKg || 0),
      } as any);
      if (!wr.ok) {
        toast.error(wr.error || 'No se pudo registrar merma');
        return;
      }
      toast.success(`Merma registrada: ${kg.toLocaleString('es-ES')} kg`);
      await loadExpiringBatches();
    } catch {
      toast.error('Error al registrar merma');
    } finally {
      setExpiryBusy(null);
    }
  };

  const wasteToday = useMemo(() => {
    if (!liveWasteSummary?.dailyTrend) return 0;
    const today = new Date().toISOString().slice(0, 10);
    const entry = (liveWasteSummary.dailyTrend as any[]).find((d: any) => d.date === today);
    return entry?.totalKg ?? entry?.kg ?? 0;
  }, [liveWasteSummary]);

  const wasteTodayCost = useMemo(() => {
    if (!liveWasteSummary?.dailyTrend) return 0;
    const today = new Date().toISOString().slice(0, 10);
    const entry = (liveWasteSummary.dailyTrend as any[]).find((d: any) => d.date === today);
    return entry?.totalCost ?? entry?.cost ?? 0;
  }, [liveWasteSummary]);

  const liveWastePct = liveWasteSummary?.wastePct ?? 0;
  const liveWasteMonthKg = liveWasteSummary?.totalKg ?? liveWasteSummary?.totalWasteKg ?? 0;

  const liveWeeklyWaste: DailyWaste[] = useMemo(() => {
    const dayLabels = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    if (!liveWasteSummary?.dailyTrend?.length) {
      return dayLabels.slice(1).concat(dayLabels[0]).map(label => ({ dia: label, label, kg: 0 }));
    }
    const last7 = liveWasteSummary.dailyTrend.slice(-7);
    return last7.map((d) => {
      const dow = new Date(d.date + 'T00:00:00').getDay();
      return { dia: dayLabels[dow], label: dayLabels[dow], kg: d.totalKg ?? d.kg ?? 0 };
    });
  }, [liveWasteSummary]);
  const [filterTurno, setFilterTurno] = useState('todos');
  const [filterTrabajador, setFilterTrabajador] = useState('todos');
  const [showAlertPanel, setShowAlertPanel] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(new Date());

  const data = useMemo(() => {
    const recent = dashData?.recentActivity ?? [];
    const c = (dashData?.counts ?? {}) as Record<string, number>;
    const ventasHoy = liveSalesStats?.today.revenue ?? 0;
    const ticketsHoy = liveSalesStats?.today.count ?? c.tickets ?? 0;
    const ventasDelta = 0;
    const ticketMedio = liveSalesStats?.avgTicket ?? (ticketsHoy > 0 ? ventasHoy / ticketsHoy : 0);
    const pedidosPendientes = liveOrders.filter(o => o.status === 'pending').length;
    const pedidosHoy = liveOrders.length;
    const hourlySales = buildHourlyFromButcherActivity(recent);
    const alerts = butcherAlertsFromActivity(recent);
    const stockCritico = (c.products ?? 0) + (c.catalog ?? 0);
    const stockCriticoItems = recent
      .filter(a => a.type === 'bt_product' || a.type === 'bt_catalog')
      .slice(0, 4)
      .map((a) => ({
        nombre: String(a.summary || 'Producto'),
        stock: 0,
        minimo: 0,
        unidad: 'kg',
      }));
    const ultimasVentas = recent
      .filter(a => a.type === 'bt_ticket')
      .slice(0, 8)
      .map((a) => ({
        ticket: String(a.id).slice(-14),
        hora: a.updatedAt
          ? new Date(a.updatedAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
          : '—',
        total: 0,
        productos: String(a.summary || '—'),
      }));

    const orderStatus = (o: ButcherOrder): 'pendiente' | 'preparando' | 'listo' => {
      if (o.status === 'ready') return 'listo';
      if (o.status === 'preparing') return 'preparando';
      return 'pendiente';
    };

    const ultimosPedidos = liveOrders.slice(0, 8).map((o) => ({
      numero: o.orderNumber || String(o._id).slice(-8),
      cliente: o.clientName || 'Cliente',
      productos: (o.items || []).map(it => it.productName).filter(Boolean).join(', ') || '—',
      entrega: o.pickupTime || '—',
      estado: orderStatus(o),
    }));

    const workers = workersFromButcherActivity(recent, c.tickets ?? 0);

    const rev = liveSalesStats?.today.revenue ?? 0;
    const byM = liveSalesStats?.byMethodToday;
    const ingresosEfectivo = Number(byM?.cash || 0);
    const ingresosTarjeta = Number(byM?.card || 0);
    const ingresosBizum = Number(byM?.bizum || 0) + Number(byM?.mixed || 0);

    return {
      ventasHoy,
      ventasAyer: 0,
      ventasDelta,
      ticketsHoy,
      ticketMedio,
      mermaHoyKg: wasteToday,
      mermaMesPct: liveWastePct,
      stockCritico,
      pedidosPendientes,
      pedidosHoy,
      trabajadoresActivos: c.suppliers ?? 0,
      cajaActual: rev,
      ingresosEfectivo,
      ingresosTarjeta,
      ingresosBizum,
      lotesProximosCaducar: expiringBatches.length || (c.traceability ?? 0),
      hourlySales,
      workers,
      alerts,
      stockCriticoItems,
      ultimasVentas,
      ultimosPedidos,
    };
  }, [dashData, liveOrders, liveSalesStats, wasteToday, liveWastePct, expiringBatches.length]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadDashData({ silent: true });
      if (userId) {
        await Promise.all([
          getButcherOrdersTodayRequest(userId).then((r) => { if (r.ok) setLiveOrders(r.orders || []); }),
          getButcherSalesStatsRequest(userId).then((r) => { if (r.ok) setLiveSalesStats(r.stats); }),
          listButcherClientsRequest(userId).then((r) => { if (r.ok) setLiveClientCount((r.clients || []).length); }),
          (() => {
            const today = new Date().toISOString().slice(0, 10);
            const monthStart = today.slice(0, 7) + '-01';
            return getButcherWasteSummaryRequest(userId, monthStart, today).then((r) => {
              if (r.ok) setLiveWasteSummary(r.summary);
            });
          })(),
        ]).catch(() => {});
        await loadExpiringBatches();
      }
      setLastUpdate(new Date());
    } finally {
      setRefreshing(false);
    }
  }, [loadDashData, userId, loadExpiringBatches]);

  const criticalAlerts = data.alerts.filter(a => a.severity === 'error').length;
  const warningAlerts = data.alerts.filter(a => a.severity === 'warning').length;

  const workerSelf = data.workers[0];

  // ─── Quick access items ─────────────────────────────────────────────
  const quickAccess = [
    { label: 'TPV', icon: <ShoppingCart className="w-5 h-5" />, route: '/saas/tpv-mode', color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-950/40' },
    { label: 'Ventas', icon: <Receipt className="w-5 h-5" />, route: '/saas/butcher-sales', color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950/40' },
    { label: 'Productos', icon: <Beef className="w-5 h-5" />, route: '/saas/butcher-products', color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-950/40' },
    { label: 'Stock', icon: <Boxes className="w-5 h-5" />, route: '/saas/butcher-inventory', color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950/40' },
    { label: 'Pedidos', icon: <ClipboardList className="w-5 h-5" />, route: '/saas/butcher-orders', color: 'text-violet-600', bg: 'bg-violet-50 dark:bg-violet-950/40' },
    { label: 'Compras', icon: <Truck className="w-5 h-5" />, route: '/saas/butcher-suppliers', color: 'text-cyan-600', bg: 'bg-cyan-50 dark:bg-cyan-950/40' },
    { label: 'Merma', icon: <Trash2 className="w-5 h-5" />, route: '/saas/butcher-waste', color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-950/40' },
    { label: 'Trazabilidad', icon: <ScanBarcode className="w-5 h-5" />, route: '/saas/butcher-traceability', color: 'text-gray-600', bg: 'bg-gray-100 dark:bg-gray-800' },
    { label: 'Equipo', icon: <Users className="w-5 h-5" />, route: '/saas/team', color: 'text-indigo-600', bg: 'bg-indigo-50 dark:bg-indigo-950/40' },
    { label: 'Finanzas', icon: <Wallet className="w-5 h-5" />, route: '/saas/finance', color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950/40' },
    { label: 'Fichajes', icon: <Clock className="w-5 h-5" />, route: '/saas/clockins', color: 'text-gray-600', bg: 'bg-gray-100 dark:bg-gray-800' },
    { label: 'Informes', icon: <BarChart3 className="w-5 h-5" />, route: '/saas/vertical/carniceria/informes', color: 'text-indigo-600', bg: 'bg-indigo-50 dark:bg-indigo-950/40' },
  ];

  // ─── Worker quick access (simplified) ───────────────────────────────
  const workerQuickAccess = [
    { label: 'TPV Mostrador', icon: <ShoppingCart className="w-5 h-5" />, route: '/saas/worker/tpv', color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-950/40' },
    { label: 'Pedidos hoy', icon: <ClipboardList className="w-5 h-5" />, route: '/saas/butcher-orders', color: 'text-violet-600', bg: 'bg-violet-50 dark:bg-violet-950/40' },
    { label: 'Fichar', icon: <Clock className="w-5 h-5" />, route: '/saas/worker/clock', color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950/40' },
    { label: 'Stock', icon: <Boxes className="w-5 h-5" />, route: '/saas/butcher-inventory', color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-950/40' },
  ];

  return (
    <Layout title="Centro Operativo" subtitle="Carnicería — Operativa diaria">
      {dashLoading ? (
        <div className="flex justify-center py-16" aria-busy="true" aria-label="Cargando">
          <Loader2 className="w-10 h-10 animate-spin text-red-600 dark:text-red-400" />
        </div>
      ) : (
      <div className="flex flex-col gap-4">

        {/* ── Header bar: role toggle + filters + status ── */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            {/* Role toggle */}
            <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
              <button
                onClick={() => setRole('gerente')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  role === 'gerente'
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                <Shield className="w-3.5 h-3.5" /> Gerente
              </button>
              <button
                onClick={() => setRole('trabajador')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  role === 'trabajador'
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                <UserCheck className="w-3.5 h-3.5" /> Trabajador
              </button>
            </div>

            {/* Filters (gerente only) */}
            {role === 'gerente' && (
              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={filterTienda}
                  onChange={e => setFilterTienda(e.target.value)}
                  className="px-2.5 py-1.5 border-2 border-gray-200 dark:border-gray-700 rounded-lg text-xs bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 outline-none focus:border-gray-400"
                >
                  <option value="todas">Todas las tiendas</option>
                  <option value="central">Tienda Central</option>
                  <option value="norte">Tienda Norte</option>
                </select>
                <select
                  value={filterTurno}
                  onChange={e => setFilterTurno(e.target.value)}
                  className="px-2.5 py-1.5 border-2 border-gray-200 dark:border-gray-700 rounded-lg text-xs bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 outline-none focus:border-gray-400"
                >
                  <option value="todos">Todos los turnos</option>
                  <option value="manana">Mañana (7-15h)</option>
                  <option value="tarde">Tarde (15-22h)</option>
                </select>
                <select
                  value={filterTrabajador}
                  onChange={e => setFilterTrabajador(e.target.value)}
                  className="px-2.5 py-1.5 border-2 border-gray-200 dark:border-gray-700 rounded-lg text-xs bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 outline-none focus:border-gray-400"
                >
                  <option value="todos">Todos los trabajadores</option>
                  {data.workers.map(w => (
                    <option key={w.nombre} value={w.nombre}>{w.nombre}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Real-time status + refresh */}
          <div className="flex items-center gap-3">
            {refreshing ? (
              <span className="flex items-center gap-1.5 text-[10px] text-gray-400 dark:text-gray-500">
                <RefreshCw className="w-3 h-3 animate-spin" /> Actualizando...
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-[10px] text-emerald-600">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                En vivo · {lastUpdate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-40"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* ═══ KPIs PRINCIPALES — 8 tarjetas ═══ */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KPICard
            title="Ventas hoy"
            value={formatEur(data.ventasHoy)}
            sub={`${data.ticketsHoy} tickets`}
            icon={<DollarSign className="w-4 h-4" />}
            iconBg="bg-emerald-100 dark:bg-emerald-900/40"
            iconColor="text-emerald-600"
            trend={{ value: liveSalesStats ? 'Datos TPV en vivo' : 'Cargando TPV…', up: null }}
            onClick={() => navigate('/saas/butcher-sales')}
          />
          <KPICard
            title="Ticket medio"
            value={formatEur(data.ticketMedio)}
            sub="Por operación"
            icon={<Receipt className="w-4 h-4" />}
            iconBg="bg-blue-100 dark:bg-blue-900/40"
            iconColor="text-blue-600"
            onClick={() => navigate('/saas/butcher-sales')}
          />
          <KPICard
            title="Merma del día"
            value={`${wasteToday.toFixed(1)} kg`}
            sub={`${liveWastePct.toFixed(1)}% mensual`}
            icon={<Trash2 className="w-4 h-4" />}
            iconBg={wasteToday > 2.5 ? 'bg-red-100 dark:bg-red-900/40' : 'bg-amber-100 dark:bg-amber-900/40'}
            iconColor={wasteToday > 2.5 ? 'text-red-600' : 'text-amber-600'}
            trend={wasteToday > 2.5 ? { value: 'Por encima del umbral', up: false } : { value: 'Dentro del rango', up: true }}
            onClick={() => navigate('/saas/butcher-waste')}
          />
          <KPICard
            title="Stock crítico"
            value={String(data.stockCritico)}
            sub={data.stockCritico > 0 ? 'Referencias catálogo Ops' : 'Todo en orden'}
            icon={<Package className="w-4 h-4" />}
            iconBg={data.stockCritico > 0 ? 'bg-red-100 dark:bg-red-900/40' : 'bg-gray-100 dark:bg-gray-700'}
            iconColor={data.stockCritico > 0 ? 'text-red-600' : 'text-gray-400'}
            trend={data.stockCritico > 0 ? { value: `${data.stockCritico} alertas`, up: false } : undefined}
            onClick={() => navigate('/saas/butcher-inventory')}
          />
          <KPICard
            title="Pedidos pendientes"
            value={String(data.pedidosPendientes)}
            sub={`${data.pedidosHoy} para hoy`}
            icon={<ClipboardList className="w-4 h-4" />}
            iconBg="bg-violet-100 dark:bg-violet-900/40"
            iconColor="text-violet-600"
            onClick={() => navigate('/saas/butcher-orders')}
          />
          <KPICard
            title="Equipo activo"
            value={String(data.trabajadoresActivos)}
            sub="Proveedores registrados (Ops)"
            icon={<UserCheck className="w-4 h-4" />}
            iconBg="bg-indigo-100 dark:bg-indigo-900/40"
            iconColor="text-indigo-600"
            onClick={() => navigate('/saas/clockins')}
          />
          <KPICard
            title="Caja actual"
            value={formatEur(data.cajaActual)}
            sub="Balance del día"
            icon={<Wallet className="w-4 h-4" />}
            iconBg={data.cajaActual >= 0 ? 'bg-cyan-100 dark:bg-cyan-900/40' : 'bg-red-100 dark:bg-red-900/40'}
            iconColor={data.cajaActual >= 0 ? 'text-cyan-600' : 'text-red-600'}
            onClick={() => navigate('/saas/finance')}
          />
          <KPICard
            title="Lotes por caducar"
            value={String(data.lotesProximosCaducar)}
            sub="En los próximos 3 días"
            icon={<ScanBarcode className="w-4 h-4" />}
            iconBg={data.lotesProximosCaducar > 0 ? 'bg-amber-100 dark:bg-amber-900/40' : 'bg-emerald-100 dark:bg-emerald-900/40'}
            iconColor={data.lotesProximosCaducar > 0 ? 'text-amber-600' : 'text-emerald-600'}
            trend={data.lotesProximosCaducar > 0 ? { value: 'Requiere atención', up: false } : undefined}
            onClick={() => navigate('/saas/butcher-traceability')}
          />
        </div>

        {/* ═══ ACCESOS RÁPIDOS ═══ */}
        <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-12 gap-2">
          {(role === 'gerente' ? quickAccess : workerQuickAccess).map(item => (
            <QuickAccessBtn key={item.route} {...item} />
          ))}
        </div>

        {/* ═══ CADUCIDAD → ACCIONES ═══ */}
        {expiringBatches.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-amber-200 dark:border-amber-800/60 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-amber-100 dark:border-amber-900/40">
              <div className="flex items-center gap-2">
                <Timer className="w-4 h-4 text-amber-600" />
                <p className="text-sm font-bold text-gray-900 dark:text-gray-100">Lotes por caducar</p>
                <span className="px-2 py-0.5 bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 text-[10px] font-bold rounded-full">
                  {expiringBatches.length}
                </span>
              </div>
              <button
                type="button"
                onClick={() => navigate('/saas/butcher-traceability')}
                className="text-[11px] font-bold text-amber-700 dark:text-amber-300 hover:underline inline-flex items-center gap-1"
              >
                Trazabilidad <ArrowRight className="w-3 h-3" />
              </button>
            </div>
            <div className="divide-y divide-amber-50 dark:divide-amber-900/30">
              {expiringBatches.map((batch) => {
                const days = Math.floor((new Date(String(batch.fechaCaducidad)).getTime() - Date.now()) / 86_400_000);
                const expired = days < 0;
                const busyRebajar = expiryBusy === `${batch._id}:rebajar`;
                const busyMerma = expiryBusy === `${batch._id}:merma`;
                return (
                  <div key={batch._id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                        {batch.producto || 'Producto'} · {batch.codigoLote || batch._id.slice(-8)}
                      </p>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">
                        Cad: {new Date(String(batch.fechaCaducidad)).toLocaleDateString('es-ES')} ·{' '}
                        {expired ? `Caducado hace ${Math.abs(days)} d` : `En ${days} d`} ·{' '}
                        {(batch.kgDisponibles || 0).toLocaleString('es-ES')} kg
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5 shrink-0">
                      <button
                        type="button"
                        disabled={!!expiryBusy}
                        onClick={() => { void handleExpiryMarkdown(batch); }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 disabled:opacity-50"
                      >
                        {busyRebajar ? <Loader2 className="w-3 h-3 animate-spin" /> : <Percent className="w-3 h-3" />}
                        Rebajar 20%
                      </button>
                      <button
                        type="button"
                        disabled={!!expiryBusy}
                        onClick={() => navigate(`/saas/vertical/carniceria/despiece?productId=${encodeURIComponent(batch.productoId || '')}&batchId=${encodeURIComponent(batch._id)}`)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800 disabled:opacity-50"
                      >
                        <Scissors className="w-3 h-3" />
                        Elaborados
                      </button>
                      <button
                        type="button"
                        disabled={!!expiryBusy}
                        onClick={() => { void handleExpiryWaste(batch); }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 disabled:opacity-50"
                      >
                        {busyMerma ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                        Merma
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ═══ ALERTAS INTELIGENTES ═══ */}
        {data.alerts.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
            <button
              onClick={() => setShowAlertPanel(!showAlertPanel)}
              className="w-full flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                <p className="text-sm font-bold text-gray-900 dark:text-gray-100">Alertas Carnicería</p>
                <span className="px-2 py-0.5 bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 text-[10px] font-bold rounded-full">
                  {data.alerts.length}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-400">
                  {criticalAlerts} críticas · {warningAlerts} avisos
                </span>
                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showAlertPanel ? 'rotate-180' : ''}`} />
              </div>
            </button>
            {showAlertPanel && (
              <div className="divide-y divide-gray-50 dark:divide-gray-800">
                {data.alerts.map(alert => {
                  const s = ALERT_STYLES[alert.severity];
                  return (
                    <div key={alert.id} className={`flex items-center justify-between px-4 py-3 border-l-4 ${s.border} ${s.bg}`}>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <AlertTriangle className={`w-4 h-4 flex-shrink-0 ${s.icon}`} />
                        <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">{alert.message}</p>
                      </div>
                      <button
                        onClick={() => navigate(alert.route)}
                        className={`flex-shrink-0 flex items-center gap-1 ml-3 text-[11px] font-bold ${s.text} hover:underline`}
                      >
                        Ver <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ═══ GRÁFICAS + RESUMEN OPERATIVO ═══ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Ventas por hora */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                <p className="text-sm font-bold text-gray-900 dark:text-gray-100">Ventas por hora (hoy)</p>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 rounded-full">
                {formatEur(data.ventasHoy)}
              </span>
            </div>
            <div className="p-4 h-48">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.hourlySales} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                  <defs>
                    <linearGradient id="butcherSalesGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#dc2626" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#dc2626" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.06)" />
                  <XAxis dataKey="hora" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const pt = payload[0].payload as HourlySale;
                      return (
                        <div className="bg-gray-900 text-white text-[10px] font-semibold px-2.5 py-1.5 rounded-lg shadow-lg">
                          <span className="opacity-60 mr-1">{pt.hora}</span>
                          {pt.importe} ops · {pt.tickets} tickets
                        </div>
                      );
                    }}
                  />
                  <Area type="monotone" dataKey="importe" stroke="#dc2626" strokeWidth={2} fill="url(#butcherSalesGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Merma semanal */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-2">
                <Trash2 className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                <p className="text-sm font-bold text-gray-900 dark:text-gray-100">Merma semanal (kg)</p>
              </div>
              <button
                onClick={() => navigate('/saas/butcher-waste')}
                className="flex items-center gap-1 text-xs font-semibold text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
              >
                Ver todo <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="p-4 h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={liveWeeklyWaste} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.06)" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const pt = payload[0].payload as DailyWaste;
                      return (
                        <div className="bg-gray-900 text-white text-[10px] font-semibold px-2.5 py-1.5 rounded-lg shadow-lg">
                          <span className="opacity-60 mr-1">{pt.dia}</span>
                          {pt.kg} kg
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="kg" radius={[4, 4, 0, 0]} maxBarSize={28}>
                    {liveWeeklyWaste.map((d, idx) => (
                      <Cell key={idx} fill={d.kg > 3 ? '#ef4444' : d.kg > 2 ? '#f59e0b' : '#10b981'} fillOpacity={0.85} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* ═══ DESGLOSE CAJA + STOCK CRÍTICO ═══ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Desglose de caja */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-2">
                <Euro className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                <p className="text-sm font-bold text-gray-900 dark:text-gray-100">Desglose de caja</p>
              </div>
            </div>
            <div className="p-5 space-y-3">
              <div className="flex items-center justify-between p-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-emerald-500" />
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Efectivo</span>
                </div>
                <span className="text-sm font-black text-emerald-700 dark:text-emerald-400">{formatEur(data.ingresosEfectivo)}</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-950/30 rounded-xl">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-500" />
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Tarjeta</span>
                </div>
                <span className="text-sm font-black text-blue-700 dark:text-blue-400">{formatEur(data.ingresosTarjeta)}</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-violet-50 dark:bg-violet-950/30 rounded-xl">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-violet-500" />
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Bizum</span>
                </div>
                <span className="text-sm font-black text-violet-700 dark:text-violet-400">{formatEur(data.ingresosBizum)}</span>
              </div>
              <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-800">
                <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Total caja</span>
                <span className="text-lg font-black text-gray-900 dark:text-gray-100">{formatEur(data.cajaActual)}</span>
              </div>
            </div>
          </div>

          {/* Stock crítico */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                <p className="text-sm font-bold text-gray-900 dark:text-gray-100">Stock crítico</p>
                <span className="px-2 py-0.5 bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 text-[10px] font-bold rounded-full">
                  {data.stockCriticoItems.length}
                </span>
              </div>
              <button
                onClick={() => navigate('/saas/butcher-products')}
                className="flex items-center gap-1 text-xs font-semibold text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
              >
                Ver productos <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="divide-y divide-gray-50 dark:divide-gray-800">
              {data.stockCriticoItems.length === 0 ? (
                <p className="px-5 py-6 text-center text-xs text-gray-400">Sin productos recientes en Ops (CouchDB)</p>
              ) : data.stockCriticoItems.map((item, i) => (
                <div key={i} className="flex items-center justify-between px-5 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${item.stock === 0 ? 'bg-red-500' : 'bg-amber-500'}`} />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate">{item.nombre}</p>
                      <p className="text-[10px] text-gray-400">Mín: {item.minimo} {item.unidad}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-black ${item.stock === 0 ? 'text-red-600' : 'text-amber-600'}`}>
                      {item.stock} {item.unidad}
                    </span>
                    {item.stock === 0 && (
                      <span className="px-1.5 py-0.5 bg-red-100 dark:bg-red-900/40 text-red-700 text-[9px] font-bold rounded-full">
                        AGOTADO
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ═══ ÚLTIMAS VENTAS + ÚLTIMOS PEDIDOS ═══ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Últimas ventas */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                <p className="text-sm font-bold text-gray-900 dark:text-gray-100">Últimas ventas</p>
              </div>
              <button
                onClick={() => navigate('/saas/butcher-sales')}
                className="flex items-center gap-1 text-xs font-semibold text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
              >
                Ver todas <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="divide-y divide-gray-50 dark:divide-gray-800">
              {data.ultimasVentas.length === 0 ? (
                <p className="px-5 py-6 text-center text-xs text-gray-400">Sin tickets bt_ticket recientes (Ops)</p>
              ) : data.ultimasVentas.map((v, i) => (
                <div key={i} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-mono font-semibold text-gray-900 dark:text-gray-100">{v.ticket}</p>
                      <span className="text-[10px] text-gray-400">{v.hora}</span>
                    </div>
                    <p className="text-[10px] text-gray-500 truncate mt-0.5">{v.productos}</p>
                  </div>
                  <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 ml-3">{v.total > 0 ? formatEur(v.total) : '—'}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Últimos pedidos */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                <p className="text-sm font-bold text-gray-900 dark:text-gray-100">Pedidos del día</p>
              </div>
              <button
                onClick={() => navigate('/saas/butcher-orders')}
                className="flex items-center gap-1 text-xs font-semibold text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
              >
                Ver todos <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="divide-y divide-gray-50 dark:divide-gray-800">
              {data.ultimosPedidos.length === 0 ? (
                <p className="px-5 py-6 text-center text-xs text-gray-400">Sin pedidos para hoy</p>
              ) : data.ultimosPedidos.map((p, i) => {
                const statusCfg = ORDER_STATUS_CFG[p.estado];
                return (
                  <div key={i} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-semibold text-gray-900 dark:text-gray-100">{p.cliente}</p>
                        <span className="text-[10px] font-mono text-gray-400">{p.numero}</span>
                      </div>
                      <p className="text-[10px] text-gray-500 truncate mt-0.5">{p.productos}</p>
                    </div>
                    <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                      <span className="text-[10px] text-gray-400">{p.entrega}</span>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${statusCfg.bg} ${statusCfg.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot}`} />
                        {statusCfg.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ═══ RENDIMIENTO POR TRABAJADOR (solo gerente) ═══ */}
        {role === 'gerente' && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                <p className="text-sm font-bold text-gray-900 dark:text-gray-100">Rendimiento por trabajador</p>
                <span className="text-[10px] font-bold px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 rounded-full">
                  Hoy
                </span>
              </div>
              <button
                onClick={() => navigate('/saas/team')}
                className="flex items-center gap-1 text-xs font-semibold text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
              >
                Ver equipo <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                    <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Trabajador</th>
                    <th className="text-center px-3 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Entrada</th>
                    <th className="text-center px-3 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Tickets</th>
                    <th className="text-right px-3 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Ingresos</th>
                    <th className="text-right px-3 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Merma</th>
                    <th className="text-right px-5 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Rendimiento</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                  {data.workers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-8 text-center text-xs text-gray-400">
                        Sin actividad de tickets agrupada (Ops).
                      </td>
                    </tr>
                  ) : data.workers.map(w => {
                    const rendimiento = w.ticketsHoy > 10 ? 'alto' : w.ticketsHoy > 3 ? 'medio' : 'bajo';
                    return (
                      <tr key={w.nombre} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-400 to-red-600 flex items-center justify-center text-white text-xs font-bold">
                              {w.avatar}
                            </div>
                            <span className="font-semibold text-gray-900 dark:text-gray-100">{w.nombre}</span>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className="text-xs text-gray-600 dark:text-gray-400">{w.horaEntrada}</span>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className="text-xs font-bold text-gray-900 dark:text-gray-100">{w.ticketsHoy}</span>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <span className="text-xs font-bold text-emerald-600">{formatEur(w.ingresosHoy)}</span>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <span className={`text-xs font-bold ${w.mermaKg > 1 ? 'text-amber-600' : 'text-gray-500'}`}>{w.mermaKg} kg</span>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            rendimiento === 'alto'
                              ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
                              : rendimiento === 'medio'
                              ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
                              : 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'
                          }`}>
                            {rendimiento === 'alto' ? <TrendingUp className="w-3 h-3" /> : rendimiento === 'medio' ? <Minus className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                            {rendimiento.charAt(0).toUpperCase() + rendimiento.slice(1)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ═══ VISTA TRABAJADOR: RESUMEN SIMPLIFICADO ═══ */}
        {role === 'trabajador' && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-500" />
                <p className="text-sm font-bold text-gray-900 dark:text-gray-100">Tu jornada de hoy</p>
              </div>
            </div>
            <div className="p-5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                <div className="bg-red-50 dark:bg-red-950/30 rounded-xl p-3 text-center">
                  <p className="text-xl font-black text-red-700 dark:text-red-400">{workerSelf?.ticketsHoy ?? 0}</p>
                  <p className="text-[10px] font-semibold text-red-600 dark:text-red-500 uppercase">Tickets</p>
                </div>
                <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-xl p-3 text-center">
                  <p className="text-xl font-black text-emerald-700 dark:text-emerald-400">{formatEur(workerSelf?.ingresosHoy ?? 0)}</p>
                  <p className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-500 uppercase">Ingresos</p>
                </div>
                <div className="bg-amber-50 dark:bg-amber-950/30 rounded-xl p-3 text-center">
                  <p className="text-xl font-black text-amber-700 dark:text-amber-400">{workerSelf?.mermaKg ?? 0} kg</p>
                  <p className="text-[10px] font-semibold text-amber-600 dark:text-amber-500 uppercase">Merma</p>
                </div>
                <div className="bg-blue-50 dark:bg-blue-950/30 rounded-xl p-3 text-center">
                  <p className="text-xl font-black text-blue-700 dark:text-blue-400">{workerSelf?.horaEntrada ?? '—'}</p>
                  <p className="text-[10px] font-semibold text-blue-600 dark:text-blue-500 uppercase">Entrada</p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Pedidos para preparar</p>
                {data.ultimosPedidos.filter(p => p.estado !== 'listo').map((p, i) => {
                  const cfg = ORDER_STATUS_CFG[p.estado as keyof typeof ORDER_STATUS_CFG];
                  return (
                    <div key={i} className="flex items-center justify-between p-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-gray-900 dark:text-gray-100">{p.cliente} — {p.numero}</p>
                        <p className="text-[10px] text-gray-500 truncate">{p.productos}</p>
                      </div>
                      <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                        <span className="text-[10px] text-gray-400">{p.entrega}</span>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${cfg.bg} ${cfg.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                          {cfg.label}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── Widget: Encargos y Clientes (datos reales) ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-blue-500" /> Encargos hoy
              </h3>
              <button onClick={() => navigate('/saas/butcher-orders')} className="text-xs text-blue-600 hover:text-blue-700 font-medium">Ver todos →</button>
            </div>
            {liveOrders.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">Sin encargos para hoy</p>
            ) : (
              <div className="space-y-2">
                {liveOrders.slice(0, 5).map((o) => (
                  <div key={o._id} className="flex items-center justify-between text-sm py-1.5 border-b border-gray-50 dark:border-gray-700/30 last:border-0">
                    <div className="min-w-0">
                      <span className="font-mono text-xs font-bold text-gray-700 dark:text-gray-300">{o.orderNumber}</span>
                      <span className="text-gray-500 ml-1.5">{o.clientName || 'Anónimo'}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {o.pickupTime && <span className="text-xs text-gray-400">{o.pickupTime}</span>}
                      <span className={`w-2 h-2 rounded-full ${o.status === 'ready' ? 'bg-emerald-500' : o.status === 'preparing' ? 'bg-blue-500' : 'bg-amber-500'}`} />
                    </div>
                  </div>
                ))}
                {liveOrders.length > 5 && <p className="text-xs text-gray-400 text-center pt-1">+{liveOrders.length - 5} más</p>}
              </div>
            )}
            <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-100 dark:border-gray-700/50 text-xs text-gray-500">
              <span>Pendientes: {liveOrders.filter((o) => o.status === 'pending').length}</span>
              <span>Preparando: {liveOrders.filter((o) => o.status === 'preparing').length}</span>
              <span>Listos: {liveOrders.filter((o) => o.status === 'ready').length}</span>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Receipt className="w-4 h-4 text-emerald-500" /> Ventas (datos reales)
              </h3>
              <button onClick={() => navigate('/saas/butcher-sales')} className="text-xs text-blue-600 hover:text-blue-700 font-medium">Ver todas →</button>
            </div>
            {liveSalesStats ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-3">
                    <p className="text-lg font-bold text-gray-900 dark:text-white">{liveSalesStats.today.revenue.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</p>
                    <p className="text-xs text-gray-500">Hoy ({liveSalesStats.today.count} ventas)</p>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-3">
                    <p className="text-lg font-bold text-gray-900 dark:text-white">{liveSalesStats.month.revenue.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</p>
                    <p className="text-xs text-gray-500">Este mes ({liveSalesStats.month.count})</p>
                  </div>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-3 text-center">
                  <p className="text-base font-bold text-gray-900 dark:text-white">{liveSalesStats.avgTicket.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</p>
                  <p className="text-xs text-gray-500">Ticket medio</p>
                </div>
                {liveSalesStats.topProducts.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Top productos</p>
                    {liveSalesStats.topProducts.slice(0, 3).map((p, i) => (
                      <div key={i} className="flex justify-between text-xs py-0.5">
                        <span className="text-gray-600 dark:text-gray-400 truncate">{p.name}</span>
                        <span className="text-gray-900 dark:text-white font-medium shrink-0 ml-2">{p.revenue.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-400 text-center py-4">Cargando...</p>
            )}
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Users className="w-4 h-4 text-purple-500" /> Clientes
              </h3>
              <button onClick={() => navigate('/saas/butcher-clients')} className="text-xs text-blue-600 hover:text-blue-700 font-medium">Gestionar →</button>
            </div>
            <div className="text-center py-4">
              <p className="text-4xl font-black text-gray-900 dark:text-white">{liveClientCount}</p>
              <p className="text-sm text-gray-500 mt-1">clientes registrados</p>
            </div>
            <button onClick={() => navigate('/saas/butcher-clients')} className="w-full mt-3 px-4 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-semibold hover:opacity-90 transition">
              Nuevo cliente
            </button>
          </div>
        </div>

      </div>
      )}
    </Layout>
  );
}
