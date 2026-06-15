import { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router';
import { useAuth } from '../../../context/AuthContext';
import { useBusiness } from '../../../context/BusinessContext';
import { useActiveStoreScope } from '../../../context/ActiveStoreScopeContext';
import { useModalClose } from '../../../hooks/useModalClose';
import { resolveBusinessDataUserId } from '../../../lib/tenantUserId';
import {
  filterDeliveryOrdersRequest,
  updateDeliveryOrderRequest,
  cancelDeliveryOrderRequest,
  getDeliveryConfigRequest,
  type DeliveryOrder,
  type DeliveryOrderStatus,
  type DeliveryType,
} from '../../../lib/deliveryApi';
import { normalizeStaffConsumptionConfig } from '../../../lib/staffConsumptionUtils';
import { resolvePdvIdFromStoreRef, filterOrdersForActivePdv } from '../../../lib/pdvScope';
import { readTpvTabletBinding } from '../../../lib/tpvTabletSession';
import { TpvRegisterProvider, useTpvRegisterIfOpen } from '../../../components/saas/TpvRegisterGate';
import { ClockedInWorkerBubbles } from '../../../components/saas/ClockedInWorkerBubbles';
import { getWorkerInitials } from '../../../lib/tpvClockedInWorkers';
import { pickDefaultActivePdvId } from '../../../lib/deliveryOpsPdvSelection';
import { printDeliveryTicket } from '../../../lib/deliveryTicketPrint';
import { TpvRapidoOrderFlow } from '../TpvRapidoPage';
import { WorkerTpvStaffConsumption } from './WorkerTpvStaffConsumption';
import { WorkerStockReviewBanner } from '../../../components/saas/WorkerStockReviewBanner';
import { CancelOrderModal } from '../../../components/delivery/CancelOrderModal';
import {
  ChefHat,
  Package,
  Truck,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ArrowRight,
  Phone,
  User,
  Timer,
  Search,
  X,
  Loader2,
  RefreshCw,
  ShoppingBag,
  Store,
  Plus,
  Banknote,
  CreditCard,
  Trash2,
  Smartphone,
  ChevronDown,
  ChevronUp,
  Globe,
  UtensilsCrossed,
} from 'lucide-react';
import { enqueueTpvOfflineItem, isBrowserOnline } from '../../../lib/tpvTabletOffline';
import { flushTpvOfflineQueue } from '../../../lib/tpvOfflineSync';

type DeliveryPaymentMethod = 'efectivo' | 'tarjeta' | 'bizum';

const PAYMENT_LABELS: Record<DeliveryPaymentMethod, string> = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  bizum: 'Bizum',
};

