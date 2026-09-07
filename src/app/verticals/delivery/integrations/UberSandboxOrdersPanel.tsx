import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Clipboard, Clock, Loader2, RefreshCw, X } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDestroyModal } from '../../../components/saas/ConfirmDestroyModal';
import {
  VERTIAL_BTN_DANGER,
  VERTIAL_BTN_PRIMARY,
  VERTIAL_BTN_SECONDARY,
} from '../../../lib/vertialUiTokens';
import {
  actUberSandboxOrderRequest,
  listUberSandboxOrdersRequest,
  type UberSandboxOrder,
} from '../../../lib/webApi';

interface Props {
  businessId: string;
  onEvidenceChanged?: () => void;
}

const STATUS_LABELS: Record<UberSandboxOrder['status'], string> = {
  received: 'Pendiente',
  accepted: 'Aceptado',
  denied: 'Denegado',
  ready: 'Listo',
  cancelled: 'Cancelado',
};

function formatDate(value: string) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('es-ES');
}

export function UberSandboxOrdersPanel({ businessId, onEvidenceChanged }: Props) {
  const [orders, setOrders] = useState<UberSandboxOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [prepById, setPrepById] = useState<Record<string, number>>({});
  const [pendingDanger, setPendingDanger] = useState<{
    order: UberSandboxOrder;
    action: 'deny' | 'cancel';
  } | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!businessId) return;
    if (!silent) setLoading(true);
    try {
      const result = await listUberSandboxOrdersRequest(businessId);
      setOrders(result.orders || []);
    } catch (error) {
      if (!silent) toast.error(error instanceof Error ? error.message : 'No se pudieron cargar las pruebas Uber');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(true), 15_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const progress = useMemo(() => ({
    received: orders.some((order) => Boolean(order.receivedAt)),
    accepted: orders.some((order) => Boolean(order.acceptedAt)),
    denied: orders.some((order) => Boolean(order.deniedAt)),
    ready: orders.some((order) => Boolean(order.readyAt)),
    cancelled: orders.some((order) => Boolean(order.cancelledAt)),
  }), [orders]);

  const act = async (
    order: UberSandboxOrder,
    action: 'accept' | 'update_time' | 'deny' | 'ready' | 'cancel',
  ) => {
    const reason = action === 'deny'
      ? 'Denegado desde pruebas Vertial'
      : action === 'cancel'
        ? 'Cancelado desde pruebas Vertial'
        : '';
    setBusyId(order.externalOrderId);
    try {
      const result = await actUberSandboxOrderRequest(
        businessId,
        order.externalOrderId,
        action,
        {
          reason,
          prepMinutes: action === 'accept' || action === 'update_time'
            ? (prepById[order.id] || order.prepMinutes || 20)
            : undefined,
        },
      );
      setOrders((current) => current.map((entry) => (
        entry.id === result.order.id ? result.order : entry
      )));
      toast.success({
        accept: 'Pedido aceptado en Uber',
        update_time: 'Tiempo actualizado en Uber',
        deny: 'Pedido denegado en Uber',
        ready: 'Uber avisado: pedido listo',
        cancel: 'Pedido cancelado en Uber',
      }[action]);
      setPendingDanger(null);
      onEvidenceChanged?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falló la acción en Uber');
    } finally {
      setBusyId('');
    }
  };

  const copyEvidence = async () => {
    const evidence = {
      environment: 'sandbox',
      generatedAt: new Date().toISOString(),
      checks: progress,
      orders: orders.map((order) => ({
        orderId: order.externalOrderId,
        storeId: order.storeId,
        brand: order.brandName,
        pdv: order.salesPointName,
        receivedAt: order.receivedAt,
        acceptedAt: order.acceptedAt,
        deniedAt: order.deniedAt,
        readyAt: order.readyAt,
        cancelledAt: order.cancelledAt,
        readyTimeUpdatedAt: order.readyTimeUpdatedAt,
        prepMinutes: order.prepMinutes,
      })),
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(evidence, null, 2));
      toast.success('Evidencias Uber copiadas');
    } catch {
      toast.error('No se pudieron copiar las evidencias');
    }
  };

  return (
    <>
    <div className="space-y-3">
      <section className="rounded-xl border border-blue-200 bg-blue-50/60 p-3 dark:border-blue-900 dark:bg-blue-950/20">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-xs font-bold text-blue-950 dark:text-blue-200">Consola sandbox aislada</h3>
            <p className="mt-0.5 text-[10px] text-blue-700 dark:text-blue-300">
              Estos pedidos no entran en TPV, Caja ni informes.
            </p>
          </div>
          <div className="flex gap-1.5">
            <button type="button" onClick={() => void load()} className={`${VERTIAL_BTN_SECONDARY} min-w-11 px-2`} aria-label="Actualizar pedidos">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button type="button" onClick={() => void copyEvidence()} className={`${VERTIAL_BTN_PRIMARY} px-3 text-xs`}>
              <Clipboard className="h-3.5 w-3.5" /> Copiar evidencias
            </button>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-5">
          {Object.entries({
            received: 'Recibido',
            accepted: 'Aceptado',
            denied: 'Denegado',
            ready: 'Listo',
            cancelled: 'Cancelado',
          }).map(([key, label]) => {
            const complete = progress[key as keyof typeof progress];
            return (
              <div key={key} className="flex items-center gap-1.5 rounded-lg border border-blue-100 bg-white px-2 py-1.5 text-[10px] font-semibold dark:border-blue-900 dark:bg-stone-950">
                <span className={`inline-flex h-4 w-4 items-center justify-center rounded-full ${
                  complete ? 'bg-emerald-100 text-emerald-700' : 'bg-stone-100 text-stone-400'
                }`}>
                  {complete ? <Check className="h-3 w-3" /> : '·'}
                </span>
                {label}
              </div>
            );
          })}
        </div>
      </section>

      {loading && orders.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-10 text-xs text-stone-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Esperando pedidos sandbox…
        </div>
      ) : orders.length === 0 ? (
        <div className="rounded-xl border border-dashed border-stone-300 px-4 py-10 text-center dark:border-stone-700">
          <Clock className="mx-auto h-6 w-6 text-stone-400" />
          <p className="mt-2 text-xs font-bold text-stone-700 dark:text-stone-300">Esperando el primer pedido Uber</p>
          <p className="mt-1 text-[10px] text-stone-500">Cuando Uber envíe el webhook aparecerá aquí automáticamente.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {orders.map((order) => {
            const busy = busyId === order.externalOrderId;
            const terminal = order.status === 'denied' || order.status === 'cancelled';
            return (
              <article key={order.id} className="rounded-xl border border-stone-200 bg-white p-3 dark:border-stone-800 dark:bg-stone-950">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded bg-black px-1.5 py-0.5 text-[9px] font-bold text-white">UBER</span>
                      {order.brandName && <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[9px] font-bold text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">{order.brandName}</span>}
                      <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[9px] font-bold text-stone-600 dark:bg-stone-800 dark:text-stone-300">{STATUS_LABELS[order.status]}</span>
                    </div>
                    <p className="mt-1.5 truncate text-sm font-bold text-stone-900 dark:text-stone-100">Pedido {order.orderNumber}</p>
                    <p className="mt-0.5 text-[10px] text-stone-500">
                      {order.storeName || order.storeId} · {order.salesPointName || 'PDV sin nombre'} · {order.deliveryType === 'recogida' ? 'Recogida' : 'Reparto'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-stone-900 dark:text-stone-100">{order.totalAmount.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</p>
                    <p className="text-[9px] text-stone-400">{formatDate(order.receivedAt)}</p>
                  </div>
                </div>
                <div className="mt-2 rounded-lg bg-stone-50 px-2.5 py-2 dark:bg-stone-900">
                  {order.items.map((item) => (
                    <p key={item.id} className="text-[10px] text-stone-600 dark:text-stone-300">
                      {item.quantity}× {item.name}
                    </p>
                  ))}
                </div>
                {!terminal && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {order.status === 'received' && (
                      <>
                        <select
                          value={prepById[order.id] || 20}
                          onChange={(event) => setPrepById((current) => ({ ...current, [order.id]: Number(event.target.value) }))}
                          className="min-h-11 rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-xs dark:border-stone-700 dark:bg-stone-950"
                        >
                          {[10, 15, 20, 30, 45].map((minutes) => <option key={minutes} value={minutes}>{minutes} min</option>)}
                        </select>
                        <button type="button" onClick={() => void act(order, 'accept')} disabled={busy} className={`${VERTIAL_BTN_PRIMARY} px-3 text-xs`}>Aceptar</button>
                        <button type="button" onClick={() => setPendingDanger({ order, action: 'deny' })} disabled={busy} className={`${VERTIAL_BTN_DANGER} px-3 text-xs`}>Denegar</button>
                      </>
                    )}
                    {order.status === 'accepted' && (
                      <>
                        <select
                          value={prepById[order.id] || order.prepMinutes || 20}
                          onChange={(event) => setPrepById((current) => ({ ...current, [order.id]: Number(event.target.value) }))}
                          className="min-h-11 rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-xs dark:border-stone-700 dark:bg-stone-950"
                          aria-label="Nuevo tiempo de preparación"
                          disabled={busy || order.canAdjustReadyTime === false}
                        >
                          {[5, 10, 15, 20, 30, 45, 60].map((minutes) => <option key={minutes} value={minutes}>{minutes} min</option>)}
                        </select>
                        <button
                          type="button"
                          onClick={() => void act(order, 'update_time')}
                          disabled={busy || order.canAdjustReadyTime === false}
                          className={`${VERTIAL_BTN_SECONDARY} px-3 text-xs`}
                          title={order.canAdjustReadyTime === false ? 'Uber no permite cambiar el tiempo de este pedido' : undefined}
                        >
                          Cambiar tiempo
                        </button>
                        <button type="button" onClick={() => void act(order, 'ready')} disabled={busy} className={`${VERTIAL_BTN_PRIMARY} px-3 text-xs`}>Marcar listo</button>
                        <button type="button" onClick={() => setPendingDanger({ order, action: 'cancel' })} disabled={busy} className={`${VERTIAL_BTN_DANGER} px-3 text-xs`}>Cancelar</button>
                      </>
                    )}
                    {order.status === 'ready' && (
                      <button type="button" onClick={() => setPendingDanger({ order, action: 'cancel' })} disabled={busy} className={`${VERTIAL_BTN_DANGER} px-3 text-xs`}>Cancelar</button>
                    )}
                    {busy && <Loader2 className="h-4 w-4 animate-spin text-blue-600" />}
                  </div>
                )}
                {order.lastError && (
                  <p className="mt-2 flex items-center gap-1 text-[10px] text-red-600"><X className="h-3 w-3" /> {order.lastError}</p>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
    <ConfirmDestroyModal
      isOpen={Boolean(pendingDanger)}
      onClose={() => {
        if (!busyId) setPendingDanger(null);
      }}
      onConfirm={async () => {
        if (pendingDanger) await act(pendingDanger.order, pendingDanger.action);
      }}
      title={pendingDanger?.action === 'deny' ? 'Denegar pedido sandbox' : 'Cancelar pedido sandbox'}
      description="La acción se enviará realmente a Uber Sandbox y quedará guardada como evidencia de certificación."
      itemName={pendingDanger?.action === 'deny' ? 'DENEGAR' : 'CANCELAR'}
      confirmLabel={`Escribe ${pendingDanger?.action === 'deny' ? 'DENEGAR' : 'CANCELAR'} para confirmar`}
      destructiveLabel={pendingDanger?.action === 'deny' ? 'Denegar en Uber' : 'Cancelar en Uber'}
      isDeleting={Boolean(busyId)}
      caseInsensitive
    />
    </>
  );
}
