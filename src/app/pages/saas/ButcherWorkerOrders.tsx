import { useState, useMemo, useCallback, useEffect } from 'react';
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
  ArrowRight, Ban,
} from 'lucide-react';

const HOY = new Date().toISOString().slice(0, 10);

const KANBAN_COLUMNS: { status: OrderStatus; label: string; icon: any; color: string; headerBg: string }[] = [
  { status: 'pending', label: 'Pendientes', icon: Clock, color: 'border-amber-400', headerBg: 'bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300' },
  { status: 'preparing', label: 'Preparando', icon: ClipboardList, color: 'border-blue-400', headerBg: 'bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300' },
  { status: 'ready', label: 'Listos', icon: CheckCircle2, color: 'border-emerald-400', headerBg: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-300' },
  { status: 'picked_up', label: 'Recogidos', icon: PackageCheck, color: 'border-gray-400', headerBg: 'bg-gray-50 dark:bg-gray-700/30 text-gray-600 dark:text-gray-400' },
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
};

const PAGO_METHODS: { key: PaymentMethod; label: string }[] = [
  { key: 'cash', label: 'Efectivo' },
  { key: 'card', label: 'Tarjeta' },
  { key: 'bizum', label: 'Bizum' },
];

export function ButcherWorkerOrders() {
  const { userId } = useApp();
  const [orders, setOrders] = useState<ButcherOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showOnlyToday, setShowOnlyToday] = useState(true);
  const [convertingOrder, setConvertingOrder] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');

  const fetchOrders = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const res = await listButcherOrdersRequest(userId);
      if (res.ok) setOrders(res.orders || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

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

  const handleAdvance = async (order: ButcherOrder) => {
    if (!userId) return;
    const next = NEXT_STATUS[order.status];
    if (!next) return;

    if (next === 'picked_up') {
      setConvertingOrder(order._id);
      setPaymentMethod('cash');
      return;
    }

    try {
      const res = await updateButcherOrderStatusRequest(userId, order._id, next);
      if (res.ok) {
        toast.success(`${order.orderNumber} → ${KANBAN_COLUMNS.find((c) => c.status === next)?.label}`);
        fetchOrders();
      }
    } catch { toast.error('Error de conexión'); }
  };

  const handleConvertAndPickup = async () => {
    if (!userId || !convertingOrder) return;
    try {
      const res = await convertOrderToSaleRequest(userId, convertingOrder, paymentMethod);
      if (res.ok) {
        toast.success('Pedido entregado y venta registrada');
        setConvertingOrder(null);
        fetchOrders();
      } else toast.error(res.error || 'Error');
    } catch { toast.error('Error de conexión'); }
  };

  const handleCancel = async (order: ButcherOrder) => {
    if (!userId) return;
    try {
      const res = await updateButcherOrderStatusRequest(userId, order._id, 'cancelled');
      if (res.ok) { toast.success('Pedido cancelado'); fetchOrders(); }
    } catch { toast.error('Error'); }
  };

  return (
    <Layout title="Tablero de encargos">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setShowOnlyToday(true)} className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${showOnlyToday ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>Hoy</button>
          <button type="button" onClick={() => setShowOnlyToday(false)} className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${!showOnlyToday ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>Todos</button>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {filteredOrders.length} pedido{filteredOrders.length !== 1 ? 's' : ''}
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
            <div key={col.status} className={`rounded-xl border-t-4 ${col.color} bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 overflow-hidden`}>
              <div className={`px-4 py-3 ${col.headerBg} flex items-center justify-between`}>
                <div className="flex items-center gap-2">
                  <col.icon className="w-4 h-4" />
                  <span className="text-sm font-bold">{col.label}</span>
                </div>
                <span className="text-sm font-bold">{col.items.length}</span>
              </div>
              <div className="p-3 space-y-2.5 max-h-[calc(100vh-250px)] overflow-y-auto">
                {col.items.length === 0 ? (
                  <p className="text-center text-xs text-gray-400 py-6">Sin pedidos</p>
                ) : col.items.map((o) => (
                  <div key={o._id} className={`rounded-lg border border-gray-100 dark:border-gray-700 p-3 bg-white dark:bg-gray-800/50 ${o.priority === 'urgent' ? 'ring-2 ring-red-400 ring-offset-1' : ''}`}>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-mono font-bold text-xs text-gray-900 dark:text-white">{o.orderNumber}</span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${TYPE_BADGE[o.orderType]}`}>{TYPE_LABEL[o.orderType]}</span>
                        {o.priority === 'urgent' && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">!</span>}
                      </div>
                      {o.pickupTime && <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 flex items-center gap-0.5"><Clock className="w-3 h-3" />{o.pickupTime}</span>}
                    </div>

                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{o.clientName || 'Anónimo'}</p>
                    {o.clientPhone && (
                      <a href={`tel:${o.clientPhone}`} className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600 mt-0.5" onClick={(e) => e.stopPropagation()}>
                        <Phone className="w-3 h-3" />{o.clientPhone}
                      </a>
                    )}

                    <div className="mt-2 space-y-0.5">
                      {o.items.slice(0, 3).map((it, j) => (
                        <p key={j} className="text-xs text-gray-600 dark:text-gray-400 truncate">
                          {it.quantity}{it.unit} {it.productName}
                        </p>
                      ))}
                      {o.items.length > 3 && <p className="text-xs text-gray-400">+{o.items.length - 3} más</p>}
                    </div>

                    {o.notes && <p className="text-[11px] text-gray-400 italic mt-1.5 truncate">{o.notes}</p>}

                    <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-50 dark:border-gray-700/50">
                      <span className="text-sm font-bold text-gray-900 dark:text-white">{o.total.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</span>
                      <div className="flex items-center gap-1">
                        {NEXT_STATUS[o.status] && (
                          <button type="button" onClick={() => handleAdvance(o)} className="px-2.5 py-1 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-md text-xs font-semibold hover:opacity-90 transition flex items-center gap-1">
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        )}
                        {o.status !== 'picked_up' && (
                          <button type="button" onClick={() => handleCancel(o)} className="p-1 rounded-md hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500">
                            <Ban className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
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
