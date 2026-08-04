import { useState, useMemo, useRef, useCallback } from 'react';
import {
  Search,
  SlidersHorizontal,
  ArrowUpDown,
  Users,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Bell,
  ChevronDown,
  Building2,
  MapPin,
  X,
  ArrowRight,
} from 'lucide-react';
import type { Business, BusinessType } from '../../lib/businessApi';
import { isDeliveryBusinessType } from '../../lib/deliverySetup';
import {
  fallbackGateSnapshot,
  resolveGateSnapshot,
  type GateBusinessSnapshot,
} from './gateBusinessSnapshots';

// ── Helpers ──────────────────────────────────────────────────────────────────

const BUSINESS_TYPE_LABELS: Record<string, string> = {
  events: 'Eventos',
  carDealership: 'Compraventa',
  workshop: 'Taller',
  delivery: 'Delivery',
  cleaning: 'Limpieza',
  hairSalon: 'Peluquería',
  gym: 'Gimnasio',
  clinic: 'Clínica',
  hotel: 'Hotel',
  construction: 'Construcción',
  academy: 'Academia',
  realEstate: 'Inmobiliaria',
  lawyer: 'Abogado',
  nightclub: 'Ocio nocturno',
  scrapyard: 'Desguace',
  spareParts: 'Recambios',
  taxi: 'Taxi',
  pharmacy: 'Farmacia',
  carWash: 'Lavadero',
  vet: 'Veterinario',
  tobaccoShop: 'Estanco',
  butcherShop: 'Carnicería',
};

