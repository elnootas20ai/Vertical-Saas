import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { Layout } from '../../components/saas/Layout';
import { useApp } from '../../context/AppContext';
import { toast } from 'sonner';
import {
  listButcherOrdersRequest,
  updateButcherOrderStatusRequest,
  convertOrderToSaleRequest,
  type ButcherOrder,
  type OrderStatus,
  type PaymentMethod,
} from '../../lib/butcherApi';
import {
  Clock, ClipboardList, CheckCircle2, PackageCheck, Phone,
  ArrowRight, Ban, GripVertical, RefreshCw,
} from 'lucide-react';

const HOY = new Date().toISOString().slice(0, 10);
const DND_ORDER_TYPE = 'butcher_order_card';
const POLL_MS = 45_000;

const KANBAN_COLUMNS: { status: OrderStatus; label: string; icon: typeof Clock; color: string; headerBg: string }[] = [
  { status: 'pending', label: 'Pendientes', icon: Clock, color: 'border-amber-400', headerBg: 'bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300' },
  { status: 'preparing', label: 'Preparando', icon: ClipboardList, color: 'border-blue-400', headerBg: 'bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300' },
  { status: 'ready', label: 'Listos', icon: CheckCircle2, color: 'border-emerald-400', headerBg: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-300' },
  { status: 'out_for_delivery', label: 'En reparto', icon: PackageCheck, color: 'border-violet-400', headerBg: 'bg-violet-50 dark:bg-violet-900/20 text-violet-800 dark:text-violet-300' },
  { status: 'picked_up', label: 'Recogidos', icon: PackageCheck, color: 'border-gray-400', headerBg: 'bg-gray-50 dark:bg-gray-700/30 text-gray-600 dark:text-gray-400' },
  { status: 'delivered', label: 'Entregados', icon: PackageCheck, color: 'border-gray-400', headerBg: 'bg-gray-50 dark:bg-gray-700/30 text-gray-600 dark:text-gray-400' },
];

const TYPE_BADGE: Record<string, string> = {
  simple: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  reservation: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
  special: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
};
const TYPE_LABEL: Record<string, string> = { simple: 'PED', reservation: 'RES', special: 'ENC' };

const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  pending: 'preparing',
  preparing: 'ready',
  ready: 'picked_up',
  out_for_delivery: 'delivered',
};

const PAGO_METHODS: { key: PaymentMethod; label: string }[] = [
  { key: 'cash', label: 'Efectivo' },
  { key: 'card', label: 'Tarjeta' },
  { key: 'bizum', label: 'Bizum' },
];

interface DragOrderItem {
  orderId: string;
  fromStatus: OrderStatus;
}

function canDropOnColumn(fromStatus: OrderStatus, toStatus: OrderStatus): boolean {
  if (fromStatus === toStatus || fromStatus === 'picked_up' || fromStatus === 'delivered' || fromStatus === 'cancelled') return false;
  if (toStatus === 'picked_up') return fromStatus === 'ready';
  if (toStatus === 'out_for_delivery') return fromStatus === 'ready';
  if (toStatus === 'delivered') return fromStatus === 'out_for_delivery';
  return true;
}

