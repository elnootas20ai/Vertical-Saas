import { useState, useEffect, useMemo, useCallback } from 'react';
import { toast } from 'sonner';
import { Layout } from '../../components/saas/Layout';
import { Tabs } from '../../components/saas/Tabs';
import { useModalClose } from '../../hooks/useModalClose';
import { useAuth } from '../../context/AuthContext';
import {
  listDeliveryOrdersRequest,
  updateDeliveryOrderRequest,
  type DeliveryOrder,
  type DeliveryOrderStatus,
} from '../../lib/deliveryApi';
import {
  Package,
  Search,
  X,
  Check,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Clock,
  Timer,
  Truck,
  ShoppingBag,
  User,
  Phone,
  MapPin,
  MessageSquare,
  Printer,
  ChevronRight,
  Eye,
  Settings,
  ClipboardCheck,
  ClipboardList,
  Coffee,
  UtensilsCrossed,
  Salad,
  Receipt,
  Sandwich,
  Cookie,
  Grip,
  TriangleAlert,
  CircleDot,
  ArrowRight,
  RotateCcw,
  Shield,
  History,
  Filter,
  ChevronDown,
  Sparkles,
  Zap,
  Store,
} from 'lucide-react';

// ─── Checklist Item Type ─────────────────────────────────────────────────────

interface ChecklistItemConfig {
  id: string;
  label: string;
  icon: typeof Package;
  category: 'container' | 'food' | 'drink' | 'complement' | 'document';
  required: boolean;
  autoDetect: boolean;
}

const DEFAULT_CHECKLIST_CONFIG: ChecklistItemConfig[] = [
  { id: 'bolsa', label: 'Bolsa / Caja', icon: ShoppingBag, category: 'container', required: true, autoDetect: false },
  { id: 'platos', label: 'Platos principales', icon: Sandwich, category: 'food', required: true, autoDetect: true },
  { id: 'bebidas', label: 'Bebidas', icon: Coffee, category: 'drink', required: false, autoDetect: true },
  { id: 'complementos', label: 'Complementos / Entrantes', icon: Salad, category: 'complement', required: false, autoDetect: true },
  { id: 'postres', label: 'Postres', icon: Cookie, category: 'food', required: false, autoDetect: true },
  { id: 'salsas', label: 'Salsas y cubiertos', icon: UtensilsCrossed, category: 'complement', required: true, autoDetect: false },
  { id: 'ticket', label: 'Ticket impreso', icon: Receipt, category: 'document', required: true, autoDetect: false },
];

type OrderDestination = 'recogida' | 'sala' | 'reparto';

interface MontajeIncident {
  id: string;
  orderId: string;
  orderNumber: string;
  type: 'faltante' | 'dañado' | 'error_pedido' | 'ticket_no_impreso' | 'otro';
  description: string;
  items: string[];
  severity: 'low' | 'medium' | 'high';
  resolvedAt?: string;
  resolvedBy?: string;
  createdAt: string;
  createdBy: string;
}

interface MontajeRecord {
  orderId: string;
  orderNumber: string;
  assembledBy: string;
  startedAt: string;
  completedAt: string;
  checklistSnapshot: Record<string, boolean>;
  destination: OrderDestination;
  incidents: string[];
}

// ─── Alert Types ─────────────────────────────────────────────────────────────

