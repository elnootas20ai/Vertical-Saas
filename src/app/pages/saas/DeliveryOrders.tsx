import { useState, useEffect, useMemo, useCallback } from 'react';
import { toast } from 'sonner';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { resolveBusinessDataUserId } from '../../lib/tenantUserId';
// SSE events are emitted by the backend (delivery_order_created, etc.)
// and handled globally; auto-refresh provides real-time updates
import {
  filterDeliveryOrdersRequest,
  createDeliveryOrderRequest,
  updateDeliveryOrderRequest,
  cancelDeliveryOrderRequest,
  reopenDeliveryOrderRequest,
  registerPaymentRequest,
  listCatalogItemsRequest,
  listPointsOfSaleRequest,
  type DeliveryOrder,
  type DeliveryOrderStatus,
  type DeliveryChannel,
  type DeliveryType,
  type CatalogItem,
  type PointOfSale,
} from '../../lib/deliveryApi';
import { OrderDetailDrawer } from '../../components/delivery/OrderDetailDrawer';
import { CancelOrderModal } from '../../components/delivery/CancelOrderModal';
import { ReopenOrderModal } from '../../components/delivery/ReopenOrderModal';
import { CreateOrderWizard } from '../../components/delivery/CreateOrderWizard';
import { DeliveryAlertsBar, type DeliveryAlert } from '../../components/delivery/DeliveryAlertsBar';
import {
  Plus, Search, X, Clock, ChefHat, Package, CheckCircle2, AlertTriangle,
  Phone, MapPin, ArrowRight, Filter, RefreshCw, Truck, ShoppingBag,
  Store, CreditCard, Banknote, XCircle,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<DeliveryOrderStatus, { label: string; badge: string; icon: typeof Clock }> = {
  nuevo:      { label: 'Nuevo',      badge: 'bg-amber-100 text-amber-700 border-amber-200',   icon: Clock },
  cocina:     { label: 'Cocina',     badge: 'bg-orange-100 text-orange-700 border-orange-200', icon: ChefHat },
  listo:      { label: 'Montaje',    badge: 'bg-indigo-100 text-indigo-700 border-indigo-200', icon: Package },
  en_reparto: { label: 'En reparto', badge: 'bg-cyan-100 text-cyan-700 border-cyan-200',       icon: Truck },
  entregado:  { label: 'Entregado',  badge: 'bg-green-100 text-green-700 border-green-200',   icon: CheckCircle2 },
  cancelled:  { label: 'Cancelado',  badge: 'bg-gray-100 text-gray-500 border-gray-200 dark:bg-gray-700 dark:text-gray-400', icon: XCircle },
  incident:   { label: 'Incidencia', badge: 'bg-red-100 text-red-700 border-red-200',         icon: AlertTriangle },
};

const CHANNEL_CONFIG: Record<string, { label: string; badge: string }> = {
  direct:   { label: 'Directo',    badge: 'bg-gray-100 text-gray-600' },
  phone:    { label: 'Teléfono',   badge: 'bg-blue-100 text-blue-600' },
  web:      { label: 'Web',        badge: 'bg-purple-100 text-purple-600' },
  app:      { label: 'App',        badge: 'bg-teal-100 text-teal-600' },
  tpv:      { label: 'TPV',        badge: 'bg-slate-100 text-slate-700' },
  glovo:    { label: 'Glovo',      badge: 'bg-yellow-100 text-yellow-700' },
  justeat:  { label: 'Just Eat',   badge: 'bg-orange-100 text-orange-700' },
  ubereats: { label: 'Uber Eats',  badge: 'bg-green-100 text-green-700' },
};

const DELIVERY_TYPE_LABELS: Record<string, { label: string; icon: typeof Truck }> = {
  domicilio: { label: 'Domicilio', icon: Truck },
  recogida:  { label: 'Recogida',  icon: ShoppingBag },
  sala:      { label: 'Sala',      icon: Store },
};

const PAYMENT_LABELS: Record<string, string> = {
  efectivo: 'Efectivo', tarjeta: 'Tarjeta', bizum: 'Bizum',
  online: 'Online', plataforma: 'Plataforma',
};

// Flujo: nuevo → cocina → listo (montaje) → en_reparto → entregado.
// El paso intermedio "en_reparto" nos permite medir cuánto tarda el repartidor
// (deliveredAt - departedAt) y mostrar al gerente qué pedidos están de camino.
const NEXT_STATUS: Partial<Record<DeliveryOrderStatus, DeliveryOrderStatus>> = {
  nuevo: 'cocina', cocina: 'listo', listo: 'en_reparto', en_reparto: 'entregado',
};

function extractBrandIds(order: DeliveryOrder): string[] {
  const raw = (order.items || []).flatMap((it) => Array.isArray((it as any).brandIds) ? (it as any).brandIds : []);
  return Array.from(new Set(raw.map((s) => String(s || '').trim()).filter(Boolean))).slice(0, 4);
}

function timeSince(dateStr: string): string {
  if (!dateStr) return '—';
  const ms = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m`;
  return `${Math.floor(hours / 24)}d`;
}

function formatTime(dateStr: string) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

// ─── Filters ─────────────────────────────────────────────────────────────────

interface Filters {
  channel: string;
  salesPointId: string;
  status: string;
  dateFrom: string;
  dateTo: string;
  deliveryType: string;
  search: string;
}

const EMPTY_FILTERS: Filters = { channel: '', salesPointId: '', status: '', dateFrom: '', dateTo: '', deliveryType: '', search: '' };

// ─── Component ───────────────────────────────────────────────────────────────

export function DeliveryOrders() {
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const userId = resolveBusinessDataUserId(user, currentBusiness);
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [pointsOfSale, setPointsOfSale] = useState<PointOfSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<DeliveryOrder | null>(null);
  const [cancelOrder, setCancelOrder] = useState<DeliveryOrder | null>(null);
  const [reopenOrder, setReopenOrder] = useState<DeliveryOrder | null>(null);
  const [paymentOrder, setPaymentOrder] = useState<DeliveryOrder | null>(null);
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState(false);
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string>(() => new Date().toISOString().slice(0, 10)); // YYYY-MM-DD

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'client', label: 'Cliente' },
    { key: 'address', label: 'Dirección' },
    { key: 'items', label: 'Artículos' },
    { key: 'total', label: 'Total' },
    { key: 'notes', label: 'Notas' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'client', label: 'Cliente', example: '' },
    { key: 'address', label: 'Dirección', example: '' },
    { key: 'items', label: 'Artículos', example: '' },
    { key: 'total', label: 'Total', example: '' },
    { key: 'notes', label: 'Notas', example: '' },
  ];

  const handleAIEntries = async (entries: Record<string, unknown>[]) => {
    toast.success(`${entries.length} pedido(s) parseado(s) con IA`);
  };

  const handleImportEntries = async (entries: Record<string, string>[]) => {
    toast.success(`${entries.length} pedido(s) importado(s)`);
  };

  // TODO: replace with real permission check from account
  const canCreate = true;
  const canCancel = true;
  const canReopen = true;
  const canOperate = true;
  const canPayment = true;

  const loadData = useCallback(async () => {
    if (!userId) return;
    try {
      const dateFrom = `${selectedDay}T00:00:00.000Z`;
      const dateTo = `${selectedDay}T23:59:59.999Z`;
      const [ordersData, catalogData, pdvData] = await Promise.all([
        filterDeliveryOrdersRequest(userId, { dateFrom, dateTo, limit: 500 }),
        listCatalogItemsRequest(userId, 'catalog'),
        listPointsOfSaleRequest(userId),
      ]);
      setOrders(ordersData.orders);
      setCatalogItems(catalogData);
      setPointsOfSale(pdvData);
    } catch {
      toast.error('Error al cargar pedidos');
    } finally {
      setLoading(false);
    }
  }, [userId, selectedDay]);

  useEffect(() => { loadData(); }, [loadData]);

  // Auto-refresh every 30s
  useEffect(() => {
    const interval = setInterval(() => { if (!loading) loadData(); }, 30_000);
    return () => clearInterval(interval);
  }, [loadData, loading]);

  // ─── Actions ─────────────────────────────────────────────────────────────

  const handleCreate = async (data: Partial<DeliveryOrder>) => {
    if (!userId) return;
    try {
      const created = await createDeliveryOrderRequest(userId, data);
      setOrders((prev) => [created, ...prev]);
      setShowCreate(false);
      toast.success(`Pedido ${created.orderNumber} creado`);
    } catch {
      toast.error('Error al crear el pedido');
    }
  };

  const handleAdvanceStatus = async (order: DeliveryOrder) => {
    if (!userId) return;
    const next = NEXT_STATUS[order.status];
    if (!next) return;
    try {
      const now = new Date().toISOString();
      const extras: Partial<DeliveryOrder> = {};
      if (next === 'cocina') extras.kitchenStartedAt = now;
      if (next === 'listo') { extras.kitchenCompletedAt = now; extras.assemblyStartedAt = now; }
      // En reparto: cerramos montaje y marcamos la salida del repartidor.
      if (next === 'en_reparto') { extras.assemblyCompletedAt = now; extras.departedAt = now; }
      // Entregado: solo marcamos la llegada. assemblyCompletedAt y departedAt
      // ya están fijados desde "en_reparto"; el backend también los garantiza
      // si por cualquier motivo se salta el paso intermedio (recogida en local).
      if (next === 'entregado') { extras.deliveredAt = now; }
      const updated = await updateDeliveryOrderRequest(userId, {
        ...order, ...extras, status: next,
        stageHistory: [...(order.stageHistory || []), { status: next, date: now, user: user.fullName || 'Sistema' }],
      });
      setOrders((prev) => prev.map((o) => o._id === updated._id ? updated : o));
      if (selectedOrder?._id === updated._id) setSelectedOrder(updated);
      toast.success(`Estado: ${STATUS_CONFIG[next].label}`);
    } catch {
      toast.error('Error al cambiar estado');
    }
  };

  const handleCancel = async (reason: string) => {
    if (!userId || !cancelOrder) return;
    setActionLoading(true);
    try {
      const updated = await cancelDeliveryOrderRequest(userId, cancelOrder._id, reason);
      setOrders((prev) => prev.map((o) => o._id === updated._id ? updated : o));
      setCancelOrder(null);
      if (selectedOrder?._id === updated._id) setSelectedOrder(updated);
      toast.success('Pedido cancelado');
    } catch {
      toast.error('Error al cancelar');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReopen = async (notes: string) => {
    if (!userId || !reopenOrder) return;
    setActionLoading(true);
    try {
      const updated = await reopenDeliveryOrderRequest(userId, reopenOrder._id, notes);
      setOrders((prev) => prev.map((o) => o._id === updated._id ? updated : o));
      setReopenOrder(null);
      if (selectedOrder?._id === updated._id) setSelectedOrder(updated);
      toast.success('Pedido reabierto');
    } catch {
      toast.error('Error al reabrir');
    } finally {
      setActionLoading(false);
    }
  };

  const handlePayment = async (method: string) => {
    if (!userId || !paymentOrder) return;
    setActionLoading(true);
    try {
      const updated = await registerPaymentRequest(userId, paymentOrder._id, method, paymentOrder.totalAmount - paymentOrder.paidAmount);
      setOrders((prev) => prev.map((o) => o._id === updated._id ? updated : o));
      setPaymentOrder(null);
      if (selectedOrder?._id === updated._id) setSelectedOrder(updated);
      toast.success(`Cobro registrado: ${PAYMENT_LABELS[method] || method}`);
    } catch {
      toast.error('Error al registrar cobro');
    } finally {
      setActionLoading(false);
    }
  };

  // ─── Filtered + sorted orders ────────────────────────────────────────────

  const filtered = useMemo(() => {
    let result = [...orders];
    if (filters.channel) result = result.filter((o) => o.channel === filters.channel);
    if (filters.salesPointId) result = result.filter((o) => o.salesPointId === filters.salesPointId);
    if (filters.status) result = result.filter((o) => o.status === filters.status);
    if (filters.deliveryType) result = result.filter((o) => o.deliveryType === filters.deliveryType);
    if (filters.dateFrom) result = result.filter((o) => o.createdAt >= filters.dateFrom);
    if (filters.dateTo) result = result.filter((o) => o.createdAt <= filters.dateTo);
    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter((o) =>
        o.orderNumber?.toLowerCase().includes(q) ||
        o.customerName?.toLowerCase().includes(q) ||
        o.customerPhone?.toLowerCase().includes(q) ||
        o.customerAddress?.toLowerCase().includes(q)
      );
    }
    result.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    return result;
  }, [orders, filters]);

  // ─── KPIs ────────────────────────────────────────────────────────────────

  const kpis = useMemo(() => ({
    nuevo:      filtered.filter((o) => o.status === 'nuevo').length,
    cocina:     filtered.filter((o) => o.status === 'cocina').length,
    listo:      filtered.filter((o) => o.status === 'listo').length,
    en_reparto: filtered.filter((o) => o.status === 'en_reparto').length,
    entregado:  filtered.filter((o) => o.status === 'entregado').length,
    cancelled:  filtered.filter((o) => o.status === 'cancelled').length,
    total:      filtered.length,
  }), [filtered]);

  // ─── Alerts ──────────────────────────────────────────────────────────────

  const alerts = useMemo((): DeliveryAlert[] => {
    const result: DeliveryAlert[] = [];
    const now = Date.now();
    const unattended = filtered.filter((o) => o.status === 'nuevo' && (now - new Date(o.createdAt).getTime()) > 5 * 60000);
    if (unattended.length > 0) {
      result.push({ id: 'unattended', level: 'warning', title: `${unattended.length} pedido${unattended.length > 1 ? 's' : ''} sin atender`,
        message: `Pedidos nuevos esperando más de 5 minutos`, action: { label: 'Ver', onClick: () => setFilters((f) => ({ ...f, status: 'nuevo' })) } });
    }
    const unpaid = filtered.filter((o) => o.status === 'entregado' && o.paymentStatus !== 'paid');
    if (unpaid.length > 0) {
      result.push({ id: 'unpaid', level: 'warning', title: `${unpaid.length} pedido${unpaid.length > 1 ? 's' : ''} sin cobrar`,
        message: `Pedidos entregados pendientes de cobro`, action: { label: 'Ver', onClick: () => setFilters((f) => ({ ...f, status: 'entregado' })) } });
    }
    const noAddr = filtered.filter((o) => o.deliveryType === 'domicilio' && !o.customerAddress?.trim() && !['cancelled', 'entregado'].includes(o.status));
    if (noAddr.length > 0) {
      result.push({ id: 'noaddr', level: 'critical', title: `${noAddr.length} pedido${noAddr.length > 1 ? 's' : ''} a domicilio sin dirección`,
        message: `Pedidos marcados como domicilio sin dirección de entrega` });
    }
    return result.filter((a) => !dismissedAlerts.has(a.id));
  }, [filtered, dismissedAlerts]);

  const hasActiveFilters = Object.values(filters).some((v) => v !== '');

  const selectCls = 'px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-gray-900 dark:focus:border-gray-100 focus:outline-none';

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <Layout title="Pedidos" subtitle="Gestión omnicanal de pedidos">
      <div className="space-y-5">
        {/* Alerts */}
        <DeliveryAlertsBar alerts={alerts} onDismiss={(id) => setDismissedAlerts((prev) => new Set(prev).add(id))} />

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
          {([
            { key: 'nuevo',      label: 'Nuevos',     color: 'amber',  icon: Clock },
            { key: 'cocina',     label: 'En cocina',  color: 'orange', icon: ChefHat },
            { key: 'listo',      label: 'En montaje', color: 'indigo', icon: Package },
            { key: 'en_reparto', label: 'En reparto', color: 'cyan',   icon: Truck },
            { key: 'entregado',  label: 'Entregados', color: 'green',  icon: CheckCircle2 },
            { key: 'cancelled',  label: 'Cancelados', color: 'gray',   icon: XCircle },
            { key: 'total',      label: 'Total',      color: 'blue',   icon: ShoppingBag },
          ] as const).map(({ key, label, color, icon: Icon }) => (
            <button key={key} onClick={() => key !== 'total' ? setFilters((f) => ({ ...EMPTY_FILTERS, status: key === 'total' ? '' : key })) : setFilters(EMPTY_FILTERS)}
              className={`p-4 bg-${color}-50 dark:bg-${color}-900/20 border-2 border-${color}-200 dark:border-${color}-800 rounded-xl text-left hover:shadow-md transition-shadow`}>
              <div className={`text-${color}-600 dark:text-${color}-400 mb-1`}><Icon className="w-5 h-5" /></div>
              <div className={`text-2xl font-bold text-${color}-900 dark:text-${color}-100`}>{kpis[key]}</div>
              <div className={`text-xs text-${color}-600 dark:text-${color}-400 mt-0.5`}>{label}</div>
            </button>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={selectedDay}
              onChange={(e) => setSelectedDay(e.target.value)}
              className="px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-gray-900 dark:focus:border-gray-100 focus:outline-none"
              title="Día de operativa / historial"
            />
            <button
              onClick={() => setSelectedDay(new Date().toISOString().slice(0, 10))}
              className="px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Hoy
            </button>
          </div>
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={filters.search} onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              className="w-full pl-9 pr-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-gray-900 dark:focus:border-gray-100 focus:outline-none"
              placeholder="Buscar por nº, cliente, teléfono, dirección..." />
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowFilters(!showFilters)}
              className={`px-4 py-2.5 border-2 rounded-xl text-sm font-medium flex items-center gap-2 transition-colors ${showFilters ? 'border-gray-900 dark:border-gray-100 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
              <Filter className="w-4 h-4" /> Filtros
              {hasActiveFilters && <span className="w-2 h-2 bg-amber-500 rounded-full" />}
            </button>
            <button onClick={loadData} className="p-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800">
              <RefreshCw className={`w-4 h-4 text-gray-400 ${loading ? 'animate-spin' : ''}`} />
            </button>
            {canCreate && (
              <AddButtonDropdown
                label="Nuevo pedido"
                onQuickAdd={() => setShowCreate(true)}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de pedido"
              />
            )}
          </div>
        </div>

        {/* Filters panel */}
        {showFilters && (
          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 flex flex-wrap gap-3 items-end animate-in slide-in-from-top-2">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Canal</label>
              <select value={filters.channel} onChange={(e) => setFilters((f) => ({ ...f, channel: e.target.value }))} className={selectCls}>
                <option value="">Todos</option>
                {Object.entries(CHANNEL_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">PDV</label>
              <select value={filters.salesPointId} onChange={(e) => setFilters((f) => ({ ...f, salesPointId: e.target.value }))} className={selectCls}>
                <option value="">Todos</option>
                {pointsOfSale.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Estado</label>
              <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))} className={selectCls}>
                <option value="">Todos</option>
                {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Tipo entrega</label>
              <select value={filters.deliveryType} onChange={(e) => setFilters((f) => ({ ...f, deliveryType: e.target.value }))} className={selectCls}>
                <option value="">Todos</option>
                {Object.entries(DELIVERY_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Desde</label>
              <input type="date" value={filters.dateFrom} onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))} className={selectCls} />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Hasta</label>
              <input type="date" value={filters.dateTo} onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))} className={selectCls} />
            </div>
            {hasActiveFilters && (
              <button onClick={() => setFilters(EMPTY_FILTERS)} className="px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl font-medium flex items-center gap-1">
                <X className="w-3.5 h-3.5" /> Limpiar
              </button>
            )}
          </div>
        )}

        {/* Table */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border-2 border-gray-100 dark:border-gray-800 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-gray-500">
              <div className="animate-spin w-6 h-6 border-2 border-gray-300 border-t-gray-900 rounded-full mr-3" /> Cargando pedidos...
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <ShoppingBag className="w-12 h-12 mb-3" />
              <p className="font-semibold text-gray-600 dark:text-gray-300">{hasActiveFilters ? 'Sin resultados para estos filtros' : 'No hay pedidos'}</p>
              <p className="text-sm mt-1">{hasActiveFilters ? 'Prueba ajustando los filtros' : 'Los pedidos aparecerán aquí'}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px]">
                <thead>
                  <tr className="border-b-2 border-gray-100 dark:border-gray-800">
                    {['Nº / Canal', 'Cliente', 'Teléfono', 'Dirección', 'Productos', 'Pago', 'Hora', 'PDV', 'Estado', ''].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((order) => {
                    const statusCfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.nuevo;
                    const channelCfg = CHANNEL_CONFIG[order.channel] || CHANNEL_CONFIG.direct;
                    const StatusIcon = statusCfg.icon;
                    const isUrgent = order.status === 'nuevo' && (Date.now() - new Date(order.createdAt).getTime()) > 5 * 60000;
                    const dtCfg = DELIVERY_TYPE_LABELS[order.deliveryType];
                    const nextStatus = NEXT_STATUS[order.status];

                    return (
                      <tr key={order._id}
                        onClick={() => setSelectedOrder(order)}
                        className={`border-b border-gray-50 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors ${isUrgent ? 'bg-amber-50/50 dark:bg-amber-900/10' : ''}`}>
                        {/* Nº / Canal */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-gray-900 dark:text-gray-100">{order.orderNumber}</span>
                            {isUrgent && <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" title="Sin atender" />}
                          </div>
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${channelCfg.badge}`}>{channelCfg.label}</span>
                            {dtCfg && <span className="text-[10px] text-gray-400">{dtCfg.label}</span>}
                          </div>
                        </td>

                        {/* Cliente */}
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate max-w-[140px]">{order.customerName || '—'}</p>
                        </td>

                        {/* Teléfono */}
                        <td className="px-4 py-3">
                          {order.customerPhone ? (
                            <a href={`tel:${order.customerPhone}`} onClick={(e) => e.stopPropagation()}
                              className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1">
                              <Phone className="w-3.5 h-3.5" /> {order.customerPhone}
                            </a>
                          ) : <span className="text-sm text-gray-300">—</span>}
                        </td>

                        {/* Dirección */}
                        <td className="px-4 py-3">
                          {order.deliveryType === 'domicilio' ? (
                            order.customerAddress ? (
                              <p className="text-sm text-gray-600 dark:text-gray-400 truncate max-w-[160px] flex items-center gap-1" title={order.customerAddress}>
                                <MapPin className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" /> {order.customerAddress}
                              </p>
                            ) : <span className="text-xs text-red-500 font-medium">Sin dirección</span>
                          ) : <span className="text-sm text-gray-300">—</span>}
                        </td>

                        {/* Productos */}
                        <td className="px-4 py-3">
                          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{order.totalAmount.toFixed(2)}€</p>
                          <p className="text-[10px] text-gray-400">{order.items.length} prod.</p>
                          {extractBrandIds(order).length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {extractBrandIds(order).map((b) => (
                                <span
                                  key={b}
                                  className="px-1.5 py-0.5 rounded-md bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 text-[10px] font-bold border border-violet-200 dark:border-violet-800"
                                  title="Marca (deducida del catálogo)"
                                >
                                  {b}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>

                        {/* Pago */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            {order.paymentMethod && <span className="text-xs text-gray-500">{PAYMENT_LABELS[order.paymentMethod] || order.paymentMethod}</span>}
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                              order.paymentStatus === 'paid' ? 'bg-green-100 text-green-700' :
                              order.paymentStatus === 'partial' ? 'bg-amber-100 text-amber-700' :
                              'bg-red-100 text-red-600'
                            }`}>
                              {order.paymentStatus === 'paid' ? '✓' : order.paymentStatus === 'partial' ? '~' : '✕'}
                            </span>
                          </div>
                        </td>

                        {/* Hora */}
                        <td className="px-4 py-3">
                          <p className="text-sm text-gray-900 dark:text-gray-100">{formatTime(order.createdAt)}</p>
                          <p className="text-[10px] text-gray-400">{timeSince(order.createdAt)}</p>
                        </td>

                        {/* PDV */}
                        <td className="px-4 py-3">
                          <p className="text-xs text-gray-500 truncate max-w-[80px]">{order.salesPointName || '—'}</p>
                        </td>

                        {/* Estado */}
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${statusCfg.badge}`}>
                            <StatusIcon className="w-3 h-3" /> {statusCfg.label}
                          </span>
                        </td>

                        {/* Acciones */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            {canOperate && nextStatus && (
                              <button onClick={() => handleAdvanceStatus(order)}
                                className="px-2.5 py-1.5 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-lg text-xs font-semibold hover:opacity-90 flex items-center gap-1">
                                <ArrowRight className="w-3 h-3" /> {STATUS_CONFIG[nextStatus].label}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="text-xs text-gray-400 text-center py-2">
          {filtered.length} de {orders.length} pedidos
        </div>
      </div>

      {/* Modals / Drawers */}
      {showCreate && (
        <CreateOrderWizard
          userId={userId}
          catalogItems={catalogItems}
          pointsOfSale={pointsOfSale}
          onSubmit={handleCreate}
          onClose={() => setShowCreate(false)}
        />
      )}

      {selectedOrder && (
        <OrderDetailDrawer
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onAdvanceStatus={handleAdvanceStatus}
          onCancel={(o) => { setCancelOrder(o); }}
          onReopen={(o) => { setReopenOrder(o); }}
          onRegisterPayment={(o) => { setPaymentOrder(o); }}
          canCancel={canCancel}
          canReopen={canReopen}
          canOperate={canOperate}
          canPayment={canPayment}
        />
      )}

      {cancelOrder && (
        <CancelOrderModal
          order={cancelOrder}
          onConfirm={handleCancel}
          onClose={() => setCancelOrder(null)}
          loading={actionLoading}
        />
      )}

      {reopenOrder && (
        <ReopenOrderModal
          order={reopenOrder}
          onConfirm={handleReopen}
          onClose={() => setReopenOrder(null)}
          loading={actionLoading}
        />
      )}

      {/* Quick payment modal */}
      {paymentOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setPaymentOrder(null)} />
          <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-in zoom-in-95">
            <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-1">Registrar cobro</h3>
            <p className="text-sm text-gray-500 mb-4">#{paymentOrder.orderNumber} — {(paymentOrder.totalAmount - paymentOrder.paidAmount).toFixed(2)}€ pendiente</p>
            <div className="grid grid-cols-2 gap-2">
              {['efectivo', 'tarjeta', 'bizum', 'online'].map((method) => (
                <button key={method} onClick={() => handlePayment(method)} disabled={actionLoading}
                  className="py-3 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl text-sm font-semibold text-gray-900 dark:text-gray-100 transition-colors capitalize disabled:opacity-50">
                  {PAYMENT_LABELS[method]}
                </button>
              ))}
            </div>
            <button onClick={() => setPaymentOrder(null)} className="w-full mt-3 py-2 text-sm text-gray-500 hover:text-gray-700">Cancelar</button>
          </div>
        </div>
      )}
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="delivery_orders"
        moduleLabel="Pedidos"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Pedidos"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
