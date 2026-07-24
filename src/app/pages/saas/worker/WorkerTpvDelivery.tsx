import { useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate, useLocation } from 'react-router';
import { useAuth } from '../../../context/AuthContext';
import { useBusiness } from '../../../context/BusinessContext';
import { useActiveStoreScope } from '../../../context/ActiveStoreScopeContext';
import { useModalClose } from '../../../hooks/useModalClose';
import { useLiveClock } from '../../../hooks/useLiveClock';
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
import { useTpvRegisterBoardReady, useTpvRegisterIfOpen, useTpvStatusBarQuickActions } from '../../../components/saas/TpvRegisterGate';
import { getWorkerInitials } from '../../../lib/tpvClockedInWorkers';
import { pickDefaultActivePdvId } from '../../../lib/deliveryOpsPdvSelection';
import { useTpvOrderFlowChrome, useTpvSuppressBottomBar } from '../../../context/TpvChromeContext';
import {
  isCancelledDeliveryOrder,
  isCompletedHistoryBoardOrder,
  isDeliveredBoardOrder,
  isTpvMontajeBoardOrder,
  isTpvRepartoBoardOrder,
  localCalendarDayKey,
  localDayBounds,
  orderAlreadyCobrado,
  orderInRegisterSession,
  orderLoadBoundsForOpenSession,
  orderOnOpenTpvOpsBoard,
} from '../../../lib/tpvCajaScope';
import { foldTpvSearchText } from '../../../lib/tpvCatalogNavigation';
import {
  formatElapsedMinutes,
  getTpvPhaseTimer,
} from '../../../lib/deliveryOpsLiveTimes';
import { printDeliveryTicket } from '../../../lib/deliveryTicketPrint';
import { businessTicketInfoFrom, resolveDeliveryOrderChargeTotal, shouldPrintCustomerTicketOnDispatch } from '../../../lib/deliveryTicketHelpers';
import { OrderTicketButtons } from '../../../components/delivery/OrderTicketButtons';
import { OrderItemDetailCard } from '../../../components/delivery/OrderItemDetailCard';
import { DecimalNumpadField } from '../../../components/saas/DecimalNumpadField';
import { parseDecimalPadValue } from '../../../lib/decimalNumpadInput';
import { TpvRapidoOrderFlow } from '../TpvRapidoPage';
import { isTpvOpsVerticalPending } from '../../../lib/deliveryOpsTypes';
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
  DoorOpen,
  Tablet,
  ChevronUp,
  ChevronDown,
  Bike,
  Car,
  History,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { enqueueTpvOfflineItem, isBrowserOnline } from '../../../lib/tpvTabletOffline';
import { flushTpvOfflineQueue } from '../../../lib/tpvOfflineSync';
import { prefetchTpvCatalog } from '../../../lib/tpvCatalogCache';
import { resolveRetailOpsWriteBusinessId, resolveTpvRegisterScope } from '../../../lib/tpvRegisterScope';
import { useTpvIncomingOrderSounds } from '../../../hooks/useTpvIncomingOrderSounds';
import { useDeliveryOrdersLive } from '../../../hooks/useDeliveryOrdersLive';
import {
  isTpvBoardSoundEnabled,
  setTpvBoardSoundEnabled,
  unlockTpvBoardAudio,
} from '../../../lib/tpvChannelSounds';

type DeliveryPaymentMethod = 'efectivo' | 'tarjeta' | 'bizum' | 'otro';

const PAYMENT_LABELS: Record<DeliveryPaymentMethod, string> = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  bizum: 'Bizum',
  otro: 'Otros',
};