interface MontajeAlert {
  id: string;
  type: 'incomplete' | 'missing_product' | 'ready_not_assembled' | 'ticket_required';
  orderId: string;
  orderNumber: string;
  message: string;
  severity: 'warning' | 'critical';
  createdAt: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeSince(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m`;
  return `${Math.floor(hours / 24)}d`;
}

function getTimeUrgency(dateStr: string): 'normal' | 'warning' | 'critical' {
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (mins > 15) return 'critical';
  if (mins > 8) return 'warning';
  return 'normal';
}

const URGENCY_RING: Record<string, string> = {
  normal: 'ring-0',
  warning: 'ring-2 ring-amber-400',
  critical: 'ring-2 ring-red-500 animate-pulse',
};

const PRIORITY_CONFIG: Record<string, { label: string; dot: string; bg: string }> = {
  normal: { label: 'Normal', dot: 'bg-blue-500', bg: 'bg-blue-50 text-blue-700 border-blue-200' },
  high: { label: 'Alta', dot: 'bg-orange-500', bg: 'bg-orange-50 text-orange-700 border-orange-200' },
  urgent: { label: 'Urgente', dot: 'bg-red-500', bg: 'bg-red-50 text-red-700 border-red-200' },
};

const CHANNEL_CONFIG: Record<string, { label: string; color: string }> = {
  direct: { label: 'Directo', color: 'bg-gray-100 text-gray-700' },
  phone: { label: 'Teléfono', color: 'bg-blue-100 text-blue-700' },
  web: { label: 'Web', color: 'bg-indigo-100 text-indigo-700' },
  app: { label: 'App', color: 'bg-purple-100 text-purple-700' },
};

const INCIDENT_TYPES: { value: MontajeIncident['type']; label: string }[] = [
  { value: 'faltante', label: 'Producto faltante' },
  { value: 'dañado', label: 'Producto dañado' },
  { value: 'error_pedido', label: 'Error en pedido' },
  { value: 'ticket_no_impreso', label: 'Ticket no impreso' },
  { value: 'otro', label: 'Otro' },
];

const DESTINATION_CONFIG: Record<OrderDestination, { label: string; icon: typeof Package; color: string; bg: string }> = {
  recogida: { label: 'Recogida', icon: ShoppingBag, color: 'text-purple-700', bg: 'bg-purple-600 hover:bg-purple-700' },
  sala: { label: 'Sala', icon: Store, color: 'text-emerald-700', bg: 'bg-emerald-600 hover:bg-emerald-700' },
  reparto: { label: 'Reparto', icon: Truck, color: 'text-cyan-700', bg: 'bg-cyan-600 hover:bg-cyan-700' },
};

// ═════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═════════════════════════════════════════════════════════════════════════════

export function DeliveryMontaje() {
  const { user } = useAuth();

  // Data
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [loading, setLoading] = useState(true);

  // UI State
  const [activeTab, setActiveTab] = useState('pendientes');
  const [search, setSearch] = useState('');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [filterChannel, setFilterChannel] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);

  // Checklist state per order
  const [checklistState, setChecklistState] = useState<Record<string, Record<string, boolean>>>({});
  const [checklistConfig, setChecklistConfig] = useState<ChecklistItemConfig[]>(DEFAULT_CHECKLIST_CONFIG);

  // Montaje records (traceability)
  const [montajeRecords, setMontajeRecords] = useState<MontajeRecord[]>([]);
  const [montajeInProgress, setMontajeInProgress] = useState<Record<string, string>>({});

  // Incidents
  const [incidents, setIncidents] = useState<MontajeIncident[]>([]);
  const [showIncidentModal, setShowIncidentModal] = useState(false);
  const [incidentOrderId, setIncidentOrderId] = useState<string | null>(null);

  // Destination selection
  const [showDestinationModal, setShowDestinationModal] = useState(false);
  const [destinationOrderId, setDestinationOrderId] = useState<string | null>(null);

  // Config modal (gerente)
  const [showConfigModal, setShowConfigModal] = useState(false);

  // Detail drawer
  const [detailOrder, setDetailOrder] = useState<DeliveryOrder | null>(null);

  // Alerts
  const [alerts, setAlerts] = useState<MontajeAlert[]>([]);
  const [showAlerts, setShowAlerts] = useState(false);

  useModalClose(showIncidentModal, () => setShowIncidentModal(false));
  useModalClose(showDestinationModal, () => setShowDestinationModal(false));
  useModalClose(showConfigModal, () => setShowConfigModal(false));
  useModalClose(!!detailOrder, () => setDetailOrder(null));

  // ─── Data Loading ────────────────────────────────────────────────────────

  const loadOrders = useCallback(async () => {
    if (!user?.id) return;
    try {
      const data = await listDeliveryOrdersRequest(user.id);
      setOrders(data);
    } catch {
      toast.error('Error al cargar los pedidos');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  // ─── Computed Data ───────────────────────────────────────────────────────

  const assemblyOrders = useMemo(
    () => orders.filter(o => o.status === 'assembly'),
    [orders],
  );

  const readyFromKitchen = useMemo(
    () => orders.filter(o => o.status === 'kitchen' && o.kitchenCompletedAt),
    [orders],
  );

  const filteredOrders = useMemo(() => {
    let list = activeTab === 'pendientes'
      ? assemblyOrders.filter(o => {
          const cl = checklistState[o._id];
          return !cl || !checklistConfig.filter(c => c.required).every(c => cl[c.id]);
        })
      : activeTab === 'listos'
        ? assemblyOrders.filter(o => {
            const cl = checklistState[o._id];
            return cl && checklistConfig.filter(c => c.required).every(c => cl[c.id]);
          })
        : activeTab === 'desde_cocina'
          ? readyFromKitchen
          : activeTab === 'incidencias'
            ? assemblyOrders.filter(o => incidents.some(i => i.orderId === o._id && !i.resolvedAt))
            : assemblyOrders;

    if (search) {
      const term = search.toLowerCase();
      list = list.filter(o =>
        o.orderNumber?.toLowerCase().includes(term) ||
        o.customerName?.toLowerCase().includes(term) ||
        o.customerPhone?.includes(term),
      );
    }

    if (filterPriority !== 'all') {
      list = list.filter(o => o.priority === filterPriority);
    }

    if (filterChannel !== 'all') {
      list = list.filter(o => o.channel === filterChannel);
    }

    return list.sort((a, b) => {
      const prio = { urgent: 0, high: 1, normal: 2 };
      const pa = prio[a.priority as keyof typeof prio] ?? 2;
      const pb = prio[b.priority as keyof typeof prio] ?? 2;
      if (pa !== pb) return pa - pb;
      return new Date(a.assemblyStartedAt || a.createdAt).getTime() - new Date(b.assemblyStartedAt || b.createdAt).getTime();
    });
  }, [assemblyOrders, readyFromKitchen, activeTab, search, filterPriority, filterChannel, checklistState, checklistConfig, incidents]);

  // ─── Alerts Generation ───────────────────────────────────────────────────

  useEffect(() => {
    const newAlerts: MontajeAlert[] = [];

    assemblyOrders.forEach(order => {
      const urgency = getTimeUrgency(order.assemblyStartedAt || order.createdAt);
      if (urgency === 'critical') {
        newAlerts.push({
          id: `timeout-${order._id}`,
          type: 'ready_not_assembled',
          orderId: order._id,
          orderNumber: order.orderNumber,
          message: `Pedido ${order.orderNumber} lleva más de 15 min en montaje`,
          severity: 'critical',
          createdAt: new Date().toISOString(),
        });
      }

      const cl = checklistState[order._id] || {};
      const ticketItem = checklistConfig.find(c => c.id === 'ticket');
      if (ticketItem?.required && !cl.ticket) {
        newAlerts.push({
          id: `ticket-${order._id}`,
          type: 'ticket_required',
          orderId: order._id,
          orderNumber: order.orderNumber,
          message: `Ticket no impreso para pedido ${order.orderNumber}`,
          severity: 'warning',
          createdAt: new Date().toISOString(),
        });
      }
    });

    readyFromKitchen.forEach(order => {
      newAlerts.push({
        id: `ready-${order._id}`,
        type: 'ready_not_assembled',
        orderId: order._id,
        orderNumber: order.orderNumber,
        message: `Pedido ${order.orderNumber} listo en cocina, pendiente de montar`,
        severity: 'warning',
        createdAt: new Date().toISOString(),
      });
    });

    setAlerts(newAlerts);
  }, [assemblyOrders, readyFromKitchen, checklistState, checklistConfig]);

  // ─── Checklist Actions ───────────────────────────────────────────────────

  const toggleChecklistItem = (orderId: string, itemId: string) => {
    setChecklistState(prev => {
      const current = prev[orderId] || {};
      return { ...prev, [orderId]: { ...current, [itemId]: !current[itemId] } };
    });

    if (!montajeInProgress[orderId]) {
      setMontajeInProgress(prev => ({
        ...prev,
        [orderId]: new Date().toISOString(),
      }));
    }
  };

  const getChecklistProgress = (orderId: string) => {
    const cl = checklistState[orderId] || {};
    const requiredItems = checklistConfig.filter(c => c.required);
    const checked = requiredItems.filter(c => cl[c.id]).length;
    return { checked, total: requiredItems.length, allRequired: checked === requiredItems.length };
  };

  const getAllChecked = (orderId: string) => {
    const cl = checklistState[orderId] || {};
    return checklistConfig.every(c => cl[c.id]);
  };

  // ─── Order Actions ───────────────────────────────────────────────────────

  const handleMoveToAssembly = async (order: DeliveryOrder) => {
    if (!user?.id) return;
    try {
      const now = new Date().toISOString();
      const updated = await updateDeliveryOrderRequest(user.id, {
        ...order,
        status: 'assembly' as DeliveryOrderStatus,
        assemblyStartedAt: now,
        kitchenCompletedAt: order.kitchenCompletedAt || now,
        stageHistory: [...(order.stageHistory || []), { status: 'assembly' as DeliveryOrderStatus, date: now, user: user.fullName || 'Sistema' }],
      });
      setOrders(prev => prev.map(o => o._id === updated._id ? updated : o));
      toast.success(`Pedido ${order.orderNumber} movido a montaje`);
    } catch {
      toast.error('Error al mover el pedido');
    }
  };

  const handleCompleteAssembly = async (order: DeliveryOrder, destination: OrderDestination) => {
    if (!user?.id) return;
    const nextStatus: DeliveryOrderStatus = destination === 'reparto' ? 'delivery' : 'delivered';
    try {
      const now = new Date().toISOString();
      const updated = await updateDeliveryOrderRequest(user.id, {
        ...order,
        status: nextStatus,
        assemblyCompletedAt: now,
        stageHistory: [
          ...(order.stageHistory || []),
          { status: nextStatus, date: now, user: user.fullName || 'Sistema', notes: `Destino: ${DESTINATION_CONFIG[destination].label}` },
        ],
      });
      setOrders(prev => prev.map(o => o._id === updated._id ? updated : o));

      const record: MontajeRecord = {
        orderId: order._id,
        orderNumber: order.orderNumber,
        assembledBy: user.fullName || user.email || 'Desconocido',
        startedAt: montajeInProgress[order._id] || order.assemblyStartedAt || now,
        completedAt: now,
        checklistSnapshot: checklistState[order._id] || {},
        destination,
        incidents: incidents.filter(i => i.orderId === order._id).map(i => i.id),
      };
      setMontajeRecords(prev => [record, ...prev]);

      setChecklistState(prev => {
        const copy = { ...prev };
        delete copy[order._id];
        return copy;
      });
      setMontajeInProgress(prev => {
        const copy = { ...prev };
        delete copy[order._id];
        return copy;
      });

      toast.success(`Pedido ${order.orderNumber} → ${DESTINATION_CONFIG[destination].label}`);
    } catch {
      toast.error('Error al completar el montaje');
    }
  };

  const handleRequestDestination = (orderId: string) => {
    setDestinationOrderId(orderId);
    setShowDestinationModal(true);
  };

  const handleReportIncident = (orderId: string) => {
    setIncidentOrderId(orderId);
    setShowIncidentModal(true);
  };

  const handlePrintTicket = (order: DeliveryOrder) => {
    toast.success(`Imprimiendo ticket para pedido ${order.orderNumber}...`);
    toggleChecklistItem(order._id, 'ticket');
  };

  // ─── KPIs ────────────────────────────────────────────────────────────────

  const kpis = useMemo(() => ({
    pending: assemblyOrders.filter(o => {
      const cl = checklistState[o._id];
      return !cl || !checklistConfig.filter(c => c.required).every(c => cl[c.id]);
    }).length,
    ready: assemblyOrders.filter(o => {
      const cl = checklistState[o._id];
      return cl && checklistConfig.filter(c => c.required).every(c => cl[c.id]);
    }).length,
    fromKitchen: readyFromKitchen.length,
    incidents: incidents.filter(i => !i.resolvedAt).length,
    total: assemblyOrders.length,
    completedToday: montajeRecords.filter(r => {
      const today = new Date().toDateString();
      return new Date(r.completedAt).toDateString() === today;
    }).length,
  }), [assemblyOrders, readyFromKitchen, checklistState, checklistConfig, incidents, montajeRecords]);

  // ─── Tabs Config ─────────────────────────────────────────────────────────

  const tabsConfig = [
    { id: 'pendientes', label: 'En montaje', count: kpis.pending || undefined },
    { id: 'listos', label: 'Listos', count: kpis.ready || undefined },
    { id: 'desde_cocina', label: 'Desde cocina', count: kpis.fromKitchen || undefined },
    { id: 'incidencias', label: 'Incidencias', count: kpis.incidents || undefined },
    { id: 'historial', label: 'Historial' },
  ];

  // ═════════════════════════════════════════════════════════════════════════
  // RENDER: KPI Cards
  // ═════════════════════════════════════════════════════════════════════════

  const renderKPIs = () => (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {[
        { label: 'En montaje', value: kpis.pending, icon: <ClipboardList className="w-5 h-5" />, bg: 'bg-amber-50 dark:bg-amber-900/20', border: 'border-amber-200 dark:border-amber-800', text: 'text-amber-700 dark:text-amber-400', num: 'text-amber-900 dark:text-amber-300' },
        { label: 'Listos', value: kpis.ready, icon: <CheckCircle2 className="w-5 h-5" />, bg: 'bg-green-50 dark:bg-green-900/20', border: 'border-green-200 dark:border-green-800', text: 'text-green-700 dark:text-green-400', num: 'text-green-900 dark:text-green-300' },
        { label: 'Desde cocina', value: kpis.fromKitchen, icon: <ArrowRight className="w-5 h-5" />, bg: 'bg-orange-50 dark:bg-orange-900/20', border: 'border-orange-200 dark:border-orange-800', text: 'text-orange-700 dark:text-orange-400', num: 'text-orange-900 dark:text-orange-300' },
        { label: 'Incidencias', value: kpis.incidents, icon: <AlertTriangle className="w-5 h-5" />, bg: 'bg-red-50 dark:bg-red-900/20', border: 'border-red-200 dark:border-red-800', text: 'text-red-700 dark:text-red-400', num: 'text-red-900 dark:text-red-300' },
        { label: 'Total activos', value: kpis.total, icon: <Package className="w-5 h-5" />, bg: 'bg-indigo-50 dark:bg-indigo-900/20', border: 'border-indigo-200 dark:border-indigo-800', text: 'text-indigo-700 dark:text-indigo-400', num: 'text-indigo-900 dark:text-indigo-300' },
        { label: 'Montados hoy', value: kpis.completedToday, icon: <Sparkles className="w-5 h-5" />, bg: 'bg-violet-50 dark:bg-violet-900/20', border: 'border-violet-200 dark:border-violet-800', text: 'text-violet-700 dark:text-violet-400', num: 'text-violet-900 dark:text-violet-300' },
      ].map(kpi => (
        <div key={kpi.label} className={`${kpi.bg} border ${kpi.border} rounded-2xl p-4 flex flex-col gap-1`}>
          <div className={`flex items-center gap-2 ${kpi.text}`}>
            {kpi.icon}
            <span className="text-xs font-semibold uppercase tracking-wide">{kpi.label}</span>
          </div>
          <span className={`text-2xl font-extrabold ${kpi.num}`}>{kpi.value}</span>
        </div>
      ))}
    </div>
  );

  // ═════════════════════════════════════════════════════════════════════════
  // RENDER: Alert Banner
  // ═════════════════════════════════════════════════════════════════════════

  const renderAlerts = () => {
    const criticalAlerts = alerts.filter(a => a.severity === 'critical');
    const warningAlerts = alerts.filter(a => a.severity === 'warning');
    if (alerts.length === 0) return null;

    return (
      <div className="space-y-2">
        {criticalAlerts.length > 0 && (
          <div className="bg-red-50 dark:bg-red-900/20 border-2 border-red-300 dark:border-red-700 rounded-xl p-4 flex items-start gap-3">
            <div className="w-8 h-8 bg-red-100 dark:bg-red-800 rounded-lg flex items-center justify-center shrink-0">
              <Zap className="w-4 h-4 text-red-600 dark:text-red-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-red-800 dark:text-red-300">
                {criticalAlerts.length} alerta{criticalAlerts.length > 1 ? 's' : ''} crítica{criticalAlerts.length > 1 ? 's' : ''}
              </p>
              <div className="mt-1 space-y-0.5">
                {criticalAlerts.slice(0, 3).map(a => (
                  <p key={a.id} className="text-xs text-red-700 dark:text-red-400">{a.message}</p>
                ))}
                {criticalAlerts.length > 3 && <p className="text-xs text-red-600">+{criticalAlerts.length - 3} más</p>}
              </div>
            </div>
          </div>
        )}
        {warningAlerts.length > 0 && (
          <button
            onClick={() => setShowAlerts(!showAlerts)}
            className="w-full bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl px-4 py-3 flex items-center gap-3 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
          >
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span className="text-sm font-semibold text-amber-800 dark:text-amber-300 flex-1 text-left">
              {warningAlerts.length} aviso{warningAlerts.length > 1 ? 's' : ''}
            </span>
            <ChevronDown className={`w-4 h-4 text-amber-500 transition-transform ${showAlerts ? 'rotate-180' : ''}`} />
          </button>
        )}
        {showAlerts && warningAlerts.length > 0 && (
          <div className="bg-white dark:bg-gray-800 border border-amber-200 dark:border-amber-700 rounded-xl divide-y divide-amber-100 dark:divide-amber-800">
            {warningAlerts.map(a => (
              <div key={a.id} className="px-4 py-2.5 flex items-center gap-3">
                <CircleDot className="w-3 h-3 text-amber-500 shrink-0" />
                <span className="text-sm text-gray-700 dark:text-gray-300 flex-1">{a.message}</span>
                <span className="text-xs text-gray-400">{a.orderNumber}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // ═════════════════════════════════════════════════════════════════════════
  // RENDER: Search & Filters
  // ═════════════════════════════════════════════════════════════════════════

  const renderSearchBar = () => (
    <div className="flex flex-col sm:flex-row gap-3">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Buscar por nº pedido, cliente o teléfono…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-10 pr-10 py-3 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        )}
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`px-4 py-3 border-2 rounded-xl text-sm font-semibold flex items-center gap-2 transition-colors ${
            showFilters || filterPriority !== 'all' || filterChannel !== 'all'
              ? 'border-indigo-300 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400'
              : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
          }`}
        >
          <Filter className="w-4 h-4" /> Filtros
          {(filterPriority !== 'all' || filterChannel !== 'all') && (
            <span className="w-2 h-2 bg-indigo-500 rounded-full" />
          )}
        </button>
        <button
          onClick={() => setShowConfigModal(true)}
          className="px-4 py-3 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-xl text-sm font-semibold text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 transition-colors"
        >
          <Settings className="w-4 h-4" /> Config
        </button>
      </div>
      {showFilters && (
        <div className="sm:col-span-full flex flex-wrap gap-2 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-500 uppercase">Prioridad:</span>
            {['all', 'urgent', 'high', 'normal'].map(p => (
              <button
                key={p}
                onClick={() => setFilterPriority(p)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  filterPriority === p
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-600 hover:bg-gray-100'
                }`}
              >
                {p === 'all' ? 'Todas' : PRIORITY_CONFIG[p]?.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-500 uppercase">Canal:</span>
            {['all', 'direct', 'phone', 'web', 'app'].map(c => (
              <button
                key={c}
                onClick={() => setFilterChannel(c)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  filterChannel === c
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-600 hover:bg-gray-100'
                }`}
              >
                {c === 'all' ? 'Todos' : CHANNEL_CONFIG[c]?.label}
              </button>
            ))}
          </div>
          {(filterPriority !== 'all' || filterChannel !== 'all') && (
            <button
              onClick={() => { setFilterPriority('all'); setFilterChannel('all'); }}
              className="ml-auto px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-lg flex items-center gap-1"
            >
              <X className="w-3 h-3" /> Limpiar filtros
            </button>
          )}
        </div>
      )}
    </div>
  );

  // ═════════════════════════════════════════════════════════════════════════
  // RENDER: Order Checklist Card
  // ═════════════════════════════════════════════════════════════════════════

  const renderOrderCard = (order: DeliveryOrder, showChecklist = true) => {
    const cl = checklistState[order._id] || {};
    const progress = getChecklistProgress(order._id);
    const allDone = getAllChecked(order._id);
    const urgency = getTimeUrgency(order.assemblyStartedAt || order.createdAt);
    const orderIncidents = incidents.filter(i => i.orderId === order._id && !i.resolvedAt);
    const progressPct = progress.total > 0 ? Math.round((progress.checked / progress.total) * 100) : 0;

    return (
      <div
        key={order._id}
        className={`bg-white dark:bg-gray-800 border-2 rounded-2xl overflow-hidden transition-all hover:shadow-lg ${
          allDone
            ? 'border-green-300 dark:border-green-700'
            : orderIncidents.length > 0
              ? 'border-red-300 dark:border-red-700'
              : urgency === 'critical'
                ? 'border-red-200 dark:border-red-800'
                : 'border-gray-200 dark:border-gray-700'
        } ${URGENCY_RING[urgency]}`}
      >
        {/* Progress bar */}
        {showChecklist && (
          <div className="h-1.5 bg-gray-100 dark:bg-gray-700">
            <div
              className={`h-full transition-all duration-500 rounded-r-full ${
                allDone ? 'bg-green-500' : progressPct > 50 ? 'bg-amber-500' : 'bg-indigo-500'
              }`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        )}

        <div className="p-5">
          {/* Header */}
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-mono text-lg font-extrabold ${
                allDone
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                  : 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400'
              }`}>
                {order.orderNumber?.slice(-3) || '---'}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-gray-900 dark:text-gray-100 text-lg">#{order.orderNumber}</span>
                  <span className={`px-2 py-0.5 text-xs font-bold rounded-full border ${PRIORITY_CONFIG[order.priority]?.bg || ''}`}>
                    {PRIORITY_CONFIG[order.priority]?.label}
                  </span>
                  {order.channel && (
                    <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${CHANNEL_CONFIG[order.channel]?.color || ''}`}>
                      {CHANNEL_CONFIG[order.channel]?.label}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                  <span className="flex items-center gap-1"><User className="w-3.5 h-3.5" /> {order.customerName}</span>
                  {order.customerPhone && <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> {order.customerPhone}</span>}
                </div>
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className={`flex items-center gap-1.5 text-sm font-semibold ${
                urgency === 'critical' ? 'text-red-600 dark:text-red-400' : urgency === 'warning' ? 'text-amber-600 dark:text-amber-400' : 'text-gray-500 dark:text-gray-400'
              }`}>
                <Timer className="w-4 h-4" />
                {timeSince(order.assemblyStartedAt || order.createdAt)}
              </div>
              {order.customerAddress && (
                <div className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1 mt-1 justify-end">
                  <MapPin className="w-3 h-3" /> {order.customerAddress.length > 30 ? order.customerAddress.slice(0, 30) + '…' : order.customerAddress}
                </div>
              )}
            </div>
          </div>

          {/* Incidents badge */}
          {orderIncidents.length > 0 && (
            <div className="mb-3 px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-xl flex items-center gap-2">
              <TriangleAlert className="w-4 h-4 text-red-500" />
              <span className="text-sm font-semibold text-red-700 dark:text-red-400">{orderIncidents.length} incidencia{orderIncidents.length > 1 ? 's' : ''} abierta{orderIncidents.length > 1 ? 's' : ''}</span>
            </div>
          )}

          {/* Content grid */}
          <div className={`grid gap-4 mb-4 ${showChecklist ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'}`}>
            {/* Products */}
            <div>
              <h5 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5" /> Productos ({order.items?.length || 0})
              </h5>
              <div className="space-y-1.5">
                {(order.items || []).map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-sm p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                    <span className="bg-indigo-600 text-white font-bold text-xs px-2 py-0.5 rounded min-w-[2rem] text-center">{item.quantity}x</span>
                    <span className="text-gray-800 dark:text-gray-200 flex-1">{item.name}</span>
                    {item.notes && <span className="text-xs text-amber-600 dark:text-amber-400 italic">⚠ {item.notes}</span>}
                  </div>
                ))}
              </div>
              {order.notes && (
                <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 p-2.5 rounded-lg flex items-start gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                  <span className="font-medium">{order.notes}</span>
                </div>
              )}
            </div>

            {/* Checklist */}
            {showChecklist && (
              <div>
                <h5 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <ClipboardCheck className="w-3.5 h-3.5" /> Checklist de montaje
                </h5>
                <div className="space-y-1">
                  {checklistConfig.map(item => {
                    const Icon = item.icon;
                    const checked = cl[item.id] || false;
                    return (
                      <button
                        key={item.id}
                        onClick={() => toggleChecklistItem(order._id, item.id)}
                        className={`w-full flex items-center gap-2.5 p-2.5 rounded-xl transition-all text-left ${
                          checked
                            ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700'
                            : 'bg-gray-50 dark:bg-gray-700/50 border border-transparent hover:bg-gray-100 dark:hover:bg-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                        }`}
                      >
                        <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
                          checked
                            ? 'bg-green-500 border-green-500'
                            : 'border-gray-300 dark:border-gray-600'
                        }`}>
                          {checked && <Check className="w-3 h-3 text-white" />}
                        </div>
                        <Icon className={`w-4 h-4 shrink-0 ${checked ? 'text-green-600 dark:text-green-400' : 'text-gray-400 dark:text-gray-500'}`} />
                        <span className={`text-sm flex-1 ${
                          checked
                            ? 'text-green-700 dark:text-green-400 line-through'
                            : 'text-gray-800 dark:text-gray-200'
                        }`}>
                          {item.label}
                        </span>
                        {item.required && !checked && (
                          <span className="text-[10px] font-bold text-red-500 uppercase">Req.</span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {progress.checked}/{progress.total} obligatorios
                  </span>
                  {allDone && (
                    <span className="text-xs font-bold text-green-600 dark:text-green-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Completo
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2 pt-3 border-t border-gray-100 dark:border-gray-700">
            <button
              onClick={() => handlePrintTicket(order)}
              className="px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-xl text-sm font-semibold flex items-center gap-2 transition-colors"
            >
              <Printer className="w-4 h-4" /> Ticket
            </button>
            <button
              onClick={() => setDetailOrder(order)}
              className="px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-xl text-sm font-semibold flex items-center gap-2 transition-colors"
            >
              <Eye className="w-4 h-4" /> Detalle
            </button>
            <button
              onClick={() => handleReportIncident(order._id)}
              className="px-3 py-2.5 border-2 border-red-200 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl text-sm font-semibold flex items-center gap-2 transition-colors"
            >
              <AlertCircle className="w-4 h-4" /> Incidencia
            </button>
            <button
              onClick={() => progress.allRequired ? handleRequestDestination(order._id) : toast.error('Completa todos los items obligatorios del checklist')}
              disabled={!progress.allRequired}
              className={`ml-auto px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all ${
                progress.allRequired
                  ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white shadow-md shadow-indigo-200 dark:shadow-indigo-900/50'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
              }`}
            >
              <ArrowRight className="w-4 h-4" />
              {progress.allRequired ? 'Completar montaje' : `Faltan ${progress.total - progress.checked}`}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ═════════════════════════════════════════════════════════════════════════
  // RENDER: "Desde cocina" card (simplified)
  // ═════════════════════════════════════════════════════════════════════════

  const renderKitchenReadyCard = (order: DeliveryOrder) => (
    <div key={order._id} className="bg-white dark:bg-gray-800 border-2 border-orange-200 dark:border-orange-700 rounded-2xl p-5 hover:shadow-lg transition-all">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-orange-100 dark:bg-orange-900/30 rounded-xl flex items-center justify-center">
            <span className="font-mono font-bold text-orange-700 dark:text-orange-400">{order.orderNumber?.slice(-3)}</span>
          </div>
          <div>
            <span className="font-bold text-gray-900 dark:text-gray-100">#{order.orderNumber}</span>
            <p className="text-sm text-gray-500 dark:text-gray-400">{order.customerName} · {order.items?.length || 0} productos</p>
          </div>
        </div>
        <div className="flex items-center gap-1 text-sm text-gray-500">
          <Clock className="w-3.5 h-3.5" />
          {timeSince(order.kitchenCompletedAt || order.createdAt)}
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => handleMoveToAssembly(order)}
          className="flex-1 py-2.5 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-md shadow-orange-200 dark:shadow-orange-900/50 transition-all"
        >
          <Package className="w-4 h-4" /> Recibir en montaje
        </button>
        <button
          onClick={() => setDetailOrder(order)}
          className="px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-xl"
        >
          <Eye className="w-4 h-4" />
        </button>
      </div>
    </div>
  );

  // ═════════════════════════════════════════════════════════════════════════
  // RENDER: Tabs Content
  // ═════════════════════════════════════════════════════════════════════════

  const renderEmptyState = (icon: typeof Package, title: string, subtitle: string) => (
    <div className="flex flex-col items-center justify-center py-20 text-gray-400 dark:text-gray-500 bg-white dark:bg-gray-800 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700">
      {(() => { const I = icon; return <I className="w-14 h-14 text-gray-300 dark:text-gray-600 mb-4" />; })()}
      <p className="font-bold text-lg text-gray-500 dark:text-gray-400">{title}</p>
      <p className="text-sm mt-1">{subtitle}</p>
    </div>
  );

  const renderPendientesTab = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl flex items-center justify-center">
          <ClipboardList className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
        </div>
        <div>
          <h3 className="font-bold text-gray-900 dark:text-gray-100">Pedidos en montaje</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">{filteredOrders.length} pedido{filteredOrders.length !== 1 ? 's' : ''} pendiente{filteredOrders.length !== 1 ? 's' : ''} de completar</p>
        </div>
      </div>
      {filteredOrders.length === 0
        ? renderEmptyState(ClipboardList, 'Sin pedidos en montaje', 'Los pedidos llegarán aquí desde cocina')
        : <div className="space-y-4">{filteredOrders.map(order => renderOrderCard(order))}</div>
      }
    </div>
  );

  const renderListosTab = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-xl flex items-center justify-center">
          <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
        </div>
        <div>
          <h3 className="font-bold text-gray-900 dark:text-gray-100">Pedidos listos</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">{filteredOrders.length} pedido{filteredOrders.length !== 1 ? 's' : ''} con checklist completo</p>
        </div>
      </div>
      {filteredOrders.length === 0
        ? renderEmptyState(CheckCircle2, 'No hay pedidos listos', 'Completa el checklist de los pedidos en montaje')
        : <div className="space-y-4">{filteredOrders.map(order => renderOrderCard(order))}</div>
      }
    </div>
  );

  const renderDesdeCocinaTab = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-orange-100 dark:bg-orange-900/30 rounded-xl flex items-center justify-center">
          <ArrowRight className="w-5 h-5 text-orange-600 dark:text-orange-400" />
        </div>
        <div>
          <h3 className="font-bold text-gray-900 dark:text-gray-100">Listos desde cocina</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">{filteredOrders.length} pedido{filteredOrders.length !== 1 ? 's' : ''} esperando recepción en montaje</p>
        </div>
      </div>
      {filteredOrders.length === 0
        ? renderEmptyState(ArrowRight, 'No hay pedidos desde cocina', 'Los pedidos aparecerán aquí cuando cocina los marque como listos')
        : <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">{filteredOrders.map(order => renderKitchenReadyCard(order))}</div>
      }
    </div>
  );

  const renderIncidenciasTab = () => {
    const openIncidents = incidents.filter(i => !i.resolvedAt);
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-xl flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900 dark:text-gray-100">Incidencias abiertas</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">{openIncidents.length} incidencia{openIncidents.length !== 1 ? 's' : ''} sin resolver</p>
          </div>
        </div>
        {openIncidents.length === 0 ? (
          renderEmptyState(AlertTriangle, 'Sin incidencias', 'No hay incidencias abiertas en montaje')
        ) : (
          <div className="space-y-3">
            {openIncidents.map(inc => (
              <div key={inc.id} className="bg-white dark:bg-gray-800 border-2 border-red-200 dark:border-red-700 rounded-xl p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <span className="font-bold text-gray-900 dark:text-gray-100">#{inc.orderNumber}</span>
                    <span className={`ml-2 px-2 py-0.5 text-xs font-bold rounded-full ${
                      inc.severity === 'high' ? 'bg-red-100 text-red-700' : inc.severity === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {INCIDENT_TYPES.find(t => t.value === inc.type)?.label}
                    </span>
                  </div>
                  <span className="text-xs text-gray-400">{timeSince(inc.createdAt)}</span>
                </div>
                <p className="text-sm text-gray-700 dark:text-gray-300">{inc.description}</p>
                {inc.items.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {inc.items.map((item, idx) => (
                      <span key={idx} className="px-2 py-0.5 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-xs font-medium rounded-lg">{item}</span>
                    ))}
                  </div>
                )}
                <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
                  <User className="w-3 h-3" /> {inc.createdBy}
                </div>
              </div>
            ))}
          </div>
        )}
        {filteredOrders.length > 0 && (
          <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
            <h4 className="font-semibold text-gray-700 dark:text-gray-300 mb-3">Pedidos con incidencias</h4>
            <div className="space-y-4">
              {filteredOrders.map(order => renderOrderCard(order))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderHistorialTab = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-violet-100 dark:bg-violet-900/30 rounded-xl flex items-center justify-center">
          <History className="w-5 h-5 text-violet-600 dark:text-violet-400" />
        </div>
        <div>
          <h3 className="font-bold text-gray-900 dark:text-gray-100">Historial de montaje</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">{montajeRecords.length} pedido{montajeRecords.length !== 1 ? 's' : ''} montado{montajeRecords.length !== 1 ? 's' : ''}</p>
        </div>
      </div>
      {montajeRecords.length === 0 ? (
        renderEmptyState(History, 'Sin historial', 'Los pedidos montados aparecerán aquí')
      ) : (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-900/50">
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Pedido</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Montado por</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Destino</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Duración</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Incidencias</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Hora</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {montajeRecords.map(record => {
                const duration = Math.round((new Date(record.completedAt).getTime() - new Date(record.startedAt).getTime()) / 60000);
                const DestIcon = DESTINATION_CONFIG[record.destination]?.icon || Package;
                return (
                  <tr key={record.orderId} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-3 font-bold text-gray-900 dark:text-gray-100">#{record.orderNumber}</td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5 text-indigo-500" /> {record.assembledBy}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${DESTINATION_CONFIG[record.destination]?.color || ''} bg-opacity-10`}>
                        <DestIcon className="w-3 h-3" /> {DESTINATION_CONFIG[record.destination]?.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{duration}m</td>
                    <td className="px-4 py-3">
                      {record.incidents.length > 0
                        ? <span className="text-red-600 font-semibold">{record.incidents.length}</span>
                        : <span className="text-green-600">0</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">{timeSince(record.completedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  // ═════════════════════════════════════════════════════════════════════════
  // MODAL: Destination selector
  // ═════════════════════════════════════════════════════════════════════════

  const renderDestinationModal = () => {
    if (!showDestinationModal || !destinationOrderId) return null;
    const order = orders.find(o => o._id === destinationOrderId);
    if (!order) return null;

    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowDestinationModal(false)}>
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden" onClick={e => e.stopPropagation()}>
          <div className="bg-gradient-to-r from-indigo-50 to-violet-50 dark:from-indigo-900/30 dark:to-violet-900/30 px-6 py-5 border-b border-gray-200 dark:border-gray-700">
            <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100">¿A dónde va este pedido?</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Pedido #{order.orderNumber} · {order.customerName}</p>
          </div>
          <div className="p-6 space-y-3">
            {(Object.entries(DESTINATION_CONFIG) as [OrderDestination, typeof DESTINATION_CONFIG[OrderDestination]][]).map(([key, config]) => {
              const Icon = config.icon;
              return (
                <button
                  key={key}
                  onClick={() => {
                    handleCompleteAssembly(order, key);
                    setShowDestinationModal(false);
                  }}
                  className={`w-full p-4 rounded-xl border-2 border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-600 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50 flex items-center gap-4 transition-all group`}
                >
                  <div className={`w-12 h-12 ${config.bg} rounded-xl flex items-center justify-center text-white shrink-0 group-hover:scale-105 transition-transform`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <div className="text-left">
                    <span className="font-bold text-gray-900 dark:text-gray-100">{config.label}</span>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {key === 'recogida' && 'El cliente recogerá el pedido'}
                      {key === 'sala' && 'Servir al cliente en sala'}
                      {key === 'reparto' && 'Asignar a repartidor'}
                    </p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-300 dark:text-gray-600 ml-auto group-hover:text-indigo-500 transition-colors" />
                </button>
              );
            })}
          </div>
          <div className="px-6 pb-6">
            <button onClick={() => setShowDestinationModal(false)} className="w-full py-3 text-sm font-semibold text-gray-500 hover:text-gray-700 transition-colors">
              Cancelar
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ═════════════════════════════════════════════════════════════════════════
  // MODAL: Incident reporter
  // ═════════════════════════════════════════════════════════════════════════

  const IncidentModal = () => {
    const [type, setType] = useState<MontajeIncident['type']>('faltante');
    const [description, setDescription] = useState('');
    const [itemsList, setItemsList] = useState('');
    const [severity, setSeverity] = useState<'low' | 'medium' | 'high'>('medium');

    if (!showIncidentModal || !incidentOrderId) return null;
    const order = orders.find(o => o._id === incidentOrderId);
    if (!order) return null;

    const handleSubmit = () => {
      if (!description.trim()) {
        toast.error('Describe la incidencia');
        return;
      }
      const incident: MontajeIncident = {
        id: `inc-${Date.now()}`,
        orderId: order._id,
        orderNumber: order.orderNumber,
        type,
        description: description.trim(),
        items: itemsList.split(',').map(s => s.trim()).filter(Boolean),
        severity,
        createdAt: new Date().toISOString(),
        createdBy: user?.fullName || user?.email || 'Desconocido',
      };
      setIncidents(prev => [incident, ...prev]);
      toast.success('Incidencia registrada');
      setShowIncidentModal(false);
    };

    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowIncidentModal(false)}>
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden" onClick={e => e.stopPropagation()}>
          <div className="bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-900/30 dark:to-orange-900/30 px-6 py-5 border-b border-gray-200 dark:border-gray-700 flex items-start justify-between">
            <div>
              <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100">Reportar incidencia</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Pedido #{order.orderNumber}</p>
            </div>
            <button onClick={() => setShowIncidentModal(false)} className="p-1 hover:bg-white dark:hover:bg-gray-700 rounded-lg transition-colors">
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Tipo de incidencia</label>
              <div className="flex flex-wrap gap-2">
                {INCIDENT_TYPES.map(t => (
                  <button
                    key={t.value}
                    onClick={() => setType(t.value)}
                    className={`px-3 py-2 rounded-xl text-sm font-semibold border-2 transition-colors ${
                      type === t.value
                        ? 'border-red-400 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
                        : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Gravedad</label>
              <div className="flex gap-2">
                {(['low', 'medium', 'high'] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => setSeverity(s)}
                    className={`flex-1 px-3 py-2 rounded-xl text-sm font-semibold border-2 transition-colors ${
                      severity === s
                        ? s === 'high' ? 'border-red-400 bg-red-50 text-red-700' : s === 'medium' ? 'border-amber-400 bg-amber-50 text-amber-700' : 'border-blue-400 bg-blue-50 text-blue-700'
                        : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    {s === 'high' ? 'Alta' : s === 'medium' ? 'Media' : 'Baja'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Descripción</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Describe qué ha pasado…"
                rows={3}
                className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Productos afectados (separados por coma)</label>
              <input
                type="text"
                value={itemsList}
                onChange={e => setItemsList(e.target.value)}
                placeholder="Ej: Hamburguesa, Patatas fritas"
                className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
              />
            </div>
          </div>
          <div className="px-6 pb-6 flex gap-3">
            <button onClick={() => setShowIncidentModal(false)} className="flex-1 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700">
              Cancelar
            </button>
            <button onClick={handleSubmit} className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-bold shadow-md transition-colors">
              Registrar incidencia
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ═════════════════════════════════════════════════════════════════════════
  // MODAL: Checklist Config (Manager)
  // ═════════════════════════════════════════════════════════════════════════

  const ConfigModal = () => {
    const [items, setItems] = useState<ChecklistItemConfig[]>([...checklistConfig]);
    const [newLabel, setNewLabel] = useState('');

    if (!showConfigModal) return null;

    const toggleRequired = (id: string) => {
      setItems(prev => prev.map(i => i.id === id ? { ...i, required: !i.required } : i));
    };

    const removeItem = (id: string) => {
      setItems(prev => prev.filter(i => i.id !== id));
    };

    const addItem = () => {
      if (!newLabel.trim()) return;
      const id = newLabel.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
      if (items.some(i => i.id === id)) {
        toast.error('Ya existe un item con ese nombre');
        return;
      }
      setItems(prev => [...prev, {
        id,
        label: newLabel.trim(),
        icon: ClipboardCheck,
        category: 'complement',
        required: false,
        autoDetect: false,
      }]);
      setNewLabel('');
    };

    const handleSave = () => {
      setChecklistConfig(items);
      setShowConfigModal(false);
      toast.success('Configuración de checklist guardada');
    };

    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowConfigModal(false)}>
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden" onClick={e => e.stopPropagation()}>
          <div className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/30 dark:to-purple-900/30 px-6 py-5 border-b border-gray-200 dark:border-gray-700 flex items-start justify-between">
            <div>
              <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <Settings className="w-5 h-5 text-indigo-600" /> Configurar checklist
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Personaliza los items del checklist de montaje</p>
            </div>
            <button onClick={() => setShowConfigModal(false)} className="p-1 hover:bg-white dark:hover:bg-gray-700 rounded-lg">
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>
          <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
            <div className="space-y-2">
              {items.map((item, idx) => {
                const Icon = item.icon;
                return (
                  <div key={item.id} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl group">
                    <Grip className="w-4 h-4 text-gray-300 dark:text-gray-600 cursor-grab" />
                    <Icon className="w-4 h-4 text-gray-500" />
                    <span className="flex-1 text-sm font-medium text-gray-800 dark:text-gray-200">{item.label}</span>
                    <button
                      onClick={() => toggleRequired(item.id)}
                      className={`px-2 py-0.5 rounded text-xs font-bold transition-colors ${
                        item.required
                          ? 'bg-red-100 text-red-700 hover:bg-red-200'
                          : 'bg-gray-200 dark:bg-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-300'
                      }`}
                    >
                      {item.required ? 'Obligatorio' : 'Opcional'}
                    </button>
                    <button
                      onClick={() => removeItem(item.id)}
                      className="p-1 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newLabel}
                onChange={e => setNewLabel(e.target.value)}
                placeholder="Nuevo item del checklist…"
                className="flex-1 px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                onKeyDown={e => e.key === 'Enter' && addItem()}
              />
              <button
                onClick={addItem}
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold transition-colors"
              >
                Añadir
              </button>
            </div>
          </div>
          <div className="px-6 pb-6 flex gap-3 border-t border-gray-200 dark:border-gray-700 pt-4">
            <button onClick={() => { setItems([...DEFAULT_CHECKLIST_CONFIG]); }} className="px-4 py-2.5 text-sm font-semibold text-gray-500 hover:text-gray-700 flex items-center gap-1">
              <RotateCcw className="w-3.5 h-3.5" /> Restaurar
            </button>
            <div className="flex-1" />
            <button onClick={() => setShowConfigModal(false)} className="px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700">
              Cancelar
            </button>
            <button onClick={handleSave} className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold shadow-md transition-colors">
              Guardar
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ═════════════════════════════════════════════════════════════════════════
  // DRAWER: Order Detail
  // ═════════════════════════════════════════════════════════════════════════

  const renderDetailDrawer = () => {
    if (!detailOrder) return null;
    const cl = checklistState[detailOrder._id] || {};
    const progress = getChecklistProgress(detailOrder._id);
    const orderIncidents = incidents.filter(i => i.orderId === detailOrder._id);
    const orderRecord = montajeRecords.find(r => r.orderId === detailOrder._id);

    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-end" onClick={() => setDetailOrder(null)}>
        <div className="bg-white dark:bg-gray-800 w-full md:w-[560px] h-full overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
          {/* Header */}
          <div className="sticky top-0 bg-gradient-to-br from-indigo-50 via-white to-white dark:from-indigo-900/30 dark:via-gray-800 dark:to-gray-800 border-b-2 border-gray-200 dark:border-gray-700 px-6 py-5 z-10">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-100 dark:bg-indigo-900/50 rounded-xl">
                  <Package className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Pedido #{detailOrder.orderNumber}</h2>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`px-2 py-0.5 text-xs font-bold rounded-full border ${PRIORITY_CONFIG[detailOrder.priority]?.bg || ''}`}>
                      {PRIORITY_CONFIG[detailOrder.priority]?.label}
                    </span>
                    {detailOrder.channel && (
                      <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${CHANNEL_CONFIG[detailOrder.channel]?.color || ''}`}>
                        {CHANNEL_CONFIG[detailOrder.channel]?.label}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button onClick={() => setDetailOrder(null)} className="p-2 hover:bg-white dark:hover:bg-gray-700 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
          </div>

          <div className="px-6 py-6 space-y-6">
            {/* Customer info */}
            <div className="bg-gradient-to-br from-blue-50 to-white dark:from-blue-900/20 dark:to-gray-800 p-4 rounded-xl border border-blue-100 dark:border-blue-800">
              <h4 className="font-bold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                <User className="w-4 h-4 text-blue-600" /> Cliente
              </h4>
              <div className="space-y-2 text-sm">
                <div><span className="text-gray-500">Nombre:</span> <span className="font-semibold text-gray-900 dark:text-gray-100 ml-1">{detailOrder.customerName}</span></div>
                {detailOrder.customerPhone && (
                  <div className="flex items-center gap-2"><Phone className="w-4 h-4 text-blue-500" /> <span className="text-gray-700 dark:text-gray-300">{detailOrder.customerPhone}</span></div>
                )}
                {detailOrder.customerAddress && (
                  <div className="flex items-start gap-2"><MapPin className="w-4 h-4 text-blue-500 mt-0.5" /> <span className="text-gray-700 dark:text-gray-300">{detailOrder.customerAddress}</span></div>
                )}
              </div>
            </div>

            {/* Products */}
            <div>
              <h4 className="font-bold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                <Package className="w-4 h-4 text-gray-600" /> Contenido del pedido
              </h4>
              <div className="space-y-2">
                {(detailOrder.items || []).map((item, idx) => (
                  <div key={idx} className="bg-gray-50 dark:bg-gray-700/50 p-3 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="bg-indigo-600 text-white font-bold text-xs px-2 py-1 rounded">{item.quantity}x</span>
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{item.name}</span>
                    </div>
                    <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{(item.quantity * item.unitPrice).toFixed(2)}€</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 p-3 bg-indigo-600 rounded-xl text-white flex items-center justify-between">
                <span className="font-semibold">Total</span>
                <span className="text-xl font-bold">{detailOrder.totalAmount?.toFixed(2) || '0.00'}€</span>
              </div>
            </div>

            {/* Checklist status */}
            <div>
              <h4 className="font-bold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                <ClipboardCheck className="w-4 h-4 text-gray-600" /> Checklist de montaje
              </h4>
              <div className="space-y-2">
                {checklistConfig.map(item => {
                  const Icon = item.icon;
                  const checked = cl[item.id] || false;
                  return (
                    <button
                      key={item.id}
                      onClick={() => toggleChecklistItem(detailOrder._id, item.id)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all text-left ${
                        checked
                          ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700'
                          : 'bg-gray-50 dark:bg-gray-700/50 border border-transparent hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                    >
                      <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-colors ${
                        checked ? 'bg-green-500 border-green-500' : 'border-gray-300 dark:border-gray-600'
                      }`}>
                        {checked && <Check className="w-4 h-4 text-white" />}
                      </div>
                      <Icon className={`w-5 h-5 ${checked ? 'text-green-600' : 'text-gray-400'}`} />
                      <span className={`flex-1 text-sm font-medium ${checked ? 'text-green-700 dark:text-green-400 line-through' : 'text-gray-900 dark:text-gray-100'}`}>{item.label}</span>
                      {item.required && !checked && <span className="text-[10px] font-bold text-red-500 uppercase">Req.</span>}
                      {checked && <CheckCircle2 className="w-5 h-5 text-green-500" />}
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 text-xs text-gray-500">{progress.checked}/{progress.total} obligatorios completados</div>
            </div>

            {/* Notes */}
            {detailOrder.notes && (
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 p-4 rounded-xl">
                <h4 className="font-bold text-gray-900 dark:text-gray-100 mb-1 flex items-center gap-2 text-sm">
                  <MessageSquare className="w-4 h-4 text-amber-600" /> Observaciones
                </h4>
                <p className="text-sm text-gray-700 dark:text-gray-300">{detailOrder.notes}</p>
              </div>
            )}

            {/* Incidents */}
            {orderIncidents.length > 0 && (
              <div>
                <h4 className="font-bold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-500" /> Incidencias ({orderIncidents.length})
                </h4>
                <div className="space-y-2">
                  {orderIncidents.map(inc => (
                    <div key={inc.id} className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 p-3 rounded-xl">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold text-red-700">{INCIDENT_TYPES.find(t => t.value === inc.type)?.label}</span>
                        <span className="text-xs text-gray-400">· {timeSince(inc.createdAt)}</span>
                      </div>
                      <p className="text-sm text-gray-700 dark:text-gray-300">{inc.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Traceability */}
            {orderRecord && (
              <div className="bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-700 p-4 rounded-xl">
                <h4 className="font-bold text-gray-900 dark:text-gray-100 mb-2 flex items-center gap-2 text-sm">
                  <Shield className="w-4 h-4 text-violet-600" /> Trazabilidad
                </h4>
                <div className="text-sm space-y-1 text-gray-700 dark:text-gray-300">
                  <div>Montado por: <span className="font-semibold">{orderRecord.assembledBy}</span></div>
                  <div>Destino: <span className="font-semibold">{DESTINATION_CONFIG[orderRecord.destination]?.label}</span></div>
                  <div>Duración: <span className="font-semibold">{Math.round((new Date(orderRecord.completedAt).getTime() - new Date(orderRecord.startedAt).getTime()) / 60000)}m</span></div>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-3 pt-4 border-t-2 border-gray-200 dark:border-gray-700">
              <button
                onClick={() => handlePrintTicket(detailOrder)}
                className="flex-1 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center justify-center gap-2 transition-colors"
              >
                <Printer className="w-4 h-4" /> Imprimir ticket
              </button>
              {detailOrder.status === 'assembly' && (
                <button
                  onClick={() => {
                    if (progress.allRequired) {
                      handleRequestDestination(detailOrder._id);
                      setDetailOrder(null);
                    } else {
                      toast.error('Completa los items obligatorios');
                    }
                  }}
                  disabled={!progress.allRequired}
                  className={`flex-1 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-colors ${
                    progress.allRequired
                      ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  <ArrowRight className="w-4 h-4" /> Completar montaje
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ═════════════════════════════════════════════════════════════════════════
  // MAIN RENDER
  // ═════════════════════════════════════════════════════════════════════════

  if (loading) {
    return (
      <Layout title="Montaje y empaquetado" subtitle="Revisión y cierre de pedidos antes de salida o entrega">
        <div className="flex items-center justify-center py-32">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
            <p className="text-sm text-gray-500 dark:text-gray-400">Cargando pedidos…</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Montaje y empaquetado" subtitle="Revisión y cierre de pedidos antes de salida o entrega">
      <div className="space-y-6">
        {renderKPIs()}
        {renderAlerts()}
        {renderSearchBar()}
        <Tabs tabs={tabsConfig} activeTab={activeTab} onChange={setActiveTab} />

        {activeTab === 'pendientes' && renderPendientesTab()}
        {activeTab === 'listos' && renderListosTab()}
        {activeTab === 'desde_cocina' && renderDesdeCocinaTab()}
        {activeTab === 'incidencias' && renderIncidenciasTab()}
        {activeTab === 'historial' && renderHistorialTab()}
      </div>

      {renderDestinationModal()}
      <IncidentModal />
      <ConfigModal />
      {renderDetailDrawer()}
    </Layout>
  );
}
