import { useState } from 'react';
import {
  X, Phone, MapPin, User, Clock, ChefHat, Package, Truck,
  CheckCircle2, AlertTriangle, CreditCard, History, Edit3,
  ExternalLink, Banknote, ArrowRight, Printer, RotateCcw,
} from 'lucide-react';
import type { DeliveryOrder, DeliveryOrderStatus } from '../../lib/deliveryApi';

const STATUS_CONFIG: Record<DeliveryOrderStatus, { label: string; color: string; icon: typeof Clock }> = {
  nuevo:      { label: 'Nuevo',      color: 'bg-amber-100 text-amber-700 border-amber-200',   icon: Clock },
  cocina:     { label: 'Cocina',     color: 'bg-orange-100 text-orange-700 border-orange-200', icon: ChefHat },
  listo:      { label: 'Montaje',    color: 'bg-indigo-100 text-indigo-700 border-indigo-200', icon: Package },
  en_reparto: { label: 'En reparto', color: 'bg-cyan-100 text-cyan-700 border-cyan-200',       icon: Truck },
  entregado:  { label: 'Entregado',  color: 'bg-green-100 text-green-700 border-green-200',   icon: CheckCircle2 },
  devuelto:   { label: 'Devuelto',   color: 'bg-amber-100 text-amber-800 border-amber-200', icon: RotateCcw },
  cancelled:  { label: 'Cancelado',  color: 'bg-gray-100 text-gray-500 border-gray-200',      icon: X },
  incident:   { label: 'Incidencia', color: 'bg-red-100 text-red-700 border-red-200',         icon: AlertTriangle },
};

const CHANNEL_CONFIG: Record<string, { label: string; color: string }> = {
  direct:   { label: 'Directo',   color: 'bg-gray-100 text-gray-600' },
  phone:    { label: 'Teléfono',  color: 'bg-blue-100 text-blue-600' },
  web:      { label: 'Web',       color: 'bg-purple-100 text-purple-600' },
  app:      { label: 'App',       color: 'bg-teal-100 text-teal-600' },
  tpv:      { label: 'TPV',       color: 'bg-slate-100 text-slate-600' },
  glovo:    { label: 'Glovo',     color: 'bg-yellow-100 text-yellow-700' },
  justeat:  { label: 'Just Eat',  color: 'bg-orange-100 text-orange-700' },
  ubereats: { label: 'Uber Eats', color: 'bg-green-100 text-green-700' },
};

const PAYMENT_LABELS: Record<string, string> = {
  efectivo: 'Efectivo', tarjeta: 'Tarjeta', bizum: 'Bizum',
  online: 'Online', plataforma: 'Plataforma', '': 'Sin definir',
};

// Debe coincidir con NEXT_STATUS en DeliveryOrders.tsx: cocina → montaje → reparto → entregado.
const NEXT_STATUS: Partial<Record<DeliveryOrderStatus, DeliveryOrderStatus>> = {
  nuevo: 'cocina', cocina: 'listo', listo: 'en_reparto', en_reparto: 'entregado',
};
const NEXT_LABEL: Partial<Record<DeliveryOrderStatus, string>> = {
  nuevo: 'Enviar a Cocina',
  cocina: 'Marcar Listo (Montaje)',
  listo: 'Salida del repartidor',
  en_reparto: 'Marcar Entregado',
};

