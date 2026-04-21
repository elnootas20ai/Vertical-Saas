import { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router';
import { useAuth } from '../../../context/AuthContext';
import { useModalClose } from '../../../hooks/useModalClose';
import {
  listDeliveryOrdersRequest,
  updateDeliveryOrderRequest,
  type DeliveryOrder,
  type DeliveryOrderStatus,
} from '../../../lib/deliveryApi';
import {
  ChefHat,
  Package,
  Truck,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  Phone,
  MapPin,
  User,
  Timer,
  Search,
  X,
  Loader2,
  RefreshCw,
  ShoppingBag,
  AlertCircle,
  Eye,
} from 'lucide-react';

type ViewTab = 'kitchen' | 'assembly' | 'delivery' | 'all';

const STATUS_CONFIG: Record<DeliveryOrderStatus, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  pending:   { label: 'Pendiente',   color: 'text-amber-700',   bg: 'bg-amber-50 border-amber-200',   icon: <Clock className="w-4 h-4" /> },
  preparing: { label: 'Preparando',  color: 'text-blue-700',    bg: 'bg-blue-50 border-blue-200',     icon: <Package className="w-4 h-4" /> },
  kitchen:   { label: 'En cocina',   color: 'text-orange-700',  bg: 'bg-orange-50 border-orange-200', icon: <ChefHat className="w-4 h-4" /> },
  assembly:  { label: 'Montaje',     color: 'text-indigo-700',  bg: 'bg-indigo-50 border-indigo-200', icon: <Package className="w-4 h-4" /> },
  delivery:  { label: 'En reparto',  color: 'text-cyan-700',    bg: 'bg-cyan-50 border-cyan-200',     icon: <Truck className="w-4 h-4" /> },
  delivered: { label: 'Entregado',   color: 'text-green-700',   bg: 'bg-green-50 border-green-200',   icon: <CheckCircle2 className="w-4 h-4" /> },
  cancelled: { label: 'Cancelado',   color: 'text-gray-500',    bg: 'bg-gray-50 border-gray-200',     icon: <X className="w-4 h-4" /> },
  incident:  { label: 'Incidencia',  color: 'text-red-700',     bg: 'bg-red-50 border-red-200',       icon: <AlertTriangle className="w-4 h-4" /> },
};

const NEXT_STATUS: Partial<Record<DeliveryOrderStatus, DeliveryOrderStatus>> = {
  pending: 'preparing',
  preparing: 'kitchen',
  kitchen: 'assembly',
  assembly: 'delivery',
  delivery: 'delivered',
};

const NEXT_LABEL: Partial<Record<DeliveryOrderStatus, string>> = {
  pending: 'Preparar',
  preparing: 'Enviar a cocina',
  kitchen: 'Listo para montaje',
  assembly: 'Salir a reparto',
  delivery: 'Marcar entregado',
};

const TAB_CONFIG: { id: ViewTab; label: string; icon: React.ReactNode; statuses: DeliveryOrderStatus[] }[] = [
  { id: 'kitchen',  label: 'Cocina',  icon: <ChefHat className="w-4 h-4" />,     statuses: ['pending', 'preparing', 'kitchen'] },
  { id: 'assembly', label: 'Montaje', icon: <Package className="w-4 h-4" />,      statuses: ['assembly'] },
  { id: 'delivery', label: 'Reparto', icon: <Truck className="w-4 h-4" />,        statuses: ['delivery'] },
  { id: 'all',      label: 'Todos',   icon: <ShoppingBag className="w-4 h-4" />,  statuses: [] },
];

function formatCurrency(n: number) {
  return n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

function timeAgo(dateStr: string) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (diff < 1) return 'Ahora';
  if (diff < 60) return `${diff}min`;
  const h = Math.floor(diff / 60);
  return `${h}h ${diff % 60}m`;
}

