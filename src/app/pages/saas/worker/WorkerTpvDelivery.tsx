import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router';
import { useAuth } from '../../../context/AuthContext';
import { useBusiness } from '../../../context/BusinessContext';
import { useActiveStoreScope } from '../../../context/ActiveStoreScopeContext';
import { useModalClose } from '../../../hooks/useModalClose';
import { useLiveClock } from '../../../hooks/useLiveClock';
import { resolveBusinessDataUserId } from '../../../lib/tenantUserId';
import {
  filterDeliveryOrdersRequest,
  updateDeliveryOrderRequest,
  correctDeliveryOrderPaymentRequest,
  cancelDeliveryOrderRequest,
  getDeliveryConfigRequest,
  isTpvRegisterSessionOpen,
  TPV_SESSION_SYNC_EVENT,
  type DeliveryOrder,
  type DeliveryOrderStatus,
  type DeliveryType,
  type TpvRegisterSession,
} from '../../../lib/deliveryApi';
import { normalizeStaffConsumptionConfig } from '../../../lib/staffConsumptionUtils';
import { resolvePdvIdFromStoreRef, filterOrdersForActivePdv } from '../../../lib/pdvScope';
import { exitTpvTabletSessionPath, readTpvTabletBinding } from '../../../lib/tpvTabletSession';
import { useTpvRegisterIfOpen, type TpvRegisterContextType } from '../../../components/saas/TpvRegisterGate';
import { getWorkerInitials } from '../../../lib/tpvClockedInWorkers';
import { pickDefaultActivePdvId } from '../../../lib/deliveryOpsPdvSelection';
import {
  isDeliveredBoardOrder,
  localCalendarDayKey,
  localDayBounds,
  orderAlreadyCobrado,
  orderInRegisterSession,
  orderLoadBoundsForOpenSession,
} from '../../../lib/tpvCajaScope';
import { printDeliveryTicket } from '../../../lib/deliveryTicketPrint';
import { businessTicketInfoFrom, resolveDeliveryOrderChargeTotal } from '../../../lib/deliveryTicketHelpers';
import { OrderTicketButtons } from '../../../components/delivery/OrderTicketButtons';
import { OrderItemDetailCard } from '../../../components/delivery/OrderItemDetailCard';
import { TpvRapidoOrderFlow } from '../TpvRapidoPage';
import { WorkerTpvStaffConsumption } from './WorkerTpvStaffConsumption';
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
  Wallet,
  Trash2,
  Smartphone,
  Globe,
  UtensilsCrossed,
  LogOut,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import { enqueueTpvOfflineItem, isBrowserOnline } from '../../../lib/tpvTabletOffline';
import { flushTpvOfflineQueue } from '../../../lib/tpvOfflineSync';
import { prefetchTpvCatalog } from '../../../lib/tpvCatalogCache';
import { resolveBusinessScopeId } from '../../../lib/deliverySetup';
import { useTpvSuppressBottomBar } from '../../../context/TpvChromeContext';

type DeliveryPaymentMethod = 'efectivo' | 'tarjeta' | 'bizum' | 'otro';

const PAYMENT_LABELS: Record<DeliveryPaymentMethod, string> = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  bizum: 'Bizum',
  otro: 'Otros',
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

function isCompletedBoardOrder(order: DeliveryOrder): boolean {
  return isDeliveredBoardOrder(order);
}

/** Pedido cobrado en TPV (Cobrar y enviar): tiene canal y método de pago. */
function resolveDeliveryPaymentMethod(raw: string | undefined | null): DeliveryPaymentMethod {
  const pm = String(raw || '').trim().toLowerCase();
  if (pm === 'otros') return 'otro';
  if (pm === 'tarjeta' || pm === 'bizum' || pm === 'otro') return pm;
  return 'efectivo';
}

/** Al entregar a domicilio hay que preguntar cómo pagó salvo que ya conste cobrado. */
function shouldAskPaymentOnDelivery(order: DeliveryOrder): boolean {
  const fullyCollected =
    Boolean(order.paymentCollected)
    && order.paymentStatus === 'paid'
    && Number(order.paidAmount || 0) >= Number(order.totalAmount || 0)
    && Number(order.totalAmount || 0) > 0;
  if (fullyCollected) return false;
  if (String(order.deliveryType || '').toLowerCase() === 'domicilio') return true;
  return !orderAlreadyCobrado(order);
}

function orderPaymentBoardBadge(order: DeliveryOrder): {
  method: DeliveryPaymentMethod;
  statusLabel: string;
  paid: boolean;
} | null {
  if (!order.paymentMethod) return null;
  const method = resolveDeliveryPaymentMethod(order.paymentMethod);
  const paid = orderAlreadyCobrado(order);
  return {
    method,
    statusLabel: paid ? 'Cobrado' : 'Pago',
    paid,
  };
}