function timeSince(dateStr: string): string {
  if (!dateStr) return '—';
  const ms = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m`;
  return `${Math.floor(hours / 24)}d`;
}

function formatDate(dateStr: string) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
}

interface Props {
  order: DeliveryOrder;
  onClose: () => void;
  onAdvanceStatus: (order: DeliveryOrder) => void;
  onCancel: (order: DeliveryOrder) => void;
  onReopen: (order: DeliveryOrder) => void;
  onRegisterPayment: (order: DeliveryOrder) => void;
  onRefund?: (order: DeliveryOrder) => void;
  onPrintTicket?: (order: DeliveryOrder, isRefund?: boolean) => void;
  canCancel: boolean;
  canReopen: boolean;
  canRefund?: boolean;
  canOperate: boolean;
  canPayment: boolean;
}

export function OrderDetailDrawer({
  order, onClose, onAdvanceStatus, onCancel, onReopen, onRegisterPayment,
  onRefund, onPrintTicket, canCancel, canReopen, canRefund, canOperate, canPayment,
}: Props) {
  const statusCfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.nuevo;
  const channelCfg = CHANNEL_CONFIG[order.channel] || CHANNEL_CONFIG.direct;
  const StatusIcon = statusCfg.icon;
  const nextStatus = NEXT_STATUS[order.status];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white dark:bg-gray-900 shadow-2xl overflow-y-auto animate-in slide-in-from-right">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <span className="text-lg font-bold text-gray-900 dark:text-gray-100">#{order.orderNumber}</span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${channelCfg.color}`}>{channelCfg.label}</span>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors">
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>
          <div className="flex items-center gap-3">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${statusCfg.color}`}>
              <StatusIcon className="w-3.5 h-3.5" /> {statusCfg.label}
            </span>
            <span className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" /> {timeSince(order.createdAt)}
            </span>
            {order.deliveryType && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 capitalize">
                {order.deliveryType}
              </span>
            )}
          </div>
        </div>

        <div className="p-5 space-y-6">
          {/* Cliente */}
          <section>
            <h4 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">Cliente</h4>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <User className="w-4 h-4 text-gray-400" />
                <span className="font-medium text-gray-900 dark:text-gray-100">{order.customerName || '—'}</span>
                {order.clientId && (
                  <a href={`/saas/crm/clientes/${order.clientId}`} className="text-blue-600 hover:text-blue-700">
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
              {order.customerPhone && (
                <a href={`tel:${order.customerPhone}`} className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700">
                  <Phone className="w-4 h-4" /> {order.customerPhone}
                </a>
              )}
              {order.deliveryType === 'domicilio' && (
                <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <MapPin className="w-4 h-4 text-gray-400" /> {order.customerAddress || <span className="text-red-500 font-medium">Sin dirección</span>}
                </div>
              )}
            </div>
          </section>

          {/* Productos */}
          <section>
            <h4 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">Productos</h4>
            {order.items.length === 0 ? (
              <p className="text-sm text-gray-400">Sin productos</p>
            ) : (
              <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 space-y-2">
                {order.items.map((item, i) => (
                  <div key={item.id || i} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 bg-gray-200 dark:bg-gray-700 rounded-lg flex items-center justify-center text-xs font-bold text-gray-600 dark:text-gray-300">{item.quantity}</span>
                      <span className="text-gray-900 dark:text-gray-100">{item.name}</span>
                    </div>
                    <span className="font-semibold text-gray-900 dark:text-gray-100">{item.total.toFixed(2)}€</span>
                  </div>
                ))}
                <div className="border-t border-gray-200 dark:border-gray-700 pt-2 flex items-center justify-between font-bold text-gray-900 dark:text-gray-100">
                  <span>Total</span>
                  <span>{order.totalAmount.toFixed(2)}€</span>
                </div>
              </div>
            )}
          </section>

          {/* Observaciones */}
          {(order.observations || order.notes) && (
            <section>
              <h4 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">Observaciones</h4>
              {order.observations && <p className="text-sm text-gray-700 dark:text-gray-300 bg-amber-50 dark:bg-amber-900/20 p-3 rounded-xl">{order.observations}</p>}
              {order.notes && <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 italic">{order.notes}</p>}
            </section>
          )}

          {/* Info operativa */}
          <section>
            <h4 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">Información operativa</h4>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-gray-400">PDV</span><p className="font-medium text-gray-900 dark:text-gray-100">{order.salesPointName || '—'}</p></div>
              <div><span className="text-gray-400">Hora entrada</span><p className="font-medium text-gray-900 dark:text-gray-100">{formatDate(order.createdAt)}</p></div>
              <div><span className="text-gray-400">Conductor</span><p className="font-medium text-gray-900 dark:text-gray-100">{order.assignedDriver || '—'}</p></div>
              <div><span className="text-gray-400">Entrega estimada</span><p className="font-medium text-gray-900 dark:text-gray-100">{formatDate(order.estimatedDelivery)}</p></div>
            </div>
          </section>

          {/* Pago */}
          <section>
            <h4 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">Pago</h4>
            <div className="flex items-center gap-3">
              <CreditCard className="w-5 h-5 text-gray-400" />
              <div className="text-sm">
                <span className="font-medium text-gray-900 dark:text-gray-100">{PAYMENT_LABELS[order.paymentMethod] || order.paymentMethod || 'Sin definir'}</span>
                <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-semibold ${
                  order.paymentStatus === 'paid' ? 'bg-green-100 text-green-700' :
                  order.paymentStatus === 'partial' ? 'bg-amber-100 text-amber-700' :
                  'bg-red-100 text-red-700'
                }`}>
                  {order.paymentStatus === 'paid' ? 'Cobrado' : order.paymentStatus === 'partial' ? 'Parcial' : 'Pendiente'}
                </span>
              </div>
              {order.paidAmount > 0 && (
                <span className="ml-auto text-sm font-semibold text-gray-900 dark:text-gray-100">{order.paidAmount.toFixed(2)}€ / {order.totalAmount.toFixed(2)}€</span>
              )}
            </div>
            {order.ticketNumber && (
              <p className="text-xs text-gray-500 mt-2 font-mono">Ticket: {order.ticketNumber}</p>
            )}
          </section>

          {order.status === 'devuelto' && order.refundReason && (
            <section className="bg-amber-50 dark:bg-amber-900/20 p-4 rounded-xl">
              <h4 className="text-xs font-bold text-amber-700 uppercase tracking-wider mb-2">Devolución</h4>
              <p className="text-sm text-amber-800 dark:text-amber-300">{order.refundReason}</p>
              <p className="text-xs text-amber-600 mt-1">
                {Number(order.refundAmount || 0).toFixed(2)}€ · Por {order.refundedBy} — {formatDate(order.refundedAt || '')}
              </p>
            </section>
          )}

          {/* Cancelación */}
          {order.status === 'cancelled' && order.cancelReason && (
            <section className="bg-red-50 dark:bg-red-900/20 p-4 rounded-xl">
              <h4 className="text-xs font-bold text-red-600 uppercase tracking-wider mb-2">Motivo de cancelación</h4>
              <p className="text-sm text-red-700 dark:text-red-400">{order.cancelReason}</p>
              <p className="text-xs text-red-500 mt-1">Por {order.cancelledBy} — {formatDate(order.cancelledAt)}</p>
            </section>
          )}

          {/* Historial */}
          <section>
            <h4 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <History className="w-4 h-4" /> Historial
            </h4>
            {order.stageHistory.length === 0 ? (
              <p className="text-sm text-gray-400">Sin historial</p>
            ) : (
              <div className="relative pl-6 space-y-3">
                <div className="absolute left-2.5 top-1 bottom-1 w-px bg-gray-200 dark:bg-gray-700" />
                {[...order.stageHistory].reverse().map((event, i) => {
                  const cfg = STATUS_CONFIG[event.status as DeliveryOrderStatus] || STATUS_CONFIG.nuevo;
                  return (
                    <div key={i} className="relative">
                      <div className={`absolute -left-[14px] top-1 w-3 h-3 rounded-full border-2 ${cfg.color}`} />
                      <div className="text-sm">
                        <span className="font-medium text-gray-900 dark:text-gray-100">{cfg.label}</span>
                        <span className="text-gray-400 ml-2">{formatDate(event.date)}</span>
                        <span className="text-gray-400 ml-1">· {event.user}</span>
                        {event.notes && <p className="text-gray-500 dark:text-gray-400 text-xs mt-0.5">{event.notes}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* Actions */}
        <div className="sticky bottom-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 p-4 flex flex-wrap gap-2">
          {canOperate && nextStatus && (
            <button onClick={() => onAdvanceStatus(order)}
              className="flex-1 py-2.5 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-xl font-semibold text-sm hover:opacity-90 transition-opacity flex items-center justify-center gap-2">
              <ArrowRight className="w-4 h-4" /> {NEXT_LABEL[order.status]}
            </button>
          )}
          {canPayment && order.paymentStatus !== 'paid' && !['cancelled', 'devuelto'].includes(order.status) && (
            <button onClick={() => onRegisterPayment(order)}
              className="py-2.5 px-4 bg-emerald-600 text-white rounded-xl font-semibold text-sm hover:bg-emerald-700 transition-colors flex items-center gap-2">
              <Banknote className="w-4 h-4" /> Cobrar
            </button>
          )}
          {onPrintTicket && order.paymentStatus === 'paid' && order.status !== 'devuelto' && (
            <button onClick={() => onPrintTicket(order)}
              className="py-2.5 px-4 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex items-center gap-2">
              <Printer className="w-4 h-4" /> Ticket
            </button>
          )}
          {canRefund && order.status === 'entregado' && order.paymentStatus === 'paid' && onRefund && (
            <button onClick={() => onRefund(order)}
              className="py-2.5 px-4 bg-amber-600 text-white rounded-xl font-semibold text-sm hover:bg-amber-700 transition-colors flex items-center gap-2">
              <RotateCcw className="w-4 h-4" /> Devolver
            </button>
          )}
          {onPrintTicket && order.status === 'devuelto' && (
            <button onClick={() => onPrintTicket(order, true)}
              className="py-2.5 px-4 border-2 border-amber-200 text-amber-700 rounded-xl text-sm font-medium hover:bg-amber-50 transition-colors flex items-center gap-2">
              <Printer className="w-4 h-4" /> Ticket devolución
            </button>
          )}
          {canCancel && !['cancelled', 'entregado', 'devuelto'].includes(order.status) && (
            <button onClick={() => onCancel(order)}
              className="py-2.5 px-4 border-2 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-xl text-sm font-medium transition-colors">
              Cancelar
            </button>
          )}
          {canReopen && ['cancelled', 'entregado'].includes(order.status) && order.status !== 'devuelto' && (
            <button onClick={() => onReopen(order)}
              className="py-2.5 px-4 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 transition-colors flex items-center gap-2">
              <Edit3 className="w-4 h-4" /> Reabrir
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
