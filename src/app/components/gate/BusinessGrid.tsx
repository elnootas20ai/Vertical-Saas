import { useState, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router';
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
} from 'lucide-react';
import type { Business, BusinessType } from '../../lib/businessApi';

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

type SortKey = 'name' | 'employees' | 'profit' | 'alerts' | 'recent';

interface BusinessAlert {
  id: string;
  type: 'warning' | 'info' | 'error';
  message: string;
}

interface BusinessStats {
  revenue: number;
  expenses: number;
  profit: number;
  employeeCount: number;
  alerts: BusinessAlert[];
}

interface RealBusinessData {
  vehicles: Array<{ purchasePrice: number; salePrice?: number; status: string; associatedCosts?: Array<{ amount: number }> }>;
  sales: Array<{ salePrice: number; status: string }>;
}

function getBusinessStats(business: Business, realData?: RealBusinessData): BusinessStats {
  const employeeCount = business.members?.length || 1;

  let revenue = 0;
  let expenses = 0;

  if (realData) {
    revenue = realData.sales
      .filter((s) => s.status === 'completed')
      .reduce((sum, s) => sum + (s.salePrice || 0), 0);

    expenses = realData.vehicles.reduce((sum, v) => {
      const costBase = v.purchasePrice || 0;
      const costExtra = (v.associatedCosts || []).reduce((a, c) => a + (c.amount || 0), 0);
      return sum + costBase + costExtra;
    }, 0);
  }

  const profit = revenue - expenses;

  const alerts: BusinessAlert[] = [];
  if (!business.taxId?.trim()) {
    alerts.push({ id: 'no-cif', type: 'warning', message: 'CIF/NIF pendiente de completar' });
  }
  if (employeeCount <= 1) {
    alerts.push({ id: 'no-team', type: 'info', message: 'Sin equipo — invita a tu primer trabajador' });
  }
  if (realData && profit < 0) {
    alerts.push({ id: 'negative-profit', type: 'error', message: 'Beneficio negativo este periodo' });
  }
  if (!business.address?.trim()) {
    alerts.push({ id: 'no-address', type: 'warning', message: 'Dirección fiscal no configurada' });
  }
  if (!business.email?.trim()) {
    alerts.push({ id: 'no-email', type: 'info', message: 'Email de contacto no configurado' });
  }
  if (realData) {
    const pendingSales = realData.sales.filter((s) => s.status === 'pending');
    if (pendingSales.length > 0) {
      alerts.push({ id: 'invoice-due', type: 'warning', message: `${pendingSales.length} venta(s) pendiente(s) de cobro` });
    }
  }

  return { revenue, expenses, profit, employeeCount, alerts };
}

function formatCurrency(amount: number): string {
  if (Math.abs(amount) >= 1000) {
    return `${(amount / 1000).toFixed(1)}k €`;
  }
  return `${amount.toLocaleString('es-ES')} €`;
}

// ── Alert Popup ──────────────────────────────────────────────────────────────

