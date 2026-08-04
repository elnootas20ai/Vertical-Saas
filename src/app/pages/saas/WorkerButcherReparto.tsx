import { useCallback, useEffect, useMemo, useState } from 'react';
import { Layout } from '../../components/saas/Layout';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'sonner';
import {
  listButcherOrdersRequest,
  updateButcherOrderStatusRequest,
  type ButcherOrder,
} from '../../lib/butcherApi';
import { Truck, MapPin, Phone, CheckCircle2, RefreshCw, Package } from 'lucide-react';

const HOY = new Date().toISOString().slice(0, 10);

export function WorkerButcherReparto() {
  const { userId } = useApp();
  const { user } = useAuth();
  const myId = user?.user_id || user?.id || userId || '';
  const [orders, setOrders] = useState<ButcherOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const res = await listButcherOrdersRequest(userId);
      if (res.ok) setOrders(res.orders || []);
    } catch {
      toast.error('Error cargando repartos');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { void load(); }, [load]);

  const mine = useMemo(() => {
    return orders
      .filter((o) =>
        o.fulfillmentMode === 'delivery'
        && !['cancelled', 'picked_up', 'delivered'].includes(o.status)
        && (o.status === 'out_for_delivery' || o.status === 'ready')
        && (!o.assignedWorkerId || o.assignedWorkerId === myId),
      )
      .sort((a, b) => String(a.pickupTime || '').localeCompare(String(b.pickupTime || '')));
  }, [orders, myId]);

  const advance = async (o: ButcherOrder, status: ButcherOrder['status']) => {
    if (!userId) return;
    setBusy(o._id);
    try {
      const res = await updateButcherOrderStatusRequest(userId, o._id, status);
      if (res.ok) {
        toast.success(status === 'delivered' ? 'Entregado' : 'En ruta');
        await load();
      } else toast.error(res.error || 'Error');
    } catch {
      toast.error('Error de conexión');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Layout title="Mis repartos" subtitle={`Hoy ${HOY}`}>
      <div className="flex justify-end mb-4">
        <button
          type="button"
          onClick={() => { void load(); }}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm"
        >
          <RefreshCw className="w-4 h-4" /> Actualizar
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">{[1, 2].map((i) => <div key={i} className="h-24 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />)}</div>
      ) : mine.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <Package className="w-10 h-10 mx-auto mb-2 opacity-40" />
          No tienes repartos asignados ahora
        </div>
      ) : (
        <div className="space-y-3">
          {mine.map((o) => (
            <div key={o._id} className="bg-white dark:bg-gray-800 rounded-xl border p-4">
              <div className="flex justify-between gap-3">
                <div>
                  <p className="font-mono font-bold text-sm">{o.orderNumber}</p>
                  <p className="font-medium">{o.clientName}</p>
                  {o.clientPhone && <p className="text-sm text-gray-500 flex items-center gap-1"><Phone className="w-3 h-3" />{o.clientPhone}</p>}
                  {o.deliveryAddress && (
                    <p className="text-sm text-violet-700 dark:text-violet-300 flex items-center gap-1 mt-1">
                      <MapPin className="w-3.5 h-3.5" />{o.deliveryAddress}
                    </p>
                  )}
                  <p className="text-xs text-gray-500 mt-1">{o.pickupTime} · {o.total.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</p>
                </div>
                <div className="flex flex-col gap-2">
                  {o.status === 'ready' && (
                    <button
                      type="button"
                      disabled={busy === o._id}
                      onClick={() => { void advance(o, 'out_for_delivery'); }}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-violet-600 text-white inline-flex items-center gap-1"
                    >
                      <Truck className="w-3.5 h-3.5" /> Salir
                    </button>
                  )}
                  {o.status === 'out_for_delivery' && (
                    <button
                      type="button"
                      disabled={busy === o._id}
                      onClick={() => { void advance(o, 'delivered'); }}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white inline-flex items-center gap-1"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> Entregado
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}