const CHANNEL_VISUAL: Record<string, { label: string; className: string; Icon: LucideIcon }> = {
  tpv: { label: 'TPV', className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200', Icon: Plus },
  web: { label: 'Web', className: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200', Icon: Globe },
  glovo: { label: 'Glovo', className: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200', Icon: Bike },
  justeat: { label: 'Just Eat', className: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200', Icon: UtensilsCrossed },
  ubereats: { label: 'Uber', className: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200', Icon: Car },
  phone: { label: 'Tel.', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200', Icon: Phone },
  app: { label: 'App', className: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200', Icon: Smartphone },
  direct: { label: 'Directo', className: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300', Icon: User },
};

function resolveChannelVisual(channel?: string | null) {
  const key = String(channel || 'tpv').trim().toLowerCase();
  return CHANNEL_VISUAL[key] || CHANNEL_VISUAL.tpv;
}

function OrderChannelBadge({ channel, compact = false }: { channel?: string | null; compact?: boolean }) {
  const visual = resolveChannelVisual(channel);
  const Icon = visual.Icon;
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded font-bold shrink-0 ${visual.className} ${
        compact ? 'p-0.5' : 'px-1 py-px text-[9px]'
      }`}
      title={visual.label}
    >
      <Icon className={compact ? 'w-2.5 h-2.5' : 'w-3 h-3'} />
      {!compact && visual.label}
    </span>
  );
}

type FulfillmentFilter = 'all' | 'recogida' | 'domicilio';

function isCompletedBoardOrder(order: DeliveryOrder): boolean {
  return isDeliveredBoardOrder(order);
}

/** Completados del turno: incluye eliminados que ya estaban entregados. */
function isHistoryCompletedBoardOrder(order: DeliveryOrder): boolean {
  return isCompletedHistoryBoardOrder(order);
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

const STATUS_CONFIG: Record<DeliveryOrderStatus, { label: string; color: string; bg: string; Icon: LucideIcon }> = {
  nuevo:      { label: 'Nuevo',      color: 'text-amber-700',   bg: 'bg-amber-50 border-amber-200',   Icon: Clock },
  cocina:     { label: 'En cocina',  color: 'text-orange-700',  bg: 'bg-orange-50 border-orange-200', Icon: ChefHat },
  listo:      { label: 'Montaje',    color: 'text-indigo-700',  bg: 'bg-indigo-50 border-indigo-200', Icon: Package },
  en_reparto: { label: 'En reparto', color: 'text-cyan-700',    bg: 'bg-cyan-50 border-cyan-200',     Icon: Truck },
  entregado:  { label: 'Entregado',  color: 'text-green-700',   bg: 'bg-green-50 border-green-200',   Icon: CheckCircle2 },
  cancelled:  { label: 'Cancelado',  color: 'text-gray-500',    bg: 'bg-gray-50 border-gray-200',     Icon: X },
  incident:   { label: 'Incidencia', color: 'text-red-700',     bg: 'bg-red-50 border-red-200',       Icon: AlertTriangle },
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

/** Recogida: del montaje → entregado (sin repartidor). Domicilio: montaje → reparto → entregado. */
function tabletNextStatus(order: DeliveryOrder): DeliveryOrderStatus | undefined {
  if (order.deliveryType === 'recogida') {
    if (order.status === 'nuevo' || order.status === 'cocina' || order.status === 'listo' || order.status === 'en_reparto') {
      return 'entregado';
    }
    return undefined;
  }
  return TABLET_NEXT_STATUS[order.status];
}

function tabletNextLabel(order: DeliveryOrder): string | undefined {
  if (order.deliveryType === 'recogida') {
    if (order.status === 'nuevo' || order.status === 'cocina' || order.status === 'listo' || order.status === 'en_reparto') {
      return 'Entregar';
    }
    return undefined;
  }
  return TABLET_NEXT_LABEL[order.status];
}

/** Pedidos visibles en la columna Montaje (cocina omitida: entran directo aquí). */
const LANE_STATUS_LABEL: Partial<Record<DeliveryOrderStatus, string>> = {
  nuevo: 'Montaje',
  cocina: 'Montaje',
  listo: 'Montaje',
  en_reparto: 'Reparto',
};

const WARN_MINUTES = 15;
const LATE_MINUTES = 25;

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

const DELIVERY_TYPE_BADGE: Record<DeliveryType, { label: string; className: string; Icon: LucideIcon }> = {
  recogida: {
    label: 'Recogida',
    className: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200',
    Icon: Store,
  },
  domicilio: {
    label: 'Envío',
    className: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200',
    Icon: Truck,
  },
  sala: {
    label: 'Sala',
    className: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200',
    Icon: ShoppingBag,
  },
};

const FULFILLMENT_FILTERS: { id: FulfillmentFilter; label: string; Icon: LucideIcon }[] = [
  { id: 'all', label: 'Todos', Icon: ShoppingBag },
  { id: 'recogida', label: 'Recogida', Icon: Store },
  { id: 'domicilio', label: 'Envío', Icon: Truck },
];

function matchesFulfillmentFilter(order: DeliveryOrder, filter: FulfillmentFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'recogida') return order.deliveryType === 'recogida';
  return order.deliveryType === 'domicilio';
}

function matchesSearch(order: DeliveryOrder, query: string): boolean {
  const q = foldTpvSearchText(query);
  if (!q) return true;
  const customer = foldTpvSearchText(order.customerName || '');
  const orderNo = foldTpvSearchText(order.orderNumber);
  const phoneDigits = String(order.customerPhone || '').replace(/\D/g, '');
  const qDigits = query.replace(/\D/g, '');
  if (orderNo.includes(q) || customer.includes(q)) return true;
  if (qDigits.length >= 3 && phoneDigits.includes(qDigits)) return true;
  // Prefijo de palabra en el nombre (evita "uri" → pedido de Carlos por un producto "Pureza")
  const nameWords = customer.split(/[^a-z0-9]+/).filter(Boolean);
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
  compact = false,
  nowMs,
}: {
  order: DeliveryOrder;
  onAdvance: (o: DeliveryOrder) => void;
  onSelect: (o: DeliveryOrder) => void;
  onDelete: (o: DeliveryOrder) => void;
  advancing: boolean;
  readOnly?: boolean;
  compact?: boolean;
  nowMs: number;
}) {
  const cfg = STATUS_CONFIG[order.status];
  const nextLabel = tabletNextLabel(order);
  const phaseTimer = getTpvPhaseTimer(order, nowMs);
  const waitMinutes = phaseTimer.minutes;
  const typeBadge = DELIVERY_TYPE_BADGE[order.deliveryType] || DELIVERY_TYPE_BADGE.domicilio;
  const TypeIcon = typeBadge.Icon;
  const isUrgent = order.priority === 'urgent' || order.priority === 'high';
  const itemCount = order.items.reduce((s, i) => s + i.quantity, 0);
  const itemPreview = order.items
    .slice(0, 2)
    .map((i) => `${i.quantity}× ${i.name}`)
    .join(' · ');
  const paymentBadge = orderPaymentBoardBadge(order);
  const timerTitle =
    order.deliveryType === 'recogida'
      ? 'Tiempo en montaje (hasta entregar en tienda)'
      : phaseTimer.kind === 'reparto'
        ? 'Tiempo en reparto (desde salida)'
        : phaseTimer.kind === 'montaje'
          ? 'Tiempo en montaje (hasta repartidor)'
          : 'Tiempo de espera';

  return (
    <div
      className={`relative rounded-lg border ${cfg.bg} transition-all hover:shadow-md ${
        compact ? 'p-1.5' : 'rounded-xl p-2'
      } ${
        waitMinutes >= LATE_MINUTES ? 'border-red-300 dark:border-red-800' : 'border-gray-200/80 dark:border-gray-600/50'
      }`}
    >
      {!readOnly && (
        <button
          type="button"
          onClick={() => onDelete(order)}
          title="Eliminar pedido"
          className={`absolute z-10 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors ${
            compact ? 'top-0.5 right-0.5 p-1' : 'top-1 right-1 p-1'
          }`}
        >
          <Trash2 className={compact ? 'w-3 h-3' : 'w-3 h-3'} />
        </button>
      )}
      <div className={`flex items-stretch ${compact ? 'gap-1.5 pr-5' : 'gap-2 pr-5'}`}>
        {/* Temporizador de fase (montaje → reparto / reparto → cierre) */}
        <div
          className={`shrink-0 flex flex-col items-center justify-center rounded-md border ${waitBadgeClasses(waitMinutes)} ${
            compact ? 'w-[2.75rem] px-0.5 py-1.5' : 'w-[3.25rem] px-1 py-1.5 rounded-lg'
          }`}
          title={timerTitle}
        >
          {!compact && <Timer className="w-3 h-3 mb-0.5 opacity-80" />}
          <span className={`font-bold leading-none tabular-nums ${compact ? 'text-base' : 'text-base'}`}>{waitMinutes}</span>
          <span className={`font-semibold uppercase tracking-wide opacity-80 ${compact ? 'text-[8px]' : 'text-[9px]'}`}>
            {phaseTimer.kind === 'reparto' ? 'ruta' : 'min'}
          </span>
        </div>

        {/* Info principal */}
        <button
          type="button"
          onClick={() => onSelect(order)}
          className="flex-1 min-w-0 text-left"
        >
          <div className="flex items-center gap-1 flex-wrap">
            <span className={`font-mono font-bold text-gray-900 dark:text-gray-100 ${compact ? 'text-xs' : 'text-xs'}`}>
              #{order.orderNumber}
            </span>
            <span className={`inline-flex items-center gap-0.5 px-1 py-px rounded font-bold ${typeBadge.className} ${compact ? 'text-[9px]' : 'text-[9px]'}`}>
              <TypeIcon className={compact ? 'w-3 h-3' : 'w-3 h-3'} />
              {typeBadge.label}
            </span>
            <OrderChannelBadge channel={order.channel} compact={compact} />
            {isUrgent && (
              <span className={`px-1 py-px bg-red-100 text-red-700 font-bold rounded ${compact ? 'text-[9px]' : 'text-[9px]'}`}>!</span>
            )}
          </div>
          {order.customerName && (
            <p className={`font-medium text-gray-800 dark:text-gray-200 truncate ${compact ? 'text-xs mt-0.5' : 'text-xs mt-0.5'}`}>
              {order.customerName}
            </p>
          )}
          {!compact && order.takenByName && (
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
          {!compact && (
            <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate mt-0.5">
              {itemPreview}
              {order.items.length > 2 ? ` +${order.items.length - 2}` : ''}
            </p>
          )}
          <div className={`flex items-center gap-1 flex-wrap ${compact ? 'mt-0.5 text-xs' : 'mt-0.5 text-[11px]'}`}>
            <span className="font-bold text-gray-900 dark:text-gray-100 tabular-nums">
              {formatCurrency(resolveDeliveryOrderChargeTotal(order))}
            </span>
            {!compact && (
              <>
                <span className="text-gray-300">·</span>
                <span className="text-gray-500">{itemCount} uds</span>
              </>
            )}
            {!compact && (
              <>
                <span className="text-gray-300">·</span>
                <span
                  className={
                    phaseTimer.kind === 'reparto'
                      ? 'text-cyan-600 dark:text-cyan-400'
                      : 'text-indigo-600 dark:text-indigo-400'
                  }
                >
                  {phaseTimer.label} {formatElapsedMinutes(waitMinutes)}
                </span>
              </>
            )}
          </div>
          {paymentBadge && !compact && (
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
            className={`shrink-0 self-center flex flex-col items-center justify-center rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition-all disabled:opacity-50 touch-manipulation ${
              compact
                ? 'min-w-[3.25rem] min-h-[2.75rem] px-1.5 py-1 gap-0.5 text-[10px]'
                : 'min-w-[3.5rem] min-h-[44px] px-2 py-2 gap-0.5 rounded-lg text-[10px]'
            }`}
          >
            {advancing ? (
              <Loader2 className={compact ? 'w-4 h-4 animate-spin' : 'w-4 h-4 animate-spin'} />
            ) : (
              <>
                <ArrowRight className={compact ? 'w-4 h-4' : 'w-4 h-4'} />
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
  advancingIds,
  readOnly = false,
  compact = false,
  nowMs,
}: {
  title: string;
  icon: ReactNode;
  count: number;
  borderClass: string;
  headerClass: string;
  badgeClass: string;
  orders: DeliveryOrder[];
  emptyLabel: string;
  onAdvance: (o: DeliveryOrder) => void;
  onSelect: (o: DeliveryOrder) => void;
  onDelete: (o: DeliveryOrder) => void;
  advancingIds: ReadonlySet<string>;
  readOnly?: boolean;
  compact?: boolean;
  nowMs: number;
}) {
  return (
    <section className={`flex flex-col min-h-0 flex-1 overflow-hidden bg-white dark:bg-gray-900 shadow-sm ${
      compact ? 'rounded-xl border' : 'rounded-2xl border-2'
    } ${borderClass} ${compact ? 'min-h-0' : 'min-h-[220px] md:min-h-0'}`}>
      <header className={`shrink-0 border-b flex items-center justify-between gap-1.5 ${
        compact ? 'px-2.5 py-1.5' : 'px-3 py-2.5'
      } ${headerClass}`}>
        <div className={`flex items-center gap-1.5 font-bold text-gray-900 dark:text-gray-100 min-w-0 ${compact ? 'text-xs' : 'text-sm'}`}>
          <span className="shrink-0">{icon}</span>
          <span className="truncate">{title}</span>
        </div>
        <span className={`shrink-0 rounded-full flex items-center justify-center font-bold ${badgeClass} ${
          compact ? 'min-w-[1.5rem] h-6 px-1.5 text-[11px]' : 'min-w-[1.75rem] h-7 px-2 text-xs'
        }`}>
          {count}
        </span>
      </header>
      <div className={`flex-1 min-h-0 overflow-y-auto touch-pan-y ${compact ? 'p-1.5 space-y-1.5' : 'p-1.5 sm:p-2 space-y-1.5'}`}>
        {orders.length === 0 ? (
          <div className={`flex flex-col items-center justify-center text-center text-gray-400 h-full min-h-[4rem] ${compact ? 'px-2' : 'py-10 px-4'}`}>
            <Package className={`mb-1 opacity-40 ${compact ? 'w-6 h-6' : 'w-8 h-8 mb-2'}`} />
            <p className={`font-medium ${compact ? 'text-xs' : 'text-xs'}`}>{emptyLabel}</p>
          </div>
        ) : (
          orders.map((order) => (
            <OrderCard
              key={order._id}
              order={order}
              onAdvance={onAdvance}
              onSelect={onSelect}
              onDelete={onDelete}
              advancing={advancingIds.has(order._id)}
              readOnly={readOnly}
              compact={compact}
              nowMs={nowMs}
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
  const chargeTotal = resolveDeliveryOrderChargeTotal(order);
  const [cashStep, setCashStep] = useState(false);
  const [cashGiven, setCashGiven] = useState('');
  const cashGivenAmount = parseDecimalPadValue(cashGiven);
  const changeAmount =
    !isNaN(cashGivenAmount) && cashGivenAmount > 0 ? cashGivenAmount - chargeTotal : null;
  const cashQuickAmounts = (() => {
    const base = [5, 10, 20, 50, 100].filter((v) => v >= chargeTotal);
    const exact = Math.ceil(chargeTotal * 100) / 100;
    return Array.from(new Set([exact, ...base])).filter((v) => v > 0).slice(0, 6);
  })();

  if (cashStep) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={loading ? undefined : onClose} />
        <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm p-5 max-h-[90vh] overflow-y-auto">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="absolute top-3 right-3 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 pr-8">Efectivo · cambio</h3>
          <p className="text-sm text-gray-500 mt-1 font-mono">#{order.orderNumber}</p>
          <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-2 tabular-nums">
            A cobrar {formatCurrency(chargeTotal)}
          </p>
          <div className="mt-4">
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
              El cliente paga con
            </label>
            <DecimalNumpadField
              value={cashGiven}
              onChange={setCashGiven}
              placeholder={chargeTotal.toFixed(2)}
              showNumpad
              compactNumpad
              inputClassName="w-full px-3 py-2.5 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-lg font-medium text-gray-900 dark:text-gray-100 outline-none focus:border-emerald-500 pr-8"
              suffix={
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium">€</span>
              }
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {cashQuickAmounts.map((amount) => {
                const label =
                  Math.abs(amount - chargeTotal) < 0.001
                    ? 'Exacto'
                    : `${amount % 1 === 0 ? amount.toFixed(0) : amount.toFixed(2)}€`;
                const selected = !isNaN(cashGivenAmount) && Math.abs(cashGivenAmount - amount) < 0.001;
                return (
                  <button
                    key={label + String(amount)}
                    type="button"
                    onClick={() => setCashGiven(amount.toFixed(2))}
                    className={`min-h-[36px] px-2.5 rounded-lg text-xs font-semibold border touch-manipulation ${
                      selected
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-white dark:bg-gray-800 border-emerald-300 dark:border-emerald-700 text-emerald-900 dark:text-emerald-200'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <div
              className={`mt-3 flex items-center justify-between rounded-xl px-3 py-2.5 ${
                changeAmount === null
                  ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 border border-amber-200 dark:border-amber-800'
                  : changeAmount >= 0
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
                    : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
              }`}
            >
              <span className="text-sm font-semibold">
                {changeAmount === null ? 'Cambio' : changeAmount >= 0 ? 'Cambio' : 'Falta'}
              </span>
              <span className="text-lg font-bold tabular-nums">
                {changeAmount === null ? '—' : formatCurrency(Math.abs(changeAmount))}
              </span>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => {
                setCashStep(false);
                setCashGiven('');
              }}
              disabled={loading}
              className="flex-1 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-700 text-sm font-semibold text-gray-700 dark:text-gray-300 disabled:opacity-50"
            >
              Atrás
            </button>
            <button
              type="button"
              onClick={() => onConfirm('efectivo')}
              disabled={loading || (changeAmount !== null && changeAmount < 0)}
              className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Confirmar
            </button>
          </div>
        </div>
      </div>
    );
  }

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
            {formatCurrency(chargeTotal)}
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
                onClick={() => setCashStep(true)}
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

function OrderDetail({
  order,
  onClose,
  onAdvance,
  onDelete,
  onCorrectPayment,
  advancing,
  correctingPayment,
  nowMs,
}: {
  order: DeliveryOrder;
  onClose: () => void;
  onAdvance: (o: DeliveryOrder) => void;
  onDelete: (o: DeliveryOrder) => void;
  onCorrectPayment?: (o: DeliveryOrder, method: DeliveryPaymentMethod) => void;
  advancing: boolean;
  correctingPayment?: boolean;
  nowMs: number;
}) {
  useModalClose(true, onClose);
  const { currentBusiness, businesses } = useBusiness();
  const compact = Boolean(readTpvTabletBinding());
  const cfg = STATUS_CONFIG[order.status];
  const nextLabel = tabletNextLabel(order);
  const displayLabel = order.deliveryType === 'recogida'
    ? (order.status === 'entregado' ? 'Entregado' : 'Recogida')
    : isTpvRepartoBoardOrder(order)
      ? 'Reparto'
      : (LANE_STATUS_LABEL[order.status] || cfg.label);
  const typeBadge = DELIVERY_TYPE_BADGE[order.deliveryType] || DELIVERY_TYPE_BADGE.domicilio;
  const StatusIcon = cfg.Icon;
  const TypeIcon = typeBadge.Icon;
  const canCorrectPayment =
    Boolean(onCorrectPayment) && isCompletedBoardOrder(order) && orderAlreadyCobrado(order);
  const currentPayment = resolveDeliveryPaymentMethod(order.paymentMethod);
  const phaseTimer = getTpvPhaseTimer(order, nowMs);

  return (
    <div className={`fixed inset-0 z-50 flex items-end sm:items-center justify-center ${compact ? 'p-0 sm:p-2' : 'p-4 sm:p-6'}`}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div className={`relative flex flex-col w-full bg-gray-50 dark:bg-gray-950 shadow-2xl border border-gray-200/80 dark:border-gray-800 overflow-hidden ${
        compact ? 'max-h-[94dvh] rounded-t-2xl sm:max-w-lg sm:rounded-2xl' : 'max-w-3xl max-h-[88dvh] rounded-2xl'
      }`}>
        <div className={`shrink-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 ${compact ? 'px-3 py-1.5' : 'px-4 py-3'}`}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              {!compact && (
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">Detalle del pedido</p>
              )}
              <div className="flex items-center gap-1 flex-wrap">
                <h2 className={`font-bold text-gray-900 dark:text-gray-100 truncate ${compact ? 'text-base' : 'text-xl'}`}>
                  #{order.orderNumber}
                </h2>
                <span className={`inline-flex items-center gap-0.5 rounded-full font-bold ${cfg.bg} ${cfg.color} ${compact ? 'px-1.5 py-px text-[10px]' : 'px-2 py-0.5 text-xs'}`}>
                  {compact ? null : <StatusIcon className="w-4 h-4" />} {displayLabel}
                </span>
                <span className={`inline-flex items-center gap-0.5 rounded-full font-bold ${typeBadge.className} ${compact ? 'px-1.5 py-px text-[10px]' : 'px-2 py-0.5 text-xs'}`}>
                  <TypeIcon className={compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} /> {typeBadge.label}
                </span>
                <OrderChannelBadge channel={order.channel} compact={compact} />
                <span className={`inline-flex items-center rounded-full font-semibold bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 ${compact ? 'px-1.5 py-px text-[10px]' : 'px-2 py-0.5 text-xs'}`}>
                  {compact ? (
                    <>
                      {phaseTimer.label}{' '}
                      <span className={`ml-0.5 tabular-nums font-bold ${timerTone(phaseTimer.minutes)}`}>
                        {formatElapsedMinutes(phaseTimer.minutes)}
                      </span>
                    </>
                  ) : (
                    <>
                      {phaseTimer.label}{' '}
                      <span className={`ml-1 tabular-nums font-bold ${timerTone(phaseTimer.minutes)}`}>
                        {formatElapsedMinutes(phaseTimer.minutes)}
                      </span>
                    </>
                  )}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className={`hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shrink-0 touch-manipulation ${compact ? 'p-1.5' : 'p-2'}`}
            >
              <X className={`text-gray-500 ${compact ? 'w-4 h-4' : 'w-5 h-5'}`} />
            </button>
          </div>
        </div>

        <div className={`flex-1 min-h-0 flex flex-col overflow-hidden ${compact ? 'gap-2 px-3 py-2' : 'gap-3 px-4 py-3'}`}>
          <div className={`shrink-0 grid ${compact ? 'grid-cols-2 gap-1.5' : 'grid-cols-1 md:grid-cols-2 gap-3'}`}>
            {order.customerName && (
              <div className={`flex items-start bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 min-w-0 ${compact ? 'gap-1.5 p-2' : 'gap-2.5 p-3 rounded-xl'}`}>
                <span className={`flex items-center justify-center rounded-md bg-cyan-50 dark:bg-cyan-950/40 shrink-0 ${compact ? 'h-7 w-7' : 'h-9 w-9 rounded-lg'}`}>
                  <User className={`text-cyan-600 dark:text-cyan-400 ${compact ? 'w-3.5 h-3.5' : 'w-5 h-5'}`} />
                </span>
                <div className="min-w-0">
                  <p className={`font-bold text-gray-900 dark:text-gray-100 truncate ${compact ? 'text-xs' : 'text-base'}`}>{order.customerName}</p>
                  {order.customerPhone && (
                    <p className={`text-gray-600 dark:text-gray-400 truncate ${compact ? 'text-[10px]' : 'text-sm mt-0.5'}`}>{order.customerPhone}</p>
                  )}
                  {order.customerAddress && (
                    <p className={`text-gray-500 leading-snug ${compact ? 'text-[10px] line-clamp-1 mt-px' : 'text-xs line-clamp-2 mt-0.5'}`}>{order.customerAddress}</p>
                  )}
                </div>
              </div>
            )}
            {order.takenByName && (
              <div className={`flex items-center bg-violet-50 dark:bg-violet-950/30 rounded-lg border border-violet-200/70 dark:border-violet-900 min-w-0 ${compact ? 'gap-1.5 px-2 py-2' : 'gap-2.5 px-3 py-3 rounded-xl'}`}>
                <span className={`rounded-full bg-violet-600 text-white font-bold flex items-center justify-center shrink-0 ${compact ? 'w-7 h-7 text-[10px]' : 'w-9 h-9 text-sm'}`}>
                  {getWorkerInitials(order.takenByName)}
                </span>
                <div className="min-w-0">
                  {!compact && (
                    <p className="text-[10px] font-bold uppercase tracking-wide text-violet-600/80 dark:text-violet-400">Pedido cogido por</p>
                  )}
                  <p className={`font-bold text-gray-900 dark:text-gray-100 truncate ${compact ? 'text-xs' : 'text-base'}`}>{order.takenByName}</p>
                </div>
              </div>
            )}
          </div>

          <div className="flex-1 min-h-0 flex flex-col gap-1 overflow-hidden">
            <h3 className={`shrink-0 font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 ${compact ? 'text-[10px]' : 'text-xs'}`}>
              Artículos · {order.items.length}
            </h3>
            <div className={`flex-1 min-h-0 overflow-y-auto touch-pan-y grid content-start grid-cols-1 ${compact ? 'gap-1.5' : 'gap-3 max-h-[min(280px,32dvh)]'} ${!compact && order.items.length > 1 ? 'sm:grid-cols-2' : ''}`}>
              {order.items.map((item) => (
                <OrderItemDetailCard
                  key={item.id}
                  item={item}
                  formatPrice={formatCurrency}
                  variant={compact ? 'compact' : 'default'}
                />
              ))}
            </div>
          </div>

          {order.notes && (
            <div className={`shrink-0 bg-amber-50 dark:bg-amber-950/30 border border-amber-300/70 dark:border-amber-800 rounded-lg ${compact ? 'px-2 py-1.5' : 'px-3 py-2 rounded-xl'}`}>
              <p className={`font-bold uppercase text-amber-700 dark:text-amber-400 ${compact ? 'text-[9px]' : 'text-[10px]'}`}>Nota</p>
              <p className={`font-semibold text-amber-900 dark:text-amber-100 leading-snug ${compact ? 'text-xs' : 'text-sm'}`}>{order.notes}</p>
            </div>
          )}

          <div className={`shrink-0 rounded-lg border border-emerald-200/80 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 ${compact ? 'p-2 space-y-1.5' : 'p-3 space-y-2 rounded-xl'}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className={`text-gray-600 dark:text-gray-400 font-medium ${compact ? 'text-[10px]' : 'text-xs'}`}>
                  {order.ticketNumber ? `Ticket ${order.ticketNumber}` : 'Total'}
                </p>
                {order.paymentMethod && (
                  <p className={`font-semibold text-emerald-800 dark:text-emerald-300 ${compact ? 'text-[10px] mt-px' : 'text-xs mt-0.5'}`}>
                    {order.paymentStatus === 'paid' ? 'Cobrado' : 'Pago previsto'} ·{' '}
                    {PAYMENT_LABELS[resolveDeliveryPaymentMethod(order.paymentMethod)]}
                  </p>
                )}
              </div>
              <p className={`font-black text-emerald-700 dark:text-emerald-400 tabular-nums leading-none shrink-0 ${compact ? 'text-lg' : 'text-3xl'}`}>
                {formatCurrency(resolveDeliveryOrderChargeTotal(order))}
              </p>
            </div>
            {currentBusiness && (
              <OrderTicketButtons
                order={order}
                business={businessTicketInfoFrom(currentBusiness)}
                salesPointName={order.salesPointName}
                cashierName={order.takenByName}
                layout={compact ? 'compact' : 'row'}
              />
            )}
          </div>

          {canCorrectPayment && (
            <div className={`shrink-0 grid grid-cols-3 ${compact ? 'gap-1' : 'gap-2'}`}>
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

        <div className={`shrink-0 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex gap-2 ${compact ? 'px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]' : 'px-4 py-3 rounded-b-2xl'}`}>
          {nextLabel && (
            <button
              type="button"
              onClick={() => onAdvance(order)}
              disabled={advancing}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold disabled:opacity-50 touch-manipulation ${
                compact ? 'px-2 py-2 text-sm' : 'px-3 py-3 rounded-xl text-base shadow-md gap-2'
              }`}
            >
              {advancing ? <Loader2 className={`animate-spin ${compact ? 'w-4 h-4' : 'w-5 h-5'}`} /> : <ArrowRight className={compact ? 'w-4 h-4' : 'w-5 h-5'} />}
              {nextLabel}
            </button>
          )}
          <button
            type="button"
            onClick={() => onDelete(order)}
            disabled={advancing}
            aria-label="Eliminar pedido"
            className={`flex items-center justify-center rounded-lg border-2 border-red-300 dark:border-red-900/60 text-red-600 dark:text-red-400 font-semibold hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50 touch-manipulation ${
              nextLabel
                ? compact ? 'px-2.5 py-2 shrink-0' : 'px-4 py-3 shrink-0 rounded-xl'
                : compact ? 'flex-1 py-2 text-sm' : 'flex-1 py-3 text-base rounded-xl'
            }`}
          >
            <Trash2 className={compact ? 'w-4 h-4' : 'w-5 h-5'} />
            {!nextLabel && !compact && 'Eliminar pedido'}
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
  const { currentBusiness, businesses, businessesFetchSettled } = useBusiness();
  const activeStoreScope = useActiveStoreScope();
  const navigate = useNavigate();
  const location = useLocation();
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState<'board' | 'new-order' | 'staff-consumption'>('board');
  const [fulfillmentFilter, setFulfillmentFilter] = useState<FulfillmentFilter>('all');
  const [search, setSearch] = useState('');
  const [advancingIds, setAdvancingIds] = useState<ReadonlySet<string>>(() => new Set());
  const advancingIdsRef = useRef<Set<string>>(new Set());
  const [correctingPaymentId, setCorrectingPaymentId] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<DeliveryOrder | null>(null);
  const [deliveryCompleteOrder, setDeliveryCompleteOrder] = useState<DeliveryOrder | null>(null);
  const [deleteOrder, setDeleteOrder] = useState<DeliveryOrder | null>(null);
  const [staffConsumptionEnabled, setStaffConsumptionEnabled] = useState(true);

  const tabletBinding = useMemo(() => readTpvTabletBinding(), []);
  const registerScope = useMemo(
    () => resolveTpvRegisterScope({
      currentBusiness,
      tabletBinding,
      authUser: user,
      pathname: location.pathname,
      businesses,
      businessesSettled: businessesFetchSettled,
    }),
    [currentBusiness, tabletBinding, user, location.pathname, businesses, businessesFetchSettled],
  );
  const userId = registerScope.effectiveDataUserId;
  const businessId = registerScope.scopeBusinessId;
  const register = useTpvRegisterIfOpen();
  const boardReady = useTpvRegisterBoardReady();
  const setStatusBarQuickActions = useTpvStatusBarQuickActions();
  const registerOpen = boardReady || Boolean(register && isTpvRegisterSessionOpen(register.session));
  const historySectionRef = useRef<HTMLDivElement | null>(null);

  const isTabletSession = registerScope.isTabletSession;
  const tabletVertical = tabletBinding?.tpvVertical ?? null;

  const tpvVerticalPending = useMemo(
    () => isTpvOpsVerticalPending({
      currentBusiness,
      businesses,
      scopeBusinessId: registerScope.scopeBusinessId,
      businessesFetchSettled,
      isTabletSession,
      tabletVertical,
    }),
    [currentBusiness, businesses, registerScope.scopeBusinessId, businessesFetchSettled, isTabletSession, tabletVertical],
  );

  useTpvOrderFlowChrome(view === 'new-order');
  useTpvSuppressBottomBar(view !== 'board');
  // CEO TPV rápido = misma UI compacta que tablet (antes !ceoMode forzaba el layout grande "antiguo").
  const isTabletUi = ceoMode || isTabletSession;
  const workerPdv = useMemo(
    () => resolvePdvIdFromStoreRef(activeStoreScope.pointsOfSale, user?.employment?.salesPointId),
    [activeStoreScope.pointsOfSale, user?.employment?.salesPointId],
  );
  const scopedPdvId = useMemo(() => {
    if (ceoMode && forcedPdvId) return String(forcedPdvId).trim() || null;
    // Solo usar PDV del binding si la sesión tablet es válida para esta cuenta.
    if (isTabletSession) {
      const fromTablet = String(tabletBinding?.pdvId || '').trim();
      if (fromTablet) return fromTablet;
    }
    const fromWorker = String(workerPdv.pdvId || '').trim();
    if (fromWorker) return fromWorker;
    return String(activeStoreScope.activeSalesPointId || '').trim() || null;
  }, [ceoMode, forcedPdvId, isTabletSession, tabletBinding?.pdvId, workerPdv.pdvId, activeStoreScope.activeSalesPointId]);
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
  /** Abierto por defecto: en tablet si va cerrado parece que “desaparecieron”. */
  const [showDelivered, setShowDelivered] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(() => isTpvBoardSoundEnabled());
  const sessionOpenedAt = register?.session?.openedAt ?? null;

  useEffect(() => {
    setTpvBoardSoundEnabled(soundEnabled);
  }, [soundEnabled]);

  useEffect(() => {
    const unlock = () => unlockTpvBoardAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  useTpvIncomingOrderSounds(orders, register?.session ?? null, soundEnabled);

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
    // Misma empresa que al crear el pedido en TPV (registerScope), NO currentBusiness
    // (puede diferir en tablet / multi-empresa y vaciar montaje-reparto).
    const filterBusinessId = String(
      resolveRetailOpsWriteBusinessId(businessId, businesses) || businessId || '',
    )
      .replace(/^business:/, '')
      .trim();
    try {
      const data = await filterDeliveryOrdersRequest(userId, {
        dateFrom: bounds.from,
        dateTo: bounds.to,
        limit: 500,
        ...(filterBusinessId ? { businessId: filterBusinessId } : {}),
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
  }, [userId, businessId, businesses, scopedPdvId, primaryPdvId, scopedPdvName, scopedPdvWorkCenterId, sessionOpenedAt]);

  useEffect(() => { void loadOrders(); }, [loadOrders]);

  useDeliveryOrdersLive({
    authUserId: user?.user_id || user?.id || null,
    businessId: resolveRetailOpsWriteBusinessId(businessId, businesses) || businessId || null,
    onRefresh: () => void loadOrders({ silent: true }),
    enabled: Boolean(userId) && Boolean(sessionOpenedAt),
    fallbackPollMs: 30_000,
  });

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
        // No vaciar el tablero antes del reload: evita el flash vacío tras crear pedido.
        setDayKey(localCalendarDayKey());
        void loadOrders({ silent: true });
      }
    };
    window.addEventListener(TPV_SESSION_SYNC_EVENT, onSessionSync);
    return () => window.removeEventListener(TPV_SESSION_SYNC_EVENT, onSessionSync);
  }, [loadOrders]);

  useEffect(() => {
    if (!userId || businesses.length === 0) return;
    prefetchTpvCatalog(userId, {
      scopeBusinessId: businessId,
      businesses,
      accountBusinessCount: businesses.length,
    });
  }, [userId, businessId, businesses]);

  useEffect(() => {
    if (!userId) {
      setStaffConsumptionEnabled(true);
      return;
    }
    getDeliveryConfigRequest(userId)
      .then((cfg) => {
        setStaffConsumptionEnabled(normalizeStaffConsumptionConfig(cfg.staffConsumption).enabled);
      })
      .catch(() => {
        // Si falla la config, no ocultar consumo: por defecto va activo.
        setStaffConsumptionEnabled(true);
      });
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

  const beginAdvancing = useCallback((orderId: string): boolean => {
    if (advancingIdsRef.current.has(orderId)) return false;
    advancingIdsRef.current.add(orderId);
    setAdvancingIds(new Set(advancingIdsRef.current));
    return true;
  }, []);

  const endAdvancing = useCallback((orderId: string) => {
    if (!advancingIdsRef.current.has(orderId)) return;
    advancingIdsRef.current.delete(orderId);
    setAdvancingIds(new Set(advancingIdsRef.current));
  }, []);

  const advanceOrder = useCallback(async (order: DeliveryOrder, paymentMethod?: DeliveryPaymentMethod) => {
    const next = tabletNextStatus(order);
    if (!next || !userId) return;

    let resolvedPayment = paymentMethod;
    if (next === 'entregado' && !resolvedPayment) {
      if (shouldAskPaymentOnDelivery(order)) {
        setDeliveryCompleteOrder(order);
        return;
      }
      resolvedPayment = resolveDeliveryPaymentMethod(order.paymentMethod);
    }

    if (!beginAdvancing(order._id)) return;
    try {
      const now = new Date().toISOString();
      const extras: Partial<DeliveryOrder> = {};
      if (next === 'en_reparto') {
        extras.assemblyCompletedAt = now;
        extras.departedAt = now;
        if (!order.assemblyStartedAt) extras.assemblyStartedAt = now;
        if (!order.kitchenCompletedAt) extras.kitchenCompletedAt = now;
      }
      if (next === 'entregado') {
        extras.deliveredAt = now;
        // Recogida: cierra montaje y entrega en un solo paso (sin columna repartidor).
        if (order.deliveryType === 'recogida' || !order.assemblyCompletedAt) {
          extras.assemblyCompletedAt = order.assemblyCompletedAt || now;
          if (!order.assemblyStartedAt) extras.assemblyStartedAt = now;
          if (!order.kitchenCompletedAt) extras.kitchenCompletedAt = now;
        }
        if (order.deliveryType === 'recogida' && !order.departedAt) {
          extras.departedAt = now;
        }
        if (resolvedPayment && !orderAlreadyCobrado(order)) {
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
            notes:
              next === 'entregado' && order.deliveryType === 'recogida'
                ? `Recogida en tienda · ${resolvedPayment ? PAYMENT_LABELS[resolvedPayment] : 'entregado'}`
                : next === 'entregado' && resolvedPayment
                  ? `Entregado · ${PAYMENT_LABELS[resolvedPayment]}`
                  : undefined,
          },
        ],
      };

      // Calle 1: ticket cliente al pasar a repartidor (no await). Calle 2: guardar estado.
      const ticketBusiness =
        currentBusiness
        || businesses.find((b) => {
          const id = String(b.business_id || '').replace(/^business:/, '').trim();
          return id && id === String(businessId || '').replace(/^business:/, '').trim();
        })
        || null;
      if (next === 'en_reparto' && shouldPrintCustomerTicketOnDispatch(order)) {
        if (ticketBusiness) {
          void printDeliveryTicket({
            order: payload,
            business: businessTicketInfoFrom(ticketBusiness),
            salesPointName: payload.salesPointName,
            cashierName: user?.fullName,
            variant: 'customer',
            accountEmail: user?.email,
          });
        } else {
          toast.error('No se pudo imprimir el ticket de cliente: falta empresa activa');
        }
      }
      if (
        next === 'entregado'
        && ticketBusiness
        && (payload.paymentStatus === 'paid' || orderAlreadyCobrado(payload))
      ) {
        void printDeliveryTicket({
          order: payload,
          business: businessTicketInfoFrom(ticketBusiness),
          salesPointName: payload.salesPointName,
          cashierName: user?.fullName,
          variant: 'customer',
          accountEmail: user?.email,
        });
      }

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
          const filterBusinessId = String(
            resolveRetailOpsWriteBusinessId(businessId, businesses) || businessId || '',
          )
            .replace(/^business:/, '')
            .trim();
          const data = await filterDeliveryOrdersRequest(userId, {
            dateFrom: bounds.from,
            dateTo: bounds.to,
            limit: 500,
            ...(filterBusinessId ? { businessId: filterBusinessId } : {}),
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
      } else {
        if (selectedOrder?._id === updated._id) setSelectedOrder(updated);
        const label = LANE_STATUS_LABEL[next] || STATUS_CONFIG[next].label;
        toast.success(`Pedido #${order.orderNumber} → ${label}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al avanzar pedido');
    } finally {
      endAdvancing(order._id);
    }
  }, [
    userId,
    selectedOrder,
    user?.fullName,
    user?.user_id,
    user?.id,
    user?.email,
    currentBusiness,
    sessionOpenedAt,
    beginAdvancing,
    endAdvancing,
    businessId,
    businesses,
  ]);

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
    if (!beginAdvancing(deleteOrder._id)) return;
    try {
      const { order: updated, cajaRegistration } = await cancelDeliveryOrderRequest(
        userId,
        deleteOrder._id,
        reason,
      );
      setOrders(prev => prev.map(o => o._id === updated._id ? updated : o));
      setDeleteOrder(null);
      if (selectedOrder?._id === updated._id) setSelectedOrder(null);
      if (deliveryCompleteOrder?._id === updated._id) setDeliveryCompleteOrder(null);
      if (cajaRegistration?.status === 'registered') {
        toast.success(`Pedido #${deleteOrder.orderNumber} eliminado · restado de caja`);
      } else {
        toast.success(`Pedido #${deleteOrder.orderNumber} eliminado`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al eliminar el pedido');
    } finally {
      endAdvancing(deleteOrder._id);
    }
  }, [userId, deleteOrder, selectedOrder, deliveryCompleteOrder, beginAdvancing, endAdvancing]);

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

  const openOrderHistory = useCallback(() => {
    setShowDelivered(true);
    window.requestAnimationFrame(() => {
      historySectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }, []);

  const openSession = register?.session ?? null;

  const stats = useMemo(() => {
    const montaje = orders.filter(
      (o) => isTpvMontajeBoardOrder(o) && orderOnOpenTpvOpsBoard(o, openSession),
    );
    const enReparto = orders.filter(
      (o) => isTpvRepartoBoardOrder(o) && orderOnOpenTpvOpsBoard(o, openSession),
    );
    const completados = orders.filter((o) => {
      if (!orderInRegisterSession(o, openSession)) return false;
      return isHistoryCompletedBoardOrder(o);
    });
    return {
      montaje: montaje.length,
      delivery: enReparto.length,
      delivered: completados.length,
    };
  }, [orders, openSession]);

  const scopedActive = useMemo(
    () => orders.filter((o) => orderOnOpenTpvOpsBoard(o, openSession)),
    [orders, openSession],
  );

  const assemblyOrders = useMemo(
    () => scopedActive
      .filter((o) => isTpvMontajeBoardOrder(o))
      .filter((o) => matchesFulfillmentFilter(o, fulfillmentFilter))
      .filter((o) => matchesSearch(o, search))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [scopedActive, fulfillmentFilter, search],
  );

  const deliveryOrders = useMemo(
    () => scopedActive
      .filter((o) => isTpvRepartoBoardOrder(o))
      .filter((o) => matchesFulfillmentFilter(o, fulfillmentFilter))
      .filter((o) => matchesSearch(o, search))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [scopedActive, fulfillmentFilter, search],
  );

  const completedShiftOrders = useMemo(
    () => orders
      .filter((o) => {
        if (!orderInRegisterSession(o, openSession)) return false;
        return isHistoryCompletedBoardOrder(o);
      })
      .sort((a, b) => new Date(b.deliveredAt || b.cancelledAt || b.createdAt).getTime() - new Date(a.deliveredAt || a.cancelledAt || a.createdAt).getTime())
      .slice(0, 50),
    [orders, openSession],
  );

  const completedTodayOrders = useMemo(
    () => completedShiftOrders
      .filter((o) => matchesFulfillmentFilter(o, fulfillmentFilter))
      .filter((o) => matchesSearch(o, search)),
    [completedShiftOrders, fulfillmentFilter, search],
  );

  useEffect(() => {
    if (view !== 'board') return;
    window.scrollTo(0, 0);
  }, [view, boardReady, scopedPdvId]);

  const filterCounts = useMemo(() => ({
    all: scopedActive.length,
    recogida: scopedActive.filter((o) => o.deliveryType === 'recogida').length,
    domicilio: scopedActive.filter((o) => o.deliveryType === 'domicilio').length,
  }), [scopedActive]);

  const visibleCount = assemblyOrders.length + deliveryOrders.length;

  useEffect(() => {
    if (!setStatusBarQuickActions) return;
    if (view !== 'board' || !registerOpen) {
      setStatusBarQuickActions(null);
      return;
    }
    const actions = [
      ...(staffConsumptionEnabled
        ? [{
            id: 'consumo',
            label: 'Consumo del trabajador',
            title: 'Registrar comida o bebida del equipo',
            tone: 'amber' as const,
            icon: <UtensilsCrossed />,
            onClick: () => setView('staff-consumption'),
          }]
        : []),
      {
        id: 'sound',
        label: soundEnabled ? 'Avisos de pedidos ON' : 'Avisos de pedidos OFF',
        title: soundEnabled
          ? 'Silenciar avisos de Glovo, web y apps'
          : 'Activar avisos cuando entre un pedido nuevo',
        active: soundEnabled,
        icon: soundEnabled ? <Volume2 /> : <VolumeX />,
        onClick: () => setSoundEnabled((v) => !v),
      },
      {
        id: 'refresh',
        label: 'Actualizar pedidos',
        title: 'Recargar la lista de montaje y reparto',
        icon: <RefreshCw className={refreshing ? 'animate-spin' : ''} />,
        onClick: () => void loadOrders(),
      },
      {
        id: 'history',
        label: 'Historial de pedidos',
        title: `Completados del turno (${stats.delivered})`,
        active: showDelivered,
        icon: <History />,
        onClick: openOrderHistory,
      },
      ...(ceoMode && onChangeStore
        ? [{
            id: 'store',
            label: 'Cambiar tienda',
            title: 'Elegir otro punto de venta',
            icon: <Store />,
            onClick: onChangeStore,
          }]
        : []),
      ...(tabletBinding && !ceoMode
        ? [{
            id: 'exit',
            label: 'Cerrar tablet',
            title: 'Salir del TPV y volver al código de tienda',
            icon: <Tablet />,
            onClick: exitTabletTpv,
          }]
        : []),
    ];
    setStatusBarQuickActions(actions);
    return () => setStatusBarQuickActions(null);
  }, [
    setStatusBarQuickActions,
    view,
    registerOpen,
    staffConsumptionEnabled,
    soundEnabled,
    refreshing,
    showDelivered,
    stats.delivered,
    openOrderHistory,
    loadOrders,
    ceoMode,
    onChangeStore,
    tabletBinding,
    exitTabletTpv,
  ]);

  if (tpvVerticalPending) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-8 min-h-[40vh] text-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        <p className="text-sm text-gray-600 dark:text-gray-400">Preparando TPV…</p>
      </div>
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

  if (view === 'new-order') {
    return (
      <TpvRapidoOrderFlow
        tabletMode
        onBack={backToBoard}
      />
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Toolbar */}
      <div className={`shrink-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 ${isTabletUi ? 'px-2 py-1.5' : 'px-4 py-3'}`}>
        {isTabletUi ? (
          <>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setView('new-order')}
                title="Nuevo pedido"
                className="flex items-center justify-center gap-1 min-h-[40px] min-w-[5.5rem] px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm shadow-emerald-900/20 transition-colors touch-manipulation shrink-0"
              >
                <Plus className="w-4 h-4" strokeWidth={2.5} />
                Nuevo
              </button>
              {staffConsumptionEnabled && (
                <button
                  type="button"
                  onClick={() => setView('staff-consumption')}
                  title="Consumo equipo"
                  className="flex items-center justify-center gap-1 min-h-[40px] min-w-[5.5rem] px-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs shadow-sm shadow-amber-900/15 transition-colors touch-manipulation shrink-0"
                >
                  <UtensilsCrossed className="w-4 h-4" />
                  Consumo
                </button>
              )}
              <div className="flex flex-1 min-w-0 rounded-xl bg-gray-100 dark:bg-gray-800 p-0.5 gap-0.5">
                {FULFILLMENT_FILTERS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFulfillmentFilter(f.id)}
                    className={`flex-1 flex items-center justify-center gap-0.5 min-h-[36px] px-1 rounded-lg font-semibold text-[11px] transition-all touch-manipulation ${
                      fulfillmentFilter === f.id
                        ? f.id === 'recogida'
                          ? 'bg-violet-600 text-white shadow-sm'
                          : f.id === 'domicilio'
                            ? 'bg-sky-600 text-white shadow-sm'
                            : 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 shadow-sm'
                        : 'text-gray-600 dark:text-gray-400'
                    }`}
                  >
                    <span className="truncate">{f.label}</span>
                    <span className={`min-w-[1.1rem] h-4 px-0.5 rounded-full text-[9px] font-bold flex items-center justify-center ${
                      fulfillmentFilter === f.id ? 'bg-white/20' : 'bg-gray-300/80 dark:bg-gray-600 text-gray-700 dark:text-gray-200'
                    }`}>
                      {filterCounts[f.id]}
                    </span>
                  </button>
                ))}
              </div>
              {ceoMode && onChangeStore && (
                <button
                  type="button"
                  onClick={onChangeStore}
                  className="flex flex-col items-center justify-center gap-0.5 min-h-[44px] min-w-[3.25rem] px-1.5 rounded-xl border border-indigo-200 dark:border-indigo-800 text-indigo-700 touch-manipulation shrink-0"
                  title="Cambiar tienda"
                  aria-label="Cambiar tienda"
                >
                  <Store className="w-4 h-4" />
                  <span className="text-[9px] font-bold leading-none">Tienda</span>
                </button>
              )}
              {tabletBinding && !ceoMode && (
                <button
                  type="button"
                  onClick={exitTabletTpv}
                  className="flex flex-col items-center justify-center gap-0.5 min-h-[44px] min-w-[3.25rem] px-1.5 rounded-xl border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 touch-manipulation shrink-0"
                  title="Salir del TPV"
                  aria-label="Salir del TPV"
                >
                  <DoorOpen className="w-4 h-4" />
                  <span className="text-[9px] font-bold leading-none">Salir</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setSoundEnabled((v) => !v)}
                className={`flex flex-col items-center justify-center gap-0.5 min-h-[44px] min-w-[3.25rem] px-1.5 rounded-xl touch-manipulation shrink-0 hover:bg-gray-100 dark:hover:bg-gray-800 ${
                  soundEnabled ? 'text-indigo-600' : 'text-gray-400'
                }`}
                title={soundEnabled ? 'Silenciar avisos de pedidos (Glovo, web…)' : 'Activar avisos de pedidos nuevos'}
                aria-label={soundEnabled ? 'Silenciar avisos' : 'Activar avisos'}
              >
                {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                <span className="text-[9px] font-bold leading-none">{soundEnabled ? 'Avisos' : 'Silencio'}</span>
              </button>
              <button
                type="button"
                onClick={() => void loadOrders()}
                className="flex flex-col items-center justify-center gap-0.5 min-h-[44px] min-w-[3.25rem] px-1.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 touch-manipulation shrink-0"
                title="Actualizar pedidos"
                aria-label="Actualizar pedidos"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                <span className="text-[9px] font-bold leading-none">Actua.</span>
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-3 justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl flex items-center justify-center shrink-0">
                  <Package className="w-5 h-5 text-indigo-600" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100 truncate">
                    {ceoMode ? (scopedPdvName || 'Pedidos activos') : 'Pedidos activos'}
                  </h1>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {ceoMode ? 'TPV operativo · ' : ''}Montaje y reparto · {visibleCount} visibles
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {ceoMode && onChangeStore && (
                  <button type="button" onClick={onChangeStore} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-indigo-200 dark:border-indigo-800 text-indigo-700 bg-indigo-50 dark:bg-indigo-950/40" title="Cambiar tienda">
                    <Store className="w-4 h-4" />
                    Cambiar tienda
                  </button>
                )}
                {tabletBinding && !ceoMode && (
                  <button type="button" onClick={exitTabletTpv} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300" title="Salir del TPV">
                    <DoorOpen className="w-4 h-4" />
                    Salir
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSoundEnabled((v) => !v)}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border hover:bg-gray-50 dark:hover:bg-gray-800 ${
                    soundEnabled
                      ? 'border-indigo-200 dark:border-indigo-800 text-indigo-700 bg-indigo-50 dark:bg-indigo-950/40'
                      : 'border-gray-200 dark:border-gray-700 text-gray-500'
                  }`}
                  title={soundEnabled ? 'Silenciar avisos de pedidos externos' : 'Activar avisos (web, Glovo…)'}
                  aria-label={soundEnabled ? 'Silenciar avisos' : 'Activar avisos'}
                >
                  {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                  {soundEnabled ? 'Avisos ON' : 'Avisos OFF'}
                </button>
                <button
                  type="button"
                  onClick={() => void loadOrders()}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                  title="Actualizar lista de pedidos"
                  aria-label="Actualizar pedidos"
                >
                  <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                  Actualizar
                </button>
              </div>
            </div>

            <div className={`grid gap-2 mb-3 ${staffConsumptionEnabled ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
              <button
                type="button"
                onClick={() => setView('new-order')}
                className="w-full flex items-center justify-center gap-2.5 min-h-[48px] py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm sm:text-base shadow-lg shadow-emerald-900/25"
              >
                <Plus className="w-5 h-5" strokeWidth={2.5} />
                Nuevo pedido
              </button>
              {staffConsumptionEnabled && (
                <button
                  type="button"
                  onClick={() => setView('staff-consumption')}
                  className="w-full flex items-center justify-center gap-2 min-h-[48px] py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-sm sm:text-base shadow-lg shadow-amber-900/20"
                >
                  <UtensilsCrossed className="w-5 h-5" strokeWidth={2.5} />
                  Consumo equipo
                </button>
              )}
            </div>

            <div className="flex rounded-xl bg-gray-100 dark:bg-gray-800 p-1 gap-1.5">
              {FULFILLMENT_FILTERS.map((f) => {
                const FilterIcon = f.Icon;
                return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFulfillmentFilter(f.id)}
                  className={`flex-1 flex items-center justify-center gap-1.5 min-h-[44px] py-2 px-2 text-xs rounded-lg font-semibold transition-all touch-manipulation ${
                    fulfillmentFilter === f.id
                      ? f.id === 'recogida'
                        ? 'bg-violet-600 text-white shadow-sm'
                        : f.id === 'domicilio'
                          ? 'bg-sky-600 text-white shadow-sm'
                          : 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-white/60 dark:hover:bg-gray-700/60'
                  }`}
                >
                  <FilterIcon className="w-4 h-4" />
                  {f.label}
                  <span className={`min-w-[1.25rem] h-5 px-1 rounded-full text-[10px] font-bold flex items-center justify-center ${
                    fulfillmentFilter === f.id ? 'bg-white/20' : 'bg-gray-300/80 dark:bg-gray-600 text-gray-700 dark:text-gray-200'
                  }`}>
                    {filterCounts[f.id]}
                  </span>
                </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Búsqueda (solo escritorio; tablet va en toolbar) */}
      {!isTabletUi && (
        <div className="shrink-0 bg-gray-50 dark:bg-gray-950 border-b border-gray-200 dark:border-gray-700 px-4 py-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar nº pedido, cliente..."
              className="w-full pl-9 pr-7 py-2.5 min-h-[44px] text-sm rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 placeholder:text-gray-400 focus:ring-1 focus:ring-indigo-500 outline-none"
            />
            {search && (
              <button type="button" onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2">
                <X className="w-4 h-4 text-gray-400" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Columnas Montaje | Reparto */}
      <div className={`flex-1 min-h-0 overflow-hidden ${isTabletUi ? 'p-2' : 'p-3 sm:p-4'}`}>
        {initialLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
          </div>
        ) : (
          <div className={`flex h-full min-h-0 ${isTabletUi ? 'flex-row gap-2' : 'flex-col md:flex-row gap-3'}`}>
            <OrderLane
              title="Montaje"
              icon={<Package className={isTabletUi ? 'w-3.5 h-3.5 text-indigo-600' : 'w-4 h-4 text-indigo-600'} />}
              count={assemblyOrders.length}
              borderClass="border-indigo-200 dark:border-indigo-800"
              headerClass="bg-indigo-50/80 dark:bg-indigo-950/40 border-indigo-100 dark:border-indigo-900"
              badgeClass="bg-indigo-600 text-white"
              orders={assemblyOrders}
              emptyLabel="Nada en montaje"
              onAdvance={advanceOrder}
              onSelect={setSelectedOrder}
              onDelete={requestDeleteOrder}
              advancingIds={advancingIds}
              compact={isTabletUi}
              nowMs={nowMs}
            />
            <OrderLane
              title="Reparto"
              icon={<Truck className={isTabletUi ? 'w-3.5 h-3.5 text-cyan-600' : 'w-4 h-4 text-cyan-600'} />}
              count={deliveryOrders.length}
              borderClass="border-cyan-200 dark:border-cyan-800"
              headerClass="bg-cyan-50/80 dark:bg-cyan-950/40 border-cyan-100 dark:border-cyan-900"
              badgeClass="bg-cyan-600 text-white"
              orders={deliveryOrders}
              emptyLabel="Nada en reparto"
              onAdvance={advanceOrder}
              onSelect={setSelectedOrder}
              onDelete={requestDeleteOrder}
              advancingIds={advancingIds}
              compact={isTabletUi}
              nowMs={nowMs}
            />
          </div>
        )}
      </div>

      {/* Resumen + completados colapsables */}
      <div className={`shrink-0 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 ${isTabletUi ? 'px-2 py-1.5' : 'px-3 py-2.5 pb-3'}`}>
        {!isTabletUi && (
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2 px-1">
            Resumen del turno
          </p>
        )}
        <div className={`grid grid-cols-3 ${isTabletUi ? 'gap-1.5' : 'gap-1.5 sm:gap-2'}`}>
          <div className={`rounded-xl border text-center text-indigo-700 bg-indigo-50 border-indigo-200 dark:bg-indigo-950/30 dark:border-indigo-900 dark:text-indigo-300 ${isTabletUi ? 'px-1 py-1.5' : 'px-1.5 py-2'}`}>
            <p className={`font-bold leading-none tabular-nums ${isTabletUi ? 'text-base' : 'text-lg sm:text-xl'}`}>{stats.montaje}</p>
            <p className={`font-semibold uppercase tracking-wide opacity-80 ${isTabletUi ? 'text-[9px] mt-0.5' : 'text-[9px] sm:text-[10px] mt-1'}`}>Montaje</p>
          </div>
          <div className={`rounded-xl border text-center text-cyan-700 bg-cyan-50 border-cyan-200 dark:bg-cyan-950/30 dark:border-cyan-900 dark:text-cyan-300 ${isTabletUi ? 'px-1 py-1.5' : 'px-1.5 py-2'}`}>
            <p className={`font-bold leading-none tabular-nums ${isTabletUi ? 'text-base' : 'text-lg sm:text-xl'}`}>{stats.delivery}</p>
            <p className={`font-semibold uppercase tracking-wide opacity-80 ${isTabletUi ? 'text-[9px] mt-0.5' : 'text-[9px] sm:text-[10px] mt-1'}`}>Reparto</p>
          </div>
          <button
            type="button"
            onClick={() => setShowDelivered((v) => !v)}
            className={`rounded-xl border text-center touch-manipulation transition-colors ${
              showDelivered
                ? 'text-emerald-900 bg-emerald-100 border-emerald-400 dark:bg-emerald-950/50 dark:border-emerald-600 dark:text-emerald-100'
                : 'text-emerald-800 bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900 dark:text-emerald-300'
            } ${isTabletUi ? 'px-1 py-1.5' : 'px-1.5 py-2'}`}
            aria-expanded={showDelivered}
            title="Ver pedidos completados del turno"
          >
            <p className={`font-bold leading-none tabular-nums ${isTabletUi ? 'text-base' : 'text-lg sm:text-xl'}`}>{stats.delivered}</p>
            <p className={`font-semibold uppercase tracking-wide opacity-80 flex items-center justify-center gap-0.5 ${isTabletUi ? 'text-[9px] mt-0.5' : 'text-[9px] sm:text-[10px] mt-1'}`}>
              Completados
              {showDelivered ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </p>
          </button>
        </div>

        {/* Siempre visible: si solo va en casilla colapsada parece que “desapareció”. */}
        <div ref={historySectionRef}>
        <button
          type="button"
          onClick={() => setShowDelivered((v) => !v)}
          className={`w-full flex items-center justify-between gap-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-left touch-manipulation ${
            isTabletUi ? 'mt-1.5 px-2.5 py-2 min-h-[44px]' : 'mt-2.5 px-3 py-2'
          }`}
          aria-expanded={showDelivered}
        >
          <div className="flex items-center gap-2 min-w-0">
            <CheckCircle2 className={`text-emerald-600 shrink-0 ${isTabletUi ? 'w-5 h-5' : 'w-4 h-4'}`} />
            <span className={`font-bold text-emerald-800 dark:text-emerald-300 truncate ${isTabletUi ? 'text-sm' : 'text-xs sm:text-sm'}`}>
              Completados del turno ({completedShiftOrders.length})
            </span>
          </div>
          {showDelivered ? (
            <ChevronUp className="w-4 h-4 text-emerald-700 shrink-0" />
          ) : (
            <ChevronDown className="w-4 h-4 text-emerald-700 shrink-0" />
          )}
        </button>

        {showDelivered && completedShiftOrders.length > 0 && (
          <div className={`mt-1.5 overflow-y-auto space-y-1 rounded-xl border border-emerald-100 dark:border-emerald-900 bg-emerald-50/30 dark:bg-emerald-950/10 ${isTabletUi ? 'max-h-[26vh] p-1.5' : 'max-h-44 p-2'}`}>
            {completedShiftOrders.map((order) => {
              const deleted = isCancelledDeliveryOrder(order);
              const statusCfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.nuevo;
              const dimmed =
                completedTodayOrders.every((o) => o._id !== order._id)
                && (fulfillmentFilter !== 'all' || search.trim().length > 0);
              return (
                <button
                  key={order._id}
                  type="button"
                  onClick={() => setSelectedOrder(order)}
                  className={`w-full flex items-center justify-between gap-2 rounded-lg text-left touch-manipulation ${
                    deleted
                      ? 'bg-gray-100/90 dark:bg-gray-800/80 opacity-80'
                      : dimmed
                        ? 'bg-white/70 dark:bg-gray-800/70 opacity-60'
                        : 'bg-white dark:bg-gray-900 hover:bg-emerald-50/80 dark:hover:bg-gray-800'
                  } ${isTabletUi ? 'py-1.5 px-2' : 'px-3 py-2'}`}
                >
                  <div className="min-w-0 flex items-center gap-1.5">
                    <OrderChannelBadge channel={order.channel} compact={isTabletUi} />
                    <div className="min-w-0">
                    <p className={`font-bold font-mono ${deleted ? 'text-gray-500 line-through' : 'text-gray-900 dark:text-gray-100'} ${isTabletUi ? 'text-[11px]' : 'text-xs'}`}>
                      #{order.orderNumber}
                    </p>
                    <p className={`text-gray-500 truncate ${isTabletUi ? 'text-[10px]' : 'text-[11px]'}`}>
                      {order.customerName || 'Cliente'}
                      {' · '}
                      {new Date(order.createdAt || '').toLocaleTimeString('es-ES', { timeStyle: 'short' })}
                    </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`font-bold tabular-nums ${deleted ? 'text-gray-500' : ''} ${isTabletUi ? 'text-[11px]' : 'text-xs'}`}>
                      {formatCurrency(resolveDeliveryOrderChargeTotal(order))}
                    </p>
                    <p className={`font-semibold ${deleted ? 'text-red-600 dark:text-red-400' : statusCfg.color} ${isTabletUi ? 'text-[9px]' : 'text-[10px]'}`}>
                      {deleted ? 'Eliminado' : statusCfg.label}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
        </div>
      </div>

      {/* Order detail modal */}
      {selectedOrder && (
        <OrderDetail
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onAdvance={advanceOrder}
          onDelete={requestDeleteOrder}
          onCorrectPayment={handleCorrectPayment}
          advancing={advancingIds.has(selectedOrder._id)}
          correctingPayment={correctingPaymentId === selectedOrder._id}
          nowMs={nowMs}
        />
      )}

      {/* Cobro al entregar */}
      {deliveryCompleteOrder && (
        <DeliverPaymentModal
          order={deliveryCompleteOrder}
          onConfirm={confirmCompleteDelivery}
          onClose={() => setDeliveryCompleteOrder(null)}
          loading={advancingIds.has(deliveryCompleteOrder._id)}
        />
      )}

      {/* Eliminar con motivo obligatorio */}
      {deleteOrder && (
        <CancelOrderModal
          order={deleteOrder}
          mode="delete"
          onConfirm={handleDeleteOrder}
          onClose={() => setDeleteOrder(null)}
          loading={advancingIds.has(deleteOrder._id)}
        />
      )}
    </div>
  );
}
