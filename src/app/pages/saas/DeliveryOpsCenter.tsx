import { useState, useEffect, useMemo, useCallback, useRef, type MouseEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Layout } from '../../components/saas/Layout';
import { Tabs } from '../../components/saas/Tabs';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { useActiveStoreScope } from '../../context/ActiveStoreScopeContext';
import { resolveBusinessDataUserId } from '../../lib/tenantUserId';
import {
  DELIVERY_ACTIVE_STORE_CHANGED,
  coerceSelectedPdvId,
  readDeliveryOpsSelectedPdvId,
  writeDeliveryOpsSelectedPdvId,
  notifyDeliveryActiveStoreChanged,
} from '../../lib/deliveryOpsPdvSelection';
import { useSSE } from '../../hooks/useSSE';
import { useLiveClock } from '../../hooks/useLiveClock';
import {
  computeKitchenLiveStats,
  computeRepartoLiveStats,
  enrichOpsAlertsLive,
  formatElapsedFromIso,
  formatOpsDayLabel,
  getOrderPhaseStartIso,
  minutesSinceIso,
} from '../../lib/deliveryOpsLiveTimes';
import { useActivationFocus } from '../../hooks/useActivationFocus';
import { scrollToActivationField } from '../../components/saas/ActivationGuideUi';
import { usePointOfSaleAccess } from '../../hooks/usePointOfSaleAccess';
import { getAuthHeaders } from '../../lib/authApi';
import { Delivery } from './Delivery';
import {
  getOpsCenterRequest,
  localDateInputValue,
  pointOfSaleDisplayLabel,
  updateDeliveryOrderRequest,
  type OpsCenterData,
  type OpsCenterFilters,
  type OpsAlert,
  type DeliveryOrder,
  type DeliveryOrderStatus,
  type DeliveryConfig,
  type PointOfSale,
} from '../../lib/deliveryApi';
import { brandDisplayName, reportCategoryLabel } from '../../lib/deliveryOrderReporting';
import { DELIVERY_LEGACY_SCREENS_HIDDEN } from '../../lib/deliverySetup';
import {
  Activity, ChefHat, Package, Truck, CheckCircle2, Clock, AlertTriangle,
  ShoppingBag, Wallet, AlertCircle, Receipt, Euro,
  Timer, Users, Bell,
  Filter, X, Armchair, Boxes, BookOpen, Hash,
  Store,
  Plus,
  RefreshCw,
  Zap,
  ClipboardCheck,
  Banknote,
  Globe,
} from 'lucide-react';
import { ClientsPage } from './ClientsPage';
import { PromotionsPage } from './PromotionsPage';

const STATUS_CFG: Record<string, { label: string; bg: string; border: string; text: string; icon: typeof Clock }> = {
  nuevo:      { label: 'Nuevos',      bg: 'bg-amber-50 dark:bg-amber-950/30',   border: 'border-amber-200 dark:border-amber-800',   text: 'text-amber-700 dark:text-amber-400',   icon: Clock },
  cocina:     { label: 'En cocina',   bg: 'bg-orange-50 dark:bg-orange-950/30', border: 'border-orange-200 dark:border-orange-800', text: 'text-orange-700 dark:text-orange-400', icon: ChefHat },
  listo:      { label: 'Montaje',     bg: 'bg-indigo-50 dark:bg-indigo-950/30', border: 'border-indigo-200 dark:border-indigo-800', text: 'text-indigo-700 dark:text-indigo-400', icon: Package },
  en_reparto: { label: 'En reparto',  bg: 'bg-cyan-50 dark:bg-cyan-950/30',     border: 'border-cyan-200 dark:border-cyan-800',     text: 'text-cyan-700 dark:text-cyan-400',     icon: Truck },
  entregado:  { label: 'Entregados',  bg: 'bg-green-50 dark:bg-green-950/30',   border: 'border-green-200 dark:border-green-800',   text: 'text-green-700 dark:text-green-400',   icon: CheckCircle2 },
  incident:   { label: 'Incidencias', bg: 'bg-red-50 dark:bg-red-950/30',       border: 'border-red-200 dark:border-red-800',       text: 'text-red-700 dark:text-red-400',       icon: AlertTriangle },
};

const CH_LABELS: Record<string, string> = {
  direct: 'Directo', phone: 'Teléfono', web: 'Web', app: 'App', tpv: 'TPV',
  glovo: 'Glovo', justeat: 'Just Eat', ubereats: 'Uber Eats',
};

function ago(d: string, nowMs: number) {
  if (!d) return '—';
  return formatElapsedFromIso(d, nowMs);
}

function eur(n: number) {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function extractBrandIds(order: DeliveryOrder): string[] {
  const raw = (order.items || []).flatMap((it) =>
    Array.isArray(it.brandIds) ? it.brandIds : [],
  );
  return Array.from(new Set(raw.map((s) => String(s || '').trim()).filter(Boolean))).slice(0, 4);
}

function OrderBrandBadges({
  order,
  brandLabels,
}: {
  order: DeliveryOrder;
  brandLabels?: Record<string, string>;
}) {
  const ids = extractBrandIds(order);
  if (!ids.length) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {ids.map((b) => (
        <span
          key={b}
          className="px-1.5 py-0.5 rounded-md bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 text-[10px] font-bold border border-violet-200 dark:border-violet-800"
          title="Marca"
        >
          {brandDisplayName(b, brandLabels)}
        </span>
      ))}
    </div>
  );
}

/* ── Filters Bar ─────────────────────────────────────────────────────────── */

