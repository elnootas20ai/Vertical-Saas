import { useCallback, useEffect, useMemo, useState } from 'react';
import { Layout } from '../../components/saas/Layout';
import { useApp } from '../../context/AppContext';
import { useBusiness } from '../../context/BusinessContext';
import { toast } from 'sonner';
import {
  listButcherOrdersRequest,
  updateButcherOrderStatusRequest,
  updateButcherOrderRequest,
  type ButcherOrder,
} from '../../lib/butcherApi';
import {
  Truck, MapPin, Phone, Clock, CheckCircle2, RefreshCw, Banknote, Package,
} from 'lucide-react';
import { Link } from 'react-router-dom';

const HOY = new Date().toISOString().slice(0, 10);

export function ButcherReparto() {
  const { userId } = useApp();
  const { currentBusiness, updateBusiness } = useBusiness();
  const enabled = Boolean(currentBusiness?.ownDeliveryEnabled);
  const [orders, setOrders] = useState<ButcherOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const res = await listButcherOrdersRequest(userId);
      if (res.ok) setOrders(res.orders || []);
    } catch {
      toast.error('No se pudieron cargar los encargos');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { void load(); }, [load]);

  const deliveryOrders = useMemo(() => {
    return orders
      .filter((o) => o.fulfillmentMode === 'delivery' && !['cancelled', 'picked_up'].includes(o.status))
      .sort((a, b) => {
        const rank = (s: string) => ({ out_for_delivery: 0, ready: 1, preparing: 2, pending: 3, delivered: 4 }[s] ?? 9);
        return rank(a.status) - rank(b.status) || String(a.pickupTime || '').localeCompare(String(b.pickupTime || ''));
      });
  }, [orders]);

  const todayActive = deliveryOrders.filter((o) => o.pickupDate === HOY && o.status !== 'delivered');
  const inRoute = deliveryOrders.filter((o) => o.status === 'out_for_delivery');

  const advance = async (o: ButcherOrder, status: ButcherOrder['status']) => {
    if (!userId) return;
    setBusyId(o._id);
    try {
      const res = await updateButcherOrderStatusRequest(userId, o._id, status);
      if (res.ok) {
        toast.success(status === 'delivered' ? 'Entregado' : 'En reparto');
        await load();
      } else toast.error(res.error || 'Error');
    } catch {
      toast.error('Error de conexión');
    } finally {
      setBusyId(null);
    }
  };

  const assignSelf = async (o: ButcherOrder) => {
    if (!userId) return;
    setBusyId(o._id);
    try {
      const res = await updateButcherOrderRequest(userId, o._id, {
        assignedWorkerId: userId,
        assignedWorkerName: 'Yo',
      } as Partial<ButcherOrder>);
      if (res.ok) {
        toast.success('Asignado');
        await load();
      }
    } catch {
      toast.error('Error al asignar');
    } finally {
      setBusyId(null);
    }
  };

  const toggleDelivery = async () => {
    if (!currentBusiness?.business_id || !updateBusiness) return;
    try {
      await updateBusiness(currentBusiness.business_id, {
        ownDeliveryEnabled: !enabled,
      });
      toast.success(!enabled ? 'Repartos activados' : 'Repartos desactivados');
    } catch {
      toast.error('No se pudo guardar la opción');
    }
  };

  if (!enabled) {
    return (
      <Layout title="Repartos">
        <div className="max-w-lg mx-auto bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-8 text-center">
          <Truck className="w-12 h-12 text-violet-500 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Repartos a domicilio</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            Activa esta opción para crear encargos con entrega, asignar repartidor y seguir el estado En reparto / Entregado.
          </p>
          <button
            type="button"
            onClick={() => { void toggleDelivery(); }}
            className="px-5 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700"
          >
            Activar repartos
          </button>
          <p className="text-xs text-gray-400 mt-4">
            También puedes gestionar encargos en{' '}
            <Link to="/saas/butcher-orders" className="text-violet-600 underline">Pedidos</Link>.
          </p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Repartos">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex gap-3">
          <div className="px-4 py-3 rounded-xl bg-violet-50 dark:bg-violet-950/40 border border-violet-200 dark:border-violet-800">
            <p className="text-xs text-violet-600 dark:text-violet-300">Hoy activos</p>
            <p className="text-xl font-bold text-violet-900 dark:text-violet-100">{todayActive.length}</p>
          </div>
          <div className="px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800">
            <p className="text-xs text-amber-600 dark:text-amber-300">En ruta</p>
            <p className="text-xl font-bold text-amber-900 dark:text-amber-100">{inRoute.length}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => { void load(); }}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm"
          >
            <RefreshCw className="w-4 h-4" /> Actualizar
          </button>
          <button
            type="button"
            onClick={() => { void toggleDelivery(); }}
            className="px-3 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            Desactivar repartos
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
          ))}
        </div>
      ) : deliveryOrders.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <Package className="w-10 h-10 mx-auto mb-2 opacity-40" />
          No hay encargos de reparto. Créalos en Pedidos eligiendo «Reparto a domicilio».
        </div>
      ) : (
        <div className="space-y-3">
          {deliveryOrders.map((o) => (
            <div
              key={o._id}
              className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-bold text-sm">{o.orderNumber}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300">
                      {o.status === 'out_for_delivery' ? 'En reparto' : o.status === 'delivered' ? 'Entregado' : o.status === 'ready' ? 'Listo para salir' : o.status}
                    </span>
                    {o.cashOnDelivery && (
                      <span className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300">
                        <Banknote className="w-3 h-3" /> Cobro en ruta
                      </span>
                    )}
                  </div>
                  <p className="font-medium mt-1">{o.clientName || 'Cliente'}</p>
                  {o.clientPhone && (
                    <p className="text-sm text-gray-500 flex items-center gap-1"><Phone className="w-3 h-3" />{o.clientPhone}</p>
                  )}
                  {o.deliveryAddress && (
                    <p className="text-sm text-violet-700 dark:text-violet-300 flex items-center gap-1 mt-1">
                      <MapPin className="w-3.5 h-3.5 shrink-0" />{o.deliveryAddress}
                    </p>
                  )}
                  <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                    <Clock className="w-3 h-3" />{o.pickupDate} {o.pickupTime}
                    {o.assignedWorkerName ? ` · ${o.assignedWorkerName}` : ''}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 truncate">
                    {o.items.map((it) => `${it.quantity}${it.unit} ${it.productName}`).join(', ')}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className="font-bold">{o.total.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</span>
                  <div className="flex flex-wrap gap-1 justify-end">
                    {!o.assignedWorkerId && o.status !== 'delivered' && (
                      <button
                        type="button"
                        disabled={busyId === o._id}
                        onClick={() => { void assignSelf(o); }}
                        className="px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 dark:border-gray-600"
                      >
                        Asignarme
                      </button>
                    )}
                    {o.status === 'ready' && (
                      <button
                        type="button"
                        disabled={busyId === o._id}
                        onClick={() => { void advance(o, 'out_for_delivery'); }}
                        className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-violet-600 text-white"
                      >
                        Salir a reparto
                      </button>
                    )}
                    {o.status === 'out_for_delivery' && (
                      <button
                        type="button"
                        disabled={busyId === o._id}
                        onClick={() => { void advance(o, 'delivered'); }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> Entregado
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}