function AlertPopup({ alerts, visible }: { alerts: BusinessAlert[]; visible: boolean }) {
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
  stats,
  isActive,
  hasRealFinancials,
  onEnter,
}: {
  business: Business;
  stats: BusinessStats;
  isActive: boolean;
  hasRealFinancials: boolean;
  onEnter: () => void;
}) {
  const [hoverAlerts, setHoverAlerts] = useState(false);
  const initials = business.name.slice(0, 2).toUpperCase();
  const typeLabel = BUSINESS_TYPE_LABELS[business.businessType] || business.businessType;
  const typeColor = BUSINESS_TYPE_COLORS[business.businessType] || 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';

  return (
    <button
      type="button"
      onClick={onEnter}
      className={`relative w-full text-left p-4 rounded-2xl border-2 transition-all duration-200 group hover:shadow-lg hover:-translate-y-0.5 ${
        isActive
          ? 'border-amber-400 bg-amber-50/50 dark:bg-amber-950/20 shadow-amber-100 dark:shadow-amber-950/10'
          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600'
      }`}
    >
      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 bg-gray-900 dark:bg-gray-700 overflow-hidden">
          {business.logo ? (
            <img src={business.logo} alt="" className="w-11 h-11 object-cover" />
          ) : (
            <span className="text-xs font-bold text-white">{initials}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate group-hover:text-amber-700 dark:group-hover:text-amber-300 transition-colors">
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
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="px-2.5 py-2 bg-gray-50 dark:bg-gray-800/80 rounded-lg">
          <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Empleados</p>
          <p className="text-sm font-bold text-gray-900 dark:text-gray-100 flex items-center gap-1">
            <Users className="w-3.5 h-3.5 text-gray-400" />
            {stats.employeeCount}
          </p>
        </div>
        <div className="px-2.5 py-2 bg-gray-50 dark:bg-gray-800/80 rounded-lg">
          <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Gastos</p>
          {hasRealFinancials ? (
            <p className="text-sm font-bold text-red-600 dark:text-red-400 flex items-center gap-1">
              <TrendingDown className="w-3.5 h-3.5" />
              {formatCurrency(stats.expenses)}
            </p>
          ) : (
            <p className="text-xs text-gray-400 dark:text-gray-500 italic mt-0.5">Entrar para ver</p>
          )}
        </div>
        <div className="px-2.5 py-2 bg-gray-50 dark:bg-gray-800/80 rounded-lg">
          <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Beneficio</p>
          {hasRealFinancials ? (
            <p className={`text-sm font-bold flex items-center gap-1 ${stats.profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
              <TrendingUp className="w-3.5 h-3.5" />
              {formatCurrency(stats.profit)}
            </p>
          ) : (
            <p className="text-xs text-gray-400 dark:text-gray-500 italic mt-0.5">Entrar para ver</p>
          )}
        </div>
      </div>

      {/* Alerts badge */}
      {stats.alerts.length > 0 && (
        <div className="relative">
          <div
            onMouseEnter={() => setHoverAlerts(true)}
            onMouseLeave={() => setHoverAlerts(false)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
              stats.alerts.some((a) => a.type === 'error')
                ? 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300'
                : stats.alerts.some((a) => a.type === 'warning')
                  ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300'
                  : 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            {stats.alerts.length} {stats.alerts.length === 1 ? 'alerta' : 'alertas'}
          </div>
          <AlertPopup alerts={stats.alerts} visible={hoverAlerts} />
        </div>
      )}
    </button>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

interface BusinessGridProps {
  businesses: Business[];
  currentBusinessId: string | undefined;
  onEnterBusiness: (businessId: string) => void;
  onManageBusinesses: () => void;
  vehicles?: Array<{ purchasePrice: number; salePrice?: number; status: string; associatedCosts?: Array<{ amount: number }> }>;
  sales?: Array<{ salePrice: number; status: string }>;
}

export function BusinessGrid({
  businesses,
  currentBusinessId,
  onEnterBusiness,
  onManageBusinesses,
  vehicles = [],
  sales = [],
}: BusinessGridProps) {
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<BusinessType | 'all'>('all');
  const [sortBy, setSortBy] = useState<SortKey>('name');
  const [showFilters, setShowFilters] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const statsMap = useMemo(() => {
    const map = new Map<string, BusinessStats>();
    for (const b of businesses) {
      const isActive = b.business_id === currentBusinessId;
      const realData: RealBusinessData | undefined = isActive
        ? { vehicles, sales }
        : undefined;
      map.set(b.business_id, getBusinessStats(b, realData));
    }
    return map;
  }, [businesses, currentBusinessId, vehicles, sales]);

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
      const sa = statsMap.get(a.business_id)!;
      const sb = statsMap.get(b.business_id)!;
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name, 'es');
        case 'employees':
          return sb.employeeCount - sa.employeeCount;
        case 'profit':
          return sb.profit - sa.profit;
        case 'alerts':
          return sb.alerts.length - sa.alerts.length;
        case 'recent':
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        default:
          return 0;
      }
    });

    return list;
  }, [businesses, search, filterType, sortBy, statsMap]);

  const totalAlerts = useMemo(() => {
    let count = 0;
    for (const s of statsMap.values()) count += s.alerts.length;
    return count;
  }, [statsMap]);

  const clearFilters = useCallback(() => {
    setSearch('');
    setFilterType('all');
    setSortBy('name');
  }, []);

  const hasActiveFilters = search.trim() !== '' || filterType !== 'all' || sortBy !== 'name';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Tus negocios</h3>
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
              stats={statsMap.get(business.business_id)!}
              isActive={currentBusinessId === business.business_id}
              hasRealFinancials={currentBusinessId === business.business_id}
              onEnter={() => onEnterBusiness(business.business_id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