function PaymentMethodBoardChip({
  method,
  statusLabel,
  paid,
}: {
  method: DeliveryPaymentMethod;
  statusLabel: string;
  paid: boolean;
}) {
  const methodLabel = PAYMENT_LABELS[method];
  const Icon = method === 'tarjeta' ? CreditCard : method === 'bizum' ? Smartphone : method === 'otro' ? Wallet : Banknote;

  const methodStyles: Record<DeliveryPaymentMethod, { chip: string; icon: string }> = {
    efectivo: {
      chip: paid
        ? 'bg-amber-100 text-amber-950 border-amber-400 dark:bg-amber-950/50 dark:text-amber-100 dark:border-amber-600'
        : 'bg-amber-50 text-amber-900 border-amber-300 dark:bg-amber-950/30 dark:text-amber-200 dark:border-amber-700',
      icon: paid ? 'text-amber-700 dark:text-amber-300' : 'text-amber-600 dark:text-amber-400',
    },
    tarjeta: {
      chip: paid
        ? 'bg-sky-100 text-sky-950 border-sky-400 dark:bg-sky-950/50 dark:text-sky-100 dark:border-sky-600'
        : 'bg-sky-50 text-sky-900 border-sky-300 dark:bg-sky-950/30 dark:text-sky-200 dark:border-sky-700',
      icon: paid ? 'text-sky-700 dark:text-sky-300' : 'text-sky-600 dark:text-sky-400',
    },
    bizum: {
      chip: paid
        ? 'bg-violet-100 text-violet-950 border-violet-400 dark:bg-violet-950/50 dark:text-violet-100 dark:border-violet-600'
        : 'bg-violet-50 text-violet-900 border-violet-300 dark:bg-violet-950/30 dark:text-violet-200 dark:border-violet-700',
      icon: paid ? 'text-violet-700 dark:text-violet-300' : 'text-violet-600 dark:text-violet-400',
    },
    otro: {
      chip: paid
        ? 'bg-gray-200 text-gray-950 border-gray-400 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600'
        : 'bg-gray-100 text-gray-900 border-gray-300 dark:bg-gray-900/30 dark:text-gray-200 dark:border-gray-700',
      icon: paid ? 'text-gray-700 dark:text-gray-300' : 'text-gray-600 dark:text-gray-400',
    },
  };

  const style = methodStyles[method];

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border-2 text-xs font-bold leading-none ${style.chip}`}
    >
      <Icon className={`w-4 h-4 shrink-0 ${style.icon}`} />
      <span className="text-[10px] font-semibold uppercase tracking-wide opacity-80">{statusLabel}</span>
      <span className="text-sm font-extrabold">{methodLabel}</span>
    </span>
  );
}

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
  const phoneDigits = String(order.customerPhone || '').replace(/\D/g, '');
  const qDigits = query.replace(/\D/g, '');
  if (orderNo.includes(q) || customer.includes(q)) return true;
  if (qDigits.length >= 3 && phoneDigits.includes(qDigits)) return true;
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
  readOnly = false,
}: {
  order: DeliveryOrder;
  onAdvance: (o: DeliveryOrder) => void;
  onSelect: (o: DeliveryOrder) => void;
  onDelete: (o: DeliveryOrder) => void;
  advancing: boolean;
  readOnly?: boolean;
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
  const paymentBadge = orderPaymentBoardBadge(order);

  return (
    <div
      className={`relative rounded-xl border ${cfg.bg} p-2 transition-all hover:shadow-md ${
        waitMinutes >= LATE_MINUTES ? 'border-red-300 dark:border-red-800' : 'border-gray-200/80 dark:border-gray-600/50'
      }`}
    >
      {!readOnly && (
        <button
          type="button"
          onClick={() => onDelete(order)}
          title="Eliminar pedido"
          className="absolute top-1 right-1 z-10 p-1 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      )}
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
              {formatCurrency(resolveDeliveryOrderChargeTotal(order))}
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
          {paymentBadge && (
            <div className="mt-1.5">
              <PaymentMethodBoardChip
                method={paymentBadge.method}
                statusLabel={paymentBadge.statusLabel}
                paid={paymentBadge.paid}
              />
            </div>
          )}
        </button>

        {/* Acción principal */}
        {!readOnly && nextLabel && (
          <button
            type="button"
            onClick={() => onAdvance(order)}
            disabled={advancing}
            title={nextLabel}
            className="shrink-0 self-center flex flex-col items-center justify-center gap-0.5 min-w-[3.5rem] min-h-[44px] px-2 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold transition-all disabled:opacity-50 touch-manipulation"
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
  readOnly = false,
  compact = false,
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
  readOnly?: boolean;
  compact?: boolean;
}) {
  return (
    <section className={`flex flex-col min-h-0 flex-1 rounded-2xl border-2 ${borderClass} bg-white dark:bg-gray-900 overflow-hidden shadow-sm ${compact ? 'min-h-[140px]' : 'min-h-[220px] md:min-h-0'}`}>
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
              readOnly={readOnly}
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
            {formatCurrency(resolveDeliveryOrderChargeTotal(order))}
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-3 font-medium">
            {shouldAskPaymentOnDelivery(order)
              ? '¿Cómo ha pagado?'
              : 'Confirma la entrega (ya cobrado en caja)'}
          </p>
          {shouldAskPaymentOnDelivery(order) && order.paymentMethod && (
            <p className="text-xs text-cyan-700 dark:text-cyan-300 mt-1 font-medium">
              Previsto: {PAYMENT_LABELS[resolveDeliveryPaymentMethod(order.paymentMethod)]}
            </p>
          )}
          {!shouldAskPaymentOnDelivery(order) && order.paymentMethod && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1 font-semibold">
              Cobrado: {PAYMENT_LABELS[resolveDeliveryPaymentMethod(order.paymentMethod)]}
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {shouldAskPaymentOnDelivery(order) ? (
            <>
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
              <button
                type="button"
                onClick={() => onConfirm('otro')}
                disabled={loading}
                className="flex flex-col items-center gap-2 py-4 px-2 rounded-2xl border-2 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="w-7 h-7 animate-spin text-gray-600" />
                ) : (
                  <Wallet className="w-7 h-7 text-gray-700 dark:text-gray-300" />
                )}
                <span className="text-xs font-bold text-gray-900 dark:text-gray-100">Otros</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => onConfirm(resolveDeliveryPaymentMethod(order.paymentMethod))}
              disabled={loading}
              className="col-span-2 flex items-center justify-center gap-2 py-4 px-4 rounded-2xl border-2 border-emerald-200 dark:border-emerald-800 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm transition-colors disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <CheckCircle2 className="w-5 h-5" />
              )}
              Confirmar entrega
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function OrderDetail({ order, onClose, onAdvance, onDelete, onCorrectPayment, advancing, correctingPayment }: {
  order: DeliveryOrder;
  onClose: () => void;
  onAdvance: (o: DeliveryOrder) => void;
  onDelete: (o: DeliveryOrder) => void;
  onCorrectPayment?: (o: DeliveryOrder, method: DeliveryPaymentMethod) => void;
  advancing: boolean;
  correctingPayment?: boolean;
}) {
  useModalClose(true, onClose);
  const { currentBusiness } = useBusiness();
  const compact = Boolean(readTpvTabletBinding());
  const cfg = STATUS_CONFIG[order.status];
  const nextLabel = TABLET_NEXT_LABEL[order.status];
  const displayLabel = LANE_STATUS_LABEL[order.status] || cfg.label;
  const typeBadge = DELIVERY_TYPE_BADGE[order.deliveryType] || DELIVERY_TYPE_BADGE.domicilio;
  const canCorrectPayment =
    Boolean(onCorrectPayment) && isCompletedBoardOrder(order) && orderAlreadyCobrado(order);
  const currentPayment = resolveDeliveryPaymentMethod(order.paymentMethod);

  return (
    <div className={`fixed inset-0 z-50 flex items-end sm:items-center justify-center ${compact ? 'p-2' : 'p-4 sm:p-6'}`}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div className={`relative flex flex-col w-full bg-gray-50 dark:bg-gray-950 rounded-2xl shadow-2xl border border-gray-200/80 dark:border-gray-800 overflow-hidden ${
        compact ? 'max-w-lg max-h-[92dvh] rounded-b-none sm:rounded-2xl' : 'max-w-3xl max-h-[88dvh]'
      }`}>
        <div className={`shrink-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 ${compact ? 'px-3 py-2' : 'px-4 py-3'}`}>
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">Detalle del pedido</p>
              <div className="flex items-center gap-1.5 flex-wrap">
                <h2 className={`font-bold text-gray-900 dark:text-gray-100 truncate ${compact ? 'text-lg' : 'text-xl'}`}>
                  #{order.orderNumber}
                </h2>
                <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-bold ${cfg.bg} ${cfg.color}`}>
                  {cfg.icon} {displayLabel}
                </span>
                <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-bold ${typeBadge.className}`}>
                  {typeBadge.icon} {typeBadge.label}
                </span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                  Espera{' '}
                  <span className={`ml-1 tabular-nums font-bold ${timerTone(orderWaitMinutes(order))}`}>
                    {formatElapsed(orderWaitMinutes(order))}
                  </span>
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shrink-0 touch-manipulation"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        <div className={`flex-1 min-h-0 flex flex-col gap-3 overflow-hidden ${compact ? 'px-3 py-2' : 'px-4 py-3'}`}>
          <div className={`shrink-0 grid gap-3 ${compact ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2'}`}>
            {order.customerName && (
              <div className="flex items-start gap-2.5 p-3 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 min-w-0">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-50 dark:bg-cyan-950/40 shrink-0">
                  <User className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
                </span>
                <div className="min-w-0">
                  <p className="text-base font-bold text-gray-900 dark:text-gray-100 truncate">{order.customerName}</p>
                  {order.customerPhone && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 truncate mt-0.5">{order.customerPhone}</p>
                  )}
                  {order.customerAddress && (
                    <p className="text-xs text-gray-500 leading-snug line-clamp-2 mt-0.5">{order.customerAddress}</p>
                  )}
                </div>
              </div>
            )}
            {order.takenByName && (
              <div className="flex items-center gap-2.5 px-3 py-3 bg-violet-50 dark:bg-violet-950/30 rounded-xl border border-violet-200/70 dark:border-violet-900 min-w-0">
                <span className="w-9 h-9 rounded-full bg-violet-600 text-white text-sm font-bold flex items-center justify-center shrink-0">
                  {getWorkerInitials(order.takenByName)}
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-violet-600/80 dark:text-violet-400">Pedido cogido por</p>
                  <p className="text-base font-bold text-gray-900 dark:text-gray-100 truncate">{order.takenByName}</p>
                </div>
              </div>
            )}
          </div>

          <div className="flex-1 min-h-0 flex flex-col gap-2 overflow-y-auto">
            <h3 className="shrink-0 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Artículos · {order.items.length}
            </h3>
            <div
              className={`max-h-[min(280px,32dvh)] overflow-y-auto grid gap-3 content-start grid-cols-1 ${
                !compact && order.items.length > 1 ? 'sm:grid-cols-2' : ''
              }`}
            >
              {order.items.map((item) => (
                <OrderItemDetailCard key={item.id} item={item} formatPrice={formatCurrency} variant="tablet" />
              ))}
            </div>
          </div>

          {order.notes && (
            <div className="shrink-0 px-3 py-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-300/70 dark:border-amber-800 rounded-xl">
              <p className="text-[10px] font-bold uppercase text-amber-700 dark:text-amber-400">Nota del pedido</p>
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-100 leading-snug">{order.notes}</p>
            </div>
          )}

          <div className="shrink-0 rounded-xl border border-emerald-200/80 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 p-3 space-y-2">
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-gray-600 dark:text-gray-400 font-medium">
                  {order.ticketNumber ? `Ticket ${order.ticketNumber}` : 'Total del pedido'}
                </p>
                {order.paymentMethod && (
                  <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300 mt-0.5">
                    {order.paymentStatus === 'paid' ? 'Cobrado' : 'Pago previsto'} ·{' '}
                    {PAYMENT_LABELS[resolveDeliveryPaymentMethod(order.paymentMethod)]}
                  </p>
                )}
              </div>
              <p className={`font-black text-emerald-700 dark:text-emerald-400 tabular-nums leading-none shrink-0 ${compact ? 'text-2xl' : 'text-3xl'}`}>
                {formatCurrency(resolveDeliveryOrderChargeTotal(order))}
              </p>
            </div>
            {currentBusiness && (
              <OrderTicketButtons
                order={order}
                business={businessTicketInfoFrom(currentBusiness)}
                salesPointName={order.salesPointName}
                cashierName={order.takenByName}
                layout="tablet"
              />
            )}
          </div>

          {canCorrectPayment && (
            <div className="shrink-0 grid grid-cols-3 gap-2">
              {([
                { method: 'efectivo' as const, label: 'Efectivo', icon: Banknote },
                { method: 'tarjeta' as const, label: 'Tarjeta', icon: CreditCard },
                { method: 'bizum' as const, label: 'Bizum', icon: Smartphone },
              ]).map(({ method, label, icon: Icon }) => {
                const active = currentPayment === method;
                return (
                  <button
                    key={method}
                    type="button"
                    disabled={correctingPayment || active}
                    onClick={() => onCorrectPayment?.(order, method)}
                    className={`flex flex-col items-center gap-0.5 py-2 px-2 rounded-lg border text-xs font-bold disabled:opacity-50 touch-manipulation ${
                      active
                        ? 'border-gray-900 bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                        : 'border-gray-200 dark:border-gray-700'
                    }`}
                  >
                    {correctingPayment ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" />}
                    {label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-3 flex gap-2 rounded-b-2xl">
          {nextLabel && (
            <button
              type="button"
              onClick={() => onAdvance(order)}
              disabled={advancing}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-base font-bold disabled:opacity-50 touch-manipulation shadow-md"
            >
              {advancing ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowRight className="w-5 h-5" />}
              {nextLabel}
            </button>
          )}
          <button
            type="button"
            onClick={() => onDelete(order)}
            disabled={advancing}
            aria-label="Eliminar pedido"
            className={`flex items-center justify-center gap-1.5 rounded-xl border-2 border-red-300 dark:border-red-900/60 text-red-600 dark:text-red-400 font-semibold hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50 touch-manipulation ${
              nextLabel ? 'px-4 py-3 shrink-0' : 'flex-1 py-3 text-base'
            }`}
          >
            <Trash2 className="w-5 h-5" />
            {!nextLabel && 'Eliminar pedido'}
          </button>
        </div>
      </div>
    </div>
  );
}

export type WorkerTpvDeliveryProps = {
  /** TPV Rápido CEO: misma UI que tablet, con tienda elegida antes. */
  ceoMode?: boolean;
  forcedPdvId?: string | null;
  onChangeStore?: () => void;
};

export function WorkerTpvDelivery({
  ceoMode = false,
  forcedPdvId = null,
  onChangeStore,
}: WorkerTpvDeliveryProps = {}) {
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
  const [correctingPaymentId, setCorrectingPaymentId] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<DeliveryOrder | null>(null);
  const [deliveryCompleteOrder, setDeliveryCompleteOrder] = useState<DeliveryOrder | null>(null);
  const [deleteOrder, setDeleteOrder] = useState<DeliveryOrder | null>(null);
  const [staffConsumptionEnabled, setStaffConsumptionEnabled] = useState(false);

  useTpvSuppressBottomBar(view !== 'board');

  const userId = resolveBusinessDataUserId(user, currentBusiness);
  const businessId = resolveBusinessScopeId(currentBusiness);
  const registerLive = useTpvRegisterIfOpen();
  const stickyRegisterRef = useRef<TpvRegisterContextType | null>(null);
  useEffect(() => {
    if (registerLive && isTpvRegisterSessionOpen(registerLive.session)) {
      stickyRegisterRef.current = registerLive;
    }
  }, [registerLive]);
  const register = registerLive ?? stickyRegisterRef.current;
  const registerOpen = Boolean(register && isTpvRegisterSessionOpen(register.session));
  const tabletBinding = useMemo(() => readTpvTabletBinding(), []);
  const isTabletUi = Boolean(tabletBinding) && !ceoMode;
  const workerPdv = useMemo(
    () => resolvePdvIdFromStoreRef(activeStoreScope.pointsOfSale, user?.employment?.salesPointId),
    [activeStoreScope.pointsOfSale, user?.employment?.salesPointId],
  );
  const scopedPdvId = useMemo(() => {
    if (ceoMode && forcedPdvId) return String(forcedPdvId).trim() || null;
    const fromTablet = String(tabletBinding?.pdvId || '').trim();
    if (fromTablet) return fromTablet;
    const fromWorker = String(workerPdv.pdvId || '').trim();
    if (fromWorker) return fromWorker;
    return String(activeStoreScope.activeSalesPointId || '').trim() || null;
  }, [ceoMode, forcedPdvId, tabletBinding?.pdvId, workerPdv.pdvId, activeStoreScope.activeSalesPointId]);
  const primaryPdvId = useMemo(
    () => pickDefaultActivePdvId(activeStoreScope.pointsOfSale.filter((p) => p.active !== false)),
    [activeStoreScope.pointsOfSale],
  );
  const scopedPdvName = useMemo(() => {
    if (!scopedPdvId) return null;
    const pdv = activeStoreScope.pointsOfSale.find((p) => p._id === scopedPdvId);
    return pdv?.name || tabletBinding?.pdvName || null;
  }, [scopedPdvId, activeStoreScope.pointsOfSale, tabletBinding?.pdvName]);
  const scopedPdvWorkCenterId = useMemo(() => {
    if (!scopedPdvId) return null;
    const pdv = activeStoreScope.pointsOfSale.find((p) => p._id === scopedPdvId);
    return String(pdv?.workCenterId || '').trim() || null;
  }, [scopedPdvId, activeStoreScope.pointsOfSale]);

  const [dayKey, setDayKey] = useState(() => localCalendarDayKey());
  const [showDelivered, setShowDelivered] = useState(false);
  const sessionOpenedAt = register?.session?.openedAt ?? null;

  const loadOrders = useCallback(async (options?: { silent?: boolean }) => {
    if (!userId) return;
    const silent = options?.silent ?? false;
    if (!silent) setRefreshing(true);
    setDayKey(localCalendarDayKey());
    if (!sessionOpenedAt) {
      setOrders([]);
      setInitialLoading(false);
      if (!silent) setRefreshing(false);
      return;
    }
    const bounds = orderLoadBoundsForOpenSession(sessionOpenedAt);
    try {
      const data = await filterDeliveryOrdersRequest(userId, {
        dateFrom: bounds.from,
        dateTo: bounds.to,
        limit: 500,
      });
      const scoped = filterOrdersForActivePdv(
        data.orders,
        scopedPdvId,
        primaryPdvId,
        scopedPdvName,
        scopedPdvWorkCenterId,
      );
      setOrders(scoped.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    } catch {
      if (!silent) toast.error('Error al cargar pedidos');
    } finally {
      setInitialLoading(false);
      setRefreshing(false);
    }
  }, [userId, scopedPdvId, primaryPdvId, scopedPdvName, scopedPdvWorkCenterId, sessionOpenedAt]);

  useEffect(() => { void loadOrders(); }, [loadOrders]);

  useEffect(() => {
    setOrders([]);
  }, [register?.session?._id, sessionOpenedAt]);

  useEffect(() => {
    const tick = () => {
      const key = localCalendarDayKey();
      if (key !== dayKey) {
        setDayKey(key);
        void loadOrders({ silent: true });
      }
    };
    const interval = setInterval(tick, 60000);
    return () => clearInterval(interval);
  }, [dayKey, loadOrders]);

  useEffect(() => {
    const onSessionSync = (event: Event) => {
      const session = (event as CustomEvent<TpvRegisterSession>).detail;
      if (!session) return;
      if (session.status === 'closed') {
        setOrders([]);
        return;
      }
      if (session.status === 'open') {
        setOrders([]);
        setDayKey(localCalendarDayKey());
        void loadOrders({ silent: true });
      }
    };
    window.addEventListener(TPV_SESSION_SYNC_EVENT, onSessionSync);
    return () => window.removeEventListener(TPV_SESSION_SYNC_EVENT, onSessionSync);
  }, [loadOrders]);

  useEffect(() => {
    if (!userId) return;
    const bizId = businessId || String(tabletBinding?.businessId || '').trim();
    prefetchTpvCatalog(userId, bizId);
  }, [userId, businessId, tabletBinding?.businessId]);

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

  const nowMs = useLiveClock(30_000);

  const advanceOrder = useCallback(async (order: DeliveryOrder, paymentMethod?: DeliveryPaymentMethod) => {
    const next = TABLET_NEXT_STATUS[order.status];
    if (!next || !userId) return;

    let resolvedPayment = paymentMethod;
    if (next === 'entregado' && !resolvedPayment) {
      if (shouldAskPaymentOnDelivery(order)) {
        setDeliveryCompleteOrder(order);
        return;
      }
      resolvedPayment = resolveDeliveryPaymentMethod(order.paymentMethod);
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
      if (next === 'entregado' && resolvedPayment) {
        extras.deliveredAt = now;
        if (!orderAlreadyCobrado(order)) {
          extras.paymentMethod = resolvedPayment;
          extras.paymentCollected = true;
          extras.paymentCollectedAt = now;
          extras.paymentCollectedBy = user?.user_id || user?.id || user?.fullName || 'Tablet';
          extras.paymentStatus = 'paid';
          extras.paidAmount = resolveDeliveryOrderChargeTotal(order);
          extras.paidAt = order.paidAt || now;
        }
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
            notes: next === 'entregado' && resolvedPayment
              ? `Entregado · ${PAYMENT_LABELS[resolvedPayment]}`
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

      const submitUpdate = async (body: DeliveryOrder): Promise<DeliveryOrder> => {
        try {
          return await updateDeliveryOrderRequest(userId, body);
        } catch (err) {
          const msg = err instanceof Error ? err.message : '';
          if (!/conflict|409|revision/i.test(msg)) throw err;
          const bounds = orderLoadBoundsForOpenSession(sessionOpenedAt);
          const data = await filterDeliveryOrdersRequest(userId, {
            dateFrom: bounds.from,
            dateTo: bounds.to,
            limit: 500,
          });
          const fresh = data.orders.find((o) => o._id === body._id);
          if (!fresh?._rev || fresh._rev === body._rev) throw err;
          return await updateDeliveryOrderRequest(userId, { ...body, _rev: fresh._rev });
        }
      };

      const updated = await submitUpdate(payload);
      setOrders(prev => prev.map(o => o._id === updated._id ? updated : o));
      if (next === 'entregado') {
        setSelectedOrder(null);
        setDeliveryCompleteOrder(null);
        toast.success(
          `Pedido #${order.orderNumber} entregado · ${PAYMENT_LABELS[resolvedPayment!]}`,
        );
        if (updated.paymentStatus === 'paid' && currentBusiness) {
          try {
            printDeliveryTicket({
              order: updated,
              business: businessTicketInfoFrom(currentBusiness),
              salesPointName: updated.salesPointName,
              cashierName: user?.fullName,
              variant: 'customer',
            });
          } catch {
            /* el ticket es opcional; no bloquear la entrega */
          }
        }
      } else {
        if (selectedOrder?._id === updated._id) setSelectedOrder(updated);
        const label = LANE_STATUS_LABEL[next] || STATUS_CONFIG[next].label;
        toast.success(`Pedido #${order.orderNumber} → ${label}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al avanzar pedido');
    } finally {
      setAdvancingId(null);
    }
  }, [userId, selectedOrder, user?.fullName, user?.user_id, user?.id, currentBusiness, sessionOpenedAt]);

  const confirmCompleteDelivery = useCallback(
    (method: DeliveryPaymentMethod) => {
      if (!deliveryCompleteOrder) return;
      const fresh = orders.find((o) => o._id === deliveryCompleteOrder._id) || deliveryCompleteOrder;
      void advanceOrder(fresh, method);
    },
    [deliveryCompleteOrder, advanceOrder, orders],
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

  const handleCorrectPayment = useCallback(
    async (order: DeliveryOrder, method: DeliveryPaymentMethod) => {
      if (!userId) return;
      setCorrectingPaymentId(order._id);
      try {
        const updated = await correctDeliveryOrderPaymentRequest(userId, order._id, method);
        setOrders((prev) => prev.map((o) => (o._id === updated._id ? updated : o)));
        setSelectedOrder((prev) => (prev?._id === updated._id ? updated : prev));
        toast.success(`Pago actualizado: ${PAYMENT_LABELS[method]}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'No se pudo corregir el pago');
      } finally {
        setCorrectingPaymentId(null);
      }
    },
    [userId],
  );

  const backToBoard = useCallback(() => {
    setView('board');
    void loadOrders({ silent: true });
  }, [loadOrders]);

  const exitTabletTpv = useCallback(() => {
    navigate(exitTpvTabletSessionPath(), { replace: true });
  }, [navigate]);

  const openSession = register?.session ?? null;

  const stats = useMemo(() => {
    const montaje = orders.filter(
      (o) => MONTAGE_STATUSES.includes(o.status) && orderInRegisterSession(o, openSession),
    );
    const enReparto = orders.filter(
      (o) => o.status === 'en_reparto' && orderInRegisterSession(o, openSession),
    );
    const completados = orders.filter((o) => {
      if (!orderInRegisterSession(o, openSession)) return false;
      return isCompletedBoardOrder(o);
    });
    const activeWait = [...montaje, ...enReparto];
    const avgWait =
      activeWait.length > 0
        ? Math.round(activeWait.reduce((s, o) => s + orderWaitMinutes(o), 0) / activeWait.length)
        : null;
    return {
      montaje: montaje.length,
      delivery: enReparto.length,
      delivered: completados.length,
      avgWait,
    };
  }, [orders, openSession, nowMs]);

  const scopedActive = useMemo(
    () => orders.filter(
      (o) =>
        (MONTAGE_STATUSES.includes(o.status) || o.status === 'en_reparto')
        && orderInRegisterSession(o, openSession),
    ),
    [orders, openSession],
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

  const completedTodayOrders = useMemo(
    () => orders
      .filter((o) => {
        if (o.status === 'cancelled') return false;
        if (!orderInRegisterSession(o, openSession)) return false;
        return isCompletedBoardOrder(o);
      })
      .filter((o) => matchesFulfillmentFilter(o, fulfillmentFilter))
      .filter((o) => matchesSearch(o, search))
      .sort((a, b) => new Date(b.deliveredAt || b.createdAt).getTime() - new Date(a.deliveredAt || a.createdAt).getTime())
      .slice(0, 50),
    [orders, openSession, fulfillmentFilter, search],
  );

  const filterCounts = useMemo(() => ({
    all: scopedActive.length,
    recogida: scopedActive.filter((o) => o.deliveryType === 'recogida').length,
    domicilio: scopedActive.filter((o) => o.deliveryType === 'domicilio').length,
  }), [scopedActive]);

  const visibleCount = assemblyOrders.length + deliveryOrders.length;

  if (view === 'new-order') {
    return (
      <TpvRapidoOrderFlow
        tabletMode
        onBack={backToBoard}
      />
    );
  }

  if (view === 'staff-consumption') {
    if (!registerOpen || !register) {
      return (
        <div className="flex flex-col items-center justify-center gap-4 p-8 min-h-[40vh] text-center">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Abre la caja de la tienda antes de registrar consumo del equipo.
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
    return (
      <WorkerTpvStaffConsumption
        userId={userId}
        onBack={backToBoard}
        register={register}
        salesPointId={scopedPdvId}
        salesPointName={scopedPdvName}
      />
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header compacto */}
      <div className={`shrink-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 ${isTabletUi ? 'px-3 py-2' : 'px-4 py-3'}`}>
        <div className={`flex items-center justify-between gap-3 ${isTabletUi ? 'mb-2' : 'mb-3'}`}>
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`bg-indigo-100 dark:bg-indigo-900/30 rounded-xl flex items-center justify-center shrink-0 ${isTabletUi ? 'w-8 h-8' : 'w-10 h-10'}`}>
              <Package className={`text-indigo-600 ${isTabletUi ? 'w-4 h-4' : 'w-5 h-5'}`} />
            </div>
            <div className="min-w-0">
              <h1 className={`font-bold text-gray-900 dark:text-gray-100 truncate ${isTabletUi ? 'text-base' : 'text-lg'}`}>
                {ceoMode ? (scopedPdvName || 'Pedidos activos') : 'Pedidos activos'}
              </h1>
              <p className={`text-gray-500 dark:text-gray-400 ${isTabletUi ? 'text-[11px]' : 'text-xs'}`}>
                {ceoMode ? 'TPV operativo · ' : ''}Montaje y reparto · {visibleCount} visibles
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {ceoMode && onChangeStore && (
              <button
                type="button"
                onClick={onChangeStore}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/40 text-xs font-semibold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors"
                title="Elegir otra tienda"
              >
                <Store className="w-4 h-4" />
                Cambiar tienda
              </button>
            )}
            {tabletBinding && !ceoMode && (
              <button
                type="button"
                onClick={exitTabletTpv}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                title="Salir del TPV"
              >
                <LogOut className="w-4 h-4" />
                Salir
              </button>
            )}
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

        <div className={`grid gap-2 ${staffConsumptionEnabled ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'} ${isTabletUi ? 'mb-2' : 'mb-3'}`}>
          <button
            type="button"
            onClick={() => setView('new-order')}
            disabled={!registerOpen}
            title={registerOpen ? undefined : 'Abre la caja de la tienda antes de crear pedidos'}
            className={`w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:bg-emerald-600/45 disabled:cursor-not-allowed text-white font-bold shadow-lg shadow-emerald-900/25 transition-colors touch-manipulation ${
              isTabletUi ? 'min-h-[40px] py-2 text-sm' : 'min-h-[48px] py-3.5 text-sm sm:text-base gap-2.5 rounded-2xl'
            }`}
          >
            <Plus className={isTabletUi ? 'w-4 h-4' : 'w-5 h-5'} strokeWidth={2.5} />
            Nuevo pedido
          </button>
          {staffConsumptionEnabled && (
            <button
              type="button"
              onClick={() => setView('staff-consumption')}
              disabled={!registerOpen}
              title={registerOpen ? undefined : 'Abre la caja de la tienda antes de registrar consumo'}
              className={`w-full flex items-center justify-center gap-2 rounded-xl bg-violet-600 hover:bg-violet-700 active:bg-violet-800 disabled:bg-violet-600/45 disabled:cursor-not-allowed text-white font-bold shadow-lg shadow-violet-900/25 transition-colors touch-manipulation ${
                isTabletUi ? 'min-h-[40px] py-2 text-sm' : 'min-h-[48px] py-3.5 text-sm sm:text-base gap-2.5 rounded-2xl'
              }`}
            >
              <UtensilsCrossed className={isTabletUi ? 'w-4 h-4' : 'w-5 h-5'} strokeWidth={2.5} />
              Consumo equipo
            </button>
          )}
        </div>

        {/* Filtro recogida / envío */}
        <div className={`flex p-0.5 rounded-lg bg-gray-100 dark:bg-gray-800 ${isTabletUi ? 'gap-1' : 'gap-1.5 p-1 rounded-xl'}`}>
          {FULFILLMENT_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFulfillmentFilter(f.id)}
              className={`flex-1 flex items-center justify-center gap-1 px-2 rounded-lg font-semibold transition-all touch-manipulation ${
                isTabletUi ? 'min-h-[34px] py-1.5 text-[11px]' : 'min-h-[44px] py-2 text-xs gap-1.5'
              } ${
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
      <div className={`shrink-0 bg-gray-50 dark:bg-gray-950 border-b border-gray-200 dark:border-gray-700 ${isTabletUi ? 'px-3 py-1.5' : 'px-4 py-2'}`}>
        <div className="relative">
          <Search className={`absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 ${isTabletUi ? 'w-3.5 h-3.5' : 'w-4 h-4'}`} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar nº pedido, cliente..."
            className={`w-full pr-8 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 placeholder:text-gray-400 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none ${
              isTabletUi ? 'pl-8 py-1.5 min-h-[36px] text-xs' : 'pl-9 py-2.5 min-h-[44px] text-sm rounded-xl'
            }`}
          />
          {search && (
            <button type="button" onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="w-4 h-4 text-gray-400" />
            </button>
          )}
        </div>
      </div>

      {/* Columnas Montaje | Reparto */}
      <div className={`flex-1 min-h-0 overflow-hidden ${isTabletUi ? 'p-2' : 'p-3 sm:p-4'}`}>
        {initialLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
          </div>
        ) : (
          <div className={`flex h-full min-h-0 gap-2 ${isTabletUi ? 'flex-col' : 'flex-col md:flex-row gap-3'}`}>
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
              compact={isTabletUi}
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
              compact={isTabletUi}
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
            { label: 'Completados', value: stats.delivered, color: 'text-green-700 bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-900 dark:text-green-300' },
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

        <button
          type="button"
          onClick={() => setShowDelivered((v) => !v)}
          className="mt-2.5 w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 text-left touch-manipulation"
        >
          <div className="flex items-center gap-2 min-w-0">
            <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
            <span className="text-xs sm:text-sm font-bold text-green-800 dark:text-green-300 truncate">
              Completados en turno ({completedTodayOrders.length})
            </span>
          </div>
          {showDelivered ? (
            <ChevronUp className="w-4 h-4 text-green-700 shrink-0" />
          ) : (
            <ChevronDown className="w-4 h-4 text-green-700 shrink-0" />
          )}
        </button>
        {showDelivered && (
          <div className={`mt-2 overflow-y-auto space-y-1 ${isTabletUi ? 'max-h-36' : 'max-h-44'}`}>
            {completedTodayOrders.length === 0 ? (
              <p className="text-center text-xs text-gray-500 dark:text-gray-400 py-3">Sin entregas en turno</p>
            ) : (
              completedTodayOrders.map((order) => {
                const statusCfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.nuevo;
                return (
                  <button
                    key={order._id}
                    type="button"
                    onClick={() => setSelectedOrder(order)}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-left touch-manipulation"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-gray-900 dark:text-gray-100 font-mono">#{order.orderNumber}</p>
                      <p className="text-[11px] text-gray-500 truncate">
                        {order.customerName || 'Cliente'}
                        {' · '}
                        {new Date(order.createdAt || '').toLocaleTimeString('es-ES', { timeStyle: 'short' })}
                        {order.channel ? ` · ${String(order.channel).toUpperCase()}` : ''}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-bold tabular-nums">{formatCurrency(resolveDeliveryOrderChargeTotal(order))}</p>
                      <p className={`text-[10px] font-semibold ${statusCfg.color}`}>{statusCfg.label}</p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Order detail modal */}
      {selectedOrder && (
        <OrderDetail
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onAdvance={advanceOrder}
          onDelete={requestDeleteOrder}
          onCorrectPayment={handleCorrectPayment}
          advancing={advancingId === selectedOrder._id}
          correctingPayment={correctingPaymentId === selectedOrder._id}
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
