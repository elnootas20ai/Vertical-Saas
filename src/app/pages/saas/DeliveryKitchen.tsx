import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { useModalClose } from '../../hooks/useModalClose';
import {
  listDeliveryOrdersRequest,
  updateDeliveryOrderRequest,
  listPointsOfSaleRequest,
  type DeliveryOrder,
  type DeliveryOrderStatus,
  type DeliveryOrderItem,
  type PointOfSale,
} from '../../lib/deliveryApi';
import {
  ChefHat,
  Package,
  Truck,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ArrowRight,
  Phone,
  MapPin,
  User,
  Timer,
  Search,
  X,
  Loader2,
  RefreshCw,
  AlertCircle,
  Eye,
  Ban,
  Flame,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Volume2,
  VolumeX,
  Filter,
  LayoutGrid,
  List,
  Wifi,
  WifiOff,
  Bell,
} from 'lucide-react';

// ─── Status config adapted to new Spanish statuses ───────────────────────────

const STATUS_CONFIG: Record<DeliveryOrderStatus, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  nuevo:     { label: 'Nuevo',      color: 'text-amber-700',   bg: 'bg-amber-50 border-amber-200',   icon: <Clock className="w-4 h-4" /> },
  cocina:    { label: 'En cocina',  color: 'text-orange-700',  bg: 'bg-orange-50 border-orange-200', icon: <ChefHat className="w-4 h-4" /> },
  listo:     { label: 'Listo',      color: 'text-green-700',   bg: 'bg-green-50 border-green-200',   icon: <CheckCircle2 className="w-4 h-4" /> },
  entregado: { label: 'Entregado',  color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', icon: <Truck className="w-4 h-4" /> },
  cancelled: { label: 'Cancelado',  color: 'text-gray-500',    bg: 'bg-gray-50 border-gray-200',     icon: <X className="w-4 h-4" /> },
  incident:  { label: 'Incidencia', color: 'text-red-700',     bg: 'bg-red-50 border-red-200',       icon: <AlertTriangle className="w-4 h-4" /> },
};

const KITCHEN_STATUSES: DeliveryOrderStatus[] = ['nuevo', 'cocina'];
const READY_STATUS: DeliveryOrderStatus = 'listo';

const NEXT_ACTION: Partial<Record<DeliveryOrderStatus, { next: DeliveryOrderStatus; label: string; color: string }>> = {
  nuevo:  { next: 'cocina', label: 'A Cocina',    color: 'bg-orange-600 hover:bg-orange-700' },
  cocina: { next: 'listo',  label: '✓ Listo',     color: 'bg-green-600 hover:bg-green-700' },
};

const DELIVERY_TYPE_LABELS: Record<string, { label: string; icon: React.ReactNode }> = {
  domicilio: { label: 'Domicilio', icon: <Truck className="w-3 h-3" /> },
  recogida:  { label: 'Recogida',  icon: <Package className="w-3 h-3" /> },
  sala:      { label: 'Sala',      icon: <MapPin className="w-3 h-3" /> },
};

const CHANNEL_LABELS: Record<string, string> = {
  direct: 'Directo', phone: 'Teléfono', web: 'Web', app: 'App', tpv: 'TPV',
  glovo: 'Glovo', justeat: 'Just Eat', ubereats: 'Uber Eats',
};

const ALLERGEN_ICONS: Record<string, string> = {
  gluten: '🌾', lacteos: '🥛', huevos: '🥚', 'frutos secos': '🥜',
  pescado: '🐟', marisco: '🦐', soja: '🫘', apio: '🥬',
  mostaza: '🟡', sesamo: '⚪', sulfitos: '🍷', moluscos: '🐚',
};

const INCIDENT_TYPES = [
  { value: 'falta_ingrediente', label: 'Falta ingrediente' },
  { value: 'error_preparacion', label: 'Error en preparación' },
  { value: 'cambio_solicitado', label: 'Cambio solicitado' },
  { value: 'producto_agotado', label: 'Producto agotado' },
  { value: 'equipo_averiado', label: 'Equipo averiado' },
  { value: 'otro', label: 'Otro' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function elapsedMinutes(dateStr: string): number {
  if (!dateStr) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000));
}

function formatElapsed(mins: number): string {
  if (mins < 1) return 'Ahora';
  if (mins < 60) return `${mins}min`;
  const h = Math.floor(mins / 60);
  return `${h}h ${mins % 60}m`;
}

function timerColor(mins: number): string {
  if (mins < 10) return 'text-green-600';
  if (mins < 20) return 'text-amber-600';
  return 'text-red-600';
}