function OrderCard({
  order,
  onAdvance,
  onCancel,
}: {
  order: ButcherOrder;
  onAdvance: (order: ButcherOrder) => void;
  onCancel: (order: ButcherOrder) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const dragHandleRef = useRef<HTMLDivElement>(null);
  const draggable = order.status !== 'picked_up' && order.status !== 'delivered' && order.status !== 'cancelled';

  const [{ isDragging }, drag, preview] = useDrag({
    type: DND_ORDER_TYPE,
    item: (): DragOrderItem => ({ orderId: order._id, fromStatus: order.status }),
    canDrag: draggable,
    collect: (monitor) => ({ isDragging: monitor.isDragging() }),
  });

  preview(ref);
  drag(dragHandleRef);

  return (
    <div
      ref={ref}
      className={`rounded-lg border border-gray-100 dark:border-gray-700 p-3 bg-white dark:bg-gray-800/50 transition-all ${
        order.priority === 'urgent' ? 'ring-2 ring-red-400 ring-offset-1' : ''
      } ${isDragging ? 'opacity-40 scale-[0.98] shadow-lg' : ''}`}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {draggable ? (
            <div
              ref={dragHandleRef}
              className="cursor-grab active:cursor-grabbing text-gray-300 dark:text-gray-600 shrink-0 touch-none"
              title="Arrastrar"
            >
              <GripVertical className="w-3.5 h-3.5" />
            </div>
          ) : null}
          <span className="font-mono font-bold text-xs text-gray-900 dark:text-white">{order.orderNumber}</span>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${TYPE_BADGE[order.orderType]}`}>{TYPE_LABEL[order.orderType]}</span>
          {order.priority === 'urgent' && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">!</span>}
        </div>
        {order.pickupTime && (
          <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 flex items-center gap-0.5">
            <Clock className="w-3 h-3" />{order.pickupTime}
          </span>
        )}
      </div>

      <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{order.clientName || 'Anónimo'}</p>
      {order.clientPhone && (
        <a href={`tel:${order.clientPhone}`} className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600 mt-0.5" onClick={(e) => e.stopPropagation()}>
          <Phone className="w-3 h-3" />{order.clientPhone}
        </a>
      )}

      <div className="mt-2 space-y-0.5">
        {order.items.slice(0, 3).map((it, j) => (
          <p key={j} className="text-xs text-gray-600 dark:text-gray-400 truncate">
            {it.quantity}{it.unit} {it.productName}
          </p>
        ))}
        {order.items.length > 3 && <p className="text-xs text-gray-400">+{order.items.length - 3} más</p>}
      </div>

      {order.notes && <p className="text-[11px] text-gray-400 italic mt-1.5 truncate">{order.notes}</p>}

      <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-50 dark:border-gray-700/50">
        <span className="text-sm font-bold text-gray-900 dark:text-white">{order.total.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</span>
        <div className="flex items-center gap-1">
          {NEXT_STATUS[order.status] && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onAdvance(order); }}
              className="px-2.5 py-1 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-md text-xs font-semibold hover:opacity-90 transition flex items-center gap-1"
            >
              <ArrowRight className="w-3 h-3" />
            </button>
          )}
          {order.status !== 'picked_up' && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onCancel(order); }}
              className="p-1 rounded-md hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500"
            >
              <Ban className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function KanbanColumn({
  status,
  label,
  icon: Icon,
  color,
  headerBg,
  items,
  onDropOrder,
  onAdvance,
  onCancel,
}: {
  status: OrderStatus;
  label: string;
  icon: typeof Clock;
  color: string;
  headerBg: string;
  items: ButcherOrder[];
  onDropOrder: (orderId: string, fromStatus: OrderStatus, toStatus: OrderStatus) => void;
  onAdvance: (order: ButcherOrder) => void;
  onCancel: (order: ButcherOrder) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const [{ isOver, canDropHere }, drop] = useDrop({
    accept: DND_ORDER_TYPE,
    canDrop: (item) => canDropOnColumn(item.fromStatus, status),
    drop: (item: DragOrderItem) => onDropOrder(item.orderId, item.fromStatus, status),
    collect: (monitor) => ({
      isOver: monitor.isOver({ shallow: true }),
      canDropHere: monitor.canDrop(),
    }),
  });

  drop(ref);

  return (
    <div className={`rounded-xl border-t-4 ${color} bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col min-h-[280px]`}>
      <div className={`px-4 py-3 ${headerBg} flex items-center justify-between shrink-0`}>
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4" />
          <span className="text-sm font-bold">{label}</span>
        </div>
        <span className="text-sm font-bold">{items.length}</span>
      </div>
      <div
        ref={ref}
        className={`p-3 space-y-2.5 flex-1 max-h-[calc(100vh-250px)] overflow-y-auto transition-colors ${
          isOver && canDropHere ? 'bg-blue-50/80 dark:bg-blue-950/30 ring-2 ring-inset ring-blue-300 dark:ring-blue-700' : ''
        } ${isOver && !canDropHere ? 'bg-red-50/50 dark:bg-red-950/20' : ''}`}
      >
        {items.length === 0 ? (
          <p className="text-center text-xs text-gray-400 py-6">
            {status === 'picked_up' ? 'Arrastra aquí un pedido listo' : 'Sin pedidos'}
          </p>
        ) : items.map((o) => (
          <OrderCard key={o._id} order={o} onAdvance={onAdvance} onCancel={onCancel} />
        ))}
      </div>
    </div>
  );
}

function ButcherWorkerOrdersBoard() {
  const { userId } = useApp();
  const [orders, setOrders] = useState<ButcherOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showOnlyToday, setShowOnlyToday] = useState(true);
  const [convertingOrder, setConvertingOrder] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');

  const fetchOrders = useCallback(async (silent = false) => {
    if (!userId) return;
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await listButcherOrdersRequest(userId);
      if (res.ok) setOrders(res.orders || []);
    } catch { /* ignore */ }
    setLoading(false);
    setRefreshing(false);
  }, [userId]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') fetchOrders(true);
    };
    document.addEventListener('visibilitychange', onVisible);
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') fetchOrders(true);
    }, POLL_MS);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(timer);
    };
  }, [fetchOrders]);

  const filteredOrders = useMemo(() => {
    let list = orders.filter((o) => o.status !== 'cancelled');
    if (showOnlyToday) list = list.filter((o) => o.pickupDate === HOY);
    return list;
  }, [orders, showOnlyToday]);

  const columns = useMemo(() => {
    return KANBAN_COLUMNS.map((col) => ({
      ...col,
      items: filteredOrders.filter((o) => o.status === col.status)
        .sort((a, b) => {
          if (a.priority === 'urgent' && b.priority !== 'urgent') return -1;
          if (b.priority === 'urgent' && a.priority !== 'urgent') return 1;
          return (a.pickupTime || '').localeCompare(b.pickupTime || '');
        }),
    }));
  }, [filteredOrders]);

  const applyLocalStatus = useCallback((orderId: string, status: OrderStatus) => {
    setOrders((prev) => prev.map((o) => (o._id === orderId ? { ...o, status } : o)));
  }, []);

  const handleStatusChange = useCallback(async (orderId: string, fromStatus: OrderStatus, toStatus: OrderStatus) => {
    if (!userId || fromStatus === toStatus) return;
    if (!canDropOnColumn(fromStatus, toStatus)) {
      if (toStatus === 'picked_up') toast.error('Solo puedes entregar pedidos en estado Listo');
      return;
    }

    if (toStatus === 'picked_up') {
      setConvertingOrder(orderId);
      setPaymentMethod('cash');
      return;
    }

    const prev = orders.find((o) => o._id === orderId);
    applyLocalStatus(orderId, toStatus);
    try {
      const res = await updateButcherOrderStatusRequest(userId, orderId, toStatus);
      if (res.ok) {
        toast.success(`Movido a ${KANBAN_COLUMNS.find((c) => c.status === toStatus)?.label}`);
      } else {
        if (prev) applyLocalStatus(orderId, prev.status);
        toast.error(res.error || 'No se pudo actualizar');
      }
    } catch {
      if (prev) applyLocalStatus(orderId, prev.status);
      toast.error('Error de conexión');
    }
  }, [userId, orders, applyLocalStatus]);

  const handleAdvance = async (order: ButcherOrder) => {
    let next = NEXT_STATUS[order.status];
    if (order.status === 'ready' && order.fulfillmentMode === 'delivery') {
      next = 'out_for_delivery';
    }
    if (!next) return;
    await handleStatusChange(order._id, order.status, next);
  };

  const handleConvertAndPickup = async () => {
    if (!userId || !convertingOrder) return;
    try {
      const res = await convertOrderToSaleRequest(userId, convertingOrder, paymentMethod);
      if (res.ok) {
        toast.success('Pedido entregado y venta registrada');
        setConvertingOrder(null);
        fetchOrders(true);
      } else toast.error(res.error || 'Error');
    } catch { toast.error('Error de conexión'); }
  };

  const handleCancel = async (order: ButcherOrder) => {
    if (!userId) return;
    try {
      const res = await updateButcherOrderStatusRequest(userId, order._id, 'cancelled');
      if (res.ok) {
        toast.success('Pedido cancelado');
        setOrders((prev) => prev.filter((o) => o._id !== order._id));
      }
    } catch { toast.error('Error'); }
  };

  return (
    <Layout title="Tablero de encargos">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setShowOnlyToday(true)} className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${showOnlyToday ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>Hoy</button>
          <button type="button" onClick={() => setShowOnlyToday(false)} className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${!showOnlyToday ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>Todos</button>
          <button
            type="button"
            onClick={() => fetchOrders(true)}
            disabled={refreshing}
            className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
            title="Actualizar"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {filteredOrders.length} pedido{filteredOrders.length !== 1 ? 's' : ''}
          <span className="hidden sm:inline text-gray-400"> · Arrastra entre columnas</span>
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 animate-pulse h-64" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
          {columns.map((col) => (
            <KanbanColumn
              key={col.status}
              status={col.status}
              label={col.label}
              icon={col.icon}
              color={col.color}
              headerBg={col.headerBg}
              items={col.items}
              onDropOrder={handleStatusChange}
              onAdvance={handleAdvance}
              onCancel={handleCancel}
            />
          ))}
        </div>
      )}

      {convertingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setConvertingOrder(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Entregar pedido</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">Selecciona el método de pago para registrar la venta.</p>
            <div className="flex gap-2 mb-6">
              {PAGO_METHODS.map((m) => (
                <button key={m.key} type="button" onClick={() => setPaymentMethod(m.key)}
                  className={`flex-1 px-3 py-2.5 rounded-xl text-sm font-semibold transition ${paymentMethod === m.key ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'}`}>
                  {m.label}
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => setConvertingOrder(null)} className="flex-1 px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-300">Cancelar</button>
              <button type="button" onClick={handleConvertAndPickup} className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 transition">Entregar</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

export function ButcherWorkerOrders() {
  return (
    <DndProvider backend={HTML5Backend}>
      <ButcherWorkerOrdersBoard />
    </DndProvider>
  );
}