const BUSINESS_TYPE_COLORS: Record<string, string> = {
  events: 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300',
  carDealership: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  workshop: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  delivery: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  cleaning: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
  hairSalon: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  gym: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  clinic: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  hotel: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  construction: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  academy: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  realEstate: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
  lawyer: 'bg-slate-100 text-slate-700 dark:bg-slate-900/40 dark:text-slate-300',
  nightclub: 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/40 dark:text-fuchsia-300',
  scrapyard: 'bg-stone-100 text-stone-700 dark:bg-stone-900/40 dark:text-stone-300',
  spareParts: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-300',
  taxi: 'bg-lime-100 text-lime-700 dark:bg-lime-900/40 dark:text-lime-300',
  pharmacy: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  carWash: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  vet: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  tobaccoShop: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  butcherShop: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

type SortKey = 'created' | 'name' | 'employees' | 'profit' | 'alerts' | 'recent';

function businessCreatedMs(b: Business): number {
  const raw = String(b.createdAt || '').trim();
  const ms = raw ? new Date(raw).getTime() : NaN;
  if (Number.isFinite(ms)) return ms;
  // Fallback estable si falta createdAt (ids tipo biz_… o timestamp embebido)
  const id = String(b.business_id || b.id || '');
  const fromId = Number(id.replace(/\D/g, '').slice(-13));
  return Number.isFinite(fromId) ? fromId : 0;
}

function formatMetricValue(label: string, value: number): string {
  if (label === 'Pedidos' || label === 'Activos' || label === 'Empleados') {
    return String(value);
  }
  return formatCurrency(value);
}

function formatCurrency(amount: number): string {
  if (Math.abs(amount) >= 1000) {
    return `${(amount / 1000).toFixed(1)}k €`;
  }
  return `${amount.toLocaleString('es-ES')} €`;
}

// ── Alert Popup ──────────────────────────────────────────────────────────────

function AlertPopup({ alerts, visible }: { alerts: GateBusinessSnapshot['alerts']; visible: boolean }) {
  if (!visible || alerts.length === 0) return null;

  const typeIcon = {
    warning: <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />,
    info: <Bell className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />,
    error: <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />,
  };

  const typeBg = {
    warning: 'bg-amber-50 dark:bg-amber-950/30',
    info: 'bg-blue-50 dark:bg-blue-950/30',
    error: 'bg-red-50 dark:bg-red-950/30',
  };

  return (
    <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 p-3 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 animate-in fade-in slide-in-from-bottom-2 duration-200">
      <div className="flex items-center gap-2 mb-2.5">
        <Bell className="w-4 h-4 text-gray-500" />
        <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
          Alertas ({alerts.length})
        </span>
      </div>
      <div className="space-y-1.5 max-h-48 overflow-y-auto">
        {alerts.map((alert) => (
          <div
            key={alert.id}
            className={`flex items-start gap-2 px-2.5 py-2 rounded-lg ${typeBg[alert.type]}`}
          >
            {typeIcon[alert.type]}
            <span className="text-xs text-gray-700 dark:text-gray-300 leading-snug">{alert.message}</span>
          </div>
        ))}
      </div>
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-3 h-3 bg-white dark:bg-gray-800 border-r border-b border-gray-200 dark:border-gray-700 rotate-45" />
    </div>
  );
}

// ── Business Card ────────────────────────────────────────────────────────────

function BusinessCard({
  business,
  snapshot,
  summariesLoading,
  isActive,
  onEnter,
}: {
  business: Business;
  snapshot: GateBusinessSnapshot;
  summariesLoading: boolean;
  isActive: boolean;
  onEnter: () => void;
}) {
  const [hoverAlerts, setHoverAlerts] = useState(false);
  const initials = business.name.slice(0, 2).toUpperCase();
  const typeLabel = BUSINESS_TYPE_LABELS[business.businessType] || business.businessType;
  const typeColor = BUSINESS_TYPE_COLORS[business.businessType] || 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';

  const isDelivery = isDeliveryBusinessType(business.businessType);
  const metric2Label = isDelivery ? snapshot.primaryLabel : snapshot.secondaryLabel;
  const metric2Value = isDelivery ? snapshot.primaryValue : snapshot.secondaryValue;
  const metric3Label = isDelivery ? snapshot.secondaryLabel : snapshot.tertiaryLabel;
  const metric3Value = isDelivery ? snapshot.secondaryValue : snapshot.tertiaryValue;

  return (
    <div
      className={`relative flex w-full flex-col rounded-2xl border-2 p-4 transition-all duration-200 ${
        isActive
          ? 'border-amber-400 bg-amber-50/50 shadow-md shadow-amber-100/80 dark:bg-amber-950/20 dark:shadow-amber-950/10'
          : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800'
      }`}
    >
      {/* Header */}
      <div className="mb-3 flex items-start gap-3">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 bg-gray-900 dark:bg-gray-700 overflow-hidden">
          {business.logo ? (
            <img src={business.logo} alt="" className="w-11 h-11 object-cover" />
          ) : (
            <span className="text-xs font-bold text-white">{initials}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="truncate text-sm font-bold text-gray-900 dark:text-gray-100">
            {business.name}
          </p>
          {business.city && (
            <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 truncate">
              <MapPin className="w-3 h-3 flex-shrink-0" />
              {business.city}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-full ${typeColor}`}>
            {typeLabel}
          </span>
          {isActive && (
            <span className="px-2 py-0.5 bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 text-[10px] font-semibold rounded-full">
              Activa
            </span>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 mb-2">
        <div className="px-2.5 py-2 bg-gray-50 dark:bg-gray-800/80 rounded-lg">
          <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Empleados</p>
          {summariesLoading ? (
            <div className="mt-1 h-5 w-10 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
          ) : (
            <p className="text-sm font-bold text-gray-900 dark:text-gray-100 flex items-center gap-1">
              <Users className="w-3.5 h-3.5 text-gray-400" />
              {snapshot.employeeCount}
            </p>
          )}
        </div>
        <div className="px-2.5 py-2 bg-gray-50 dark:bg-gray-800/80 rounded-lg">
          <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide truncate">
            {metric2Label}
          </p>
          {summariesLoading ? (
            <div className="mt-1 h-5 w-14 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
          ) : metric2Label === 'Gastos' ? (
            <p className="text-sm font-bold text-red-600 dark:text-red-400 flex items-center gap-1">
              <TrendingDown className="w-3.5 h-3.5" />
              {formatMetricValue(metric2Label, metric2Value)}
            </p>
          ) : (
            <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5" />
              {formatMetricValue(metric2Label, metric2Value)}
            </p>
          )}
        </div>
        <div className="px-2.5 py-2 bg-gray-50 dark:bg-gray-800/80 rounded-lg">
          <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide truncate">
            {metric3Label}
          </p>
          {summariesLoading ? (
            <div className="mt-1 h-5 w-14 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
          ) : metric3Label === 'Beneficio' ? (
            <p
              className={`text-sm font-bold flex items-center gap-1 ${
                metric3Value >= 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-red-600 dark:text-red-400'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              {formatMetricValue(metric3Label, metric3Value)}
            </p>
          ) : (
            <p className="text-sm font-bold text-gray-900 dark:text-gray-100">
              {formatMetricValue(metric3Label, metric3Value)}
            </p>
          )}
        </div>
      </div>

      {snapshot.contextLine ? (
        <p className="mb-2 text-[11px] leading-snug text-gray-500 dark:text-gray-400">
          {snapshot.contextLine}
        </p>
      ) : null}

      {/* Alerts badge */}
      {snapshot.alerts.length > 0 && (
        <div className="relative">
          <div
            onMouseEnter={() => setHoverAlerts(true)}
            onMouseLeave={() => setHoverAlerts(false)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
              snapshot.alerts.some((a) => a.type === 'error')
                ? 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300'
                : snapshot.alerts.some((a) => a.type === 'warning')
                  ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300'
                  : 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            {snapshot.alerts.length} {snapshot.alerts.length === 1 ? 'alerta' : 'alertas'}
          </div>
          <AlertPopup alerts={snapshot.alerts} visible={hoverAlerts} />
        </div>
      )}

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onEnter();
        }}
        className="relative z-10 mt-4 flex w-full min-h-[3rem] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-blue-600 px-4 py-3 text-sm font-bold text-white shadow-md shadow-teal-500/25 transition-all hover:from-emerald-600 hover:via-teal-600 hover:to-blue-700 active:scale-[0.98]"
      >
        Entrar al panel
        <ArrowRight className="h-4 w-4 shrink-0" />
      </button>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

interface BusinessGridProps {
  businesses: Business[];
  currentBusinessId: string | undefined;
  onEnterBusiness: (businessId: string) => void;
  onManageBusinesses: () => void;
  businessSnapshots?: Map<string, GateBusinessSnapshot>;
  summariesLoading?: boolean;
}

export function BusinessGrid({
  businesses,
  currentBusinessId,
  onEnterBusiness,
  onManageBusinesses,
  businessSnapshots,
  summariesLoading = false,
}: BusinessGridProps) {
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<BusinessType | 'all'>('all');
  const [sortBy, setSortBy] = useState<SortKey>('created');
  const [showFilters, setShowFilters] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const snapshotMap = useMemo(() => {
    const map = new Map<string, GateBusinessSnapshot>();
    for (const b of businesses) {
      const resolved = resolveGateSnapshot(b, businessSnapshots);
      map.set(b.business_id, resolved ?? fallbackGateSnapshot(b));
    }
    return map;
  }, [businesses, businessSnapshots]);

  const totalAlerts = useMemo(() => {
    let count = 0;
    for (const s of snapshotMap.values()) count += s.alerts.length;
    return count;
  }, [snapshotMap]);

  const availableTypes = useMemo(() => {
    const types = new Set<BusinessType>();
    for (const b of businesses) {
      types.add(b.businessType);
    }
    return Array.from(types);
  }, [businesses]);

  const filteredAndSorted = useMemo(() => {
    let list = [...businesses];

    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter(
        (b) =>
          b.name.toLowerCase().includes(q) ||
          (b.city && b.city.toLowerCase().includes(q)) ||
          (b.legalName && b.legalName.toLowerCase().includes(q)) ||
          (b.taxId && b.taxId.toLowerCase().includes(q)),
      );
    }

    if (filterType !== 'all') {
      list = list.filter((b) => b.businessType === filterType);
    }

    list.sort((a, b) => {
      const sa = snapshotMap.get(a.business_id)!;
      const sb = snapshotMap.get(b.business_id)!;
      switch (sortBy) {
        case 'created': {
          const diff = businessCreatedMs(a) - businessCreatedMs(b);
          return diff !== 0 ? diff : a.name.localeCompare(b.name, 'es');
        }
        case 'name':
          return a.name.localeCompare(b.name, 'es');
        case 'employees':
          return sb.employeeCount - sa.employeeCount;
        case 'profit':
          return sb.profitValue - sa.profitValue;
        case 'alerts':
          return sb.alerts.length - sa.alerts.length;
        case 'recent':
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        default:
          return 0;
      }
    });

    return list;
  }, [businesses, search, filterType, sortBy, snapshotMap]);

  const clearFilters = useCallback(() => {
    setSearch('');
    setFilterType('all');
    setSortBy('created');
  }, []);

  const hasActiveFilters = search.trim() !== '' || filterType !== 'all' || sortBy !== 'created';

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Tus negocios</h3>
          <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs font-medium rounded-full">
            {businesses.length}
          </span>
          {totalAlerts > 0 && (
            <span className="px-2 py-0.5 bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-xs font-medium rounded-full flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              {totalAlerts} {totalAlerts === 1 ? 'alerta' : 'alertas'}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onManageBusinesses}
          className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors underline underline-offset-2"
        >
          Gestionar empresas
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Search */}
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Buscar por nombre, ciudad, CIF…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-400 transition-all placeholder:text-gray-400"
          />
          {search && (
            <button
              type="button"
              onClick={() => { setSearch(''); inputRef.current?.focus(); }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <X className="w-3.5 h-3.5 text-gray-400" />
            </button>
          )}
        </div>

        {/* Filter toggle */}
        <button
          type="button"
          onClick={() => setShowFilters((p) => !p)}
          className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-xl border transition-colors ${
            showFilters || filterType !== 'all'
              ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300'
              : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300'
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          Filtrar
        </button>

        {/* Sort */}
        <div className="relative">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortKey)}
            className="appearance-none pl-8 pr-7 py-2 text-xs font-medium bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-600 dark:text-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-400 cursor-pointer"
          >
            <option value="created">Orden de creación</option>
            <option value="name">Nombre A-Z</option>
            <option value="employees">Más empleados</option>
            <option value="profit">Mayor beneficio</option>
            <option value="alerts">Más alertas</option>
            <option value="recent">Más reciente</option>
          </select>
          <ArrowUpDown className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
        </div>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="flex items-center gap-1 px-2 py-2 text-xs text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            Limpiar
          </button>
        )}
      </div>

      {/* Filter chips */}
      {showFilters && availableTypes.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Tipo:</span>
          <button
            type="button"
            onClick={() => setFilterType('all')}
            className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
              filterType === 'all'
                ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            Todos
          </button>
          {availableTypes.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setFilterType(type)}
              className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
                filterType === type
                  ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              {BUSINESS_TYPE_LABELS[type] || type}
            </button>
          ))}
        </div>
      )}

      {/* Grid */}
      {filteredAndSorted.length === 0 ? (
        <div className="py-10 text-center">
          <Building2 className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {search || filterType !== 'all'
              ? 'No se encontraron negocios con esos filtros'
              : 'No tienes negocios todavía'}
          </p>
          {(search || filterType !== 'all') && (
            <button
              type="button"
              onClick={clearFilters}
              className="mt-2 text-xs text-amber-600 dark:text-amber-400 hover:underline"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filteredAndSorted.map((business) => (
            <BusinessCard
              key={business.business_id}
              business={business}
              snapshot={snapshotMap.get(business.business_id)!}
              summariesLoading={summariesLoading}
              isActive={currentBusinessId === business.business_id}
              onEnter={() => onEnterBusiness(business.business_id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