const CHANNEL_BADGE: Record<string, { label: string; className: string }> = {
  tpv: { label: 'TPV', className: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200' },
  web: { label: 'Web', className: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200' },
  app: { label: 'App', className: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200' },
  phone: { label: 'Tel.', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200' },
  direct: { label: 'Directo', className: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' },
  glovo: { label: 'Glovo', className: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200' },
  justeat: { label: 'Just Eat', className: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200' },
  ubereats: { label: 'Uber', className: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200' },
};

type FulfillmentFilter = 'all' | 'recogida' | 'domicilio';

const STATUS_CONFIG: Record<DeliveryOrderStatus, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  nuevo:      { label: 'Nuevo',      color: 'text-amber-700',   bg: 'bg-amber-50 border-amber-200',   icon: <Clock className="w-4 h-4" /> },
  cocina:     { label: 'En cocina',  color: 'text-orange-700',  bg: 'bg-orange-50 border-orange-200', icon: <ChefHat className="w-4 h-4" /> },
  listo:      { label: 'Montaje',    color: 'text-indigo-700',  bg: 'bg-indigo-50 border-indigo-200', icon: <Package className="w-4 h-4" /> },
  en_reparto: { label: 'En reparto', color: 'text-cyan-700',    bg: 'bg-cyan-50 border-cyan-200',     icon: <Truck className="w-4 h-4" /> },
  entregado:  { label: 'Entregado',  color: 'text-green-700',   bg: 'bg-green-50 border-green-200',   icon: <CheckCircle2 className="w-4 h-4" /> },
  cancelled:  { label: 'Cancelado',  color: 'text-gray-500',    bg: 'bg-gray-50 border-gray-200',     icon: <X className="w-4 h-4" /> },
  incident:   { label: 'Incidencia', color: 'text-red-700',     bg: 'bg-red-50 border-red-200',       icon: <AlertTriangle className="w-4 h-4" /> },
};

const TABLET_NEXT_STATUS: Partial<Record<DeliveryOrderStatus, DeliveryOrderStatus>> = {
  nuevo: 'en_reparto',
  cocina: 'en_reparto',
  listo: 'en_reparto',
  en_reparto: 'entregado',
};

const TABLET_NEXT_LABEL: Partial<Record<DeliveryOrderStatus, string>> = {
  nuevo: 'Reparto',
  cocina: 'Reparto',
  listo: 'Reparto',
  en_reparto: 'Entregado',
};

/** Pedidos visibles en la columna Montaje (cocina omitida: entran directo aquí). */
const MONTAGE_STATUSES: DeliveryOrderStatus[] = ['nuevo', 'cocina', 'listo'];

const LANE_STATUS_LABEL: Partial<Record<DeliveryOrderStatus, string>> = {
  nuevo: 'Montaje',
  cocina: 'Montaje',
  listo: 'Montaje',
  en_reparto: 'Reparto',
};

const WARN_MINUTES = 15;
const LATE_MINUTES = 25;

function elapsedMinutes(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
}

function timerTone(minutes: number): string {
  if (minutes >= LATE_MINUTES) return 'text-red-600 dark:text-red-400 font-bold';
  if (minutes >= WARN_MINUTES) return 'text-amber-600 dark:text-amber-400 font-semibold';
  return 'text-gray-500 dark:text-gray-400';
}

function waitBadgeClasses(minutes: number): string {
  if (minutes >= LATE_MINUTES) {
    return 'bg-red-100 text-red-800 border-red-300 dark:bg-red-950/60 dark:text-red-200 dark:border-red-800';
  }
  if (minutes >= WARN_MINUTES) {
    return 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-800';
  }
  return 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-600';
}

/** Tiempo de espera del pedido (desde creación). */
function orderWaitMinutes(order: DeliveryOrder): number {
  return elapsedMinutes(order.createdAt);
}

function formatElapsed(minutes: number): string {
  if (minutes < 1) return 'Ahora';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  return `${h}h ${minutes % 60}m`;
}

const DELIVERY_TYPE_BADGE: Record<DeliveryType, { label: string; className: string; icon: React.ReactNode }> = {
  recogida: {
    label: 'Recogida',
    className: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200',
    icon: <Store className="w-3 h-3" />,
  },
  domicilio: {
    label: 'Envío',
    className: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200',
    icon: <Truck className="w-3 h-3" />,
  },
  sala: {
    label: 'Sala',
    className: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200',
    icon: <ShoppingBag className="w-3 h-3" />,
  },
};

const FULFILLMENT_FILTERS: { id: FulfillmentFilter; label: string; icon: React.ReactNode }[] = [
  { id: 'all', label: 'Todos', icon: <ShoppingBag className="w-4 h-4" /> },
  { id: 'recogida', label: 'Recogida', icon: <Store className="w-4 h-4" /> },
  { id: 'domicilio', label: 'Envío', icon: <Truck className="w-4 h-4" /> },
];

function matchesFulfillmentFilter(order: DeliveryOrder, filter: FulfillmentFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'recogida') return order.deliveryType === 'recogida';
  return order.deliveryType === 'domicilio';
}

function matchesSearch(order: DeliveryOrder, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const customer = order.customerName?.toLowerCase() || '';
  const orderNo = order.orderNumber.toLowerCase();
  if (orderNo.includes(q) || customer.includes(q)) return true;
  // Prefijo de palabra en el nombre (evita "uri" → pedido de Carlos por un producto "Pureza")
  const nameWords = customer.split(/[^a-z0-9áéíóúüñ]+/i).filter(Boolean);
  if (q.length < 4) {
    return nameWords.some((w) => w.startsWith(q));
  }
  return false;
}

function formatCurrency(n: number) {
  return n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

function OrderCard({
  order,
  onAdvance,
  onSelect,
  onDelete,
  advancing,
}: {
  order: DeliveryOrder;
  onAdvance: (o: DeliveryOrder) => void;
  onSelect: (o: DeliveryOrder) => void;
  onDelete: (o: DeliveryOrder) => void;
  advancing: boolean;
}) {
  const cfg = STATUS_CONFIG[order.status];
  const nextLabel = TABLET_NEXT_LABEL[order.status];
  const waitMinutes = orderWaitMinutes(order);
  const routeMinutes = order.departedAt ? elapsedMinutes(order.departedAt) : null;
  const typeBadge = DELIVERY_TYPE_BADGE[order.deliveryType] || DELIVERY_TYPE_BADGE.domicilio;
  const channelBadge = order.channel && order.channel !== 'tpv' ? CHANNEL_BADGE[order.channel] : null;
  const isUrgent = order.priority === 'urgent' || order.priority === 'high';
  const itemCount = order.items.reduce((s, i) => s + i.quantity, 0);
  const itemPreview = order.items
    .slice(0, 2)
    .map((i) => `${i.quantity}× ${i.name}`)
    .join(' · ');

  return (
    <div
      className={`relative rounded-xl border ${cfg.bg} p-2 transition-all hover:shadow-md ${
        waitMinutes >= LATE_MINUTES ? 'border-red-300 dark:border-red-800' : 'border-gray-200/80 dark:border-gray-600/50'
      }`}
    >
      <button
        type="button"
        onClick={() => onDelete(order)}
        title="Eliminar pedido"
        className="absolute top-1 right-1 z-10 p-1 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
      >
        <Trash2 className="w-3 h-3" />
      </button>
      <div className="flex items-stretch gap-2 pr-5">
        {/* Tiempo de espera — badge fijo a la izquierda */}
        <div
          className={`shrink-0 w-[3.25rem] flex flex-col items-center justify-center rounded-lg border px-1 py-1.5 ${waitBadgeClasses(waitMinutes)}`}
          title="Tiempo de espera desde el pedido"
        >
          <Timer className="w-3 h-3 mb-0.5 opacity-80" />
          <span className="text-base font-bold leading-none tabular-nums">{waitMinutes}</span>
          <span className="text-[9px] font-semibold uppercase tracking-wide opacity-80">min</span>
          <span className="text-[8px] font-medium mt-0.5 opacity-70">espera</span>
        </div>

        {/* Info principal — compacta */}
        <button
          type="button"
          onClick={() => onSelect(order)}
          className="flex-1 min-w-0 text-left"
        >
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-mono text-xs font-bold text-gray-900 dark:text-gray-100">
              #{order.orderNumber}
            </span>
            <span className={`inline-flex items-center gap-0.5 px-1 py-px rounded text-[9px] font-bold ${typeBadge.className}`}>
              {typeBadge.icon}
              {typeBadge.label}
            </span>
            {channelBadge && (
              <span className={`inline-flex items-center gap-0.5 px-1 py-px rounded text-[9px] font-bold ${channelBadge.className}`}>
                <Globe className="w-2.5 h-2.5" />
                {channelBadge.label}
              </span>
            )}
            {isUrgent && (
              <span className="px-1 py-px bg-red-100 text-red-700 text-[9px] font-bold rounded">!</span>
            )}
          </div>
          {order.customerName && (
            <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate mt-0.5">
              {order.customerName}
            </p>
          )}
          {order.takenByName && (
            <p className="flex items-center gap-1 mt-0.5 text-[10px] text-gray-500 dark:text-gray-400">
              <span
                className="w-4 h-4 rounded-full bg-violet-600 text-white text-[8px] font-bold flex items-center justify-center shrink-0"
                title={order.takenByName}
              >
                {getWorkerInitials(order.takenByName)}
              </span>
              <span className="truncate">{order.takenByName.split(' ')[0]}</span>
            </p>
          )}
          <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate mt-0.5">
            {itemPreview}
            {order.items.length > 2 ? ` +${order.items.length - 2}` : ''}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5 text-[11px] flex-wrap">
            <span className="font-bold text-gray-900 dark:text-gray-100 tabular-nums">
              {formatCurrency(order.totalAmount)}
            </span>
            <span className="text-gray-300">·</span>
            <span className="text-gray-500">{itemCount} uds</span>
            {routeMinutes != null && (
              <>
                <span className="text-gray-300">·</span>
                <span className="text-cyan-600 dark:text-cyan-400">En ruta {routeMinutes}m</span>
              </>
            )}
          </div>
        </button>

        {/* Acción principal */}
        {nextLabel && (
          <button
            type="button"
            onClick={() => onAdvance(order)}
            disabled={advancing}
            title={nextLabel}
            className="shrink-0 self-center flex flex-col items-center justify-center gap-0.5 min-w-[3.25rem] px-2 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold transition-all disabled:opacity-50"
          >
            {advancing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <ArrowRight className="w-4 h-4" />
                <span className="leading-tight text-center">{nextLabel}</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

function OrderLane({
  title,
  icon,
  count,
  borderClass,
  headerClass,
  badgeClass,
  orders,
  emptyLabel,
  onAdvance,
  onSelect,
  onDelete,
  advancingId,
}: {
  title: string;
  icon: React.ReactNode;
  count: number;
  borderClass: string;
  headerClass: string;
  badgeClass: string;
  orders: DeliveryOrder[];
  emptyLabel: string;
  onAdvance: (o: DeliveryOrder) => void;
  onSelect: (o: DeliveryOrder) => void;
  onDelete: (o: DeliveryOrder) => void;
  advancingId: string | null;
}) {
  return (
    <section className={`flex flex-col min-h-[220px] lg:min-h-0 flex-1 rounded-2xl border-2 ${borderClass} bg-white dark:bg-gray-900 overflow-hidden shadow-sm`}>
      <header className={`shrink-0 px-3 py-2.5 border-b flex items-center justify-between gap-2 ${headerClass}`}>
        <div className="flex items-center gap-2 text-sm font-bold text-gray-900 dark:text-gray-100 min-w-0">
          <span className="shrink-0">{icon}</span>
          <span className="truncate">{title}</span>
        </div>
        <span className={`shrink-0 min-w-[1.75rem] h-7 px-2 rounded-full flex items-center justify-center text-xs font-bold ${badgeClass}`}>
          {count}
        </span>
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto p-1.5 sm:p-2 space-y-1.5">
        {orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 px-4 text-center text-gray-400">
            <Package className="w-8 h-8 mb-2 opacity-40" />
            <p className="text-xs font-medium">{emptyLabel}</p>
          </div>
        ) : (
          orders.map((order) => (
            <OrderCard
              key={order._id}
              order={order}
              onAdvance={onAdvance}
              onSelect={onSelect}
              onDelete={onDelete}
              advancing={advancingId === order._id}
            />
          ))
        )}
      </div>
    </section>
  );
}

function DeliverPaymentModal({
  order,
  onConfirm,
  onClose,
  loading,
}: {
  order: DeliveryOrder;
  onConfirm: (method: DeliveryPaymentMethod) => void;
  onClose: () => void;
  loading: boolean;
}) {
  useModalClose(!loading, onClose);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={loading ? undefined : onClose} />
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm p-5">
        <button
          type="button"
          onClick={onClose}
          disabled={loading}
          className="absolute top-3 right-3 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40"
        >
          <X className="w-5 h-5 text-gray-500" />
        </button>
        <div className="text-center mb-5">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6 text-green-600" />
          </div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Entregar pedido</h3>
          <p className="text-sm text-gray-500 mt-1 font-mono">#{order.orderNumber}</p>
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-2 tabular-nums">
            {formatCurrency(order.totalAmount)}
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-3 font-medium">¿Cómo ha pagado?</p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => onConfirm('efectivo')}
            disabled={loading}
            className="flex flex-col items-center gap-2 py-4 px-2 rounded-2xl border-2 border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="w-7 h-7 animate-spin text-emerald-600" />
            ) : (
              <Banknote className="w-7 h-7 text-emerald-700 dark:text-emerald-400" />
            )}
            <span className="text-xs font-bold text-gray-900 dark:text-gray-100">Efectivo</span>
          </button>
          <button
            type="button"
            onClick={() => onConfirm('tarjeta')}
            disabled={loading}
            className="flex flex-col items-center gap-2 py-4 px-2 rounded-2xl border-2 border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="w-7 h-7 animate-spin text-blue-600" />
            ) : (
              <CreditCard className="w-7 h-7 text-blue-700 dark:text-blue-400" />
            )}
            <span className="text-xs font-bold text-gray-900 dark:text-gray-100">Tarjeta</span>
          </button>
          <button
            type="button"
            onClick={() => onConfirm('bizum')}
            disabled={loading}
            className="flex flex-col items-center gap-2 py-4 px-2 rounded-2xl border-2 border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/30 hover:bg-purple-100 dark:hover:bg-purple-900/40 transition-colors disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="w-7 h-7 animate-spin text-purple-600" />
            ) : (
              <Smartphone className="w-7 h-7 text-purple-700 dark:text-purple-400" />
            )}
            <span className="text-xs font-bold text-gray-900 dark:text-gray-100">Bizum</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function OrderDetail({ order, onClose, onAdvance, onDelete, advancing }: {
  order: DeliveryOrder;
  onClose: () => void;
  onAdvance: (o: DeliveryOrder) => void;
  onDelete: (o: DeliveryOrder) => void;
  advancing: boolean;
}) {
  useModalClose(true, onClose);
  const cfg = STATUS_CONFIG[order.status];
  const nextLabel = TABLET_NEXT_LABEL[order.status];
  const displayLabel = LANE_STATUS_LABEL[order.status] || cfg.label;
  const typeBadge = DELIVERY_TYPE_BADGE[order.deliveryType] || DELIVERY_TYPE_BADGE.domicilio;

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
              {cfg.icon} {displayLabel}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Espera:{' '}
              <span className={`font-bold tabular-nums ${timerTone(orderWaitMinutes(order))}`}>
                {formatElapsed(orderWaitMinutes(order))}
              </span>
              {order.departedAt && (
                <span className="text-cyan-600 dark:text-cyan-400 ml-2">
                  · En ruta {formatElapsed(elapsedMinutes(order.departedAt))}
                </span>
              )}
            </p>
            <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold mt-1 ml-1 ${typeBadge.className}`}>
              {typeBadge.icon} {typeBadge.label}
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
                {order.customerAddress && <p className="text-xs text-gray-500 mt-0.5">{order.customerAddress}</p>}
              </div>
            </div>
          )}

          {order.takenByName && (
            <div className="flex items-center gap-3 p-3 bg-violet-50 dark:bg-violet-900/20 rounded-xl">
              <span className="w-9 h-9 rounded-full bg-violet-600 text-white text-sm font-bold flex items-center justify-center shrink-0">
                {getWorkerInitials(order.takenByName)}
              </span>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Pedido cogido por</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{order.takenByName}</p>
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
              {formatCurrency(order.totalAmount)}
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

          <button
            type="button"
            onClick={() => onDelete(order)}
            disabled={advancing}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border-2 border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 text-sm font-semibold hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
            Eliminar pedido
          </button>
        </div>
      </div>
    </div>
  );
}

export function WorkerTpvDelivery() {
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const activeStoreScope = useActiveStoreScope();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState<'board' | 'new-order' | 'staff-consumption'>('board');
  const [fulfillmentFilter, setFulfillmentFilter] = useState<FulfillmentFilter>('all');
  const [search, setSearch] = useState('');
  const [advancingId, setAdvancingId] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<DeliveryOrder | null>(null);
  const [deliveryCompleteOrder, setDeliveryCompleteOrder] = useState<DeliveryOrder | null>(null);
  const [deleteOrder, setDeleteOrder] = useState<DeliveryOrder | null>(null);
  const [staffConsumptionEnabled, setStaffConsumptionEnabled] = useState(false);

  const userId = resolveBusinessDataUserId(user, currentBusiness);
  const register = useTpvRegisterIfOpen();
  const tabletBinding = useMemo(() => readTpvTabletBinding(), []);
  const workerPdv = useMemo(
    () => resolvePdvIdFromStoreRef(activeStoreScope.pointsOfSale, user?.employment?.salesPointId),
    [activeStoreScope.pointsOfSale, user?.employment?.salesPointId],
  );
  const scopedPdvId = useMemo(() => {
    const fromTablet = String(tabletBinding?.pdvId || '').trim();
    if (fromTablet) return fromTablet;
    const fromWorker = String(workerPdv.pdvId || '').trim();
    if (fromWorker) return fromWorker;
    return String(activeStoreScope.activeSalesPointId || '').trim() || null;
  }, [tabletBinding?.pdvId, workerPdv.pdvId, activeStoreScope.activeSalesPointId]);
  const primaryPdvId = useMemo(
    () => pickDefaultActivePdvId(activeStoreScope.pointsOfSale.filter((p) => p.active !== false)),
    [activeStoreScope.pointsOfSale],
  );
  const scopedPdvName = useMemo(() => {
    if (!scopedPdvId) return null;
    const pdv = activeStoreScope.pointsOfSale.find((p) => p._id === scopedPdvId);
    return pdv?.name || tabletBinding?.pdvName || null;
  }, [scopedPdvId, activeStoreScope.pointsOfSale, tabletBinding?.pdvName]);

  const [showDelivered, setShowDelivered] = useState(false);

  const loadOrders = useCallback(async (options?: { silent?: boolean }) => {
    if (!userId) return;
    const silent = options?.silent ?? false;
    if (!silent) setRefreshing(true);
    const today = new Date().toISOString().slice(0, 10);
    try {
      const data = await filterDeliveryOrdersRequest(userId, {
        ...(scopedPdvId ? { salesPointId: scopedPdvId } : {}),
        dateFrom: `${today}T00:00:00.000Z`,
        dateTo: `${today}T23:59:59.999Z`,
        limit: 500,
      });
      const scoped = filterOrdersForActivePdv(data.orders, scopedPdvId, primaryPdvId, scopedPdvName);
      setOrders(scoped.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    } catch {
      if (!silent) toast.error('Error al cargar pedidos');
    } finally {
      setInitialLoading(false);
      setRefreshing(false);
    }
  }, [userId, scopedPdvId, primaryPdvId, scopedPdvName]);

  useEffect(() => { void loadOrders(); }, [loadOrders]);

  useEffect(() => {
    if (!userId) {
      setStaffConsumptionEnabled(false);
      return;
    }
    getDeliveryConfigRequest(userId)
      .then((cfg) => {
        setStaffConsumptionEnabled(normalizeStaffConsumptionConfig(cfg.staffConsumption).enabled);
      })
      .catch(() => setStaffConsumptionEnabled(false));
  }, [userId]);

  useEffect(() => {
    if (!staffConsumptionEnabled && view === 'staff-consumption') {
      setView('board');
    }
  }, [staffConsumptionEnabled, view]);

  useEffect(() => {
    if (!isBrowserOnline()) return;
    void flushTpvOfflineQueue().then((r) => {
      if (r.synced > 0) void loadOrders({ silent: true });
    });
  }, [loadOrders]);

  useEffect(() => {
    if (!userId) return;
    const interval = setInterval(() => void loadOrders({ silent: true }), 30000);
    return () => clearInterval(interval);
  }, [userId, loadOrders]);

  // Refresca colores de tiempo en pantalla sin recargar pedidos.
  const [, setTimeTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTimeTick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  const advanceOrder = useCallback(async (order: DeliveryOrder, paymentMethod?: DeliveryPaymentMethod) => {
    const next = TABLET_NEXT_STATUS[order.status];
    if (!next || !userId) return;

    if (next === 'entregado' && !paymentMethod) {
      setDeliveryCompleteOrder(order);
      return;
    }

    setAdvancingId(order._id);
    try {
      const now = new Date().toISOString();
      const extras: Partial<DeliveryOrder> = {};
      if (next === 'en_reparto') {
        extras.assemblyCompletedAt = now;
        extras.departedAt = now;
        if (!order.assemblyStartedAt) extras.assemblyStartedAt = now;
        if (!order.kitchenCompletedAt) extras.kitchenCompletedAt = now;
      }
      if (next === 'entregado' && paymentMethod) {
        extras.deliveredAt = now;
        extras.paymentMethod = paymentMethod;
        extras.paymentCollected = true;
        extras.paymentCollectedAt = now;
        extras.paymentCollectedBy = user?.user_id || user?.id || user?.fullName || 'Tablet';
        extras.paymentStatus = 'paid';
        extras.paidAmount = order.totalAmount;
        extras.paidAt = now;
      }
      const payload: DeliveryOrder = {
        ...order,
        ...extras,
        status: next,
        stageHistory: [
          ...(order.stageHistory || []),
          {
            status: next,
            date: now,
            user: user?.fullName || 'Tablet',
            notes: next === 'entregado' && paymentMethod
              ? `Entregado · ${PAYMENT_LABELS[paymentMethod]}`
              : undefined,
          },
        ],
      };

      if (!isBrowserOnline()) {
        enqueueTpvOfflineItem('order_update', { userId, order: payload });
        setOrders(prev => prev.map(o => o._id === payload._id ? payload : o));
        if (next === 'entregado') {
          setSelectedOrder(null);
          setDeliveryCompleteOrder(null);
          toast.info(`Sin conexión — entrega guardada en cola (#${order.orderNumber})`);
        } else {
          if (selectedOrder?._id === payload._id) setSelectedOrder(payload);
          toast.info(`Sin conexión — cambio guardado en cola (#${order.orderNumber})`);
        }
        return;
      }

      const updated = await updateDeliveryOrderRequest(userId, payload);
      setOrders(prev => prev.map(o => o._id === updated._id ? updated : o));
      if (next === 'entregado') {
        setSelectedOrder(null);
        setDeliveryCompleteOrder(null);
        toast.success(
          `Pedido #${order.orderNumber} entregado · ${PAYMENT_LABELS[paymentMethod!]}`,
        );
        if (updated.paymentStatus === 'paid' && currentBusiness) {
          printDeliveryTicket({
            order: updated,
            business: {
              name: currentBusiness.name,
              legalName: currentBusiness.legalName,
              taxId: currentBusiness.taxId,
              address: currentBusiness.address,
              city: currentBusiness.city,
              phone: currentBusiness.phone,
            },
            salesPointName: updated.salesPointName,
            cashierName: user?.fullName,
          });
        }
      } else {
        if (selectedOrder?._id === updated._id) setSelectedOrder(updated);
        const label = LANE_STATUS_LABEL[next] || STATUS_CONFIG[next].label;
        toast.success(`Pedido #${order.orderNumber} → ${label}`);
      }
    } catch {
      toast.error('Error al avanzar pedido');
    } finally {
      setAdvancingId(null);
    }
  }, [userId, selectedOrder, user?.fullName, user?.user_id, user?.id, currentBusiness]);

  const confirmCompleteDelivery = useCallback(
    (method: DeliveryPaymentMethod) => {
      if (!deliveryCompleteOrder) return;
      void advanceOrder(deliveryCompleteOrder, method);
    },
    [deliveryCompleteOrder, advanceOrder],
  );

  const requestDeleteOrder = useCallback((order: DeliveryOrder) => {
    setDeleteOrder(order);
  }, []);

  const handleDeleteOrder = useCallback(async (reason: string) => {
    if (!userId || !deleteOrder) return;
    setAdvancingId(deleteOrder._id);
    try {
      const updated = await cancelDeliveryOrderRequest(userId, deleteOrder._id, reason);
      setOrders(prev => prev.map(o => o._id === updated._id ? updated : o));
      setDeleteOrder(null);
      if (selectedOrder?._id === updated._id) setSelectedOrder(null);
      if (deliveryCompleteOrder?._id === updated._id) setDeliveryCompleteOrder(null);
      toast.success(`Pedido #${deleteOrder.orderNumber} eliminado`);
    } catch {
      toast.error('Error al eliminar el pedido');
    } finally {
      setAdvancingId(null);
    }
  }, [userId, deleteOrder, selectedOrder, deliveryCompleteOrder]);

  const backToBoard = useCallback(() => {
    setView('board');
    void loadOrders({ silent: true });
  }, [loadOrders]);

  const stats = useMemo(() => {
    const montaje = orders.filter(o => MONTAGE_STATUSES.includes(o.status));
    const enReparto = orders.filter(o => o.status === 'en_reparto');
    const entregados = orders.filter(o => o.status === 'entregado');
    const activeWait = [...montaje, ...enReparto];
    const avgWait =
      activeWait.length > 0
        ? Math.round(activeWait.reduce((s, o) => s + orderWaitMinutes(o), 0) / activeWait.length)
        : null;
    return {
      montaje: montaje.length,
      delivery: enReparto.length,
      delivered: entregados.length,
      avgWait,
    };
  }, [orders]);

  const scopedActive = useMemo(
    () => orders.filter((o) => MONTAGE_STATUSES.includes(o.status) || o.status === 'en_reparto'),
    [orders],
  );

  const assemblyOrders = useMemo(
    () => scopedActive
      .filter((o) => MONTAGE_STATUSES.includes(o.status))
      .filter((o) => matchesFulfillmentFilter(o, fulfillmentFilter))
      .filter((o) => matchesSearch(o, search))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [scopedActive, fulfillmentFilter, search],
  );

  const deliveryOrders = useMemo(
    () => scopedActive
      .filter((o) => o.status === 'en_reparto')
      .filter((o) => matchesFulfillmentFilter(o, fulfillmentFilter))
      .filter((o) => matchesSearch(o, search))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [scopedActive, fulfillmentFilter, search],
  );

  const deliveredOrders = useMemo(
    () => orders
      .filter((o) => o.status === 'entregado')
      .filter((o) => matchesFulfillmentFilter(o, fulfillmentFilter))
      .filter((o) => matchesSearch(o, search))
      .sort((a, b) => new Date(b.deliveredAt || b.updatedAt || b.createdAt).getTime() - new Date(a.deliveredAt || a.updatedAt || a.createdAt).getTime())
      .slice(0, 40),
    [orders, fulfillmentFilter, search],
  );

  const filterCounts = useMemo(() => ({
    all: scopedActive.length,
    recogida: scopedActive.filter((o) => o.deliveryType === 'recogida').length,
    domicilio: scopedActive.filter((o) => o.deliveryType === 'domicilio').length,
  }), [scopedActive]);

  const visibleCount = assemblyOrders.length + deliveryOrders.length;

  if (view === 'new-order' || view === 'staff-consumption') {
    if (!register) {
      return (
        <div className="flex flex-col items-center justify-center gap-4 p-8 min-h-[40vh] text-center">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Abre la caja de la tienda antes de usar el TPV.
          </p>
          <button
            type="button"
            onClick={backToBoard}
            className="px-4 py-2.5 rounded-xl bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-sm font-semibold"
          >
            Volver al tablero
          </button>
        </div>
      );
    }
    if (view === 'staff-consumption') {
      return (
        <TpvRegisterProvider value={register}>
          <WorkerTpvStaffConsumption
            userId={userId}
            onBack={backToBoard}
            register={register}
            salesPointId={scopedPdvId}
            salesPointName={scopedPdvName}
          />
        </TpvRegisterProvider>
      );
    }
    return (
      <TpvRegisterProvider value={register}>
        <TpvRapidoOrderFlow
          tabletMode
          onBack={backToBoard}
          registerOverride={register}
        />
      </TpvRegisterProvider>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <WorkerStockReviewBanner />
      {/* Header compacto */}
      <div className="shrink-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl flex items-center justify-center shrink-0">
              <Package className="w-5 h-5 text-indigo-600" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100 truncate">Pedidos activos</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Montaje y reparto · {visibleCount} visibles
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void loadOrders()}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title="Refrescar"
            >
              <RefreshCw className={`w-5 h-5 text-gray-500 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        <div className={`grid gap-2.5 mb-3 ${staffConsumptionEnabled ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
          <button
            type="button"
            onClick={() => setView('new-order')}
            className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-sm sm:text-base shadow-lg shadow-emerald-900/25 transition-colors"
          >
            <Plus className="w-5 h-5" strokeWidth={2.5} />
            Nuevo pedido
          </button>
          {staffConsumptionEnabled && (
            <button
              type="button"
              onClick={() => setView('staff-consumption')}
              className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-2xl bg-violet-600 hover:bg-violet-700 active:bg-violet-800 text-white font-bold text-sm sm:text-base shadow-lg shadow-violet-900/25 transition-colors"
            >
              <UtensilsCrossed className="w-5 h-5" strokeWidth={2.5} />
              Consumo equipo
            </button>
          )}
        </div>

        {register && (
          <div className="mb-3">
            <ClockedInWorkerBubbles
              workers={register.clockedInWorkers}
              selectedId={register.selectedOrderTakerId}
              onSelect={register.setSelectedOrderTakerId}
              loading={register.clockedInWorkersLoading}
              label="En tienda"
              emptyMessage="Nadie fichado — abre caja y pulsa Fichar"
            />
          </div>
        )}

        {/* Filtro recogida / envío */}
        <div className="flex gap-1.5 p-1 rounded-xl bg-gray-100 dark:bg-gray-800">
          {FULFILLMENT_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFulfillmentFilter(f.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-xs font-semibold transition-all ${
                fulfillmentFilter === f.id
                  ? f.id === 'recogida'
                    ? 'bg-violet-600 text-white shadow-sm'
                    : f.id === 'domicilio'
                      ? 'bg-sky-600 text-white shadow-sm'
                      : 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-white/60 dark:hover:bg-gray-700/60'
              }`}
            >
              {f.icon}
              {f.label}
              <span className={`min-w-[1.25rem] h-5 px-1 rounded-full text-[10px] font-bold flex items-center justify-center ${
                fulfillmentFilter === f.id ? 'bg-white/20' : 'bg-gray-300/80 dark:bg-gray-600 text-gray-700 dark:text-gray-200'
              }`}>
                {filterCounts[f.id]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Búsqueda */}
      <div className="shrink-0 px-4 py-2 bg-gray-50 dark:bg-gray-950 border-b border-gray-200 dark:border-gray-700">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar nº pedido, cliente..."
            className="w-full pl-9 pr-8 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm placeholder:text-gray-400 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
          />
          {search && (
            <button type="button" onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="w-4 h-4 text-gray-400" />
            </button>
          )}
        </div>
      </div>

      {/* Entregados hoy — desplegable */}
      {deliveredOrders.length > 0 && (
        <div className="shrink-0 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2">
          <button
            type="button"
            onClick={() => setShowDelivered((v) => !v)}
            className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 text-left"
          >
            <div className="flex items-center gap-2 min-w-0">
              <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
              <span className="text-sm font-bold text-green-800 dark:text-green-300">
                Entregados hoy ({deliveredOrders.length})
              </span>
            </div>
            {showDelivered ? <ChevronUp className="w-4 h-4 text-green-700" /> : <ChevronDown className="w-4 h-4 text-green-700" />}
          </button>
          {showDelivered && (
            <div className="mt-2 max-h-44 overflow-y-auto space-y-1">
              {deliveredOrders.map((order) => (
                <button
                  key={order._id}
                  type="button"
                  onClick={() => setSelectedOrder(order)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-gray-900 dark:text-gray-100 font-mono">#{order.orderNumber}</p>
                    <p className="text-[11px] text-gray-500 truncate">{order.customerName || 'Cliente'}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-bold tabular-nums">{formatCurrency(order.totalAmount)}</p>
                    <p className="text-[10px] text-gray-500 capitalize">{order.paymentMethod || '—'}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Columnas Montaje | Reparto */}
      <div className="flex-1 min-h-0 overflow-hidden p-3 sm:p-4">
        {initialLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row gap-3 h-full min-h-0">
            <OrderLane
              title="Montaje"
              icon={<Package className="w-4 h-4 text-indigo-600" />}
              count={assemblyOrders.length}
              borderClass="border-indigo-200 dark:border-indigo-800"
              headerClass="bg-indigo-50/80 dark:bg-indigo-950/40 border-indigo-100 dark:border-indigo-900"
              badgeClass="bg-indigo-600 text-white"
              orders={assemblyOrders}
              emptyLabel="Nada en montaje"
              onAdvance={advanceOrder}
              onSelect={setSelectedOrder}
              onDelete={requestDeleteOrder}
              advancingId={advancingId}
            />
            <OrderLane
              title="Reparto"
              icon={<Truck className="w-4 h-4 text-cyan-600" />}
              count={deliveryOrders.length}
              borderClass="border-cyan-200 dark:border-cyan-800"
              headerClass="bg-cyan-50/80 dark:bg-cyan-950/40 border-cyan-100 dark:border-cyan-900"
              badgeClass="bg-cyan-600 text-white"
              orders={deliveryOrders}
              emptyLabel="Nada en reparto"
              onAdvance={advanceOrder}
              onSelect={setSelectedOrder}
              onDelete={requestDeleteOrder}
              advancingId={advancingId}
            />
          </div>
        )}
      </div>

      {/* Resumen del día — abajo */}
      <div className="shrink-0 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2.5 pb-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2 px-1">
          Resumen del día
        </p>
        <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
          {[
            { label: 'Montaje', value: stats.montaje, color: 'text-indigo-700 bg-indigo-50 border-indigo-200 dark:bg-indigo-950/30 dark:border-indigo-900 dark:text-indigo-300' },
            { label: 'Reparto', value: stats.delivery, color: 'text-cyan-700 bg-cyan-50 border-cyan-200 dark:bg-cyan-950/30 dark:border-cyan-900 dark:text-cyan-300' },
            { label: 'Entregados', value: stats.delivered, color: 'text-green-700 bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-900 dark:text-green-300' },
            {
              label: 'Espera media',
              value: stats.avgWait != null ? `${stats.avgWait}m` : '—',
              color: stats.avgWait != null && stats.avgWait >= WARN_MINUTES
                ? 'text-amber-700 bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-900 dark:text-amber-300'
                : 'text-gray-700 bg-gray-50 border-gray-200 dark:bg-gray-800/50 dark:border-gray-700 dark:text-gray-300',
            },
          ].map((s) => (
            <div key={s.label} className={`rounded-xl border px-1.5 py-2 text-center ${s.color}`}>
              <p className="text-lg sm:text-xl font-bold leading-none">{s.value}</p>
              <p className="text-[9px] sm:text-[10px] font-semibold uppercase tracking-wide mt-1 opacity-80">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Order detail modal */}
      {selectedOrder && (
        <OrderDetail
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onAdvance={advanceOrder}
          onDelete={requestDeleteOrder}
          advancing={advancingId === selectedOrder._id}
        />
      )}

      {/* Cobro al entregar */}
      {deliveryCompleteOrder && (
        <DeliverPaymentModal
          order={deliveryCompleteOrder}
          onConfirm={confirmCompleteDelivery}
          onClose={() => setDeliveryCompleteOrder(null)}
          loading={advancingId === deliveryCompleteOrder._id}
        />
      )}

      {/* Eliminar con motivo obligatorio */}
      {deleteOrder && (
        <CancelOrderModal
          order={deleteOrder}
          mode="delete"
          onConfirm={handleDeleteOrder}
          onClose={() => setDeleteOrder(null)}
          loading={advancingId === deleteOrder._id}
        />
      )}
    </div>
  );
}