function FiltersBar({ filters, onChange, config, pdvs, sticky = false }: {
  filters: OpsCenterFilters; onChange: (f: OpsCenterFilters) => void;
  config: DeliveryConfig | null; pdvs: PointOfSale[];
  /** Solo útil fuera de paneles con scroll interno; dentro de Ops evita huecos raros */
  sticky?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  const { user } = useAuth();
  const pointOfSaleAccess = usePointOfSaleAccess(pdvs.length);

  const goToPdvBilling = () => {
    const resolvedUserId = user?.id || (user as { user_id?: string } | null)?.user_id || '';
    if (resolvedUserId) {
      try {
        localStorage.setItem(
          `billing_selection_${resolvedUserId}`,
          JSON.stringify({ selectedPlanId: 'pro', billingMode: 'monthly' }),
        );
      } catch {
        /* ignore */
      }
    }
    nav('/saas/settings/facturacion');
  };

  const handleAddPdvClick = () => {
    if (pointOfSaleAccess.canCreatePointOfSale) {
      nav('/saas/settings/tienda?action=new-pdv');
      return;
    }
    goToPdvBilling();
  };

  const addPdvLabel = pointOfSaleAccess.canCreatePointOfSale
    ? 'Nuevo PDV'
    : pointOfSaleAccess.needsPointOfSaleAddon
      ? 'Añadir PDV extra'
      : 'Multi-PDV (PRO)';
  const addPdvTitle = pointOfSaleAccess.canCreatePointOfSale
    ? `Crear un nuevo punto de venta (${pdvs.length}/${pointOfSaleAccess.includedPointOfSaleLimit})`
    : pointOfSaleAccess.needsPointOfSaleAddon
      ? `Tu plan PRO incluye ${pointOfSaleAccess.includedPointOfSaleLimit} PDV. Añade un extra para crear otro.`
      : `Tu plan ${pointOfSaleAccess.planLabel} incluye ${pointOfSaleAccess.includedPointOfSaleLimit} PDV. Sube a PRO para crear más.`;

  const addPdvButtonClass =
    'px-3 py-2 rounded-lg text-sm font-semibold border transition-colors inline-flex items-center gap-1.5 shrink-0 ' +
    (pointOfSaleAccess.canCreatePointOfSale
      ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/30'
      : 'border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/30');

  const ac = [
    pdvs.length > 1 ? filters.salesPointId : '',
    filters.channel,
    filters.timeSlot,
  ].filter(Boolean).length;
  const sel = 'px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-gray-900 dark:focus:border-gray-400 outline-none';
  const today = localDateInputValue();
  const selectedDate = filters.date || today;
  const isToday = selectedDate === today;

  const inner = (
    <div className="flex flex-wrap gap-2 items-center">
      {pdvs.length > 1 ? (
        <select
          className={sel}
          value={
            filters.salesPointId && pdvs.some((p) => p._id === filters.salesPointId)
              ? filters.salesPointId
              : ''
          }
          onChange={(e) => onChange({ ...filters, salesPointId: e.target.value || undefined })}
        >
          <option value="">Todas las tiendas</option>
          {pdvs.map((p) => (
            <option key={p._id} value={p._id}>
              {pointOfSaleDisplayLabel(p)}
            </option>
          ))}
        </select>
      ) : pdvs.length === 1 ? (
        <div className="flex flex-wrap items-center gap-2">
          <div
            className={`${sel} flex items-center gap-2 border-gray-900/25 dark:border-gray-400/30 bg-gray-50 dark:bg-gray-800/90 font-medium text-gray-900 dark:text-gray-100`}
            title="Centro de trabajo / PDV activo en esta vista"
          >
            <Store className="w-4 h-4 shrink-0 opacity-80" />
            <span className="truncate max-w-[14rem]">{pointOfSaleDisplayLabel(pdvs[0])}</span>
          </div>
          <button
            type="button"
            onClick={handleAddPdvClick}
            className={addPdvButtonClass}
            title={addPdvTitle}
          >
            {pointOfSaleAccess.canCreatePointOfSale && <Plus className="w-3.5 h-3.5" />}
            {addPdvLabel}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleAddPdvClick}
          className={addPdvButtonClass}
          title={addPdvTitle}
        >
          {pointOfSaleAccess.canCreatePointOfSale && <Plus className="w-3.5 h-3.5" />}
          {addPdvLabel}
        </button>
      )}
      <select className={sel} value={filters.channel || ''} onChange={e => onChange({ ...filters, channel: e.target.value || undefined })}>
        <option value="">Todos los canales</option>
        {(config?.activeChannels || []).map(ch => <option key={ch} value={ch}>{CH_LABELS[ch] || ch}</option>)}
      </select>
      {config?.activeTimeSlots && config.activeTimeSlots.length > 0 && (
        <select className={sel} value={filters.timeSlot || ''} onChange={e => onChange({ ...filters, timeSlot: e.target.value || undefined })}>
          <option value="">Todo el día</option>
          {config.activeTimeSlots.map(s => <option key={s.id} value={s.id}>{s.label} ({s.start}–{s.end})</option>)}
        </select>
      )}
      <div className="flex items-center gap-1.5">
        <input
          type="date"
          className={sel}
          value={selectedDate}
          max={today}
          onChange={(e) => onChange({ ...filters, date: e.target.value || today })}
        />
        <button
          type="button"
          onClick={() => onChange({ ...filters, date: today })}
          className={`px-3 py-2 rounded-lg text-sm font-semibold border transition-colors shrink-0 ${
            isToday
              ? 'border-teal-600 bg-teal-600 text-white'
              : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
          }`}
          title={`Ver operativa de hoy (${new Date(`${today}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })})`}
        >
          Hoy
        </button>
      </div>
      {ac > 0 && (
        <button
          onClick={() => onChange({
            date: today,
            ...(filters.salesPointId ? { salesPointId: filters.salesPointId } : {}),
          })}
          className="px-2.5 py-2 text-xs font-semibold text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 flex items-center gap-1"
        >
          <X className="w-3.5 h-3.5" /> Limpiar
        </button>
      )}
    </div>
  );

  const desktopWrap = sticky ? 'sticky top-0 z-10' : '';

  return (
    <>
      <div className={`hidden md:block ${desktopWrap}`}>
        <div className="bg-white/95 dark:bg-gray-900/90 backdrop-blur-sm border border-gray-200/90 dark:border-gray-700 rounded-xl px-3 py-2 shadow-sm">
          {inner}
        </div>
      </div>
      <div className="md:hidden">
        <button onClick={() => setOpen(!open)} className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm font-semibold flex items-center gap-2 bg-white dark:bg-gray-800">
          <Filter className="w-4 h-4" /> Filtros {ac > 0 && <span className="px-1.5 py-0.5 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-full text-xs font-bold">{ac}</span>}
        </button>
        {open && (
          <div className="mt-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-2.5">
            {inner}
          </div>
        )}
      </div>
    </>
  );
}

/* ── Status Pipeline ─────────────────────────────────────────────────────── */

function Pipeline({ byStatus, active, onFilter }: {
  byStatus: Record<string, number>; active: string | null; onFilter: (s: string | null) => void;
}) {
  const phases = ['nuevo', 'cocina', 'listo', 'en_reparto', 'entregado', 'incident'] as const;
  return (
    <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
      {phases.map(s => {
        const c = STATUS_CFG[s]; if (!c) return null;
        const Icon = c.icon; const on = active === s;
        return (
          <button key={s} onClick={() => onFilter(on ? null : s)}
            type="button"
            className={`p-3 rounded-lg border transition-all text-left ${c.bg} ${c.border} ${on ? 'ring-1 ring-gray-900 dark:ring-gray-100 ring-offset-1 ring-offset-white dark:ring-offset-gray-950 shadow-sm' : 'hover:brightness-[0.98] dark:hover:brightness-110'}`}>
            <div className={`${c.text} mb-1 flex items-center justify-between gap-1`}>
              <Icon className="w-[18px] h-[18px] shrink-0 opacity-90" />
              <span className={`text-xl font-bold tabular-nums leading-none ${c.text}`}>{byStatus[s] || 0}</span>
            </div>
            <div className={`text-[11px] font-semibold leading-tight ${c.text} opacity-90`}>{c.label}</div>
          </button>
        );
      })}
    </div>
  );
}

/* ── Alerts ───────────────────────────────────────────────────────────────── */

function opsAlertSignature(alerts: OpsAlert[]): string {
  return alerts.map((a) => a.id).sort().join('|');
}

const OPS_CASH_ALERT_TYPES = new Set<OpsAlert['type']>([
  'cash_pending_close',
  'cash_pending_validation',
  'register_discrepancy',
  'register_not_open',
]);

function opsAlertsCoverCash(alerts: OpsAlert[]): boolean {
  return alerts.some((a) => OPS_CASH_ALERT_TYPES.has(a.type));
}

function opsAlertActionLabel(a: OpsAlert): string | null {
  switch (a.type) {
    case 'cash_pending_validation':
      return 'Validar cierre';
    case 'register_discrepancy':
      return 'Ver cierre';
    case 'cash_pending_close':
    case 'register_not_open':
      return 'Ver caja';
    case 'kitchen_saturated':
      return 'Ver cocina';
    case 'delayed_order':
      return 'Ver pedido';
    case 'open_incident':
      return 'Ver incidencias';
    case 'critical_stock':
      return 'Ver stock';
    default:
      return null;
  }
}

function handleOpsAlertAction(
  a: OpsAlert,
  nav: ReturnType<typeof useNavigate>,
  activeOrders: DeliveryOrder[],
) {
  if (a.type === 'kitchen_saturated') {
    document.getElementById('ops-kitchen-widget')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  if (a.type === 'delayed_order') {
    const order = activeOrders.find((o) => o._id === a.orderId);
    const status = order?.status;
    if (status === 'cocina') {
      document.getElementById('ops-kitchen-widget')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (status === 'listo') {
      nav('/saas/delivery-montaje', { state: { returnToOps: true } });
      return;
    }
    if (status === 'camino' || status === 'incident') {
      nav('/saas/delivery-reparto', { state: { returnToOps: true } });
      return;
    }
    nav(a.route || '/saas/delivery-kitchen', { state: { returnToOps: true } });
    return;
  }
  if (OPS_CASH_ALERT_TYPES.has(a.type)) {
    let path = '/saas/vertical/delivery/caja';
    if (a.type === 'cash_pending_validation') {
      if (a.sessionId) path += `?validate=${encodeURIComponent(a.sessionId)}`;
    } else if (a.type === 'register_discrepancy' && a.sessionId) {
      path += `?view=${encodeURIComponent(a.sessionId)}`;
    }
    nav(path, { state: { returnToOps: true } });
    return;
  }
  if (a.type === 'open_incident') {
    nav('/saas/delivery-reparto', { state: { returnToOps: true } });
    return;
  }
  if (a.type === 'critical_stock') {
    nav('/saas/catalog', { state: { returnToOps: true } });
    return;
  }
  if (a.route) nav(a.route, { state: { returnToOps: true } });
}

function readOpsBannerDismissed(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeOpsBannerDismissed(key: string, signature: string) {
  try {
    sessionStorage.setItem(key, signature);
  } catch {
    /* ignore */
  }
}

function Alerts({
  alerts,
  nowMs,
  opsDate,
  activeOrders,
  cashStatus,
  cfg,
}: {
  alerts: OpsAlert[];
  nowMs: number;
  opsDate: string;
  activeOrders: DeliveryOrder[];
  cashStatus?: OpsCenterData['cashStatus'];
  cfg: DeliveryConfig | null;
}) {
  const todayKey = localDateInputValue();
  const dayLabel = formatOpsDayLabel(opsDate, todayKey);
  const maxCashHours = 12;

  const liveAlerts = useMemo(
    () =>
      enrichOpsAlertsLive(
        alerts,
        activeOrders,
        cfg,
        cashStatus?.openTpvSessions ?? [],
        maxCashHours,
        nowMs,
      ),
    [alerts, activeOrders, cfg, cashStatus?.openTpvSessions, maxCashHours, nowMs],
  );

  const signature = useMemo(() => opsAlertSignature(liveAlerts), [liveAlerts]);
  const [bannerDismissedSig, setBannerDismissedSig] = useState<string | null>(
    () => readOpsBannerDismissed('deliveryOps.alertsBannerDismissed'),
  );
  const [exp, setExp] = useState(false);
  const [hide, setHide] = useState<Set<string>>(new Set());
  const nav = useNavigate();

  const vis = liveAlerts.filter((a) => !hide.has(a.id));
  const bannerHidden = bannerDismissedSig === signature;
  if (!vis.length || bannerHidden) return null;

  const crit = vis.some((a) => a.severity === 'critical');
  const bg = crit
    ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800'
    : 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800';
  const ICONS: Record<string, typeof AlertTriangle> = {
    delayed_order: Timer,
    kitchen_saturated: ChefHat,
    cash_pending_close: Wallet,
    cash_pending_validation: Banknote,
    register_discrepancy: Banknote,
    register_not_open: Banknote,
    critical_stock: Boxes,
    open_incident: AlertCircle,
  };

  const dismissBanner = (e: MouseEvent) => {
    e.stopPropagation();
    setBannerDismissedSig(signature);
    writeOpsBannerDismissed('deliveryOps.alertsBannerDismissed', signature);
  };

  return (
    <div className={`rounded-xl border-2 ${bg} overflow-hidden shadow-sm`}>
      <div className="w-full px-3 py-2.5 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setExp((v) => !v)}
          className="flex-1 min-w-0 flex items-center gap-2 text-left"
        >
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${crit ? 'bg-red-100 dark:bg-red-900/40' : 'bg-amber-100 dark:bg-amber-900/40'}`}>
            <Bell className={`w-4 h-4 ${crit ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`} />
          </div>
          <div className="min-w-0">
            <p className={`text-sm font-bold leading-tight ${crit ? 'text-red-900 dark:text-red-100' : 'text-amber-950 dark:text-amber-100'}`}>
              {vis.length} alerta{vis.length !== 1 ? 's' : ''} pendiente{vis.length !== 1 ? 's' : ''}
            </p>
            <p className={`text-xs mt-0.5 ${crit ? 'text-red-800/85 dark:text-red-200/90' : 'text-amber-900/75 dark:text-amber-200/85'}`}>
              {exp ? 'Toca para ocultar detalle' : `Operativa · ${dayLabel}${opsDate !== todayKey ? ' (día seleccionado)' : ''}`}
            </p>
          </div>
        </button>
        <button
          type="button"
          onClick={() => setExp((v) => !v)}
          className={`shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-bold border ${
            crit
              ? 'bg-white dark:bg-gray-900 text-red-700 dark:text-red-300 border-red-200 dark:border-red-700'
              : 'bg-white dark:bg-gray-900 text-amber-800 dark:text-amber-200 border-amber-300 dark:border-amber-700'
          }`}
        >
          {exp ? 'Ocultar' : 'Ver alertas'}
        </button>
        <button
          type="button"
          onClick={dismissBanner}
          className="p-2 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-white/60 dark:hover:bg-gray-900/30 shrink-0"
          title="Quitar aviso"
          aria-label="Quitar aviso de alertas"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      {exp && (
        <div className="px-3 pb-3 space-y-1.5 border-t border-black/5 dark:border-white/5 pt-2">
          {vis.map((a) => {
            const I = ICONS[a.type] || AlertTriangle;
            return (
              <div key={a.id} className="flex items-start gap-2 bg-white dark:bg-gray-800 rounded-lg p-2.5 border border-gray-100 dark:border-gray-700">
                <I className={`w-4 h-4 mt-0.5 shrink-0 ${a.severity === 'critical' ? 'text-red-500' : 'text-amber-500'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{a.title}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {a.message}
                    {a.createdAt && (
                      <span className="text-gray-400 dark:text-gray-500">
                        {' '}
                        · lleva {formatElapsedFromIso(a.createdAt, nowMs)}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {opsAlertActionLabel(a) && (
                    <button
                      type="button"
                      onClick={() => handleOpsAlertAction(a, nav, activeOrders)}
                      className="px-2 py-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg"
                    >
                      {opsAlertActionLabel(a)}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setHide((p) => new Set(p).add(a.id))}
                    className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg"
                    title="Quitar esta alerta"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Caja status banner ───────────────────────────────────────────────────── */

function cashBannerSignature(cashStatus: NonNullable<OpsCenterData['cashStatus']>): string {
  const pendingClose = cashStatus.pendingClose || 0;
  const pendingValidation = cashStatus.pendingValidation || 0;
  const discrepancy = Math.abs(cashStatus.todayDiscrepancy || 0);
  const openCount = cashStatus.openTpvSessions?.length || 0;
  return `${openCount}|${pendingClose}|${pendingValidation}|${Math.round(discrepancy)}`;
}

function CashStatusBanner({
  cashStatus,
  onNavigate,
}: {
  cashStatus: OpsCenterData['cashStatus'] | undefined;
  onNavigate: (path: string) => void;
}) {
  const signature = cashStatus ? cashBannerSignature(cashStatus) : '';
  const [dismissedSig, setDismissedSig] = useState<string | null>(
    () => readOpsBannerDismissed('deliveryOps.cashBannerDismissed'),
  );

  if (!cashStatus) return null;
  const pendingClose = cashStatus.pendingClose || 0;
  const pendingValidation = cashStatus.pendingValidation || 0;
  const discrepancy = Math.abs(cashStatus.todayDiscrepancy || 0);
  const openCount = cashStatus.openTpvSessions?.length || 0;
  const hasIssue = pendingClose > 0 || pendingValidation > 0 || discrepancy >= 20;
  if (!hasIssue && openCount === 0) return null;
  if (dismissedSig === signature) return null;

  const dismiss = (e: MouseEvent) => {
    e.stopPropagation();
    setDismissedSig(signature);
    writeOpsBannerDismissed('deliveryOps.cashBannerDismissed', signature);
  };

  return (
    <div className="relative rounded-xl border-2 border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 shadow-sm">
      <button
        type="button"
        onClick={() => onNavigate('/saas/vertical/delivery/caja')}
        className="w-full text-left px-4 py-3 pr-12 hover:bg-amber-100/80 dark:hover:bg-amber-900/20 transition-colors rounded-xl"
      >
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shrink-0">
            <Banknote className="w-5 h-5 text-amber-700 dark:text-amber-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-amber-900 dark:text-amber-100">Panel de caja</p>
            <p className="text-xs text-amber-800/90 dark:text-amber-200/90 mt-0.5">
              {openCount > 0 ? `${openCount} caja${openCount !== 1 ? 's' : ''} abierta${openCount !== 1 ? 's' : ''}` : 'Sin caja abierta'}
              {pendingValidation > 0 ? ` · ${pendingValidation} cierre${pendingValidation !== 1 ? 's' : ''} por validar` : ''}
              {pendingClose > 0 ? ` · ${pendingClose} sin cerrar (+14h)` : ''}
              {discrepancy >= 20 ? ` · descuadre hoy ${discrepancy.toFixed(2)}€` : ''}
            </p>
          </div>
          <span className="text-xs font-bold text-amber-800 dark:text-amber-300 shrink-0 mt-1">Abrir →</span>
        </div>
      </button>
      <button
        type="button"
        onClick={dismiss}
        className="absolute top-2.5 right-2.5 p-2 rounded-lg text-amber-700/70 dark:text-amber-300/70 hover:text-amber-900 dark:hover:text-amber-100 hover:bg-amber-100 dark:hover:bg-amber-900/40"
        title="Quitar aviso"
        aria-label="Quitar aviso de caja"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

function cajaAlertBadge(cashStatus: OpsCenterData['cashStatus'] | undefined): number {
  if (!cashStatus) return 0;
  return (cashStatus.pendingClose || 0) + (cashStatus.pendingValidation || 0);
}

/* ── Quick Access ─────────────────────────────────────────────────────────── */

function QuickAccess({ cfg, kpis, cashPend, incidents, onNavigate, pedidosQueueCount, activationFocus }: {
  cfg: DeliveryConfig | null; kpis: OpsCenterData['kpis'] | null; cashPend: number; incidents: number;
  onNavigate: (path: string) => void;
  /** Cola nuevo+cocina+listo (preferible a KPI suelto; evita parpadeos) */
  pedidosQueueCount: number;
  activationFocus?: string | null;
}) {
  type QItem = { l: string; i: typeof Activity; r: string; b: number | null; bc?: string; v: boolean; highlight?: boolean };
  const items: QItem[] = [
    { l: 'TPV rápido', i: Zap, r: '/saas/vertical/delivery/tpv', b: null, v: true },
    { l: 'Caja', i: Banknote, r: '/saas/vertical/delivery/caja', b: cashPend > 0 ? cashPend : null, bc: 'bg-red-500', v: true, highlight: cashPend > 0 },
    { l: 'Pedidos', i: Truck, r: '/saas/delivery', b: pedidosQueueCount > 0 ? pedidosQueueCount : null, v: !DELIVERY_LEGACY_SCREENS_HIDDEN },
    { l: 'Cocina', i: ChefHat, r: '/saas/delivery-kitchen', b: kpis?.byStatus.cocina ?? null, v: cfg?.hasKitchen !== false },
    { l: 'Montaje', i: ClipboardCheck, r: '/saas/delivery-montaje', b: kpis?.byStatus.listo ?? null, v: cfg?.hasAssemblyStation !== false },
    { l: 'Reparto', i: Truck, r: '/saas/delivery-reparto', b: null, v: (cfg?.hasOwnDelivery || cfg?.hasPlatformDelivery) === true },
    { l: 'Sala', i: Armchair, r: '/saas/sala', b: null, v: !DELIVERY_LEGACY_SCREENS_HIDDEN && cfg?.hasPhysicalTables === true },
    { l: 'Catálogo', i: BookOpen, r: '/saas/catalog', b: null, v: true },
    { l: 'Pedidos web', i: Package, r: '/saas/web-orders', b: null, v: true },
    { l: 'Web config', i: Globe, r: '/saas/web-config', b: null, v: true },
  ];
  return (
    <div className="flex gap-2.5 sm:gap-3 overflow-x-auto pb-1.5 pt-1 scrollbar-thin overflow-y-visible -mx-0.5">
      {items.filter(x => x.v).map(x => {
        const activationKey = x.l === 'TPV rápido' ? 'open-tpv' : undefined;
        const highlighted = activationKey && activationFocus === activationKey;
        return (
        <button
          key={x.l}
          type="button"
          data-activation-field={activationKey}
          onClick={() => onNavigate(x.r)}
          className={`flex flex-col items-center justify-center gap-2 px-3 py-3.5 rounded-xl border-2 bg-white dark:bg-gray-800 hover:border-amber-400/80 dark:hover:border-amber-600/50 hover:bg-amber-50/40 dark:hover:bg-amber-950/20 hover:shadow-md active:scale-[0.98] transition-all min-w-[88px] sm:min-w-[102px] shrink-0 relative overflow-visible shadow-sm ${
            highlighted || (x.highlight && x.b)
              ? 'activation-field-highlight border-amber-500 dark:border-amber-500 ring-2 ring-amber-300/50'
              : highlighted
              ? 'activation-field-highlight border-amber-500 dark:border-amber-500'
              : 'border-gray-200 dark:border-gray-600'
          }`}
        >
          <x.i className="w-7 h-7 sm:w-8 sm:h-8 text-gray-700 dark:text-gray-200" strokeWidth={2} />
          <span className="text-[11px] sm:text-xs font-bold text-gray-700 dark:text-gray-200 leading-tight text-center max-w-[5.5rem]">{x.l}</span>
          {x.b != null && x.b > 0 && (
            <span
              className={`absolute -top-1 -right-1 min-h-[1.35rem] min-w-[1.35rem] px-1.5 py-0.5 flex items-center justify-center ${x.bc || 'bg-gray-900 dark:bg-gray-100'} text-white dark:text-gray-900 rounded-full text-[11px] sm:text-xs font-bold leading-none shadow-md border-[3px] border-white dark:border-gray-900`}
            >
              {x.b > 99 ? '99+' : x.b}
            </span>
          )}
        </button>
        );
      })}
    </div>
  );
}

/* ── Metrics ──────────────────────────────────────────────────────────────── */

function Metrics({ kpis }: { kpis: OpsCenterData['kpis'] | null }) {
  if (!kpis) return null;
  const cards = [
    { l: 'Facturación', v: `${eur(kpis.revenue)} €`, i: Euro, c: 'text-emerald-600 dark:text-emerald-400' },
    { l: 'Pedidos', v: String(kpis.totalOrders), i: ShoppingBag, c: 'text-blue-600 dark:text-blue-400' },
    { l: 'Ticket medio', v: `${eur(kpis.averageTicket)} €`, i: Receipt, c: 'text-violet-600 dark:text-violet-400' },
    { l: 'Prep. media', v: `${kpis.avgPrepTimeMinutes} min`, i: Timer, c: 'text-orange-600 dark:text-orange-400' },
    { l: 'Entrega media', v: `${kpis.avgDeliveryTimeMinutes} min`, i: Truck, c: 'text-cyan-600 dark:text-cyan-400' },
    { l: 'Puntualidad', v: `${kpis.onTimePercentage}%`, i: CheckCircle2, c: kpis.onTimePercentage >= 80 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400' },
  ];
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3.5">
      <h3 className="text-xs font-bold mb-2.5 flex items-center gap-1.5 uppercase tracking-wide text-gray-500 dark:text-gray-400"><Activity className="w-4 h-4 opacity-80" /> Métricas del día</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {cards.map(c => (
          <div key={c.l} className="text-center py-0.5">
            <c.i className={`w-[18px] h-[18px] mx-auto mb-0.5 ${c.c}`} />
            <p className={`text-lg font-bold tabular-nums ${c.c}`}>{c.v}</p>
            <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400 mt-0.5 leading-tight">{c.l}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Kitchen Widget ──────────────────────────────────────────────────────── */

function KitchenW({ ks, orders, onAdv, brandLabels, nowMs, cfg }: {
  ks: OpsCenterData['kitchenStatus'] | null; orders: DeliveryOrder[];
  onAdv: (o: DeliveryOrder, s: DeliveryOrderStatus) => void;
  brandLabels?: Record<string, string>;
  nowMs: number;
  cfg: DeliveryConfig | null;
}) {
  if (!ks) return null;
  const capacity = cfg?.maxKitchenCapacity ?? ks.capacity ?? 15;
  const live = computeKitchenLiveStats(orders, capacity, nowMs);
  const kitchenWarnMin = cfg?.defaultPrepTime ?? 20;
  const list = orders.filter(o => o.status === 'cocina').slice(0, 5);
  const col = live.saturationPercent < 50 ? 'bg-green-500' : live.saturationPercent < 80 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div id="ops-kitchen-widget" className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden">
      <div className="p-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ChefHat className="w-5 h-5 text-orange-600 dark:text-orange-400" />
          <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Cocina</h3>
          <span className="px-2 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded-full text-xs font-bold">{live.ordersInKitchen}/{live.capacity}</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span>Mayor: {Math.round(live.oldestOrderMinutes)}m</span>
          <span>Media: {Math.round(live.avgWaitMinutes)}m</span>
        </div>
      </div>
      <div className="px-3 pt-2 pb-1">
        <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
          <div className={`h-full ${col} rounded-full transition-all`} style={{ width: `${Math.min(100, live.saturationPercent)}%` }} />
        </div>
        <p className="text-[10px] text-gray-400 mt-1 text-right">{live.saturationPercent}% capacidad</p>
      </div>
      <div className="divide-y divide-gray-100 dark:divide-gray-700">
        {!list.length && <div className="px-3 py-4 text-center text-gray-400 text-xs">Sin pedidos en cocina</div>}
        {list.map(o => {
          const phaseStart = getOrderPhaseStartIso(o);
          const waitMin = minutesSinceIso(phaseStart, nowMs);
          return (
          <div key={o._id} className="px-3 py-2 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{o.orderNumber} <span className="text-xs text-gray-500 font-normal">{o.items?.slice(0, 2).map(i => i.name).join(', ')}</span></p>
              <OrderBrandBadges order={o} brandLabels={brandLabels} />
              <p className={`text-xs mt-0.5 ${waitMin > kitchenWarnMin ? 'text-red-500 font-semibold' : 'text-gray-400'}`}>{ago(phaseStart, nowMs)} en cocina</p>
            </div>
            <button onClick={() => onAdv(o, 'listo')} className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-xs font-semibold shrink-0">Listo</button>
          </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Assembly Widget ─────────────────────────────────────────────────────── */

function AssemblyW({ orders, onAdv, brandLabels, nowMs }: {
  orders: DeliveryOrder[];
  onAdv: (o: DeliveryOrder, s: DeliveryOrderStatus) => void;
  brandLabels?: Record<string, string>;
  nowMs: number;
}) {
  // En montaje: pedidos en estado 'listo' pendientes de salir hacia entrega.
  // No incluimos 'en_reparto' porque ese ya está saliendo / fuera del local.
  const list = orders.filter(o => o.status === 'listo' && !o.assignedDriver && o.deliveryType !== 'sala').slice(0, 5);
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden">
      <div className="p-3 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
        <Package className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
        <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Montaje</h3>
        <span className="px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-full text-xs font-bold">{list.length}</span>
      </div>
      <div className="divide-y divide-gray-100 dark:divide-gray-700">
        {!list.length && <div className="px-3 py-4 text-center text-gray-400 text-xs">Sin pedidos en montaje</div>}
        {list.map(o => (
          <div key={o._id} className="px-3 py-2 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{o.orderNumber}</p>
              <OrderBrandBadges order={o} brandLabels={brandLabels} />
              <p className="text-xs text-gray-400 mt-0.5">{o.deliveryType === 'recogida' ? 'Recogida' : 'Domicilio'} — {ago(getOrderPhaseStartIso(o), nowMs)} en montaje</p>
            </div>
            <button onClick={() => onAdv(o, 'entregado')} className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shrink-0">Completado</button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Delivery/Reparto Widget ─────────────────────────────────────────────── */

function RepartoW({ orders, cfg, onAdv, brandLabels, nowMs }: {
  orders: DeliveryOrder[];
  cfg: DeliveryConfig | null; onAdv: (o: DeliveryOrder, s: DeliveryOrderStatus) => void;
  brandLabels?: Record<string, string>;
  nowMs: number;
}) {
  if (!cfg?.hasOwnDelivery && !cfg?.hasPlatformDelivery) return null;
  const live = computeRepartoLiveStats(orders, cfg?.delayThresholdMinutes ?? 40, nowMs);
  // En reparto: pedidos ya marcados 'en_reparto' o, por compatibilidad,
  // 'listo' con repartidor asignado (flujo antiguo previo al estado intermedio).
  const list = orders.filter(o => (o.status === 'en_reparto' || (o.status === 'listo' && o.assignedDriver))).slice(0, 5);
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden">
      <div className="p-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Truck className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
          <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Reparto</h3>
          <span className="px-2 py-0.5 bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300 rounded-full text-xs font-bold">{live.ordersInDelivery}</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span><Users className="w-3 h-3 inline mr-0.5" />{live.driversActive}</span>
          {live.delayedCount > 0 && <span className="text-red-500 font-semibold">{live.delayedCount} retrasado(s)</span>}
        </div>
      </div>
      <div className="divide-y divide-gray-100 dark:divide-gray-700">
        {!list.length && <div className="px-3 py-4 text-center text-gray-400 text-xs">{cfg?.hasOwnDelivery ? 'Sin pedidos en reparto' : 'Pedidos en plataformas'}</div>}
        {list.map(o => (
          <div key={o._id} className="px-3 py-2 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{o.orderNumber}</p>
              <OrderBrandBadges order={o} brandLabels={brandLabels} />
              <p className="text-xs text-gray-400 mt-0.5">{ago(getOrderPhaseStartIso(o), nowMs)} en ruta · {o.assignedDriver} — {(o.customerAddress || '').slice(0, 30)}</p>
            </div>
            <button onClick={() => onAdv(o, 'entregado')} className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-xs font-semibold shrink-0">Entregado</button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Cash Widget ─────────────────────────────────────────────────────────── */

function CashW({ cs, onNavigate, opsDate, nowMs }: { cs: OpsCenterData['cashStatus'] | null; onNavigate: (path: string) => void; opsDate?: string; nowMs: number }) {
  if (!cs) return null;
  const tot = cs.openTpvSessions.length + cs.openDriverSessions.length;
  const movements = cs.recentCashMovements || [];
  const movLabels: Record<string, string> = { cash_in: 'Entrada', cash_out: 'Salida', return: 'Devolución' };
  const isToday = opsDate === localDateInputValue();

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden">
      <div className="p-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wallet className="w-5 h-5 text-violet-600 dark:text-violet-400" />
          <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Caja</h3>
          <span className="px-2 py-0.5 bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 rounded-full text-xs font-bold">{tot}</span>
        </div>
        <div className="flex items-center gap-2">
          {cs.pendingClose > 0 && <span className="px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full text-xs font-bold animate-pulse">{cs.pendingClose} cierre pend.</span>}
          <button
            type="button"
            onClick={() => onNavigate('/saas/vertical/delivery/caja')}
            className="text-[11px] font-semibold text-violet-600 dark:text-violet-400 hover:underline"
          >
            Ver caja →
          </button>
        </div>
      </div>
      <div className="p-3">
        <div className="text-center mb-3">
          <p className="text-xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">{eur(cs.totalCashInRegisters)} €</p>
          <p className="text-xs text-gray-500 mt-0.5">Efectivo en cajas abiertas</p>
        </div>
        {cs.openTpvSessions.slice(0, 2).map(s => (
          <div key={s._id} className="flex items-center justify-between text-xs bg-gray-50 dark:bg-gray-900/50 rounded-lg px-3 py-2 mb-1.5">
            <span className="font-semibold text-gray-700 dark:text-gray-300 truncate">{s.terminalName || 'Terminal'} — {s.pointOfSaleName || 'PDV'}</span>
            <span className="text-gray-500 shrink-0 ml-2">{s.workerName || '—'} · {ago(s.openedAt, nowMs)}</span>
          </div>
        ))}
        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
          <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
            Movimientos de caja{isToday ? ' hoy' : ''}
          </p>
          {movements.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-2">Sin entradas, salidas ni devoluciones manuales</p>
          ) : (
            <div className="space-y-1.5 max-h-[168px] overflow-y-auto">
              {movements.map((m) => (
                <div key={m.id} className="flex items-start justify-between gap-2 text-xs bg-gray-50 dark:bg-gray-900/50 rounded-lg px-2.5 py-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-gray-400 tabular-nums">
                        {new Date(m.date).toLocaleTimeString('es-ES', { timeStyle: 'short' })}
                      </span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${m.type === 'cash_in' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'}`}>
                        {movLabels[m.type] || m.type}
                      </span>
                      <span className="text-gray-500 truncate">{m.terminalName || m.pointOfSaleName || 'TPV'}</span>
                    </div>
                    <p className="text-gray-600 dark:text-gray-400 truncate mt-0.5">{m.description || m.workerName || '—'}</p>
                  </div>
                  <span className={`font-bold shrink-0 tabular-nums ${m.type === 'cash_in' ? 'text-green-600' : 'text-red-600'}`}>
                    {m.type === 'cash_in' ? '+' : '−'}{m.amount.toFixed(2)}€
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Incidents Widget ────────────────────────────────────────────────────── */

function IncidentsW({ orders, onNavigate }: { orders: DeliveryOrder[]; onNavigate: (path: string) => void }) {
  const list = orders.filter(o => o.status === 'incident');
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden">
      <div className="p-3 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
        <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
        <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Incidencias</h3>
        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${list.length ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' : 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'}`}>{list.length}</span>
      </div>
      <div className="divide-y divide-gray-100 dark:divide-gray-700">
        {!list.length && <div className="px-3 py-4 text-center"><CheckCircle2 className="w-6 h-6 text-green-400 mx-auto mb-1.5" /><p className="text-xs text-green-600 dark:text-green-400 font-semibold">Sin incidencias</p></div>}
        {list.slice(0, 4).map(o => (
          <div key={o._id} className="px-3 py-2 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{o.orderNumber} — {o.customerName}</p>
              <p className="text-xs text-gray-500 mt-0.5">{o.incidentType || 'General'}: {(o.incidentNotes || '').slice(0, 50)}</p>
            </div>
            <button
              onClick={() => onNavigate(DELIVERY_LEGACY_SCREENS_HIDDEN ? '/saas/delivery-reparto' : '/saas/delivery')}
              className="px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg shrink-0"
            >
              Resolver
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Tables Widget ───────────────────────────────────────────────────────── */

function TablesW({ cfg, orders }: { cfg: DeliveryConfig; orders: DeliveryOrder[] }) {
  if (!cfg.hasPhysicalTables || !cfg.tableCount) return null;
  const used = new Set(
    orders.filter(o => o.deliveryType === 'sala' && o.tableNumber && !['entregado', 'cancelled'].includes(o.status)).map(o => o.tableNumber)
  );
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden">
      <div className="p-3 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
        <Armchair className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
        <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Sala</h3>
        <span className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded-full text-xs font-bold">{used.size}/{cfg.tableCount}</span>
      </div>
      <div className="p-3">
        <div className="grid grid-cols-5 sm:grid-cols-8 gap-1.5">
          {Array.from({ length: cfg.tableCount }, (_, i) => i + 1).map(n => (
            <div key={n} className={`aspect-square rounded-lg flex items-center justify-center text-xs font-bold border-2 ${
              used.has(n)
                ? 'bg-emerald-100 dark:bg-emerald-900/30 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300'
                : 'bg-gray-50 dark:bg-gray-900/30 border-gray-200 dark:border-gray-700 text-gray-400'
            }`}>{n}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Revenue by Channel ──────────────────────────────────────────────────── */

function ChannelsW({ data }: { data: Record<string, number> }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const mx = Math.max(...entries.map(e => e[1]), 1);
  if (!entries.length) return null;
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600 p-3">
      <h3 className="text-[11px] font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5"><Hash className="w-3.5 h-3.5 opacity-70" /> Facturación por canal</h3>
      <div className="space-y-2">
        {entries.map(([ch, val]) => (
          <div key={ch} className="flex items-center gap-3">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400 w-20 shrink-0">{CH_LABELS[ch] || ch}</span>
            <div className="flex-1 h-5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden"><div className="h-full bg-blue-500 dark:bg-blue-400 rounded-full transition-all" style={{ width: `${(val / mx) * 100}%` }} /></div>
            <span className="text-xs font-bold text-gray-700 dark:text-gray-300 w-20 text-right">{eur(val)} €</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RevenueBreakdownW({
  title,
  data,
  labelForKey,
  barClass = 'bg-violet-500 dark:bg-violet-400',
}: {
  title: string;
  data: Record<string, number>;
  labelForKey: (key: string) => string;
  barClass?: string;
}) {
  const entries = Object.entries(data || {}).filter(([, v]) => Number(v) > 0).sort((a, b) => b[1] - a[1]);
  const mx = Math.max(...entries.map((e) => e[1]), 1);
  if (!entries.length) return null;
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600 p-3">
      <h3 className="text-[11px] font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-2">{title}</h3>
      <div className="space-y-2">
        {entries.map(([key, val]) => (
          <div key={key} className="flex items-center gap-3">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400 w-24 shrink-0 truncate" title={labelForKey(key)}>
              {labelForKey(key)}
            </span>
            <div className="flex-1 h-5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${barClass}`} style={{ width: `${(val / mx) * 100}%` }} />
            </div>
            <span className="text-xs font-bold text-gray-700 dark:text-gray-300 w-20 text-right">{eur(val)} €</span>
          </div>
        ))}
      </div>
    </div>
  );
}

type OpsPanelId = 'operativa' | 'pedidos' | 'clients' | 'promotions';

function opsPanelFromSearch(panelParam: string | null): OpsPanelId {
  const p = panelParam?.trim();
  if (p === 'pedidos') {
    return DELIVERY_LEGACY_SCREENS_HIDDEN ? 'operativa' : 'pedidos';
  }
  if (p === 'clients' || p === 'promotions') return p;
  return 'operativa';
}

/* ═══ MAIN PAGE ══════════════════════════════════════════════════════════════ */

export function DeliveryOpsCenter() {
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const activeStoreScope = useActiveStoreScope();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const opsPanel = opsPanelFromSearch(searchParams.get('panel'));

  const setOpsPanel = useCallback((next: OpsPanelId) => {
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      if (next === 'operativa') p.delete('panel');
      else p.set('panel', next);
      return p;
    }, { replace: true });
  }, [setSearchParams]);

  const navFromOps = useCallback((path: string) => {
    navigate(path, { state: { returnToOps: true } });
  }, [navigate]);

  const onDeliveryOpsSectionTab = useCallback(
    (id: string) => {
      if (id === 'pedidos' && !DELIVERY_LEGACY_SCREENS_HIDDEN) setOpsPanel('pedidos');
      else if (id === 'clients') setOpsPanel('clients');
      else if (id === 'promotions') setOpsPanel('promotions');
      else setOpsPanel('operativa');
    },
    [setOpsPanel],
  );

  useEffect(() => {
    const p = searchParams.get('panel');
    const allowed = new Set(
      DELIVERY_LEGACY_SCREENS_HIDDEN
        ? ['clients', 'promotions']
        : ['pedidos', 'clients', 'promotions'],
    );
    if (p === 'pedidos' && DELIVERY_LEGACY_SCREENS_HIDDEN) {
      setSearchParams((prev) => {
        const n = new URLSearchParams(prev);
        n.delete('panel');
        return n;
      }, { replace: true });
      return;
    }
    if (p !== null && p !== '' && !allowed.has(p)) {
      setSearchParams((prev) => {
        const n = new URLSearchParams(prev);
        n.delete('panel');
        return n;
      }, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const sectionTabActive = opsPanel;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const workerMode = window.localStorage.getItem('saas-worker-mode') === 'true';
    if (workerMode) {
      navigate('/saas/vertical/delivery/caja', { replace: true });
    }
  }, [navigate]);
  const sessionUserId = useMemo(() => {
    try {
      const raw = localStorage.getItem('vertial_session_user');
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { user_id?: string; id?: string; userId?: string; _id?: string };
      return parsed.user_id || parsed.id || parsed.userId || parsed._id || null;
    } catch {
      return null;
    }
  }, []);
  const authUserId = user?.user_id || user?.id || user?.userId || user?._id || sessionUserId || null;
  const nowMs = useLiveClock(30_000);
  const dataUserId = useMemo(
    () => resolveBusinessDataUserId(user, currentBusiness),
    [user, currentBusiness],
  );
  const sseToken = useMemo(() => {
    const headers = getAuthHeaders();
    const authHeader = headers.Authorization || headers.authorization;
    if (!authHeader) return null;
    return authHeader.replace(/^Bearer\s+/i, '').trim() || null;
  }, [user?.user_id]);
  const [data, setData] = useState<OpsCenterData | null>(null);
  const [loading, setLoading] = useState(true);
  const { focus: activationFocus, clearFocus: clearActivationFocus } = useActivationFocus();

  useEffect(() => {
    if (typeof window === 'undefined' || window.location.hash !== '#cocina') return;
    if (opsPanel !== 'operativa') return;
    const t = window.setTimeout(() => {
      document.getElementById('ops-kitchen-widget')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 150);
    return () => window.clearTimeout(t);
  }, [data, opsPanel]);

  useEffect(() => {
    if (activationFocus !== 'open-tpv') return;
    window.setTimeout(() => {
      scrollToActivationField('open-tpv', { focusInput: false });
    }, 500);
    clearActivationFocus();
  }, [activationFocus, clearActivationFocus]);
  const [filters, setFilters] = useState<OpsCenterFilters>(() => ({ date: localDateInputValue() }));
  const syncedTodayRef = useRef(false);

  useEffect(() => {
    if (syncedTodayRef.current) return;
    syncedTodayRef.current = true;
    const today = localDateInputValue();
    setFilters((f) => (f.date === today ? f : { ...f, date: today }));
  }, []);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [sseOk, setSseOk] = useState(false);
  const [lastUp, setLastUp] = useState<Date | null>(null);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  /** Un solo PDV activo: fijamos el filtro para que la vista y la API queden ancladas a esa tienda (p. ej. gerente con una sede). */
  const singleActivePdvId = useMemo(() => {
    const list = data?.pointsOfSale || [];
    const active = list.filter((p) => p.active !== false);
    return active.length === 1 ? active[0]._id : null;
  }, [data?.pointsOfSale]);

  useEffect(() => {
    if (!singleActivePdvId) return;
    setFilters((prev) => {
      if (prev.salesPointId === singleActivePdvId) return prev;
      return { ...prev, salesPointId: singleActivePdvId };
    });
  }, [singleActivePdvId]);

  const restoredOpsPdvSelectionRef = useRef(false);
  const persistBootRef = useRef(false);
  const prevPersistedSalesPointRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    restoredOpsPdvSelectionRef.current = false;
    persistBootRef.current = false;
    prevPersistedSalesPointRef.current = undefined;
  }, [dataUserId, currentBusiness?.business_id, currentBusiness?.id]);

  /** Persistir tienda elegida para que el TPV rápido abra esa caja sin paso intermedio. */
  useEffect(() => {
    const bid = String(currentBusiness?.business_id || currentBusiness?.id || '');
    if (!bid || !dataUserId) return;
    const id = filters.salesPointId?.trim() || null;
    const toStore = id;
    if (!persistBootRef.current) {
      persistBootRef.current = true;
      prevPersistedSalesPointRef.current = toStore;
      if (toStore) {
        writeDeliveryOpsSelectedPdvId(bid, dataUserId, toStore);
        notifyDeliveryActiveStoreChanged();
      }
      return;
    }
    if (prevPersistedSalesPointRef.current === toStore) return;
    prevPersistedSalesPointRef.current = toStore;
    writeDeliveryOpsSelectedPdvId(bid, dataUserId, toStore);
    notifyDeliveryActiveStoreChanged();
  }, [filters.salesPointId, currentBusiness?.business_id, currentBusiness?.id, dataUserId, data?.pointsOfSale]);

  useEffect(() => {
    if (!data?.pointsOfSale?.length || restoredOpsPdvSelectionRef.current) return;
    const activePdvs = data.pointsOfSale.filter((p) => p.active !== false);
    if (activePdvs.length <= 1) {
      restoredOpsPdvSelectionRef.current = true;
      return;
    }
    const bid = String(currentBusiness?.business_id || currentBusiness?.id || '');
    if (!bid || !dataUserId) {
      restoredOpsPdvSelectionRef.current = true;
      return;
    }
    const saved = readDeliveryOpsSelectedPdvId(bid, dataUserId);
    const pdvId = coerceSelectedPdvId(activePdvs, saved);
    if (pdvId) {
      setFilters((f) => (f.salesPointId === pdvId ? f : { ...f, salesPointId: pdvId }));
    }
    restoredOpsPdvSelectionRef.current = true;
  }, [data?.pointsOfSale, currentBusiness?.business_id, currentBusiness?.id, dataUserId]);

  /** Si el filtro apunta a un PDV que no está en esta empresa, corregirlo. */
  useEffect(() => {
    const list = data?.pointsOfSale?.filter((p) => p.active !== false) ?? [];
    if (list.length === 0) return;
    const current = filters.salesPointId?.trim();
    if (current && list.some((p) => p._id === current)) return;
    const bid = String(currentBusiness?.business_id || currentBusiness?.id || '');
    const saved = bid && dataUserId ? readDeliveryOpsSelectedPdvId(bid, dataUserId) : null;
    const pdvId = coerceSelectedPdvId(list, saved || activeStoreScope.activeSalesPointId);
    setFilters((f) => {
      const next = pdvId || undefined;
      if (f.salesPointId === next) return f;
      return { ...f, salesPointId: next };
    });
  }, [
    data?.pointsOfSale,
    filters.salesPointId,
    currentBusiness?.business_id,
    currentBusiness?.id,
    dataUserId,
    activeStoreScope.activeSalesPointId,
  ]);

  /** Selector global (Topbar) o sidebar: misma clave localStorage → alinear filtro Ops sin recargar. */
  useEffect(() => {
    const bid = String(currentBusiness?.business_id || currentBusiness?.id || '');
    const onStore = () => {
      if (!bid || !dataUserId) return;
      const list = data?.pointsOfSale;
      if (!list?.length) return;
      const saved = readDeliveryOpsSelectedPdvId(bid, dataUserId);
      const pdvId = coerceSelectedPdvId(
        list,
        saved || activeStoreScope.activeSalesPointId,
      );
      if (pdvId) {
        setFilters((f) => (f.salesPointId === pdvId ? f : { ...f, salesPointId: pdvId }));
      }
    };
    window.addEventListener(DELIVERY_ACTIVE_STORE_CHANGED, onStore);
    return () => window.removeEventListener(DELIVERY_ACTIVE_STORE_CHANGED, onStore);
  }, [
    currentBusiness?.business_id,
    currentBusiness?.id,
    dataUserId,
    data?.pointsOfSale,
    activeStoreScope.activeSalesPointId,
  ]);

  /** Cola nuevo+cocina+listo desde pedidos activos (alineado con la lista real, menos parpadeos que solo KPI). */
  const pedidosQueueCount = useMemo(() => {
    if (!data?.activeOrders) return 0;
    return data.activeOrders.filter((o) => o.status === 'nuevo' || o.status === 'cocina' || o.status === 'listo' || o.status === 'en_reparto').length;
  }, [data?.activeOrders]);

  const quickNav = useCallback(
    (path: string) => {
      if (path === '/saas/delivery') {
        if (DELIVERY_LEGACY_SCREENS_HIDDEN) {
          navFromOps('/saas/delivery-reparto');
          return;
        }
        if (opsPanel !== 'pedidos') setOpsPanel('pedidos');
        return;
      }
      if (path === '/saas/sala' && DELIVERY_LEGACY_SCREENS_HIDDEN) return;
      navFromOps(path);
    },
    [navFromOps, opsPanel, setOpsPanel],
  );

  const deliveryOpsTabs = useMemo(() => {
    const tabs = [
      { id: 'operativa', label: 'Operativa' },
      { id: 'pedidos', label: 'Pedidos', ...(pedidosQueueCount > 0 ? { count: pedidosQueueCount } : {}) },
      { id: 'clients', label: 'Clientes' },
      { id: 'promotions', label: 'Promociones' },
    ];
    return DELIVERY_LEGACY_SCREENS_HIDDEN ? tabs.filter((t) => t.id !== 'pedidos') : tabs;
  }, [pedidosQueueCount]);

  const load = useCallback(async () => {
    if (!authUserId) return;
    try {
      const effectiveFilters = { ...filters, date: filters.date || localDateInputValue() };
      const r = await getOpsCenterRequest(authUserId, effectiveFilters);
      setData(r); setLastUp(new Date());
    } catch (e) { console.error('ops-center error', e); } finally { setLoading(false); }
  }, [authUserId, filters]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (sseOk) {
      if (poll.current) {
        clearInterval(poll.current);
        poll.current = null;
      }
      return;
    }
    poll.current = setInterval(load, 30000);
    return () => { if (poll.current) clearInterval(poll.current); };
  }, [load, sseOk]);

  // Al cambiar de día local, volver a hoy si el panel seguía en el día anterior.
  useEffect(() => {
    const tick = setInterval(() => {
      const today = localDateInputValue();
      setFilters((f) => {
        if (f.date === today) return f;
        if (data?.date && f.date === data.date) {
          return { ...f, date: today };
        }
        return f;
      });
      if (data?.date && data.date !== today) {
        load();
      }
    }, 60_000);
    return () => clearInterval(tick);
  }, [data?.date, load]);

  const handlers = useMemo(() => ({
    'delivery:order_created': () => load(),
    'delivery:order_status_changed': () => load(),
    'delivery:incident_reported': () => load(),
    'delivery:incident_resolved': () => load(),
    tpv_session_updated: () => load(),
    delivery_payment_registered: () => load(),
    connected: () => setSseOk(true),
    disconnected: () => setSseOk(false),
    reconnecting: () => setSseOk(false),
  }), [load]);

  useSSE({
    userId: authUserId,
    token: sseToken,
    businessId: currentBusiness?.business_id || currentBusiness?.id || null,
    handlers,
    enabled: !!authUserId && !!sseToken,
  });

  const advance = useCallback(async (order: DeliveryOrder, s: DeliveryOrderStatus) => {
    if (!authUserId) return;
    try {
      await updateDeliveryOrderRequest(authUserId, {
        ...order, status: s,
        stageHistory: [...(order.stageHistory || []), { status: s, date: new Date().toISOString(), user: user.fullName || 'Sistema' }],
      });
      toast.success(`${order.orderNumber} → ${STATUS_CFG[s]?.label || s}`);
      load();
    } catch { toast.error('Error al actualizar'); }
  }, [authUserId, user, load]);

  const cfg = data?.config || null;

  const active = useMemo(() => {
    if (!data?.activeOrders) return [];
    return statusFilter ? data.activeOrders.filter(o => o.status === statusFilter) : data.activeOrders;
  }, [data?.activeOrders, statusFilter]);

  const subtitle = data?.date
    ? `Operativa del ${new Date(data.date + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}`
    : 'Cargando...';
  const dataAgeMs = lastUp ? Date.now() - lastUp.getTime() : Number.POSITIVE_INFINITY;
  const isPollingFresh = dataAgeMs < 45_000;
  const connectionText = sseOk
    ? 'En vivo'
    : isPollingFresh
      ? 'Conexion inestable (actualizando cada 30s)'
      : 'Sin conexion (reintentando)';
  const connectionDotClass = sseOk
    ? 'bg-green-500'
    : isPollingFresh
      ? 'bg-amber-500 animate-pulse'
      : 'bg-red-500 animate-pulse';

  /** Misma etiqueta que sidebar/topbar (sin parpadeo nombre centro → código PDV). */
  const effectiveOpsPdvLabel = useMemo(() => {
    const list =
      (data?.pointsOfSale?.length ? data.pointsOfSale : activeStoreScope.pointsOfSale) ?? [];
    const id =
      activeStoreScope.activeSalesPointId?.trim() ||
      filters.salesPointId?.trim() ||
      null;
    if (id && list.length) {
      const p = list.find((x) => x._id === id);
      if (p) return pointOfSaleDisplayLabel(p);
    }
    const global = activeStoreScope.displayLabelForActive?.trim();
    return global || null;
  }, [
    filters.salesPointId,
    data?.pointsOfSale,
    activeStoreScope.pointsOfSale,
    activeStoreScope.activeSalesPointId,
    activeStoreScope.displayLabelForActive,
  ]);

  const layoutSecondaryLine =
    opsPanel === 'pedidos'
      ? 'Pedidos e historial integrados en Ops'
      : opsPanel === 'clients'
        ? 'Clientes en Ops'
        : opsPanel === 'promotions'
          ? 'Promociones en Ops'
          : subtitle;

  const layoutSubtitle = effectiveOpsPdvLabel
    ? `${effectiveOpsPdvLabel} · ${layoutSecondaryLine}`
    : layoutSecondaryLine;

  return (
    <Layout title="Centro Operativo" subtitle={layoutSubtitle} noPadding>
      <div className="px-3 md:px-4 pt-1 pb-4 md:pb-5">
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 shadow-lg shadow-gray-200/40 dark:shadow-none flex flex-col overflow-hidden max-h-[calc(100dvh-8rem)] min-h-[260px]">
        <div className="shrink-0 px-3 py-2 border-b border-gray-200/90 dark:border-gray-700 bg-gradient-to-b from-gray-50 to-gray-50/90 dark:from-gray-900 dark:to-gray-950">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex items-center gap-1.5 shrink-0 text-[11px] font-semibold tabular-nums text-gray-500 dark:text-gray-400 border border-gray-200/80 dark:border-gray-600 rounded-md px-2 py-0.5 bg-white/60 dark:bg-gray-800/80">
              <div className={`w-2 h-2 rounded-full shrink-0 ${connectionDotClass}`} title={connectionText} />
              <span className="truncate max-w-[11rem] sm:max-w-none">
                {connectionText}
                {lastUp && ` · ${lastUp.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`}
              </span>
            </div>
            <span className="text-sm font-semibold tracking-tight text-gray-900 dark:text-gray-50 truncate">
              {effectiveOpsPdvLabel ? (
                <>
                  Viendo <span className="text-teal-700 dark:text-teal-400">{effectiveOpsPdvLabel}</span>
                  <span className="font-normal text-gray-600 dark:text-gray-400"> · delivery</span>
                </>
              ) : (
                <>Vista principal · delivery</>
              )}
            </span>
            <div className="flex-1 min-w-[4px]" />
            <button type="button" onClick={load} className="p-2 text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100 rounded-md hover:bg-white/80 dark:hover:bg-gray-800 border border-transparent hover:border-gray-200 dark:hover:border-gray-600 transition-colors shrink-0" title="Actualizar">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {opsPanel === 'pedidos' ? (
          <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
            <div className="shrink-0 px-2 pt-2 pb-1.5 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-950 [&_button]:py-2.5 [&_button]:px-4 [&_button]:text-sm [&>div]:rounded-lg [&>div]:border-gray-200 [&>div]:dark:border-gray-700">
              <Tabs tabs={deliveryOpsTabs} activeTab={sectionTabActive} onChange={onDeliveryOpsSectionTab} />
            </div>
            <div className="shrink-0 px-2 pt-2 pb-2 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-950">
              <QuickAccess
                cfg={cfg}
                kpis={data?.kpis || null}
                cashPend={cajaAlertBadge(data?.cashStatus)}
                incidents={data?.kpis?.byStatus?.incident || 0}
                onNavigate={quickNav}
                pedidosQueueCount={pedidosQueueCount}
                activationFocus={activationFocus}
              />
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 bg-gray-50/70 dark:bg-gray-900/35">
              <Delivery embedded onEmbeddedBack={() => setOpsPanel('operativa')} />
            </div>
          </div>
        ) : opsPanel === 'clients' ? (
          <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
            <div className="shrink-0 px-2 pt-2 pb-1.5 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-950 [&_button]:py-2.5 [&_button]:px-4 [&_button]:text-sm [&>div]:rounded-lg [&>div]:border-gray-200 [&>div]:dark:border-gray-700">
              <Tabs tabs={deliveryOpsTabs} activeTab={sectionTabActive} onChange={onDeliveryOpsSectionTab} />
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 bg-gray-50/70 dark:bg-gray-900/35">
              <ClientsPage embedDeliveryOps />
            </div>
          </div>
        ) : opsPanel === 'promotions' ? (
          <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
            <div className="shrink-0 px-2 pt-2 pb-1.5 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-950 [&_button]:py-2.5 [&_button]:px-4 [&_button]:text-sm [&>div]:rounded-lg [&>div]:border-gray-200 [&>div]:dark:border-gray-700">
              <Tabs tabs={deliveryOpsTabs} activeTab={sectionTabActive} onChange={onDeliveryOpsSectionTab} />
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 bg-gray-50/70 dark:bg-gray-900/35">
              <PromotionsPage embedDeliveryOps />
            </div>
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 pt-1 pb-3 space-y-2.5">

            <FiltersBar filters={filters} onChange={setFilters} config={cfg} pdvs={data?.pointsOfSale || []} sticky={false} />

            <div className="[&_button]:py-2.5 [&_button]:px-4 [&_button]:text-sm [&>div]:rounded-lg [&>div]:border-gray-200 [&>div]:dark:border-gray-700">
              <Tabs tabs={deliveryOpsTabs} activeTab={sectionTabActive} onChange={onDeliveryOpsSectionTab} />
            </div>

            {data?.alerts && data.alerts.length > 0 && (
              <Alerts
                alerts={data.alerts}
                nowMs={nowMs}
                opsDate={data?.date || filters.date || localDateInputValue()}
                activeOrders={active}
                cashStatus={data?.cashStatus}
                cfg={cfg}
              />
            )}

            {!opsAlertsCoverCash(data?.alerts ?? []) && (
              <CashStatusBanner cashStatus={data?.cashStatus} onNavigate={quickNav} />
            )}

            {data?.kpis && <Pipeline byStatus={data.kpis.byStatus} active={statusFilter} onFilter={setStatusFilter} />}

            <QuickAccess
              cfg={cfg}
              kpis={data?.kpis || null}
              cashPend={cajaAlertBadge(data?.cashStatus)}
              incidents={data?.kpis?.byStatus?.incident || 0}
              onNavigate={quickNav}
              pedidosQueueCount={pedidosQueueCount}
              activationFocus={activationFocus}
            />

            <Metrics kpis={data?.kpis || null} />

            {loading && !data ? (
              <div className="flex items-center justify-center py-20">
                <div className="animate-spin w-8 h-8 border-2 border-gray-300 border-t-gray-900 dark:border-gray-600 dark:border-t-gray-100 rounded-full" />
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {cfg?.hasKitchen !== false && (
                  <KitchenW
                    ks={data?.kitchenStatus || null}
                    orders={active}
                    onAdv={advance}
                    brandLabels={data?.brandLabels}
                    nowMs={nowMs}
                    cfg={cfg}
                  />
                )}
                {cfg?.hasAssemblyStation !== false && (
                  <AssemblyW orders={active} onAdv={advance} brandLabels={data?.brandLabels} nowMs={nowMs} />
                )}
                {(cfg?.hasOwnDelivery || cfg?.hasPlatformDelivery) && (
                  <RepartoW
                    orders={active}
                    cfg={cfg}
                    onAdv={advance}
                    brandLabels={data?.brandLabels}
                    nowMs={nowMs}
                  />
                )}
                <CashW cs={data?.cashStatus || null} onNavigate={quickNav} opsDate={data?.date || filters.date} nowMs={nowMs} />
                <IncidentsW orders={active} onNavigate={navFromOps} />
                {!DELIVERY_LEGACY_SCREENS_HIDDEN && cfg?.hasPhysicalTables && cfg.tableCount > 0 && (
                  <TablesW cfg={cfg} orders={active} />
                )}
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
              {data?.revenueByChannel && Object.keys(data.revenueByChannel).length > 0 && (
                <ChannelsW data={data.revenueByChannel} />
              )}
              {data?.revenueByBrand && Object.keys(data.revenueByBrand).length > 0 && (
                <RevenueBreakdownW
                  title="Facturación por marca (entregado)"
                  data={data.revenueByBrand}
                  labelForKey={(id) => brandDisplayName(id, data.brandLabels)}
                  barClass="bg-violet-500 dark:bg-violet-400"
                />
              )}
              {data?.revenueByCategory && Object.keys(data.revenueByCategory).length > 0 && (
                <RevenueBreakdownW
                  title="Bebidas y complementos (sin marca)"
                  data={data.revenueByCategory}
                  labelForKey={(key) => reportCategoryLabel(key)}
                  barClass="bg-amber-500 dark:bg-amber-400"
                />
              )}
            </div>
          </div>
        )}
      </div>
      </div>
    </Layout>
  );
}