function OrderCard({
  order,
  onAdvance,
  onSelect,
  advancing,
}: {
  order: DeliveryOrder;
  onAdvance: (o: DeliveryOrder) => void;
  onSelect: (o: DeliveryOrder) => void;
  advancing: boolean;
}) {
  const cfg = STATUS_CONFIG[order.status];
  const nextLabel = NEXT_LABEL[order.status];
  const isUrgent = order.priority === 'urgent' || order.priority === 'high';
  const itemCount = order.items.reduce((s, i) => s + i.quantity, 0);

  return (
    <div className={`rounded-2xl border-2 ${cfg.bg} p-4 transition-all hover:shadow-lg`}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-bold text-gray-900 dark:text-gray-100">
              #{order.orderNumber}
            </span>
            {isUrgent && (
              <span className="flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 text-[10px] font-bold rounded-full">
                <AlertTriangle className="w-3 h-3" /> URGENTE
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
            <Timer className="w-3 h-3" />
            <span>{timeAgo(order.createdAt)}</span>
            {order.channel && (
              <span className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-[10px] font-medium uppercase">
                {order.channel}
              </span>
            )}
          </div>
        </div>
        <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${cfg.bg} ${cfg.color}`}>
          {cfg.icon}
          {cfg.label}
        </div>
      </div>

      {order.customerName && (
        <div className="flex items-center gap-2 mb-2 text-sm text-gray-700 dark:text-gray-300">
          <User className="w-3.5 h-3.5 text-gray-400" />
          <span className="truncate">{order.customerName}</span>
          {order.customerPhone && (
            <>
              <Phone className="w-3 h-3 text-gray-400 ml-1" />
              <span className="text-xs text-gray-500">{order.customerPhone}</span>
            </>
          )}
        </div>
      )}

      {order.deliveryAddress && (
        <div className="flex items-center gap-2 mb-2 text-xs text-gray-500">
          <MapPin className="w-3 h-3 shrink-0" />
          <span className="truncate">{order.deliveryAddress}</span>
        </div>
      )}

      <div className="mb-3 space-y-1">
        {order.items.slice(0, 4).map((item) => (
          <div key={item.id} className="flex items-center justify-between text-sm">
            <span className="text-gray-700 dark:text-gray-300 truncate">
              <span className="font-semibold text-gray-900 dark:text-gray-100">{item.quantity}x</span>{' '}
              {item.name}
            </span>
            <span className="text-xs text-gray-500 ml-2 shrink-0">{formatCurrency(item.unitPrice * item.quantity)}</span>
          </div>
        ))}
        {order.items.length > 4 && (
          <p className="text-xs text-gray-400">+{order.items.length - 4} más...</p>
        )}
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-gray-200/80 dark:border-gray-600/40">
        <div className="text-sm">
          <span className="text-gray-500">{itemCount} uds</span>
          <span className="mx-1.5 text-gray-300">·</span>
          <span className="font-bold text-gray-900 dark:text-gray-100">{formatCurrency(order.total)}</span>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onSelect(order)}
            className="p-2 rounded-lg text-gray-500 hover:bg-white/60 dark:hover:bg-gray-700/40 transition-colors"
            title="Ver detalle"
          >
            <Eye className="w-4 h-4" />
          </button>
          {nextLabel && (
            <button
              type="button"
              onClick={() => onAdvance(order)}
              disabled={advancing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-all disabled:opacity-50 shadow-sm"
            >
              {advancing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
              {nextLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function OrderDetail({ order, onClose, onAdvance, advancing }: {
  order: DeliveryOrder;
  onClose: () => void;
  onAdvance: (o: DeliveryOrder) => void;
  advancing: boolean;
}) {
  useModalClose(true, onClose);
  const cfg = STATUS_CONFIG[order.status];
  const nextLabel = NEXT_LABEL[order.status];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-5 py-4 flex items-center justify-between rounded-t-2xl z-10">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
              Pedido #{order.orderNumber}
            </h2>
            <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold mt-1 ${cfg.bg} ${cfg.color}`}>
              {cfg.icon} {cfg.label}
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {order.customerName && (
            <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
              <User className="w-5 h-5 text-gray-400" />
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{order.customerName}</p>
                {order.customerPhone && <p className="text-xs text-gray-500">{order.customerPhone}</p>}
                {order.deliveryAddress && <p className="text-xs text-gray-500 mt-0.5">{order.deliveryAddress}</p>}
              </div>
            </div>
          )}

          <div>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Artículos</h3>
            <div className="space-y-2">
              {order.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <div>
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {item.quantity}x {item.name}
                    </span>
                    {item.notes && <p className="text-xs text-amber-600 mt-0.5">{item.notes}</p>}
                  </div>
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                    {formatCurrency(item.unitPrice * item.quantity)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {order.notes && (
            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
              <p className="text-sm text-amber-800 dark:text-amber-300">{order.notes}</p>
            </div>
          )}

          <div className="flex items-center justify-between p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Total</span>
            <span className="text-xl font-bold text-emerald-700 dark:text-emerald-400">
              {formatCurrency(order.total)}
            </span>
          </div>

          {nextLabel && (
            <button
              type="button"
              onClick={() => onAdvance(order)}
              disabled={advancing}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold transition-all disabled:opacity-50 shadow-lg"
            >
              {advancing ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowRight className="w-5 h-5" />}
              {nextLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function WorkerTpvDelivery() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ViewTab>('kitchen');
  const [search, setSearch] = useState('');
  const [advancingId, setAdvancingId] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<DeliveryOrder | null>(null);

  const userId = user?.user_id || user?.id || '';

  const loadOrders = useCallback(async () => {
    if (!userId) return;
    try {
      const data = await listDeliveryOrdersRequest(userId);
      setOrders(data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    } catch {
      toast.error('Error al cargar pedidos');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  useEffect(() => {
    if (!userId) return;
    const interval = setInterval(loadOrders, 30000);
    return () => clearInterval(interval);
  }, [userId, loadOrders]);

  const advanceOrder = useCallback(async (order: DeliveryOrder) => {
    const next = NEXT_STATUS[order.status];
    if (!next || !userId) return;
    setAdvancingId(order._id);
    try {
      const updated = await updateDeliveryOrderRequest(userId, { ...order, status: next });
      setOrders(prev => prev.map(o => o._id === updated._id ? updated : o));
      if (selectedOrder?._id === updated._id) setSelectedOrder(updated);
      toast.success(`Pedido #${order.orderNumber} → ${STATUS_CONFIG[next].label}`);
    } catch {
      toast.error('Error al avanzar pedido');
    } finally {
      setAdvancingId(null);
    }
  }, [userId, selectedOrder]);

  const tabConfig = TAB_CONFIG.find(t => t.id === activeTab)!;
  const filtered = useMemo(() => {
    let list = orders;
    if (activeTab !== 'all') {
      list = list.filter(o => tabConfig.statuses.includes(o.status));
    } else {
      list = list.filter(o => o.status !== 'cancelled');
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(o =>
        o.orderNumber.toLowerCase().includes(q) ||
        o.customerName?.toLowerCase().includes(q) ||
        o.items.some(i => i.name.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [orders, activeTab, tabConfig, search]);

  const stats = useMemo(() => ({
    kitchen: orders.filter(o => ['pending', 'preparing', 'kitchen'].includes(o.status)).length,
    assembly: orders.filter(o => o.status === 'assembly').length,
    delivery: orders.filter(o => o.status === 'delivery').length,
    delivered: orders.filter(o => o.status === 'delivered').length,
  }), [orders]);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="shrink-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/saas/worker')}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Volver</span>
            </button>
            <div className="h-6 w-px bg-gray-200 dark:bg-gray-700" />
            <div className="w-10 h-10 bg-orange-100 dark:bg-orange-900/30 rounded-xl flex items-center justify-center">
              <ChefHat className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">Mi Puesto - Cocina</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {orders.filter(o => !['delivered', 'cancelled'].includes(o.status)).length} pedidos activos
              </p>
            </div>
          </div>
          <button
            onClick={() => { setLoading(true); loadOrders(); }}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            title="Refrescar"
          >
            <RefreshCw className={`w-5 h-5 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-4 gap-2 mb-3">
          {[
            { label: 'Cocina', value: stats.kitchen, color: 'bg-orange-50 text-orange-700 border-orange-200' },
            { label: 'Montaje', value: stats.assembly, color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
            { label: 'Reparto', value: stats.delivery, color: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
            { label: 'Entregados', value: stats.delivered, color: 'bg-green-50 text-green-700 border-green-200' },
          ].map(s => (
            <div key={s.label} className={`rounded-xl border p-2.5 text-center ${s.color}`}>
              <p className="text-xl font-bold">{s.value}</p>
              <p className="text-[10px] font-semibold uppercase tracking-wider">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1.5">
          {TAB_CONFIG.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                activeTab === tab.id
                  ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 shadow-md'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              {tab.icon}
              {tab.label}
              {tab.id !== 'all' && (
                <span className={`ml-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  activeTab === tab.id ? 'bg-white/20' : 'bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300'
                }`}>
                  {tab.id === 'kitchen' ? stats.kitchen : tab.id === 'assembly' ? stats.assembly : stats.delivery}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Search */}
      <div className="shrink-0 px-4 py-2 bg-gray-50 dark:bg-gray-950 border-b border-gray-200 dark:border-gray-700">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar pedido, cliente..."
            className="w-full pl-9 pr-8 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm placeholder:text-gray-400 focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="w-4 h-4 text-gray-400" />
            </button>
          )}
        </div>
      </div>

      {/* Orders grid */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <AlertCircle className="w-10 h-10 mb-2" />
            <p className="text-sm font-medium">No hay pedidos en esta sección</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.map(order => (
              <OrderCard
                key={order._id}
                order={order}
                onAdvance={advanceOrder}
                onSelect={setSelectedOrder}
                advancing={advancingId === order._id}
              />
            ))}
          </div>
        )}
      </div>

      {/* Order detail modal */}
      {selectedOrder && (
        <OrderDetail
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onAdvance={advanceOrder}
          advancing={advancingId === selectedOrder._id}
        />
      )}
    </div>
  );
}
