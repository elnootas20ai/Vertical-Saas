import { useState, useEffect, useMemo, useCallback, useRef, type MouseEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { useActiveStoreScope } from '../../context/ActiveStoreScopeContext';
import { StoreHoursStatusBanner } from '../../components/saas/StoreHoursStatusBanner';
import { resolveWorkerWorkCenter } from '../../lib/workerStoreHours';
import { resolveBusinessDataUserId } from '../../lib/tenantUserId';
import { isIosCustomerAccessOnlyApp } from '../../lib/appStoreCompliance';
import {
  DELIVERY_ACTIVE_STORE_CHANGED,
  DELIVERY_OPS_LIVE_ALL_FILTER,
  coerceSelectedPdvId,
  readDeliveryOpsSelectedPdvId,
  writeDeliveryOpsSelectedPdvId,
  readDeliveryOpsViewMode,
  writeDeliveryOpsViewMode,
  notifyDeliveryActiveStoreChanged,
  type DeliveryOpsViewMode,
} from '../../lib/deliveryOpsPdvSelection';
import { useSSE } from '../../hooks/useSSE';
import { DELIVERY_OPS_LIVE_EVENT } from '../../lib/deliveryOpsLive';
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
import { writeBillingSelection } from '../../lib/billingSelection';
import { formatAddonPriceShort } from '../../lib/planAddonCatalog';
import { getAuthHeaders } from '../../lib/authApi';
import { fetchDailySummary, type DailySummary } from '../../lib/clockinsApi';
import {
  getOpsCenterRequest,
  localDateInputValue,
  pointOfSaleDisplayLabel,
  dedupePointsOfSale,
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
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover';

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

function FiltersBar({
  filters,
  onChange,
  config,
  pdvs,
  viewMode,
  onViewModeChange,
  sticky = false,
}: {
  filters: OpsCenterFilters;
  onChange: (f: OpsCenterFilters) => void;
  config: DeliveryConfig | null;
  pdvs: PointOfSale[];
  viewMode: DeliveryOpsViewMode;
  onViewModeChange: (mode: DeliveryOpsViewMode, salesPointId?: string) => void;
  /** Solo útil fuera de paneles con scroll interno; dentro de Ops evita huecos raros */
  sticky?: boolean;
}) {
  const nav = useNavigate();
  const { user } = useAuth();
  const pointOfSaleAccess = usePointOfSaleAccess(pdvs.length);

  const goToPdvBilling = () => {
    if (isIosCustomerAccessOnlyApp()) {
      toast.info('En iOS no se amplía el plan de PDV.');
      return;
    }
    const resolvedUserId = user?.id || (user as { user_id?: string } | null)?.user_id || '';
    if (resolvedUserId) {
      writeBillingSelection(resolvedUserId, {
        selectedPlanId: 'pro',
        billingMode: 'monthly',
        requestedAddon: pointOfSaleAccess.needsPointOfSaleAddon ? 'extra_pdv' : null,
      });
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
      ? `Tu plan PRO incluye ${pointOfSaleAccess.includedPointOfSaleLimit} PDV. Ampliación: ${formatAddonPriceShort('extra_pdv')}.`
      : `Tu plan ${pointOfSaleAccess.planLabel} incluye ${pointOfSaleAccess.includedPointOfSaleLimit} PDV. Sube a PRO para crear más.`;

  const addPdvButtonClass =
    'px-3 py-2 rounded-lg text-sm font-semibold border transition-colors inline-flex items-center gap-1.5 shrink-0 ' +
    (pointOfSaleAccess.canCreatePointOfSale
      ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/30'
      : 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 text-[var(--v-blue,#2563eb)] dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/30');

  const sel = 'w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-gray-900 dark:focus:border-gray-400 outline-none';
  const today = localDateInputValue();
  const selectedDate = filters.date || today;
  const isToday = selectedDate === today;
  const activeFilterCount = [
    filters.channel,
    filters.timeSlot,
    !isToday ? selectedDate : '',
  ].filter(Boolean).length;

  const filterSummary = [
    filters.channel ? (CH_LABELS[filters.channel] || filters.channel) : 'Todos los canales',
    filters.timeSlot
      ? (config?.activeTimeSlots?.find((s) => s.id === filters.timeSlot)?.label || filters.timeSlot)
      : 'Todo el día',
    isToday
      ? 'Hoy'
      : new Date(`${selectedDate}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }),
  ].join(' · ');

  const wrapClass = sticky ? 'sticky top-0 z-10' : '';
  const selectValue =
    viewMode === 'live_all'
      ? DELIVERY_OPS_LIVE_ALL_FILTER
      : filters.salesPointId && pdvs.some((p) => p._id === filters.salesPointId)
        ? filters.salesPointId
        : '';

  return (
    <div className={wrapClass}>
      <div className="bg-white/95 dark:bg-gray-900/90 backdrop-blur-sm border border-gray-200/90 dark:border-gray-700 rounded-xl px-3 py-2 shadow-sm flex flex-wrap gap-2 items-center">
        {pdvs.length > 1 ? (
          <select
            className="px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-gray-900 dark:focus:border-gray-400 outline-none min-w-[12rem]"
            value={selectValue}
            onChange={(e) => {
              const v = e.target.value;
              if (v === DELIVERY_OPS_LIVE_ALL_FILTER) {
                onViewModeChange('live_all');
                return;
              }
              onViewModeChange('single', v || undefined);
            }}
          >
            <option value={DELIVERY_OPS_LIVE_ALL_FILTER}>En directo · todas</option>
            {pdvs.map((p) => (
              <option key={p._id} value={p._id}>
                {pointOfSaleDisplayLabel(p)}
              </option>
            ))}
          </select>
        ) : pdvs.length === 1 ? (
          <div className="flex flex-wrap items-center gap-2">
            <div
              className="px-3 py-2 border border-gray-900/25 dark:border-gray-400/30 rounded-lg text-sm flex items-center gap-2 bg-gray-50 dark:bg-gray-800/90 font-medium text-gray-900 dark:text-gray-100"
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

        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="px-2.5 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700/80 transition-colors shrink-0"
              title={filterSummary}
            >
              <Filter className="w-3.5 h-3.5 shrink-0" />
              Filtro
              {activeFilterCount > 0 && (
                <span className="px-1 py-0.5 min-w-[1.125rem] text-center bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-full text-[10px] font-bold leading-none">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 p-3 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Canal</label>
                <select className={sel} value={filters.channel || ''} onChange={(e) => onChange({ ...filters, channel: e.target.value || undefined })}>
                  <option value="">Todos los canales</option>
                  {(config?.activeChannels || []).map((ch) => (
                    <option key={ch} value={ch}>{CH_LABELS[ch] || ch}</option>
                  ))}
                </select>
              </div>
              {config?.activeTimeSlots && config.activeTimeSlots.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Franja horaria</label>
                  <select className={sel} value={filters.timeSlot || ''} onChange={(e) => onChange({ ...filters, timeSlot: e.target.value || undefined })}>
                    <option value="">Todo el día</option>
                    {config.activeTimeSlots.map((s) => (
                      <option key={s.id} value={s.id}>{s.label} ({s.start}–{s.end})</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Fecha</label>
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
              </div>
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={() => onChange({
                    date: today,
                    ...(viewMode === 'single' && filters.salesPointId
                      ? { salesPointId: filters.salesPointId }
                      : {}),
                  })}
                  className="w-full px-2.5 py-2 text-xs font-semibold text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 flex items-center justify-center gap-1 border-t border-gray-100 dark:border-gray-800 pt-3"
                >
                  <X className="w-3.5 h-3.5" /> Limpiar filtros
                </button>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

/* ── Live multi-PDV column ───────────────────────────────────────────────── */

function foodCountsOf(data: OpsCenterData | null): { pizza: number; burger: number; taco: number } {
  const f = data?.foodFamilyCounts;
  return {
    pizza: Number(f?.pizza || 0),
    burger: Number(f?.burger || 0),
    taco: Number(f?.taco || 0),
  };
}

function brandRowsOf(
  data: OpsCenterData | null,
  limit = 4,
): Array<{ id: string; label: string; amount: number }> {
  const map = data?.revenueByBrand || {};
  const labels = data?.brandLabels || {};
  return Object.entries(map)
    .map(([id, amount]) => ({
      id,
      label: brandDisplayName(id, labels),
      amount: Number(amount) || 0,
    }))
    .filter((r) => r.amount > 0.009)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
}

function OpsPdvLiveColumn({
  pdv,
  data,
  onFocusStore,
}: {
  pdv: PointOfSale;
  data: OpsCenterData | null;
  onFocusStore: (pdvId: string) => void;
}) {
  const byStatus = data?.kpis?.byStatus || {};
  const phases = [
    { key: 'nuevo' as const, short: 'Nuevos' },
    { key: 'cocina' as const, short: 'Cocina' },
    { key: 'listo' as const, short: 'Montaje' },
    { key: 'en_reparto' as const, short: 'Reparto' },
    { key: 'incident' as const, short: 'Incid.' },
  ];
  const openCash = data?.cashStatus?.openTpvSessions?.length || 0;
  const pendingClose = data?.cashStatus?.pendingClose || 0;
  const revenue = data?.kpis?.revenue ?? 0;
  const orders = data?.kpis?.totalOrders ?? 0;
  const food = foodCountsOf(data);
  const brands = brandRowsOf(data, 3);
  const inFlight =
    (byStatus.nuevo || 0)
    + (byStatus.cocina || 0)
    + (byStatus.listo || 0)
    + (byStatus.en_reparto || 0);
  const label = pointOfSaleDisplayLabel(pdv);
  const loading = !data;
  const hasFood = food.pizza + food.burger + food.taco > 0;

  return (
    <div className="relative rounded-2xl border border-gray-200/90 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm hover:shadow-md hover:border-teal-300/70 dark:hover:border-teal-700/60 transition-all overflow-hidden flex flex-col min-h-0">
      <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-teal-500 to-cyan-500" aria-hidden />
      <div className="pl-3.5 pr-3 pt-3 pb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-teal-700/80 dark:text-teal-400/90 mb-0.5">
            Tienda
          </p>
          <p className="text-base font-bold text-gray-900 dark:text-gray-50 truncate leading-tight">
            {label}
          </p>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500 dark:text-gray-400 tabular-nums">
            <span className="font-semibold text-gray-800 dark:text-gray-200">{orders} pedidos</span>
            <span className="text-gray-300 dark:text-gray-600">·</span>
            <span className="font-semibold text-emerald-700 dark:text-emerald-400">{eur(revenue)} €</span>
            {inFlight > 0 && (
              <>
                <span className="text-gray-300 dark:text-gray-600">·</span>
                <span className="font-semibold text-amber-700 dark:text-amber-400">{inFlight} en curso</span>
              </>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onFocusStore(pdv._id)}
          className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-teal-200 dark:border-teal-800 bg-teal-50/80 dark:bg-teal-950/40 px-2.5 py-1.5 text-[11px] font-bold text-teal-800 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-900/50 transition-colors"
        >
          Ver detalle
        </button>
      </div>

      <div className="px-3 pb-2 space-y-2">
        {loading ? (
          <div className="h-[4.5rem] rounded-xl bg-gray-50 dark:bg-gray-800/80 animate-pulse" />
        ) : (
          <>
            <div className="grid grid-cols-5 gap-1.5">
              {phases.map(({ key, short }) => {
                const c = STATUS_CFG[key];
                if (!c) return null;
                const n = byStatus[key] || 0;
                const hot = n > 0;
                return (
                  <div
                    key={key}
                    className={`rounded-xl border px-1 py-2 text-center transition-colors ${
                      hot
                        ? `${c.bg} ${c.border}`
                        : 'bg-gray-50/80 dark:bg-gray-800/50 border-gray-100 dark:border-gray-800'
                    }`}
                    title={c.label}
                  >
                    <div className={`text-lg font-black tabular-nums leading-none ${hot ? c.text : 'text-gray-400 dark:text-gray-500'}`}>
                      {n}
                    </div>
                    <div className={`text-[9px] font-semibold mt-1 truncate ${hot ? c.text : 'text-gray-400 dark:text-gray-500'} opacity-90`}>
                      {short}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              {([
                { key: 'pizza', label: 'Pizzas', n: food.pizza, tone: 'text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border-rose-200/80 dark:border-rose-900' },
                { key: 'burger', label: 'Burgers', n: food.burger, tone: 'text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border-amber-200/80 dark:border-amber-900' },
                { key: 'taco', label: 'Tacos', n: food.taco, tone: 'text-lime-800 dark:text-lime-300 bg-lime-50 dark:bg-lime-950/40 border-lime-200/80 dark:border-lime-900' },
              ] as const).map((row) => (
                <div
                  key={row.key}
                  className={`rounded-xl border px-1.5 py-1.5 text-center ${row.n > 0 ? row.tone : 'bg-gray-50/80 dark:bg-gray-800/40 border-gray-100 dark:border-gray-800 text-gray-400'}`}
                >
                  <div className="text-base font-black tabular-nums leading-none">{row.n}</div>
                  <div className="text-[9px] font-semibold mt-0.5 opacity-90">{row.label}</div>
                </div>
              ))}
            </div>

            {brands.length > 0 ? (
              <div className="rounded-xl border border-violet-100 dark:border-violet-900/50 bg-violet-50/40 dark:bg-violet-950/20 px-2.5 py-2 space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-wide text-violet-700/80 dark:text-violet-300/90">
                  Por marca
                </p>
                {brands.map((b) => (
                  <div key={b.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate font-semibold text-gray-800 dark:text-gray-200">{b.label}</span>
                    <span className="tabular-nums font-bold text-violet-700 dark:text-violet-300 shrink-0">
                      {eur(b.amount)} €
                    </span>
                  </div>
                ))}
              </div>
            ) : !hasFood ? (
              <p className="text-[11px] text-center text-gray-400 dark:text-gray-500 py-1">
                Sin comida ni marcas aún hoy
              </p>
            ) : null}
          </>
        )}
      </div>

      <div className="mt-auto px-3 pb-3 pt-1 flex flex-wrap items-center gap-1.5 text-[11px] border-t border-gray-100/90 dark:border-gray-800/90 bg-gray-50/40 dark:bg-gray-950/30">
        {openCash > 0 ? (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 font-semibold border border-emerald-200/80 dark:border-emerald-800">
            <Wallet className="w-3 h-3" />
            {openCash} caja abierta{openCash !== 1 ? 's' : ''}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white dark:bg-gray-900 text-gray-500 font-medium border border-gray-200 dark:border-gray-700">
            Sin caja
          </span>
        )}
        {pendingClose > 0 && (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 font-bold border border-red-200 dark:border-red-800">
            {pendingClose} cierre pend.
          </span>
        )}
      </div>
    </div>
  );
}

function OpsFoodAndBrandsStrip({
  food,
  brands,
  title = 'Comida y marcas',
}: {
  food: { pizza: number; burger: number; taco: number };
  brands: Array<{ id: string; label: string; amount: number }>;
  title?: string;
}) {
  const hasFood = food.pizza + food.burger + food.taco > 0;
  if (!hasFood && brands.length === 0) return null;
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3.5 shadow-sm">
      <h3 className="text-xs font-bold mb-2.5 uppercase tracking-wide text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
        <Package className="w-4 h-4 opacity-80" /> {title}
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="grid grid-cols-3 gap-2">
          {([
            { label: 'Pizzas', n: food.pizza, cls: 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300' },
            { label: 'Burgers', n: food.burger, cls: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300' },
            { label: 'Tacos', n: food.taco, cls: 'border-lime-200 bg-lime-50 text-lime-900 dark:border-lime-900 dark:bg-lime-950/40 dark:text-lime-300' },
          ]).map((row) => (
            <div key={row.label} className={`rounded-xl border px-2 py-2.5 text-center ${row.cls}`}>
              <div className="text-xl font-black tabular-nums leading-none">{row.n}</div>
              <div className="text-[10px] font-bold mt-1 opacity-90">{row.label}</div>
            </div>
          ))}
        </div>
        <div className="space-y-1.5 min-h-[4.5rem]">
          {brands.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4">Sin € por marca aún (hace falta cobrado/entregado)</p>
          ) : (
            brands.map((b) => (
              <div
                key={b.id}
                className="flex items-center justify-between gap-2 rounded-lg bg-violet-50/70 dark:bg-violet-950/30 border border-violet-100 dark:border-violet-900/40 px-2.5 py-1.5"
              >
                <span className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">{b.label}</span>
                <span className="text-xs font-bold tabular-nums text-violet-700 dark:text-violet-300 shrink-0">
                  {eur(b.amount)} €
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function aggregateLiveOpsKpis(rows: OpsCenterData[]): OpsCenterData['kpis'] | null {
  if (!rows.length) return null;
  const byStatus: Record<string, number> = {
    nuevo: 0, cocina: 0, listo: 0, en_reparto: 0, entregado: 0, cancelled: 0, incident: 0,
  };
  let revenue = 0;
  let totalOrders = 0;
  let deliveredOnTime = 0;
  let deliveredLate = 0;
  let prepSum = 0;
  let prepN = 0;
  let delSum = 0;
  let delN = 0;
  let ticketDenom = 0;
  for (const r of rows) {
    const k = r.kpis;
    if (!k) continue;
    totalOrders += Number(k.totalOrders || 0);
    revenue += Number(k.revenue || 0);
    deliveredOnTime += Number(k.deliveredOnTime || 0);
    deliveredLate += Number(k.deliveredLate || 0);
    for (const key of Object.keys(byStatus)) {
      byStatus[key] += Number((k.byStatus as Record<string, number> | undefined)?.[key] || 0);
    }
    if (Number(k.avgPrepTimeMinutes) > 0) {
      prepSum += Number(k.avgPrepTimeMinutes);
      prepN += 1;
    }
    if (Number(k.avgDeliveryTimeMinutes) > 0) {
      delSum += Number(k.avgDeliveryTimeMinutes);
      delN += 1;
    }
    // Reconstruir nº de pedidos que alimentan el ticket (cobrados/entregados).
    const avg = Number(k.averageTicket || 0);
    const rev = Number(k.revenue || 0);
    if (avg > 0.009 && rev > 0) {
      ticketDenom += Math.max(1, Math.round(rev / avg));
    } else if ((k.byStatus?.entregado || 0) > 0) {
      ticketDenom += Number(k.byStatus.entregado);
    }
  }
  const timed = deliveredOnTime + deliveredLate;
  return {
    totalOrders,
    byStatus: byStatus as OpsCenterData['kpis']['byStatus'],
    revenue: Math.round(revenue * 100) / 100,
    averageTicket: ticketDenom > 0 ? Math.round((revenue / ticketDenom) * 100) / 100 : 0,
    avgPrepTimeMinutes: prepN > 0 ? Math.round((prepSum / prepN) * 10) / 10 : 0,
    avgDeliveryTimeMinutes: delN > 0 ? Math.round((delSum / delN) * 10) / 10 : 0,
    deliveredOnTime,
    deliveredLate,
    onTimePercentage: timed > 0 ? Math.round((deliveredOnTime / timed) * 1000) / 10 : 100,
  };
}

function aggregateLiveFoodFamilyCounts(
  rows: OpsCenterData[],
): OpsCenterData['foodFamilyCounts'] {
  const out = { pizza: 0, burger: 0, taco: 0 };
  for (const r of rows) {
    const f = r.foodFamilyCounts;
    out.pizza += Number(f?.pizza || 0);
    out.burger += Number(f?.burger || 0);
    out.taco += Number(f?.taco || 0);
  }
  return out;
}

function aggregateLiveRevenueByBrand(rows: OpsCenterData[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    for (const [id, amount] of Object.entries(r.revenueByBrand || {})) {
      out[id] = Math.round(((out[id] || 0) + (Number(amount) || 0)) * 100) / 100;
    }
  }
  return out;
}

function mergeLiveBrandLabels(rows: OpsCenterData[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of rows) {
    for (const [id, label] of Object.entries(r.brandLabels || {})) {
      if (!out[id] && label) out[id] = label;
    }
  }
  return out;
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
      return 'Ver cierre';
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
  const accent = crit ? 'var(--v-rose,#e11d48)' : 'var(--v-amber,#d97706)';
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
    <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="h-1 w-full" style={{ background: accent }} />
      <div className="flex w-full items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={() => setExp((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
        >
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
            style={{
              background: crit ? 'rgba(225,29,72,0.12)' : 'rgba(217,119,6,0.14)',
              color: accent,
            }}
          >
            <Bell className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold leading-tight text-slate-900 dark:text-slate-100">
              {vis.length} alerta{vis.length !== 1 ? 's' : ''} pendiente{vis.length !== 1 ? 's' : ''}
            </p>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {exp ? 'Toca para ocultar detalle' : `Operativa · ${dayLabel}${opsDate !== todayKey ? ' (día seleccionado)' : ''}`}
            </p>
          </div>
        </button>
        <button
          type="button"
          onClick={() => setExp((v) => !v)}
          className="shrink-0 rounded-xl bg-[var(--v-blue,#2563eb)] px-3 py-1.5 text-xs font-semibold text-white shadow-sm shadow-blue-600/20 hover:bg-[#1d4ed8]"
        >
          {exp ? 'Ocultar' : 'Ver alertas'}
        </button>
        <button
          type="button"
          onClick={dismissBanner}
          className="shrink-0 rounded-xl p-2 text-slate-400 transition hover:bg-slate-50 hover:text-slate-700 dark:hover:bg-slate-900 dark:hover:text-slate-200"
          title="Quitar aviso"
          aria-label="Quitar aviso de alertas"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {exp && (
        <div className="space-y-1.5 border-t border-slate-100 px-3 pb-3 pt-2 dark:border-slate-800">
          {vis.map((a) => {
            const I = ICONS[a.type] || AlertTriangle;
            const rowCrit = a.severity === 'critical';
            return (
              <div
                key={a.id}
                className="flex items-start gap-2.5 rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 dark:border-slate-800 dark:bg-slate-900/50"
              >
                <span
                  className="mt-1 h-8 w-1 shrink-0 rounded-full"
                  style={{ background: rowCrit ? 'var(--v-rose,#e11d48)' : 'var(--v-amber,#d97706)' }}
                />
                <I
                  className="mt-0.5 h-4 w-4 shrink-0"
                  style={{ color: rowCrit ? 'var(--v-rose,#e11d48)' : 'var(--v-amber,#d97706)' }}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{a.title}</p>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    {a.message}
                    {a.createdAt && (
                      <span className="text-slate-400 dark:text-slate-500">
                        {' '}
                        · lleva {formatElapsedFromIso(a.createdAt, nowMs)}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {opsAlertActionLabel(a) && (
                    <button
                      type="button"
                      onClick={() => handleOpsAlertAction(a, nav, activeOrders)}
                      className="rounded-xl px-2.5 py-1.5 text-xs font-semibold text-[var(--v-blue,#2563eb)] transition hover:bg-blue-50 dark:hover:bg-blue-950/30"
                    >
                      {opsAlertActionLabel(a)}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setHide((p) => new Set(p).add(a.id))}
                    className="rounded-lg p-1 text-slate-400 transition hover:text-slate-600 dark:hover:text-slate-300"
                    title="Quitar esta alerta"
                  >
                    <X className="h-3.5 w-3.5" />
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
    <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="h-1 w-full bg-[var(--v-amber,#d97706)]" />
      <button
        type="button"
        onClick={() => onNavigate('/saas/vertical/delivery/caja')}
        className="w-full rounded-2xl px-4 py-3 pr-12 text-left transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-900/50"
      >
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[rgba(217,119,6,0.14)]">
            <Banknote className="h-5 w-5 text-[var(--v-amber,#d97706)]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-slate-900 dark:text-slate-100">Panel de caja</p>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {openCount > 0 ? `${openCount} caja${openCount !== 1 ? 's' : ''} abierta${openCount !== 1 ? 's' : ''}` : 'Sin caja abierta'}
              {pendingValidation > 0 ? ` · ${pendingValidation} cierre${pendingValidation !== 1 ? 's' : ''} por validar` : ''}
              {pendingClose > 0 ? ` · ${pendingClose} sin cerrar (+14h)` : ''}
              {discrepancy >= 20 ? ` · descuadre hoy ${discrepancy.toFixed(2)}€` : ''}
            </p>
          </div>
          <span className="mt-1 shrink-0 text-xs font-semibold text-[var(--v-blue,#2563eb)]">Abrir →</span>
        </div>
      </button>
      <button
        type="button"
        onClick={dismiss}
        className="absolute right-2.5 top-3.5 rounded-xl p-2 text-slate-400 transition hover:bg-slate-50 hover:text-slate-700 dark:hover:bg-slate-900 dark:hover:text-slate-200"
        title="Quitar aviso"
        aria-label="Quitar aviso de caja"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function cajaAlertBadge(cashStatus: OpsCenterData['cashStatus'] | undefined): number {
  if (!cashStatus) return 0;
  return (cashStatus.pendingClose || 0) + (cashStatus.pendingValidation || 0);
}

/* ── Quick Access ─────────────────────────────────────────────────────────── */

function QuickAccess({ cfg, kpis, cashPend, incidents, onNavigate, activationFocus }: {
  cfg: DeliveryConfig | null; kpis: OpsCenterData['kpis'] | null; cashPend: number; incidents: number;
  onNavigate: (path: string) => void;
  activationFocus?: string | null;
}) {
  type QItem = { l: string; i: typeof Activity; r: string; b: number | null; bc?: string; v: boolean; highlight?: boolean };
  const items: QItem[] = [
    { l: 'TPV rápido', i: Zap, r: '/saas/vertical/delivery/tpv', b: null, v: true },
    { l: 'Caja', i: Banknote, r: '/saas/vertical/delivery/caja', b: cashPend > 0 ? cashPend : null, bc: 'bg-red-500', v: true, highlight: cashPend > 0 },
    { l: 'Cocina', i: ChefHat, r: '/saas/delivery-kitchen', b: kpis?.byStatus.cocina ?? null, v: cfg?.hasKitchen !== false },
    { l: 'Montaje', i: ClipboardCheck, r: '/saas/delivery-montaje', b: kpis?.byStatus.listo ?? null, v: cfg?.hasAssemblyStation !== false },
    { l: 'Reparto', i: Truck, r: '/saas/delivery-reparto', b: null, v: (cfg?.hasOwnDelivery || cfg?.hasPlatformDelivery) === true },
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

function Metrics({
  kpis,
  clockSummary,
  title = 'Métricas operativas',
  hint,
}: {
  kpis: OpsCenterData['kpis'] | null;
  clockSummary?: DailySummary | null;
  title?: string;
  hint?: string | null;
}) {
  if (!kpis) return null;
  const hasTimedDeliveries = (Number(kpis.deliveredOnTime) || 0) + (Number(kpis.deliveredLate) || 0) > 0;
  const hasPrep = Number(kpis.avgPrepTimeMinutes) > 0;
  const hasDeliveryAvg = Number(kpis.avgDeliveryTimeMinutes) > 0;
  const hasTicket = Number(kpis.averageTicket) > 0 || Number(kpis.revenue) > 0;
  const clockScored =
    (Number(clockSummary?.onTime) || 0) +
    (Number(clockSummary?.earlyEntry) || 0) +
    (Number(clockSummary?.late) || 0);
  const clockPct =
    clockSummary?.onTimePercentage != null
      ? Number(clockSummary.onTimePercentage)
      : clockScored > 0
        ? Math.round(
            (((Number(clockSummary?.onTime) || 0) + (Number(clockSummary?.earlyEntry) || 0)) / clockScored) * 100,
          )
        : null;
  const hasClockPunctuality = clockPct != null;
  const avgLate = Number(clockSummary?.avgLateMinutes) || 0;
  const avgEntryDelay = Number(clockSummary?.avgEntryDelayMinutes) || 0;
  const hasLateAvg = hasClockPunctuality && (avgLate > 0 || Number(clockSummary?.late) > 0);
  const hasEntryDelayAvg = hasClockPunctuality && clockScored > 0;
  const cards: Array<{
    l: string;
    v: string;
    i: typeof Euro;
    c: string;
    tip?: string;
    sub?: string;
  }> = [
    { l: 'Facturación', v: `${eur(kpis.revenue)} €`, i: Euro, c: 'text-emerald-600 dark:text-emerald-400' },
    { l: 'Pedidos', v: String(kpis.totalOrders), i: ShoppingBag, c: 'text-blue-600 dark:text-blue-400' },
    {
      l: 'Ticket medio',
      v: hasTicket ? `${eur(kpis.averageTicket)} €` : '—',
      i: Receipt,
      c: 'text-violet-600 dark:text-violet-400',
      tip: 'Media de pedidos cobrados o entregados',
    },
    {
      l: 'Montaje media',
      v: hasPrep ? `${kpis.avgPrepTimeMinutes} min` : '—',
      i: Timer,
      c: 'text-orange-600 dark:text-orange-400',
      tip: 'Media de montaje: desde que entra el pedido hasta listo para salir',
    },
    {
      l: 'Reparto media',
      v: hasDeliveryAvg ? `${kpis.avgDeliveryTimeMinutes} min` : '—',
      i: Truck,
      c: 'text-cyan-600 dark:text-cyan-400',
      tip: 'Ida estimada: (salida → vuelta al local) ÷ 2. No se marca la entrega en puerta',
    },
    {
      l: 'Puntualidad',
      v: hasClockPunctuality ? `${clockPct}%` : '—',
      i: Users,
      c: hasClockPunctuality
        ? (clockPct! >= 80 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400')
        : 'text-gray-400 dark:text-gray-500',
      tip: 'Fichajes a tiempo vs horario de turno (≥5 min = tarde). Incluye llegadas anticipadas',
      sub: hasClockPunctuality
        ? `${(Number(clockSummary?.onTime) || 0) + (Number(clockSummary?.earlyEntry) || 0)}/${clockScored} a tiempo`
        : undefined,
    },
    {
      l: 'Retraso media',
      v: hasLateAvg ? `${avgLate} min` : hasEntryDelayAvg ? `${avgEntryDelay} min` : '—',
      i: Clock,
      c: hasLateAvg
        ? 'text-amber-600 dark:text-amber-400'
        : hasEntryDelayAvg
          ? 'text-gray-600 dark:text-gray-300'
          : 'text-gray-400 dark:text-gray-500',
      tip: hasLateAvg
        ? `Media solo entre quien llegó tarde (${Number(clockSummary?.late) || 0}). Media de todas las entradas: ${avgEntryDelay} min`
        : 'Media de retraso en la entrada (min ≥ 0) respecto al inicio de turno',
    },
    {
      l: 'Pedidos a tiempo',
      v: hasTimedDeliveries ? `${kpis.onTimePercentage}%` : '—',
      i: CheckCircle2,
      c: hasTimedDeliveries
        ? (kpis.onTimePercentage >= 80 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400')
        : 'text-gray-400 dark:text-gray-500',
      tip: 'Entregas a tiempo vs umbral de retraso del pedido (hace falta al menos 1 entregado)',
    },
  ];
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3.5 shadow-sm">
      <div className="mb-2.5 flex items-end justify-between gap-2">
        <h3 className="text-xs font-bold flex items-center gap-1.5 uppercase tracking-wide text-gray-500 dark:text-gray-400">
          <Activity className="w-4 h-4 opacity-80" /> {title}
        </h3>
        {hint ? (
          <span className="text-[10px] font-semibold text-teal-700 dark:text-teal-400 tabular-nums shrink-0">
            {hint}
          </span>
        ) : null}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-4 gap-2.5">
        {cards.map(c => (
          <div key={c.l} className="text-center py-0.5 rounded-lg bg-gray-50/70 dark:bg-gray-900/40 px-1" title={c.tip}>
            <c.i className={`w-[18px] h-[18px] mx-auto mb-0.5 ${c.c}`} />
            <p className={`text-lg font-bold tabular-nums ${c.c}`}>{c.v}</p>
            <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400 mt-0.5 leading-tight">{c.l}</p>
            {c.sub ? (
              <p className="text-[9px] text-gray-400 dark:text-gray-500 mt-0.5 tabular-nums leading-tight">{c.sub}</p>
            ) : null}
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
            <button onClick={() => onAdv(o, 'entregado')} className="px-3 py-1.5 bg-[var(--v-blue,#2563eb)] hover:bg-[#1d4ed8] text-white rounded-lg text-xs font-semibold shrink-0">Completado</button>
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
          <p className="text-xs text-gray-500 mt-0.5">Dinero en cajón (fondo + cobros)</p>
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
              onClick={() => onNavigate('/saas/delivery-reparto')}
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
  barClass = 'bg-[var(--v-blue,#2563eb)] dark:bg-blue-400',
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

export function DeliveryOpsCenter() {
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const activeStoreScope = useActiveStoreScope();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    const panel = searchParams.get('panel')?.trim();
    if (panel === 'clients') {
      navigate('/saas/crm/clientes?tab=clients', { replace: true });
      return;
    }
    if (panel === 'promotions') {
      navigate('/saas/promotions', { replace: true });
      return;
    }
    if (panel && panel !== 'operativa') {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete('panel');
        return next;
      }, { replace: true });
    }
  }, [searchParams, navigate, setSearchParams]);

  const navFromOps = useCallback((path: string) => {
    navigate(path, { state: { returnToOps: true } });
  }, [navigate]);

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
  const [liveByPdv, setLiveByPdv] = useState<Record<string, OpsCenterData>>({});
  const [loading, setLoading] = useState(true);
  const [clockSummary, setClockSummary] = useState<DailySummary | null>(null);
  const { focus: activationFocus, clearFocus: clearActivationFocus } = useActivationFocus();

  useEffect(() => {
    if (typeof window === 'undefined' || window.location.hash !== '#cocina') return;
    const panel = searchParams.get('panel')?.trim();
    if (panel && panel !== 'operativa') return;
    const t = window.setTimeout(() => {
      document.getElementById('ops-kitchen-widget')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 150);
    return () => window.clearTimeout(t);
  }, [data, searchParams]);

  useEffect(() => {
    if (activationFocus !== 'open-tpv') return;
    window.setTimeout(() => {
      scrollToActivationField('open-tpv', { focusInput: false });
    }, 500);
    clearActivationFocus();
  }, [activationFocus, clearActivationFocus]);
  const [filters, setFilters] = useState<OpsCenterFilters>(() => ({ date: localDateInputValue() }));
  const [opsViewMode, setOpsViewMode] = useState<DeliveryOpsViewMode>('single');
  const syncedTodayRef = useRef(false);

  useEffect(() => {
    if (syncedTodayRef.current) return;
    syncedTodayRef.current = true;
    const today = localDateInputValue();
    setFilters((f) => (f.date === today ? f : { ...f, date: today }));
  }, []);

  /** Restaurar modo monitor (solo Ops) al cambiar de empresa. */
  useEffect(() => {
    const bid = String(currentBusiness?.business_id || currentBusiness?.id || '');
    if (!bid || !dataUserId) {
      setOpsViewMode('single');
      return;
    }
    setOpsViewMode(readDeliveryOpsViewMode(bid, dataUserId));
  }, [dataUserId, currentBusiness?.business_id, currentBusiness?.id]);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [sseOk, setSseOk] = useState(false);
  const [lastUp, setLastUp] = useState<Date | null>(null);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);
  const loadSeqRef = useRef(0);

  /** PDV visibles en Ops: scope global (activos + todos) y luego respuesta API. */
  const opsPdvs = useMemo(() => {
    const scopePdvs = dedupePointsOfSale([
      ...(activeStoreScope.pointsOfSale ?? []),
      ...(activeStoreScope.allPointsOfSale ?? []),
    ]).filter((p) => p.active !== false);
    if (scopePdvs.length > 0) return scopePdvs;
    return (data?.pointsOfSale ?? []).filter((p) => p.active !== false);
  }, [activeStoreScope.pointsOfSale, activeStoreScope.allPointsOfSale, data?.pointsOfSale]);

  const isLiveAll = opsViewMode === 'live_all' && opsPdvs.length > 1;

  const resolvedOpsPdvId = useMemo(() => {
    if (isLiveAll) return null;
    if (opsPdvs.length === 0) return null;
    if (opsPdvs.length === 1) return opsPdvs[0]._id;
    const bid = String(currentBusiness?.business_id || currentBusiness?.id || '');
    const saved = bid && dataUserId ? readDeliveryOpsSelectedPdvId(bid, dataUserId) : null;
    const fromFilter = filters.salesPointId?.trim();
    if (fromFilter && opsPdvs.some((p) => p._id === fromFilter)) return fromFilter;
    return coerceSelectedPdvId(
      opsPdvs,
      saved || activeStoreScope.activeSalesPointId || activeStoreScope.activePreferenceRaw,
    );
  }, [
    isLiveAll,
    opsPdvs,
    filters.salesPointId,
    currentBusiness?.business_id,
    currentBusiness?.id,
    dataUserId,
    activeStoreScope.activeSalesPointId,
    activeStoreScope.activePreferenceRaw,
  ]);

  /** Un solo PDV activo: fijamos el filtro para que la vista y la API queden ancladas a esa tienda (p. ej. gerente con una sede). */
  const singleActivePdvId = useMemo(() => {
    return opsPdvs.length === 1 ? opsPdvs[0]._id : null;
  }, [opsPdvs]);

  /** Con varias tiendas no pedimos datos hasta tener PDV elegido (salvo monitor en directo). */
  const opsPdvFilterReady = useMemo(() => {
    if (opsPdvs.length <= 1) return true;
    if (isLiveAll) return true;
    return Boolean(resolvedOpsPdvId);
  }, [opsPdvs.length, isLiveAll, resolvedOpsPdvId]);

  const handleViewModeChange = useCallback((mode: DeliveryOpsViewMode, salesPointId?: string) => {
    const bid = String(currentBusiness?.business_id || currentBusiness?.id || '');
    setOpsViewMode(mode);
    if (bid && dataUserId) {
      writeDeliveryOpsViewMode(bid, dataUserId, mode);
    }
    if (mode === 'live_all') {
      // No tocar tienda del TPV/sidebar: solo modo Ops.
      setFilters((f) => {
        const { salesPointId: _drop, ...rest } = f;
        return rest;
      });
      return;
    }
    const id = String(salesPointId || '').trim();
    setFilters((f) => ({ ...f, salesPointId: id || undefined }));
    if (bid && dataUserId && id) {
      writeDeliveryOpsSelectedPdvId(bid, dataUserId, id);
      notifyDeliveryActiveStoreChanged();
    }
  }, [currentBusiness?.business_id, currentBusiness?.id, dataUserId]);

  /** Alinear filtro Ops con sidebar / localStorage en cuanto haya PDVs en scope (modo 1 tienda). */
  useEffect(() => {
    if (isLiveAll) return;
    if (!resolvedOpsPdvId || opsPdvs.length <= 1) return;
    setFilters((f) => (f.salesPointId === resolvedOpsPdvId ? f : { ...f, salesPointId: resolvedOpsPdvId }));
  }, [isLiveAll, resolvedOpsPdvId, opsPdvs.length]);

  useEffect(() => {
    if (!singleActivePdvId) return;
    if (opsViewMode === 'live_all') setOpsViewMode('single');
    setFilters((prev) => {
      if (prev.salesPointId === singleActivePdvId) return prev;
      return { ...prev, salesPointId: singleActivePdvId };
    });
  }, [singleActivePdvId, opsViewMode]);

  const restoredOpsPdvSelectionRef = useRef(false);
  const persistBootRef = useRef(false);
  const prevPersistedSalesPointRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    restoredOpsPdvSelectionRef.current = false;
    persistBootRef.current = false;
    prevPersistedSalesPointRef.current = undefined;
  }, [dataUserId, currentBusiness?.business_id, currentBusiness?.id]);

  /** Persistir tienda elegida para que el TPV rápido abra esa caja sin paso intermedio.
   *  En «En directo · todas» no se escribe (el TPV sigue con la última tienda concreta). */
  useEffect(() => {
    if (isLiveAll) return;
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
  }, [isLiveAll, filters.salesPointId, currentBusiness?.business_id, currentBusiness?.id, dataUserId, data?.pointsOfSale]);

  useEffect(() => {
    if (isLiveAll) {
      restoredOpsPdvSelectionRef.current = true;
      return;
    }
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
  }, [isLiveAll, data?.pointsOfSale, currentBusiness?.business_id, currentBusiness?.id, dataUserId]);

  /** Si el filtro apunta a un PDV que no está en esta empresa, corregirlo. */
  useEffect(() => {
    if (isLiveAll) return;
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
    isLiveAll,
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
      if (isLiveAll) return;
      if (!bid || !dataUserId) return;
      const list = opsPdvs.length > 0 ? opsPdvs : (data?.pointsOfSale ?? []).filter((p) => p.active !== false);
      if (!list.length) return;
      const saved = readDeliveryOpsSelectedPdvId(bid, dataUserId);
      const pdvId = coerceSelectedPdvId(
        list,
        saved || activeStoreScope.activeSalesPointId || activeStoreScope.activePreferenceRaw,
      );
      if (pdvId) {
        setFilters((f) => (f.salesPointId === pdvId ? f : { ...f, salesPointId: pdvId }));
      }
    };
    window.addEventListener(DELIVERY_ACTIVE_STORE_CHANGED, onStore);
    return () => window.removeEventListener(DELIVERY_ACTIVE_STORE_CHANGED, onStore);
  }, [
    isLiveAll,
    currentBusiness?.business_id,
    currentBusiness?.id,
    dataUserId,
    data?.pointsOfSale,
    opsPdvs,
    activeStoreScope.activeSalesPointId,
    activeStoreScope.activePreferenceRaw,
  ]);

  const quickNav = useCallback(
    (path: string) => {
      navFromOps(path);
    },
    [navFromOps],
  );

  const load = useCallback(async () => {
    if (!authUserId) {
      setLoading(false);
      return;
    }
    if (!opsPdvFilterReady) {
      setLoading(false);
      return;
    }
    const seq = ++loadSeqRef.current;
    try {
      const businessId = String(currentBusiness?.business_id || currentBusiness?.id || '').trim();
      const baseFilters = {
        ...filters,
        date: filters.date || localDateInputValue(),
        ...(businessId ? { businessId } : {}),
      };

      if (isLiveAll && opsPdvs.length > 1) {
        const results = await Promise.all(
          opsPdvs.map(async (pdv) => {
            try {
              const row = await getOpsCenterRequest(authUserId, {
                ...baseFilters,
                salesPointId: pdv._id,
              });
              return [pdv._id, row] as const;
            } catch (e) {
              console.error('ops-center live pdv error', pdv._id, e);
              return null;
            }
          }),
        );
        if (seq !== loadSeqRef.current) return;
        const next: Record<string, OpsCenterData> = {};
        for (const item of results) {
          if (item) next[item[0]] = item[1];
        }
        setLiveByPdv(next);
        const rows = Object.values(next);
        const first = rows[0] || null;
        if (first) {
          const mergedAlerts = rows.flatMap((r) => r.alerts || []);
          const seen = new Set<string>();
          const alerts = mergedAlerts.filter((a) => {
            const id = String(a.id || `${a.type}:${a.sessionId || a.orderId || ''}`);
            if (!id || seen.has(id)) return false;
            seen.add(id);
            return true;
          });
          const aggKpis = aggregateLiveOpsKpis(rows);
          setData({
            ...first,
            alerts,
            kpis: aggKpis || first.kpis,
            foodFamilyCounts: aggregateLiveFoodFamilyCounts(rows),
            revenueByBrand: aggregateLiveRevenueByBrand(rows),
            brandLabels: mergeLiveBrandLabels(rows),
            pointsOfSale: opsPdvs,
            activeOrders: rows.flatMap((r) => r.activeOrders || []),
          });
        }
        setLastUp(new Date());
      } else {
        const effectiveFilters = {
          ...baseFilters,
          ...(resolvedOpsPdvId ? { salesPointId: resolvedOpsPdvId } : {}),
        };
        const r = await getOpsCenterRequest(authUserId, effectiveFilters);
        if (seq !== loadSeqRef.current) return;
        setLiveByPdv({});
        setData(r);
        setLastUp(new Date());
      }
    } catch (e) {
      if (seq === loadSeqRef.current) console.error('ops-center error', e);
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  }, [
    authUserId,
    filters,
    currentBusiness?.business_id,
    currentBusiness?.id,
    opsPdvFilterReady,
    resolvedOpsPdvId,
    isLiveAll,
    opsPdvs,
  ]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const businessId = String(currentBusiness?.business_id || currentBusiness?.id || '').trim();
    const date = filters.date || localDateInputValue();
    if (!businessId) {
      setClockSummary(null);
      return;
    }
    let cancelled = false;
    void fetchDailySummary(businessId, date)
      .then((summary) => {
        if (!cancelled) setClockSummary(summary?.ok ? summary : null);
      })
      .catch(() => {
        if (!cancelled) setClockSummary(null);
      });
    return () => {
      cancelled = true;
    };
  }, [currentBusiness?.business_id, currentBusiness?.id, filters.date, lastUp]);

  useEffect(() => {
    const onLocalLive = () => {
      void load();
    };
    window.addEventListener(DELIVERY_OPS_LIVE_EVENT, onLocalLive);
    return () => window.removeEventListener(DELIVERY_OPS_LIVE_EVENT, onLocalLive);
  }, [load]);

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
    'delivery:order_updated': () => load(),
    'delivery:order_status_changed': () => load(),
    'delivery:incident_reported': () => load(),
    'delivery:incident_resolved': () => load(),
    delivery_order_created: () => load(),
    delivery_order_updated: () => load(),
    delivery_order_cancelled: () => load(),
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
    enabled: !!authUserId,
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
      ? 'Actualizando cada 30s'
      : loading
        ? 'Conectando…'
        : 'Sin conexion (reintentando)';
  const connectionDotClass = sseOk
    ? 'bg-green-500'
    : isPollingFresh
      ? 'bg-amber-500 animate-pulse'
      : 'bg-red-500 animate-pulse';

  /** Misma etiqueta que sidebar/topbar (sin parpadeo nombre centro → código PDV). */
  const effectiveOpsPdvLabel = useMemo(() => {
    if (isLiveAll) {
      return `En directo · ${opsPdvs.length} tiendas`;
    }
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
    isLiveAll,
    opsPdvs.length,
    filters.salesPointId,
    data?.pointsOfSale,
    activeStoreScope.pointsOfSale,
    activeStoreScope.activeSalesPointId,
    activeStoreScope.displayLabelForActive,
  ]);

  const layoutSubtitle = effectiveOpsPdvLabel
    ? `${effectiveOpsPdvLabel} · ${subtitle}`
    : subtitle;

  const liveAggCashPend = useMemo(() => {
    if (!isLiveAll) return cajaAlertBadge(data?.cashStatus);
    let n = 0;
    for (const row of Object.values(liveByPdv)) {
      n += cajaAlertBadge(row.cashStatus);
    }
    return n;
  }, [isLiveAll, liveByPdv, data?.cashStatus]);

  const opsStoreHoursWorkCenter = useMemo(() => {
    if (isLiveAll) return null;
    const pdvId = String(filters.salesPointId || '').trim();
    if (!pdvId) return null;
    const pdv = (data?.pointsOfSale || []).find((p) => p._id === pdvId);
    const ref = String(pdv?.workCenterId || pdvId).trim();
    return resolveWorkerWorkCenter(activeStoreScope.retailWorkCenters, ref);
  }, [
    isLiveAll,
    filters.salesPointId,
    data?.pointsOfSale,
    activeStoreScope.retailWorkCenters,
  ]);

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
              {isLiveAll ? (
                <>
                  <span className="text-teal-700 dark:text-teal-400">En directo · {opsPdvs.length} tiendas</span>
                  <span className="font-normal text-gray-600 dark:text-gray-400"> · delivery</span>
                </>
              ) : effectiveOpsPdvLabel ? (
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
          {opsStoreHoursWorkCenter ? (
            <StoreHoursStatusBanner
              workCenter={opsStoreHoursWorkCenter}
              compact
              className="mt-2 rounded-lg"
            />
          ) : null}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 pt-1 pb-3 space-y-2.5">

            <FiltersBar
              filters={filters}
              onChange={setFilters}
              config={cfg}
              pdvs={opsPdvs}
              viewMode={isLiveAll ? 'live_all' : opsViewMode}
              onViewModeChange={handleViewModeChange}
              sticky={false}
            />

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

            {!isLiveAll && !opsAlertsCoverCash(data?.alerts ?? []) && (
              <CashStatusBanner cashStatus={data?.cashStatus} onNavigate={quickNav} />
            )}

            {/* En «todas»: el pipeline por fase vive en cada columna (evita duplicar). */}
            {!isLiveAll && data?.kpis && (
              <Pipeline byStatus={data.kpis.byStatus} active={statusFilter} onFilter={setStatusFilter} />
            )}

            <QuickAccess
              cfg={cfg}
              kpis={data?.kpis || null}
              cashPend={liveAggCashPend}
              incidents={data?.kpis?.byStatus?.incident || 0}
              onNavigate={quickNav}
              activationFocus={activationFocus}
            />

            <Metrics
              kpis={data?.kpis || null}
              clockSummary={clockSummary}
              title={isLiveAll ? 'Métricas operativas · todas' : 'Métricas operativas'}
              hint={isLiveAll ? `${opsPdvs.length} tiendas · en vivo` : null}
            />

            {data && (
              <OpsFoodAndBrandsStrip
                food={foodCountsOf(data)}
                brands={brandRowsOf(data, isLiveAll ? 8 : 6)}
                title={isLiveAll ? 'Comida y marcas · todas' : 'Comida y marcas'}
              />
            )}

            {loading && !data && opsPdvFilterReady ? (
              <div className="flex items-center justify-center py-20">
                <div className="animate-spin w-8 h-8 border-2 border-gray-300 border-t-gray-900 dark:border-gray-600 dark:border-t-gray-100 rounded-full" />
              </div>
            ) : !opsPdvFilterReady && opsPdvs.length > 1 ? (
              <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-6 text-center text-sm text-amber-900 dark:text-amber-100">
                <p className="font-semibold mb-2">Elige una tienda en el menú lateral</p>
                <p className="text-amber-800/90 dark:text-amber-200/90">
                  En <strong>Centros de trabajo</strong>, pulsa tu tienda para cargar la operativa de delivery.
                </p>
              </div>
            ) : isLiveAll ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 px-0.5">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                    <Store className="w-3.5 h-3.5" />
                    Por tienda
                  </h3>
                  <span className="text-[10px] text-gray-400 dark:text-gray-500">
                    Totales arriba · detalle aquí
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {opsPdvs.map((pdv) => (
                    <OpsPdvLiveColumn
                      key={pdv._id}
                      pdv={pdv}
                      data={liveByPdv[pdv._id] || null}
                      onFocusStore={(id) => handleViewModeChange('single', id)}
                    />
                  ))}
                </div>
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
                {cfg?.hasPhysicalTables && cfg.tableCount > 0 && (
                  <TablesW cfg={cfg} orders={active} />
                )}
              </div>
            )}

            {!isLiveAll && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
              {data?.revenueByChannel && Object.keys(data.revenueByChannel).length > 0 && (
                <ChannelsW data={data.revenueByChannel} />
              )}
              {data?.revenueByBrand && Object.keys(data.revenueByBrand).length > 0 && (
                <RevenueBreakdownW
                  title="Facturación por marca (cobrado / entregado)"
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
            )}
          </div>
      </div>
      </div>
    </Layout>
  );
}