function sortByUrgency(orders: DeliveryOrder[]): DeliveryOrder[] {
  return [...orders].sort((a, b) => {
    const aUrgent = a.priority === 'urgent' || a.priority === 'high' ? 0 : 1;
    const bUrgent = b.priority === 'urgent' || b.priority === 'high' ? 0 : 1;
    if (aUrgent !== bUrgent) return aUrgent - bUrgent;
    const aPrio = a.kitchenPriority ?? 99;
    const bPrio = b.kitchenPriority ?? 99;
    if (aPrio !== bPrio) return aPrio - bPrio;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
}

// ─── KitchenOrderCard ────────────────────────────────────────────────────────

function KitchenOrderCard({
  order,
  onAction,
  onSelect,
  onMarkOutOfStock,
  acting,
}: {
  order: DeliveryOrder;
  onAction: (o: DeliveryOrder, nextStatus: DeliveryOrderStatus) => void;
  onSelect: (o: DeliveryOrder) => void;
  onMarkOutOfStock: (o: DeliveryOrder, item: DeliveryOrderItem) => void;
  acting: boolean;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(iv);
  }, []);

  const cfg = STATUS_CONFIG[order.status];
  const action = NEXT_ACTION[order.status];
  const isUrgent = order.priority === 'urgent' || order.priority === 'high';
  const refDate = order.kitchenStartedAt || order.createdAt;
  const mins = Math.max(0, Math.floor((now - new Date(refDate).getTime()) / 60000));
  const isOvertime = mins > 20;
  const dtInfo = DELIVERY_TYPE_LABELS[order.deliveryType] || DELIVERY_TYPE_LABELS.domicilio;

  const categorized = useMemo(() => {
    const groups: Record<string, DeliveryOrderItem[]> = {};
    for (const item of order.items) {
      const cat = item.category || 'General';
      (groups[cat] ||= []).push(item);
    }
    return Object.entries(groups);
  }, [order.items]);

  return (
    <div
      className={`rounded-2xl border-2 p-3.5 transition-all hover:shadow-lg cursor-pointer ${cfg.bg} ${
        isUrgent ? 'border-l-4 !border-l-red-500' : ''
      } ${isOvertime ? 'ring-2 ring-red-300' : ''}`}
      onClick={() => onSelect(order)}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-lg font-bold text-gray-900 dark:text-gray-100">
            #{order.orderNumber}
          </span>
          {isUrgent && (
            <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-red-100 text-red-700 text-[10px] font-bold rounded-full animate-pulse">
              <Flame className="w-3 h-3" /> URGENTE
            </span>
          )}
          <span className="flex items-center gap-1 px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-[10px] font-medium rounded-full">
            {dtInfo.icon} {dtInfo.label}
          </span>
          {order.channel && CHANNEL_LABELS[order.channel] && (
            <span className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-600 rounded text-[10px] font-medium">
              {CHANNEL_LABELS[order.channel]}
            </span>
          )}
        </div>
        <div className={`flex items-center gap-1 text-base font-bold tabular-nums ${timerColor(mins)}`}>
          <Timer className="w-4 h-4" />
          {formatElapsed(mins)}
        </div>
      </div>

      {/* Taken by */}
      {order.takenByName && (
        <div className="flex items-center gap-1.5 mb-2 text-xs text-gray-500">
          <User className="w-3 h-3" />
          <span>{order.takenByName}</span>
        </div>
      )}

      {/* Products grouped by category */}
      <div className="mb-2 space-y-1.5">
        {categorized.map(([cat, items]) => (
          <div key={cat}>
            {categorized.length > 1 && (
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">{cat}</p>
            )}
            {items.map((item) => (
              <div key={item.id} className={`flex items-start justify-between gap-2 ${item.outOfStock ? 'opacity-50 line-through' : ''}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {item.quantity}x
                    </span>
                    <span className="text-sm text-gray-800 dark:text-gray-200 truncate">{item.name}</span>
                    {item.allergens && item.allergens.length > 0 && (
                      <span className="flex gap-0.5 shrink-0">
                        {item.allergens.map((a) => (
                          <span key={a} title={a} className="text-xs">{ALLERGEN_ICONS[a.toLowerCase()] || '⚠️'}</span>
                        ))}
                      </span>
                    )}
                    {item.outOfStock && (
                      <span className="px-1 py-0.5 bg-red-100 text-red-700 text-[9px] font-bold rounded">AGOTADO</span>
                    )}
                  </div>
                  {item.extras && item.extras.length > 0 && (
                    <p className="text-xs text-indigo-600 dark:text-indigo-400 ml-6">
                      + {item.extras.join(', ')}
                    </p>
                  )}
                  {item.notes && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 ml-6 italic">{item.notes}</p>
                  )}
                </div>
                {!item.outOfStock && item.catalogItemId && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onMarkOutOfStock(order, item); }}
                    className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100 shrink-0"
                    title="Marcar agotado"
                  >
                    <Ban className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Notes */}
      {(order.observations || order.notes) && (
        <div className="flex items-start gap-1.5 mb-2 p-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <MessageSquare className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-800 dark:text-amber-300 line-clamp-2">
            {order.observations || order.notes}
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-2 border-t border-gray-200/60 dark:border-gray-600/30">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span>{order.items.reduce((s, i) => s + i.quantity, 0)} uds</span>
          {order.salesPointName && (
            <>
              <span className="text-gray-300">·</span>
              <span className="truncate max-w-[100px]">{order.salesPointName}</span>
            </>
          )}
        </div>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onSelect(order); }}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-white/60 dark:hover:bg-gray-700/40 transition-colors"
            title="Ver detalle"
          >
            <Eye className="w-4 h-4" />
          </button>
          {action && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onAction(order, action.next); }}
              disabled={acting}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-white text-xs font-semibold transition-all disabled:opacity-50 shadow-sm ${action.color}`}
            >
              {acting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
              {action.label}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── KanbanColumn ────────────────────────────────────────────────────────────

function KanbanColumn({
  title,
  icon,
  color,
  count,
  orders,
  onAction,
  onSelect,
  onMarkOutOfStock,
  actingId,
}: {
  title: string;
  icon: React.ReactNode;
  color: string;
  count: number;
  orders: DeliveryOrder[];
  onAction: (o: DeliveryOrder, next: DeliveryOrderStatus) => void;
  onSelect: (o: DeliveryOrder) => void;
  onMarkOutOfStock: (o: DeliveryOrder, item: DeliveryOrderItem) => void;
  actingId: string | null;
}) {
  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className={`flex items-center gap-2 px-4 py-3 rounded-t-2xl ${color}`}>
        {icon}
        <h2 className="text-sm font-bold">{title}</h2>
        <span className="ml-auto flex items-center justify-center w-7 h-7 rounded-full bg-white/80 dark:bg-gray-800/80 text-sm font-bold text-gray-900 dark:text-gray-100">
          {count}
        </span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3 bg-gray-50/50 dark:bg-gray-900/50 rounded-b-2xl border border-t-0 border-gray-200 dark:border-gray-700">
        {orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-300 dark:text-gray-600">
            <CheckCircle2 className="w-8 h-8 mb-2" />
            <p className="text-xs font-medium">Sin pedidos</p>
          </div>
        ) : (
          orders.map((order) => (
            <div key={order._id} className="group">
              <KitchenOrderCard
                order={order}
                onAction={onAction}
                onSelect={onSelect}
                onMarkOutOfStock={onMarkOutOfStock}
                acting={actingId === order._id}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── IncidentModal ───────────────────────────────────────────────────────────

function IncidentModal({
  order,
  onClose,
  onSubmit,
  submitting,
}: {
  order: DeliveryOrder;
  onClose: () => void;
  onSubmit: (type: string, notes: string, itemId?: string) => void;
  submitting: boolean;
}) {
  useModalClose(true, onClose);
  const [type, setType] = useState('falta_ingrediente');
  const [notes, setNotes] = useState('');
  const [itemId, setItemId] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-md w-full">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
            Registrar Incidencia — #{order.orderNumber}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tipo de incidencia</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none"
            >
              {INCIDENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Producto afectado (opcional)</label>
            <select
              value={itemId}
              onChange={(e) => setItemId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none"
            >
              <option value="">— Ninguno —</option>
              {order.items.map((item) => (
                <option key={item.id} value={item.id}>{item.quantity}x {item.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Descripción *</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none resize-none"
              placeholder="Describe la incidencia..."
            />
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => onSubmit(type, notes, itemId || undefined)}
              disabled={!notes.trim() || submitting}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-all disabled:opacity-50 shadow-sm"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />}
              Registrar incidencia
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── OrderDetailModal ────────────────────────────────────────────────────────

function OrderDetailModal({
  order,
  onClose,
  onAction,
  onIncident,
  onMarkOutOfStock,
  acting,
}: {
  order: DeliveryOrder;
  onClose: () => void;
  onAction: (o: DeliveryOrder, next: DeliveryOrderStatus) => void;
  onIncident: (o: DeliveryOrder) => void;
  onMarkOutOfStock: (o: DeliveryOrder, item: DeliveryOrderItem) => void;
  acting: boolean;
}) {
  useModalClose(true, onClose);
  const cfg = STATUS_CONFIG[order.status];
  const action = NEXT_ACTION[order.status];
  const mins = elapsedMinutes(order.kitchenStartedAt || order.createdAt);
  const dtInfo = DELIVERY_TYPE_LABELS[order.deliveryType] || DELIVERY_TYPE_LABELS.domicilio;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-5 py-4 flex items-center justify-between rounded-t-2xl z-10">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
              Pedido #{order.orderNumber}
            </h2>
            <div className="flex items-center gap-2 mt-1">
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${cfg.bg} ${cfg.color}`}>
                {cfg.icon} {cfg.label}
              </span>
              <span className="flex items-center gap-1 px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded-full text-xs font-medium text-gray-600 dark:text-gray-300">
                {dtInfo.icon} {dtInfo.label}
              </span>
              <span className={`text-sm font-bold tabular-nums ${timerColor(mins)}`}>
                {formatElapsed(mins)}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Customer info */}
          {order.customerName && (
            <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
              <User className="w-5 h-5 text-gray-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{order.customerName}</p>
                {order.customerPhone && (
                  <a href={`tel:${order.customerPhone}`} className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
                    <Phone className="w-3 h-3" /> {order.customerPhone}
                  </a>
                )}
                {order.customerAddress && (
                  <p className="flex items-center gap-1 text-xs text-gray-500 mt-0.5">
                    <MapPin className="w-3 h-3" /> {order.customerAddress}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Taken by */}
          {order.takenByName && (
            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <ChefHat className="w-4 h-4" />
              <span>Tomado por <strong>{order.takenByName}</strong></span>
              {order.takenAt && <span className="text-xs text-gray-400">({new Date(order.takenAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })})</span>}
            </div>
          )}

          {/* Products */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Productos</h3>
            <div className="space-y-2">
              {order.items.map((item) => (
                <div key={item.id} className={`p-2.5 bg-gray-50 dark:bg-gray-800 rounded-xl ${item.outOfStock ? 'opacity-50' : ''}`}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-sm font-semibold text-gray-900 dark:text-gray-100 ${item.outOfStock ? 'line-through' : ''}`}>
                          {item.quantity}x {item.name}
                        </span>
                        {item.category && (
                          <span className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-600 rounded text-[10px] font-medium text-gray-500">{item.category}</span>
                        )}
                        {item.allergens && item.allergens.length > 0 && (
                          <span className="flex gap-0.5">
                            {item.allergens.map((a) => (
                              <span key={a} title={a} className="text-sm">{ALLERGEN_ICONS[a.toLowerCase()] || '⚠️'}</span>
                            ))}
                          </span>
                        )}
                        {item.outOfStock && (
                          <span className="px-1.5 py-0.5 bg-red-100 text-red-700 text-[10px] font-bold rounded">AGOTADO</span>
                        )}
                      </div>
                      {item.extras && item.extras.length > 0 && (
                        <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-0.5">+ {item.extras.join(', ')}</p>
                      )}
                      {item.ingredients && item.ingredients.length > 0 && (
                        <div className="mt-1">
                          <p className="text-[10px] font-bold uppercase text-gray-400">Ingredientes</p>
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {item.ingredients.map((ing) => (
                              <span key={ing.name} className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-[10px] text-gray-600 dark:text-gray-400">
                                {ing.name}{ing.quantity ? ` (${ing.quantity})` : ''}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {item.notes && (
                        <p className="text-xs text-amber-600 dark:text-amber-400 italic mt-0.5">{item.notes}</p>
                      )}
                    </div>
                    {!item.outOfStock && item.catalogItemId && (
                      <button
                        type="button"
                        onClick={() => onMarkOutOfStock(order, item)}
                        className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors shrink-0 ml-2"
                        title="Marcar agotado"
                      >
                        <Ban className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Observations */}
          {(order.observations || order.notes) && (
            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
              <div className="flex items-center gap-1.5 mb-1">
                <MessageSquare className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">Observaciones</span>
              </div>
              <p className="text-sm text-amber-800 dark:text-amber-300">{order.observations || order.notes}</p>
            </div>
          )}

          {/* Kitchen notes */}
          {order.kitchenNotes && (
            <div className="p-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-xl">
              <div className="flex items-center gap-1.5 mb-1">
                <ChefHat className="w-3.5 h-3.5 text-orange-500" />
                <span className="text-xs font-semibold text-orange-700 dark:text-orange-400">Notas de cocina</span>
              </div>
              <p className="text-sm text-orange-800 dark:text-orange-300">{order.kitchenNotes}</p>
            </div>
          )}

          {/* Stage history timeline */}
          {order.stageHistory.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Historial</h3>
              <div className="space-y-2 pl-3 border-l-2 border-gray-200 dark:border-gray-700">
                {order.stageHistory.map((event, idx) => {
                  const evCfg = STATUS_CONFIG[event.status as DeliveryOrderStatus];
                  return (
                    <div key={idx} className="relative pl-4">
                      <div className={`absolute -left-[9px] top-1 w-4 h-4 rounded-full border-2 border-white dark:border-gray-900 ${evCfg?.bg || 'bg-gray-100'}`} />
                      <p className="text-xs font-medium text-gray-900 dark:text-gray-100">
                        {evCfg?.label || event.status}
                      </p>
                      <p className="text-[10px] text-gray-500">
                        {new Date(event.date).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}
                        {event.notes && ` — ${event.notes}`}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            {order.status === 'cocina' && (
              <button
                type="button"
                onClick={() => onIncident(order)}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border-2 border-red-300 text-red-700 text-sm font-semibold hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                <AlertTriangle className="w-4 h-4" />
                Incidencia
              </button>
            )}
            {action && (
              <button
                type="button"
                onClick={() => onAction(order, action.next)}
                disabled={acting}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-white font-semibold transition-all disabled:opacity-50 shadow-lg ${action.color}`}
              >
                {acting ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowRight className="w-5 h-5" />}
                {action.label}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

type ViewMode = 'kanban' | 'list';
type MobileTab = 'cola' | 'cocina' | 'listos';

export function DeliveryKitchen() {
  const { user } = useAuth();
  const userId = user?.user_id || user?.id || '';

  // Data state
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [pointsOfSale, setPointsOfSale] = useState<PointOfSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);

  // UI state
  const [search, setSearch] = useState('');
  const [filterPdv, setFilterPdv] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('kanban');
  const [mobileTab, setMobileTab] = useState<MobileTab>('cola');
  const [selectedOrder, setSelectedOrder] = useState<DeliveryOrder | null>(null);
  const [incidentOrder, setIncidentOrder] = useState<DeliveryOrder | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem('kds_sound') !== 'off');
  const [submitting, setSubmitting] = useState(false);

  // Refs
  const prevOrderCountRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Sound toggle
  useEffect(() => {
    localStorage.setItem('kds_sound', soundEnabled ? 'on' : 'off');
  }, [soundEnabled]);

  // Load data
  const loadOrders = useCallback(async () => {
    if (!userId) return;
    try {
      const data = await listDeliveryOrdersRequest(userId);
      setOrders(data);
      if (prevOrderCountRef.current > 0) {
        const activeNew = data.filter((o) => o.status === 'nuevo').length;
        const activePrev = prevOrderCountRef.current;
        if (activeNew > activePrev && soundEnabled) {
          try {
            const ctx = new AudioContext();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = 880;
            osc.type = 'sine';
            gain.gain.value = 0.3;
            osc.start();
            osc.stop(ctx.currentTime + 0.15);
          } catch {}
        }
      }
      prevOrderCountRef.current = data.filter((o) => o.status === 'nuevo').length;
    } catch {
      toast.error('Error al cargar pedidos');
    } finally {
      setLoading(false);
    }
  }, [userId, soundEnabled]);

  const loadPdv = useCallback(async () => {
    if (!userId) return;
    try {
      const data = await listPointsOfSaleRequest(userId);
      setPointsOfSale(data.filter((p) => p.active));
    } catch {}
  }, [userId]);

  useEffect(() => { loadOrders(); loadPdv(); }, [loadOrders, loadPdv]);

  useEffect(() => {
    if (!userId) return;
    const interval = setInterval(loadOrders, 15000);
    const handleVisibility = () => {
      if (!document.hidden) loadOrders();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [userId, loadOrders]);

  // Actions
  const advanceOrder = useCallback(async (order: DeliveryOrder, nextStatus: DeliveryOrderStatus) => {
    if (!userId) return;
    setActingId(order._id);
    try {
      const payload: Partial<DeliveryOrder> & { _id: string; _rev?: string } = {
        ...order,
        status: nextStatus,
      };
      if (nextStatus === 'cocina' && !order.takenBy) {
        payload.takenBy = userId;
        payload.takenByName = user?.name || user?.email || '';
        payload.takenAt = new Date().toISOString();
      }
      const updated = await updateDeliveryOrderRequest(userId, payload as DeliveryOrder);
      setOrders((prev) => prev.map((o) => (o._id === updated._id ? updated : o)));
      if (selectedOrder?._id === updated._id) setSelectedOrder(updated);
      const label = STATUS_CONFIG[nextStatus]?.label || nextStatus;
      toast.success(`Pedido #${order.orderNumber} → ${label}`);
    } catch {
      toast.error('Error al actualizar pedido');
    } finally {
      setActingId(null);
    }
  }, [userId, user, selectedOrder]);

  const submitIncident = useCallback(async (type: string, notes: string, _itemId?: string) => {
    if (!incidentOrder || !userId) return;
    setSubmitting(true);
    try {
      const updated = await updateDeliveryOrderRequest(userId, {
        ...incidentOrder,
        status: 'incident' as DeliveryOrderStatus,
        incidentType: type,
        incidentNotes: notes,
      });
      setOrders((prev) => prev.map((o) => (o._id === updated._id ? updated : o)));
      toast.success(`Incidencia registrada — #${incidentOrder.orderNumber}`);
      setIncidentOrder(null);
    } catch {
      toast.error('Error al registrar incidencia');
    } finally {
      setSubmitting(false);
    }
  }, [incidentOrder, userId]);

  const markOutOfStock = useCallback(async (order: DeliveryOrder, item: DeliveryOrderItem) => {
    if (!userId || !item.catalogItemId) return;
    const confirmed = window.confirm(`¿Marcar "${item.name}" como agotado?\nSe reflejará en todos los pedidos abiertos.`);
    if (!confirmed) return;
    setActingId(order._id);
    try {
      const updatedItems = order.items.map((i) =>
        i.catalogItemId === item.catalogItemId
          ? { ...i, outOfStock: true, outOfStockAt: new Date().toISOString() }
          : i,
      );
      const updated = await updateDeliveryOrderRequest(userId, { ...order, items: updatedItems });
      setOrders((prev) =>
        prev.map((o) => {
          if (o._id === updated._id) return updated;
          const hasItem = o.items.some((i) => i.catalogItemId === item.catalogItemId && !i.outOfStock);
          if (hasItem) {
            return {
              ...o,
              items: o.items.map((i) =>
                i.catalogItemId === item.catalogItemId
                  ? { ...i, outOfStock: true, outOfStockAt: new Date().toISOString() }
                  : i,
              ),
            };
          }
          return o;
        }),
      );
      toast.success(`"${item.name}" marcado como agotado`);
    } catch {
      toast.error('Error al marcar producto agotado');
    } finally {
      setActingId(null);
    }
  }, [userId]);

  // Filtered + sorted orders
  const activeOrders = useMemo(() => {
    let list = orders.filter((o) => !['entregado', 'cancelled'].includes(o.status));
    if (filterPdv) list = list.filter((o) => o.salesPointId === filterPdv);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((o) =>
        o.orderNumber.toLowerCase().includes(q) ||
        o.customerName?.toLowerCase().includes(q) ||
        o.items.some((i) => i.name.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [orders, filterPdv, search]);

  const colQueue = useMemo(() => sortByUrgency(activeOrders.filter((o) => o.status === 'nuevo')), [activeOrders]);
  const colKitchen = useMemo(() => sortByUrgency(activeOrders.filter((o) => o.status === 'cocina')), [activeOrders]);
  const colReady = useMemo(() => {
    const thirtyMinAgo = Date.now() - 30 * 60000;
    return activeOrders
      .filter((o) => o.status === 'listo' && new Date(o.kitchenCompletedAt || o.updatedAt).getTime() > thirtyMinAgo)
      .sort((a, b) => new Date(b.kitchenCompletedAt || b.updatedAt).getTime() - new Date(a.kitchenCompletedAt || a.updatedAt).getTime());
  }, [activeOrders]);
  const colIncidents = useMemo(() => activeOrders.filter((o) => o.status === 'incident'), [activeOrders]);

  // KPI metrics
  const stats = useMemo(() => {
    const kitchenOrders = orders.filter((o) => o.kitchenStartedAt && o.kitchenCompletedAt);
    const avgKitchen = kitchenOrders.length > 0
      ? Math.round(kitchenOrders.reduce((s, o) => s + (new Date(o.kitchenCompletedAt).getTime() - new Date(o.kitchenStartedAt).getTime()) / 60000, 0) / kitchenOrders.length)
      : 0;
    const todayIncidents = orders.filter((o) => {
      if (o.status !== 'incident') return false;
      const d = new Date(o.updatedAt);
      const today = new Date();
      return d.toDateString() === today.toDateString();
    }).length;
    return {
      queue: colQueue.length,
      kitchen: colKitchen.length,
      ready: colReady.length,
      incidents: colIncidents.length + todayIncidents,
      avgKitchen,
    };
  }, [orders, colQueue, colKitchen, colReady, colIncidents]);

  // Alerts
  const alerts = useMemo(() => {
    const list: { type: 'warning' | 'danger'; text: string }[] = [];
    if (stats.queue >= 10) list.push({ type: 'danger', text: `Cola alta: ${stats.queue} pedidos pendientes` });
    else if (stats.queue >= 5) list.push({ type: 'warning', text: `Cola creciendo: ${stats.queue} pedidos pendientes` });
    const overtime = colKitchen.filter((o) => elapsedMinutes(o.kitchenStartedAt || o.createdAt) > 20);
    for (const o of overtime.slice(0, 3)) {
      list.push({ type: 'danger', text: `#${o.orderNumber} fuera de tiempo (${formatElapsed(elapsedMinutes(o.kitchenStartedAt || o.createdAt))})` });
    }
    if (colIncidents.length > 0) {
      list.push({ type: 'danger', text: `${colIncidents.length} pedido(s) con incidencia` });
    }
    return list;
  }, [stats, colKitchen, colIncidents]);

  // Mobile tab content
  const mobileOrders = useMemo(() => {
    if (mobileTab === 'cola') return colQueue;
    if (mobileTab === 'cocina') return colKitchen;
    return colReady;
  }, [mobileTab, colQueue, colKitchen, colReady]);

  return (
    <Layout title="Cocina / KDS" noPadding>
      <div className="flex flex-col h-[calc(100vh-64px)] min-h-0">
        {/* ── Alert bar ──────────────────────────────────────────────────── */}
        {alerts.length > 0 && (
          <div className="shrink-0 bg-red-50 dark:bg-red-900/30 border-b border-red-200 dark:border-red-800 px-4 py-2">
            <div className="flex items-center gap-3 overflow-x-auto">
              <Bell className="w-4 h-4 text-red-500 shrink-0 animate-pulse" />
              {alerts.map((a, i) => (
                <span key={i} className={`text-xs font-semibold whitespace-nowrap ${a.type === 'danger' ? 'text-red-700 dark:text-red-400' : 'text-amber-700 dark:text-amber-400'}`}>
                  {a.text}
                  {i < alerts.length - 1 && <span className="mx-2 text-red-300">|</span>}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ── KPI bar ────────────────────────────────────────────────────── */}
        <div className="shrink-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
          <div className="grid grid-cols-5 gap-2 mb-3">
            {[
              { label: 'En Cola', value: stats.queue, bg: 'bg-amber-50 text-amber-700 border-amber-200' },
              { label: 'En Cocina', value: stats.kitchen, bg: 'bg-orange-50 text-orange-700 border-orange-200' },
              { label: 'Listos', value: stats.ready, bg: 'bg-green-50 text-green-700 border-green-200' },
              { label: 'T. Medio', value: stats.avgKitchen ? `${stats.avgKitchen}m` : '—', bg: 'bg-blue-50 text-blue-700 border-blue-200' },
              { label: 'Incidencias', value: stats.incidents, bg: stats.incidents > 0 ? 'bg-red-50 text-red-700 border-red-200' : 'bg-gray-50 text-gray-500 border-gray-200' },
            ].map((s) => (
              <div key={s.label} className={`rounded-xl border p-2 text-center ${s.bg}`}>
                <p className="text-2xl font-bold tabular-nums">{s.value}</p>
                <p className="text-[10px] font-semibold uppercase tracking-wider">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Filters row */}
          <div className="flex items-center gap-2 flex-wrap">
            {pointsOfSale.length > 1 && (
              <select
                value={filterPdv}
                onChange={(e) => setFilterPdv(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-xs font-medium focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
              >
                <option value="">Todas las sedes</option>
                {pointsOfSale.map((p) => (
                  <option key={p._id} value={p._id}>{p.name}</option>
                ))}
              </select>
            )}
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar pedido, cliente, producto..."
                className="w-full pl-9 pr-8 py-1.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-xs placeholder:text-gray-400 focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                  <X className="w-3.5 h-3.5 text-gray-400" />
                </button>
              )}
            </div>
            <div className="hidden md:flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-0.5">
              <button
                onClick={() => setViewMode('kanban')}
                className={`p-1.5 rounded-lg transition-colors ${viewMode === 'kanban' ? 'bg-white dark:bg-gray-700 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                title="Vista Kanban"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-white dark:bg-gray-700 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                title="Vista Lista"
              >
                <List className="w-4 h-4" />
              </button>
            </div>
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={`p-1.5 rounded-lg transition-colors ${soundEnabled ? 'text-orange-600 hover:bg-orange-50' : 'text-gray-400 hover:bg-gray-100'}`}
              title={soundEnabled ? 'Silenciar' : 'Activar sonido'}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
            <button
              onClick={() => { setLoading(true); loadOrders(); }}
              className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title="Refrescar"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* ── Mobile tabs (< md) ─────────────────────────────────────────── */}
        <div className="md:hidden shrink-0 flex gap-1 px-4 py-2 bg-gray-50 dark:bg-gray-950 border-b border-gray-200 dark:border-gray-700">
          {[
            { id: 'cola' as const, label: 'En Cola', count: stats.queue },
            { id: 'cocina' as const, label: 'Cocina', count: stats.kitchen },
            { id: 'listos' as const, label: 'Listos', count: stats.ready },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setMobileTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                mobileTab === tab.id
                  ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 shadow-md'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400'
              }`}
            >
              {tab.label}
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                mobileTab === tab.id ? 'bg-white/20' : 'bg-gray-200 dark:bg-gray-600'
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* ── Content area ───────────────────────────────────────────────── */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-10 h-10 animate-spin text-orange-500" />
          </div>
        ) : (
          <>
            {/* Desktop: Kanban columns */}
            <div className="hidden md:flex flex-1 min-h-0 gap-4 p-4">
              {viewMode === 'kanban' ? (
                <>
                  <KanbanColumn
                    title="En Cola"
                    icon={<Clock className="w-4 h-4 text-amber-700" />}
                    color="bg-amber-100/80 text-amber-800"
                    count={colQueue.length}
                    orders={colQueue}
                    onAction={advanceOrder}
                    onSelect={setSelectedOrder}
                    onMarkOutOfStock={markOutOfStock}
                    actingId={actingId}
                  />
                  <KanbanColumn
                    title="En Cocina"
                    icon={<ChefHat className="w-4 h-4 text-orange-700" />}
                    color="bg-orange-100/80 text-orange-800"
                    count={colKitchen.length}
                    orders={colKitchen}
                    onAction={advanceOrder}
                    onSelect={setSelectedOrder}
                    onMarkOutOfStock={markOutOfStock}
                    actingId={actingId}
                  />
                  <KanbanColumn
                    title="Listos"
                    icon={<CheckCircle2 className="w-4 h-4 text-green-700" />}
                    color="bg-green-100/80 text-green-800"
                    count={colReady.length}
                    orders={colReady}
                    onAction={advanceOrder}
                    onSelect={setSelectedOrder}
                    onMarkOutOfStock={markOutOfStock}
                    actingId={actingId}
                  />
                  {colIncidents.length > 0 && (
                    <KanbanColumn
                      title="Incidencias"
                      icon={<AlertTriangle className="w-4 h-4 text-red-700" />}
                      color="bg-red-100/80 text-red-800"
                      count={colIncidents.length}
                      orders={colIncidents}
                      onAction={advanceOrder}
                      onSelect={setSelectedOrder}
                      onMarkOutOfStock={markOutOfStock}
                      actingId={actingId}
                    />
                  )}
                </>
              ) : (
                <div className="flex-1 min-h-0 overflow-y-auto">
                  <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-3">
                    {[...colQueue, ...colKitchen, ...colReady, ...colIncidents].map((order) => (
                      <div key={order._id} className="group">
                        <KitchenOrderCard
                          order={order}
                          onAction={advanceOrder}
                          onSelect={setSelectedOrder}
                          onMarkOutOfStock={markOutOfStock}
                          acting={actingId === order._id}
                        />
                      </div>
                    ))}
                  </div>
                  {colQueue.length + colKitchen.length + colReady.length + colIncidents.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                      <ChefHat className="w-12 h-12 mb-3 text-gray-300" />
                      <p className="text-sm font-medium">No hay pedidos activos en cocina</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Mobile: single column */}
            <div className="md:hidden flex-1 min-h-0 overflow-y-auto p-4">
              {mobileOrders.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                  <AlertCircle className="w-10 h-10 mb-2" />
                  <p className="text-sm font-medium">Sin pedidos en esta sección</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {mobileOrders.map((order) => (
                    <div key={order._id} className="group">
                      <KitchenOrderCard
                        order={order}
                        onAction={advanceOrder}
                        onSelect={setSelectedOrder}
                        onMarkOutOfStock={markOutOfStock}
                        acting={actingId === order._id}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Modals ───────────────────────────────────────────────────────── */}
      {selectedOrder && (
        <OrderDetailModal
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onAction={(o, next) => { advanceOrder(o, next); setSelectedOrder(null); }}
          onIncident={(o) => { setSelectedOrder(null); setIncidentOrder(o); }}
          onMarkOutOfStock={markOutOfStock}
          acting={actingId === selectedOrder._id}
        />
      )}
      {incidentOrder && (
        <IncidentModal
          order={incidentOrder}
          onClose={() => setIncidentOrder(null)}
          onSubmit={submitIncident}
          submitting={submitting}
        />
      )}
    </Layout>
  );
}
