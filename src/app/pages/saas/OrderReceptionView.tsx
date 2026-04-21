import { useState, useMemo } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import {
  markOrderReceivedRequest,
  type PurchaseOrder,
  type PurchaseOrderItem,
  type PurchaseOrderStatus,
} from '../../lib/purchaseOrderApi';
import {
  Truck, Package, CheckCircle2, AlertTriangle, X, Clock, Search, Eye,
  ChevronDown, ChevronUp, Hash, Factory, Calendar, FileText,
} from 'lucide-react';

/* ─── Types ─────────────────────────────────────────────────────── */

interface ReceptionViewProps {
  orders: PurchaseOrder[];
  onOrderUpdated: (updated: PurchaseOrder) => void;
}

/* ─── Reception Modal ───────────────────────────────────────────── */

interface ReceptionModalProps {
  order: PurchaseOrder;
  onClose: () => void;
  onSave: (order: PurchaseOrder, receivedItems: Array<{ catalogItemId: string; quantity: number }>) => void;
}

function ReceptionModal({ order, onClose, onSave }: ReceptionModalProps) {
  const [receivedQtys, setReceivedQtys] = useState<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    for (const item of order.items) {
      map[item.catalogItemId || item.id] = item.received || 0;
    }
    return map;
  });

  const handleSetQty = (key: string, qty: number) => {
    setReceivedQtys(prev => ({ ...prev, [key]: Math.max(0, qty) }));
  };

  const handleReceiveAll = () => {
    const map: Record<string, number> = {};
    for (const item of order.items) {
      map[item.catalogItemId || item.id] = item.quantity;
    }
    setReceivedQtys(map);
  };

  const handleSubmit = () => {
    const receivedItems = order.items.map(item => ({
      catalogItemId: item.catalogItemId,
      quantity: receivedQtys[item.catalogItemId || item.id] || 0,
    }));
    onSave(order, receivedItems);
  };

  const allReceived = order.items.every(item => {
    const key = item.catalogItemId || item.id;
    return (receivedQtys[key] || 0) >= item.quantity;
  });

  const someReceived = order.items.some(item => {
    const key = item.catalogItemId || item.id;
    return (receivedQtys[key] || 0) > 0;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-900/30 rounded-xl flex items-center justify-center">
              <Truck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Recepción de mercancía</h2>
              <p className="text-sm text-gray-500">{order.orderNumber} · {order.supplierName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">Introduce la cantidad recibida de cada artículo</p>
            <button
              onClick={handleReceiveAll}
              className="px-3 py-1.5 text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors"
            >
              Recibir todo
            </button>
          </div>

          <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/40">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Artículo</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Pedido</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Prev. recibido</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Recibido ahora</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                {order.items.map(item => {
                  const key = item.catalogItemId || item.id;
                  const currentReceived = receivedQtys[key] || 0;
                  const isComplete = currentReceived >= item.quantity;
                  const isPartial = currentReceived > 0 && currentReceived < item.quantity;
                  return (
                    <tr key={key} className={`transition-colors ${isComplete ? 'bg-emerald-50/50 dark:bg-emerald-900/5' : ''}`}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900 dark:text-gray-100">{item.name}</div>
                        {item.sku && <div className="text-xs text-gray-400 font-mono">{item.sku}</div>}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300 tabular-nums font-semibold">{item.quantity}</td>
                      <td className="px-4 py-3 text-right text-gray-400 tabular-nums">{item.received || 0}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleSetQty(key, currentReceived - 1)}
                            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                          >
                            <ChevronDown className="w-4 h-4 text-gray-400" />
                          </button>
                          <input
                            type="number"
                            min="0"
                            max={item.quantity * 2}
                            className="w-16 px-2 py-1.5 text-center border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm font-semibold text-gray-900 dark:text-gray-100 outline-none"
                            value={currentReceived}
                            onChange={e => handleSetQty(key, Number(e.target.value) || 0)}
                          />
                          <button
                            onClick={() => handleSetQty(key, currentReceived + 1)}
                            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                          >
                            <ChevronUp className="w-4 h-4 text-gray-400" />
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {isComplete ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-500 mx-auto" />
                        ) : isPartial ? (
                          <AlertTriangle className="w-5 h-5 text-amber-500 mx-auto" />
                        ) : (
                          <Clock className="w-5 h-5 text-gray-300 dark:text-gray-600 mx-auto" />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Summary */}
          <div className="flex items-center gap-4 px-4 py-3 bg-gray-50 dark:bg-gray-900/40 rounded-xl text-sm">
            <div className="flex-1">
              <span className="text-gray-500">Total pedido: </span>
              <span className="font-bold text-gray-900 dark:text-gray-100">{order.items.reduce((s, i) => s + i.quantity, 0)} uds.</span>
            </div>
            <div className="flex-1 text-center">
              <span className="text-gray-500">Recibido: </span>
              <span className={`font-bold ${allReceived ? 'text-emerald-600' : someReceived ? 'text-amber-600' : 'text-gray-400'}`}>
                {Object.values(receivedQtys).reduce((s, v) => s + v, 0)} uds.
              </span>
            </div>
            <div className="flex-1 text-right">
              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold ${
                allReceived ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400' :
                someReceived ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400' :
                'bg-gray-100 text-gray-500'
              }`}>
                {allReceived ? 'Completo' : someReceived ? 'Parcial' : 'Pendiente'}
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-4 flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-3 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={!someReceived}
            className="flex-1 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            {allReceived ? 'Confirmar recepción completa' : 'Confirmar recepción parcial'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Reception View ───────────────────────────────────────── */

export function OrderReceptionView({ orders, onOrderUpdated }: ReceptionViewProps) {
  const { user } = useAuth();
  const [receivingOrder, setReceivingOrder] = useState<PurchaseOrder | null>(null);
  const [search, setSearch] = useState('');

  const pendingOrders = useMemo(() => {
    return orders
      .filter(o => ['sent', 'partial'].includes(o.status))
      .filter(o => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return o.orderNumber.toLowerCase().includes(q) ||
          o.supplierName.toLowerCase().includes(q) ||
          o.items.some(i => i.name.toLowerCase().includes(q));
      })
      .sort((a, b) => {
        if (a.status === 'partial' && b.status !== 'partial') return -1;
        if (b.status === 'partial' && a.status !== 'partial') return 1;
        return (a.expectedDate || '').localeCompare(b.expectedDate || '');
      });
  }, [orders, search]);

  const recentlyReceived = useMemo(() => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    return orders
      .filter(o => o.status === 'received' && o.receivedAt >= sevenDaysAgo)
      .sort((a, b) => (b.receivedAt || '').localeCompare(a.receivedAt || ''));
  }, [orders]);

  const handleReceive = async (order: PurchaseOrder, receivedItems: Array<{ catalogItemId: string; quantity: number }>) => {
    if (!user?.id) return;
    try {
      const updated = await markOrderReceivedRequest(user.id, order._id, receivedItems);
      onOrderUpdated(updated);
      setReceivingOrder(null);
      const allDone = receivedItems.every((ri, i) => ri.quantity >= (order.items[i]?.quantity || 0));
      toast.success(allDone ? 'Recepción completa — stock actualizado' : 'Recepción parcial registrada — stock actualizado');
    } catch (err: any) {
      toast.error(err?.message || 'Error al registrar recepción');
    }
  };

  return (
    <div className="space-y-5">
      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
        <input
          className="w-full pl-10 pr-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-sm outline-none focus:border-gray-400 text-gray-900 dark:text-gray-100"
          placeholder="Buscar por nº pedido, proveedor..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Pending reception */}
      <div>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <Truck className="w-3.5 h-3.5" /> Pendientes de recepción ({pendingOrders.length})
        </h3>

        {pendingOrders.length === 0 ? (
          <div className="text-center py-16 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl">
            <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
            <p className="font-semibold text-gray-700 dark:text-gray-300">Sin pedidos pendientes</p>
            <p className="text-sm text-gray-400 mt-1">Todos los pedidos enviados han sido recibidos</p>
          </div>
        ) : (
          <div className="space-y-2">
            {pendingOrders.map(order => {
              const totalOrdered = order.items.reduce((s, i) => s + i.quantity, 0);
              const totalReceived = order.items.reduce((s, i) => s + (i.received || 0), 0);
              const progress = totalOrdered > 0 ? (totalReceived / totalOrdered) * 100 : 0;
              const isOverdue = order.expectedDate && new Date(order.expectedDate) < new Date();

              return (
                <div key={order._id} className={`bg-white dark:bg-gray-800 border rounded-xl hover:shadow-sm transition-all ${
                  isOverdue ? 'border-red-200 dark:border-red-800/50' : 'border-gray-200 dark:border-gray-700'
                }`}>
                  <div className="p-4 flex items-center gap-4">
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                      order.status === 'partial' ? 'bg-amber-100 dark:bg-amber-900/20' : 'bg-blue-50 dark:bg-blue-900/20'
                    }`}>
                      {order.status === 'partial' ? (
                        <AlertTriangle className="w-5 h-5 text-amber-500" />
                      ) : (
                        <Truck className="w-5 h-5 text-blue-500" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-gray-900 dark:text-gray-100 text-sm">{order.orderNumber}</span>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-lg ${
                          order.status === 'partial'
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400'
                            : 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400'
                        }`}>
                          {order.status === 'partial' ? 'Parcial' : 'Enviado'}
                        </span>
                        {isOverdue && (
                          <span className="inline-flex items-center gap-0.5 px-2 py-0.5 text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400 rounded-lg">
                            <AlertTriangle className="w-3 h-3" /> Retrasado
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                        <span className="flex items-center gap-1"><Factory className="w-3.5 h-3.5" /> {order.supplierName || 'Sin proveedor'}</span>
                        <span>{order.items.length} artículo(s)</span>
                        {order.expectedDate && (
                          <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> {new Date(order.expectedDate).toLocaleDateString('es-ES')}</span>
                        )}
                      </div>
                      {/* Progress bar */}
                      {order.status === 'partial' && (
                        <div className="mt-2 flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                            <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${progress}%` }} />
                          </div>
                          <span className="text-xs text-gray-400 tabular-nums">{Math.round(progress)}%</span>
                        </div>
                      )}
                    </div>

                    <div className="text-right shrink-0 hidden sm:block">
                      <p className="text-base font-bold text-gray-900 dark:text-gray-100 tabular-nums">{order.total.toFixed(2)}€</p>
                    </div>

                    <button
                      onClick={() => setReceivingOrder(order)}
                      className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold transition-colors flex items-center gap-1.5 shrink-0"
                    >
                      <Package className="w-4 h-4" />
                      Recibir
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recently received */}
      {recentlyReceived.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Recibidos recientemente ({recentlyReceived.length})
          </h3>
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-700/60 bg-gray-50 dark:bg-gray-900/40">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Pedido</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Proveedor</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Artículos</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Total</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Recibido</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700/40">
                {recentlyReceived.map(order => (
                  <tr key={order._id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/10">
                    <td className="px-4 py-2.5">
                      <span className="font-semibold text-gray-900 dark:text-gray-100">{order.orderNumber}</span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-600 dark:text-gray-300">{order.supplierName}</td>
                    <td className="px-4 py-2.5 text-right text-gray-500 tabular-nums">{order.items.length}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-gray-900 dark:text-gray-100 tabular-nums">{order.total.toFixed(2)}€</td>
                    <td className="px-4 py-2.5 text-right text-gray-400 text-xs">
                      {order.receivedAt ? new Date(order.receivedAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Reception modal */}
      {receivingOrder && (
        <ReceptionModal
          order={receivingOrder}
          onClose={() => setReceivingOrder(null)}
          onSave={handleReceive}
        />
      )}
    </div>
  );
}
