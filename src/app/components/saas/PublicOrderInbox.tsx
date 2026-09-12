import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Clock3, Loader2, ShoppingBag, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { getAuthHeaders } from '../../lib/authApi';
import {
  acceptPublicOrderRequest,
  listWebOrdersRequest,
  rejectPublicOrderRequest,
  type WebOrder,
} from '../../lib/webApi';
import { useSSE } from '../../hooks/useSSE';

type TargetKind = NonNullable<WebOrder['targetKind']>;

interface Props {
  targetKind: TargetKind;
  compact?: boolean;
  salesPointId?: string | null;
  tableId?: string | null;
}

export function PublicOrderInbox({
  targetKind,
  compact = false,
  salesPointId,
  tableId,
}: Props) {
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const businessId = String(currentBusiness?.business_id || currentBusiness?.id || '').trim();
  const userId = String(user?.user_id || user?.id || user?.userId || user?._id || '').trim();
  const [orders, setOrders] = useState<WebOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState('');

  const load = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    try {
      const response = await listWebOrdersRequest(businessId, {
        targetKind,
        reviewStatus: 'pending',
        ...(salesPointId ? { salesPointId } : {}),
        ...(tableId ? { tableId } : {}),
      });
      setOrders(response.orders || []);
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [businessId, salesPointId, tableId, targetKind]);

  useEffect(() => {
    void load();
  }, [load]);

  const token = useMemo(() => {
    const headers = getAuthHeaders();
    const auth = headers.Authorization || headers.authorization;
    return auth ? auth.replace(/^Bearer\s+/i, '').trim() : null;
  }, [userId]);

  const handlers = useMemo(() => ({
    'public_order:created': () => { void load(); },
    'public_order:updated': () => { void load(); },
    public_order_updated: () => { void load(); },
  }), [load]);

  useSSE({
    userId,
    token,
    businessId: businessId || null,
    handlers,
    enabled: Boolean(userId && token && businessId),
  });

  const review = async (order: WebOrder, action: 'accept' | 'reject') => {
    setBusyId(order._id);
    try {
      if (action === 'accept') {
        await acceptPublicOrderRequest(businessId, order._id);
        toast.success(targetKind.startsWith('restaurant_')
          ? 'Pedido enviado a Cocina'
          : 'Pedido aceptado');
      } else {
        await rejectPublicOrderRequest(businessId, order._id);
        toast.success('Solicitud rechazada');
      }
      setOrders((current) => current.filter((item) => item._id !== order._id));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo revisar el pedido');
      void load();
    } finally {
      setBusyId('');
    }
  };

  if (!loading && orders.length === 0) return null;

  return (
    <section className={`rounded-2xl border border-amber-200 bg-amber-50/80 ${compact ? 'p-2' : 'p-3'} dark:border-amber-900/60 dark:bg-amber-950/20`}>
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-950 dark:text-amber-100">
        <ShoppingBag className="h-4 w-4" />
        Pedidos pendientes
        <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs text-amber-900 dark:bg-amber-900 dark:text-amber-100">
          {orders.length}
        </span>
        {loading && <Loader2 className="ml-auto h-4 w-4 animate-spin" />}
      </div>
      <div className="space-y-2">
        {orders.map((order) => (
          <article key={order._id} className="rounded-xl border border-amber-100 bg-white p-3 shadow-sm dark:border-stone-700 dark:bg-stone-900">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-stone-900 dark:text-stone-100">
                  {targetKind === 'restaurant_table'
                    ? (order.tableName || `Mesa ${order.tableNumber}`)
                    : (order.customerName || order.orderNumber)}
                </p>
                <p className="mt-0.5 flex items-center gap-1 text-xs text-stone-500">
                  <Clock3 className="h-3 w-3" />
                  {order.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)} artículos
                  {' · '}
                  {Number(order.totalAmount || 0).toFixed(2).replace('.', ',')} €
                </p>
                <p className="mt-1 line-clamp-2 text-xs text-stone-600 dark:text-stone-300">
                  {order.items.map((item) => `${item.quantity}× ${item.name}`).join(' · ')}
                </p>
              </div>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  disabled={Boolean(busyId)}
                  onClick={() => void review(order, 'reject')}
                  className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-stone-200 px-2.5 text-xs font-semibold text-stone-600 hover:bg-stone-50 disabled:opacity-50 dark:border-stone-700 dark:text-stone-300"
                >
                  <X className="h-3.5 w-3.5" /> Rechazar
                </button>
                <button
                  type="button"
                  disabled={Boolean(busyId)}
                  onClick={() => void review(order, 'accept')}
                  className="inline-flex min-h-9 items-center gap-1 rounded-xl bg-[var(--v-blue,#2563eb)] px-2.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {busyId === order._id
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Check className="h-3.5 w-3.5" />}
                  Aceptar
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
