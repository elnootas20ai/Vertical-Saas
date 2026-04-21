import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Building2,
  Users,
  TrendingUp,
  TrendingDown,
  MapPin,
  ArrowRight,
  Crown,
  BarChart3,
  Wallet,
  AlertTriangle,
  Info,
  Search,
  ArrowUpDown,
  Filter,
  AlertCircle,
  AlertOctagon,
  Clock,
} from 'lucide-react';
import { Layout } from './Layout';
import { BusinessCarousel, BUSINESS_TYPE_LABELS, BUSINESS_TYPE_COLORS } from './BusinessCarousel';
import { useBusiness } from '../../context/BusinessContext';
import type { Business, BusinessType } from '../../lib/businessApi';

interface BusinessAlert {
  id: string;
  type: 'warning' | 'info' | 'error';
  message: string;
  date: Date;
}

interface BusinessStats {
  revenue: number;
  expenses: number;
  profit: number;
  margin: number;
  employeeCount: number;
  alerts: BusinessAlert[];
}

function getBusinessStats(b: Business): BusinessStats {
  const employeeCount = b.members?.length || 0;
  return { revenue: 0, expenses: 0, profit: 0, margin: 0, employeeCount, alerts: [] };
}

function fmt(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M €`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}k €`;
  return `${n.toLocaleString('es-ES')} €`;
}

// ── Component ───────────────────────────────────────────────────────────────

interface GeneralDashboardProps {
  onSelectBusiness: (businessId: string) => void;
}

export function GeneralDashboard({ onSelectBusiness }: GeneralDashboardProps) {
  const navigate = useNavigate();
  const { businesses, currentBusiness, switchBusiness } = useBusiness();
  const [selectedBusinessId, setSelectedBusinessId] = useState<string | null>(null);

  const selectedBusiness = useMemo(
    () => selectedBusinessId ? businesses.find(b => b.business_id === selectedBusinessId) : null,
    [businesses, selectedBusinessId],
  );

  const filteredBusinesses = useMemo(
    () => selectedBusiness ? [selectedBusiness] : businesses,
    [businesses, selectedBusiness],
  );

  const stats = useMemo(() => {
    const map = new Map<string, BusinessStats>();
    for (const b of businesses) map.set(b.business_id, getBusinessStats(b));
    return map;
  }, [businesses]);

  const totals = useMemo(() => {
    let revenue = 0, expenses = 0, profit = 0, employees = 0, alertCount = 0;
    for (const b of filteredBusinesses) {
      const s = stats.get(b.business_id);
      if (!s) continue;
      revenue += s.revenue;
      expenses += s.expenses;
      profit += s.profit;
      employees += s.employeeCount;
      alertCount += s.alerts.length;
    }
    const margin = revenue > 0 ? Math.round((profit / revenue) * 100) : 0;
    return { revenue, expenses, profit, margin, employees, alertCount };
  }, [filteredBusinesses, stats]);

  const typeBreakdown = useMemo(() => {
    const groups: Record<string, { count: number; revenue: number; profit: number; employees: number }> = {};
    for (const b of filteredBusinesses) {
      const s = stats.get(b.business_id)!;
      const t = b.businessType;
      if (!groups[t]) groups[t] = { count: 0, revenue: 0, profit: 0, employees: 0 };
      groups[t].count++;
      groups[t].revenue += s.revenue;
      groups[t].profit += s.profit;
      groups[t].employees += s.employeeCount;
    }
    return Object.entries(groups)
      .sort((a, b) => b[1].revenue - a[1].revenue);
  }, [filteredBusinesses, stats]);

  const ranked = useMemo(() => {
    return [...filteredBusinesses]
      .map(b => ({ business: b, stats: stats.get(b.business_id)! }))
      .sort((a, b) => b.stats.profit - a.stats.profit);
  }, [filteredBusinesses, stats]);

  const maxRevenue = useMemo(
    () => Math.max(...ranked.map(r => r.stats.revenue), 1),
    [ranked],
  );

  const [showAlertsPanel, setShowAlertsPanel] = useState(false);
  const [showAllCategories, setShowAllCategories] = useState(false);
  const MAX_VISIBLE_CATEGORIES = 3;

  const allAlerts = useMemo(() => {
    const result: { business: Business; alert: BusinessAlert }[] = [];
    for (const b of filteredBusinesses) {
      const s = stats.get(b.business_id);
      if (!s) continue;
      for (const a of s.alerts) result.push({ business: b, alert: a });
    }
    return result;
  }, [filteredBusinesses, stats]);

  const handleCarouselSwitch = (businessId: string) => {
    setSelectedBusinessId(prev => prev === businessId ? null : businessId);
  };

  const handleGoToBusiness = (businessId: string) => {
    switchBusiness(businessId);
    onSelectBusiness(businessId);
  };

  return (
    <Layout
      title={selectedBusiness ? selectedBusiness.name : 'Dashboard General'}
      subtitle={selectedBusiness
        ? `Rendimiento de ${selectedBusiness.name}`
        : 'Rendimiento global de todos tus negocios'}
    >
      <div className="flex flex-col gap-5">

        {/* ── KPIs principales ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KPI
            label={selectedBusiness ? 'Empresa' : 'Empresas'}
            value={selectedBusiness ? '1' : String(businesses.length)}
            sub={selectedBusiness
              ? (BUSINESS_TYPE_LABELS[selectedBusiness.businessType as BusinessType] || selectedBusiness.businessType)
              : `${typeBreakdown.length} categorías`}
            icon={<Building2 className="w-4 h-4" />}
            iconBg="bg-blue-100 dark:bg-blue-900/40"
            iconColor="text-blue-600 dark:text-blue-400"
          />
          <KPI
            label={selectedBusiness ? 'Trabajadores activos' : 'Trabajadores totales'}
            value={String(totals.employees)}
            sub={selectedBusiness
              ? `De ${selectedBusiness.name}`
              : `Media ${Math.round(totals.employees / (businesses.length || 1))} / empresa`}
            icon={<Users className="w-4 h-4" />}
            iconBg="bg-purple-100 dark:bg-purple-900/40"
            iconColor="text-purple-600 dark:text-purple-400"
          />
          <KPI
            label="Facturación est."
            value={fmt(totals.revenue)}
            sub={`Gastos: ${fmt(totals.expenses)}`}
            icon={<Wallet className="w-4 h-4" />}
            iconBg="bg-emerald-100 dark:bg-emerald-900/40"
            iconColor="text-emerald-600 dark:text-emerald-400"
          />
          <KPI
            label="Beneficio est."
            value={fmt(totals.profit)}
            sub={`Margen: ${totals.margin}%`}
            icon={<TrendingUp className="w-4 h-4" />}
            iconBg={totals.profit >= 0 ? 'bg-amber-100 dark:bg-amber-900/40' : 'bg-red-100 dark:bg-red-900/40'}
            iconColor={totals.profit >= 0 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}
            trend={totals.profit >= 0 ? 'up' : 'down'}
          />
        </div>

        {/* ── Alertas resumen ── */}
        {totals.alertCount > 0 && (
          <div className="flex flex-col">
            <div className={`flex items-center justify-between gap-2 px-4 py-2.5 bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 ${showAlertsPanel ? 'rounded-t-xl border-b-0' : 'rounded-xl'}`}>
              <div className="flex items-center gap-2 min-w-0">
                <AlertTriangle className="w-4 h-4 text-orange-500 flex-shrink-0" />
                <span className="text-xs font-medium text-orange-800 dark:text-orange-300">
                  {totals.alertCount} {totals.alertCount === 1 ? 'alerta pendiente' : 'alertas pendientes'} en tus negocios
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowAlertsPanel(p => !p)}
                className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-orange-700 dark:text-orange-300 bg-orange-100 dark:bg-orange-900/40 hover:bg-orange-200 dark:hover:bg-orange-900/60 rounded-lg transition-colors flex-shrink-0"
              >
                <Info className="w-3.5 h-3.5" />
                {showAlertsPanel ? 'Cerrar' : '+ info'}
              </button>
            </div>

            {showAlertsPanel && (
              <AlertsPanel
                allAlerts={allAlerts}
                businesses={businesses}
                onClose={() => setShowAlertsPanel(false)}
                onGoToBusiness={handleGoToBusiness}
              />
            )}
          </div>
        )}

        {/* ── Desglose por categoría ── */}
        <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-gray-500 dark:text-gray-400" />
              <p className="text-sm font-bold text-gray-900 dark:text-gray-100">Rendimiento por categoría</p>
            </div>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {(showAllCategories ? typeBreakdown : typeBreakdown.slice(0, MAX_VISIBLE_CATEGORIES)).map(([type, data]) => {
              const pct = totals.revenue > 0 ? Math.round((data.revenue / totals.revenue) * 100) : 0;
              const color = BUSINESS_TYPE_COLORS[type] || 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
              const barColor = type === 'carDealership' ? 'bg-blue-500' :
                type === 'workshop' ? 'bg-orange-500' :
                type === 'delivery' ? 'bg-emerald-500' :
                type === 'cleaning' ? 'bg-cyan-500' :
                type === 'gym' ? 'bg-purple-500' :
                type === 'clinic' ? 'bg-rose-500' :
                type === 'hotel' ? 'bg-amber-500' :
                type === 'construction' ? 'bg-yellow-500' :
                type === 'academy' ? 'bg-indigo-500' :
                type === 'realEstate' ? 'bg-teal-500' :
                type === 'lawyer' ? 'bg-slate-500' :
                type === 'nightclub' ? 'bg-fuchsia-500' :
                type === 'events' ? 'bg-pink-500' :
                type === 'hairSalon' ? 'bg-violet-500' :
                'bg-gray-500';

              return (
                <div key={type} className="px-5 py-3.5 flex items-center gap-4">
                  <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-md flex-shrink-0 ${color}`}>
                    {BUSINESS_TYPE_LABELS[type as BusinessType] || type}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${barColor}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 w-8 text-right">{pct}%</span>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-gray-500 dark:text-gray-400">
                      <span>{data.count} {data.count === 1 ? 'empresa' : 'empresas'}</span>
                      <span>·</span>
                      <span>{data.employees} empleados</span>
                      <span>·</span>
                      <span className="font-semibold text-gray-700 dark:text-gray-300">{fmt(data.revenue)}</span>
                      <span>·</span>
                      <span className={data.profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>
                        {fmt(data.profit)} beneficio
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {typeBreakdown.length > MAX_VISIBLE_CATEGORIES && (
            <button
              type="button"
              onClick={() => setShowAllCategories(prev => !prev)}
              className="w-full px-5 py-2.5 flex items-center justify-center gap-1.5 text-[11px] font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50 border-t border-gray-100 dark:border-gray-800 transition-colors"
            >
              {showAllCategories
                ? 'Ver menos'
                : `+${typeBreakdown.length - MAX_VISIBLE_CATEGORIES} categorías más`}
            </button>
          )}
        </div>

        {/* ── Rendimiento por empresa ── */}
        <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-2">
              <Crown className="w-4 h-4 text-gray-500 dark:text-gray-400" />
              <p className="text-sm font-bold text-gray-900 dark:text-gray-100">Rendimiento por empresa</p>
            </div>
            <button
              onClick={() => navigate('/saas/settings/empresas')}
              className="text-[10px] text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors underline underline-offset-2"
            >
              Gestionar empresas
            </button>
          </div>

          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {ranked.map(({ business, stats: s }, idx) => {
              const initials = business.name.slice(0, 2).toUpperCase();
              const typeLabel = BUSINESS_TYPE_LABELS[business.businessType] || business.businessType;
              const typeColor = BUSINESS_TYPE_COLORS[business.businessType] || 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
              const barPct = Math.round((s.revenue / maxRevenue) * 100);
              const isTop = idx < 3;

              return (
                <button
                  key={business.business_id}
                  type="button"
                  onClick={() => handleGoToBusiness(business.business_id)}
                  className="w-full text-left px-5 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors group flex items-center gap-4"
                >
                  {/* Rank */}
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-black ${
                    idx === 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' :
                    idx === 1 ? 'bg-gray-200 text-gray-600 dark:bg-gray-600 dark:text-gray-300' :
                    idx === 2 ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300' :
                    'bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500'
                  }`}>
                    {idx + 1}
                  </div>

                  {/* Logo */}
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-gray-900 dark:bg-gray-700 overflow-hidden">
                    {business.logo ? (
                      <img src={business.logo} alt="" className="w-9 h-9 object-cover" />
                    ) : (
                      <span className="text-[10px] font-bold text-white">{initials}</span>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate group-hover:text-amber-700 dark:group-hover:text-amber-300 transition-colors">
                        {business.name}
                      </p>
                      <span className={`px-1.5 py-0.5 text-[9px] font-semibold rounded-md flex-shrink-0 ${typeColor}`}>
                        {typeLabel}
                      </span>
                      {business.city && (
                        <span className="hidden sm:flex items-center gap-0.5 text-[10px] text-gray-400 dark:text-gray-500 flex-shrink-0">
                          <MapPin className="w-2.5 h-2.5" />
                          {business.city}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${s.profit >= 0 ? 'bg-emerald-500' : 'bg-red-500'}`}
                          style={{ width: `${barPct}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Metrics */}
                  <div className="hidden sm:flex items-center gap-4 flex-shrink-0 text-right">
                    <div>
                      <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide">Facturación</p>
                      <p className="text-xs font-bold text-gray-900 dark:text-gray-100">{fmt(s.revenue)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide">Beneficio</p>
                      <p className={`text-xs font-bold ${s.profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                        {fmt(s.profit)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide">Equipo</p>
                      <p className="text-xs font-bold text-gray-900 dark:text-gray-100 flex items-center justify-end gap-0.5">
                        <Users className="w-3 h-3 text-gray-400" />
                        {s.employeeCount}
                      </p>
                    </div>
                  </div>

                  {/* Mobile metrics */}
                  <div className="sm:hidden flex flex-col items-end flex-shrink-0">
                    <p className="text-xs font-bold text-gray-900 dark:text-gray-100">{fmt(s.revenue)}</p>
                    <p className={`text-[10px] font-semibold ${s.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {fmt(s.profit)}
                    </p>
                  </div>

                  <ArrowRight className="w-4 h-4 text-gray-300 dark:text-gray-600 group-hover:text-amber-500 transition-colors flex-shrink-0" />
                </button>
              );
            })}
          </div>
        </div>

      </div>
    </Layout>
  );
}

// ── KPI Card ────────────────────────────────────────────────────────────────

function KPI({
  label, value, sub, icon, iconBg, iconColor, trend,
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  trend?: 'up' | 'down';
}) {
  return (
    <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-2xl p-5">
      <div className="flex items-start justify-between mb-3">
        <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</p>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${iconBg}`}>
          <span className={iconColor}>{icon}</span>
        </div>
      </div>
      <p className="text-2xl font-black text-gray-900 dark:text-gray-100 mb-1 flex items-center gap-2">
        {value}
        {trend && (
          trend === 'up'
            ? <TrendingUp className="w-4 h-4 text-emerald-500" />
            : <TrendingDown className="w-4 h-4 text-red-500" />
        )}
      </p>
      <p className="text-xs text-gray-500 dark:text-gray-400">{sub}</p>
    </div>
  );
}

// ── Alerts Panel ─────────────────────────────────────────────────────────────

type SortOption = 'business' | 'type' | 'severity' | 'date';
type AlertTypeFilter = 'all' | 'error' | 'warning' | 'info';

const SEVERITY_ORDER: Record<string, number> = { error: 0, warning: 1, info: 2 };

function formatAlertDate(d: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Ahora mismo';
  if (diffMins < 60) return `Hace ${diffMins} min`;
  if (diffHours < 24) return `Hace ${diffHours}h`;
  if (diffDays === 1) return `Ayer, ${d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`;
  if (diffDays < 7) return `Hace ${diffDays} días, ${d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`;
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) + ', ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

const ALERT_TYPE_META: Record<string, { label: string; icon: typeof AlertTriangle; dot: string; bg: string; text: string; border: string }> = {
  error:   { label: 'Error',       icon: AlertOctagon,  dot: 'bg-red-500',    bg: 'bg-red-50 dark:bg-red-950/20',       text: 'text-red-700 dark:text-red-300',       border: 'border-red-200 dark:border-red-800' },
  warning: { label: 'Advertencia', icon: AlertTriangle,  dot: 'bg-amber-500',  bg: 'bg-amber-50 dark:bg-amber-950/20',   text: 'text-amber-700 dark:text-amber-300',   border: 'border-amber-200 dark:border-amber-800' },
  info:    { label: 'Info',        icon: AlertCircle, dot: 'bg-blue-500',   bg: 'bg-blue-50 dark:bg-blue-950/20',     text: 'text-blue-700 dark:text-blue-300',     border: 'border-blue-200 dark:border-blue-800' },
};

function AlertsPanel({
  allAlerts,
  businesses,
  onClose,
  onGoToBusiness,
}: {
  allAlerts: { business: Business; alert: BusinessAlert }[];
  businesses: Business[];
  onClose: () => void;
  onGoToBusiness: (businessId: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<AlertTypeFilter>('all');
  const [businessFilter, setBusinessFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortOption>('severity');
  const [showFilters, setShowFilters] = useState(false);

  const filtered = useMemo(() => {
    let items = [...allAlerts];

    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(i =>
        i.alert.message.toLowerCase().includes(q) ||
        i.business.name.toLowerCase().includes(q),
      );
    }
    if (typeFilter !== 'all') {
      items = items.filter(i => i.alert.type === typeFilter);
    }
    if (businessFilter !== 'all') {
      items = items.filter(i => i.business.business_id === businessFilter);
    }

    items.sort((a, b) => {
      if (sortBy === 'severity') return (SEVERITY_ORDER[a.alert.type] ?? 9) - (SEVERITY_ORDER[b.alert.type] ?? 9);
      if (sortBy === 'business') return a.business.name.localeCompare(b.business.name);
      if (sortBy === 'date') return b.alert.date.getTime() - a.alert.date.getTime();
      return a.alert.type.localeCompare(b.alert.type);
    });

    return items;
  }, [allAlerts, search, typeFilter, businessFilter, sortBy]);

  const counts = useMemo(() => {
    const c = { error: 0, warning: 0, info: 0 };
    for (const i of allAlerts) c[i.alert.type]++;
    return c;
  }, [allAlerts]);

  return (
    <div className="border border-orange-200 dark:border-orange-800 border-t-0 rounded-b-xl bg-white dark:bg-gray-900 overflow-hidden">

      {/* Toolbar: type badges + search + filters + sort */}
      <div className="px-4 pt-3 pb-2 border-b border-gray-100 dark:border-gray-800 space-y-2.5">
        {/* Type badges */}
        <div className="flex items-center gap-2 flex-wrap">
          {(['error', 'warning', 'info'] as const).map(t => {
            const meta = ALERT_TYPE_META[t];
            return (
              <button
                key={t}
                type="button"
                onClick={() => setTypeFilter(prev => prev === t ? 'all' : t)}
                className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-semibold border transition-all ${
                  typeFilter === t
                    ? `${meta.bg} ${meta.text} ${meta.border}`
                    : 'bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                {counts[t]} {meta.label}
              </button>
            );
          })}
        </div>

        {/* Search + filters + sort */}
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar alertas o negocios..."
              className="w-full pl-7 pr-3 py-1.5 text-[11px] bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400 transition-all"
            />
          </div>
          <button
            type="button"
            onClick={() => setShowFilters(f => !f)}
            className={`flex items-center gap-1 px-2 py-1.5 text-[10px] font-medium rounded-lg border transition-all ${
              showFilters || businessFilter !== 'all'
                ? 'bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                : 'bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <Filter className="w-3 h-3" />
            Filtros
            {businessFilter !== 'all' && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />}
          </button>
          <button
            type="button"
            onClick={() => setSortBy(prev => prev === 'severity' ? 'date' : prev === 'date' ? 'business' : prev === 'business' ? 'type' : 'severity')}
            className="flex items-center gap-1 px-2 py-1.5 text-[10px] font-medium bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-all"
          >
            <ArrowUpDown className="w-3 h-3" />
            {sortBy === 'severity' ? 'Gravedad' : sortBy === 'date' ? 'Fecha' : sortBy === 'business' ? 'Negocio' : 'Tipo'}
          </button>
        </div>

        {/* Business filter chips */}
        {showFilters && (
          <div className="p-2.5 bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-lg">
            <p className="text-[9px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">Filtrar por negocio</p>
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => setBusinessFilter('all')}
                className={`px-2 py-0.5 text-[10px] font-medium rounded-md border transition-all ${
                  businessFilter === 'all'
                    ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 border-gray-900 dark:border-gray-100'
                    : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600'
                }`}
              >
                Todos
              </button>
              {businesses
                .filter(b => allAlerts.some(a => a.business.business_id === b.business_id))
                .map(b => (
                  <button
                    key={b.business_id}
                    type="button"
                    onClick={() => setBusinessFilter(prev => prev === b.business_id ? 'all' : b.business_id)}
                    className={`px-2 py-0.5 text-[10px] font-medium rounded-md border transition-all ${
                      businessFilter === b.business_id
                        ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 border-gray-900 dark:border-gray-100'
                        : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600'
                    }`}
                  >
                    {b.name}
                  </button>
                ))}
            </div>
          </div>
        )}
      </div>

      {/* Alert list */}
      <div className="max-h-80 overflow-y-auto px-4 py-3">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Search className="w-6 h-6 text-gray-300 dark:text-gray-600 mb-2" />
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Sin resultados</p>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">Prueba con otros filtros o términos de búsqueda</p>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {filtered.map((item, idx) => {
              const meta = ALERT_TYPE_META[item.alert.type] || ALERT_TYPE_META.info;
              const Icon = meta.icon;
              const initials = item.business.name.slice(0, 2).toUpperCase();
              const typeLabel = BUSINESS_TYPE_LABELS[item.business.businessType] || item.business.businessType;
              const typeColor = BUSINESS_TYPE_COLORS[item.business.businessType] || 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';

              return (
                <div
                  key={`${item.business.business_id}-${item.alert.id}-${idx}`}
                  className={`flex items-start gap-2.5 p-2.5 rounded-lg border ${meta.border} ${meta.bg} transition-all`}
                >
                  <div className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 ${
                    item.alert.type === 'error' ? 'bg-red-100 dark:bg-red-900/40' :
                    item.alert.type === 'warning' ? 'bg-amber-100 dark:bg-amber-900/40' :
                    'bg-blue-100 dark:bg-blue-900/40'
                  }`}>
                    <Icon className={`w-3 h-3 ${
                      item.alert.type === 'error' ? 'text-red-600 dark:text-red-400' :
                      item.alert.type === 'warning' ? 'text-amber-600 dark:text-amber-400' :
                      'text-blue-600 dark:text-blue-400'
                    }`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-[11px] font-semibold leading-tight ${meta.text}`}>{item.alert.message}</p>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <span className="flex items-center gap-0.5 text-[9px] text-gray-400 dark:text-gray-500">
                        <Clock className="w-2.5 h-2.5" />
                        {formatAlertDate(item.alert.date)}
                      </span>
                      <span className="text-gray-300 dark:text-gray-600">·</span>
                      <button
                        type="button"
                        onClick={() => { onGoToBusiness(item.business.business_id); onClose(); }}
                        className="flex items-center gap-1 text-[9px] text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors group/biz"
                      >
                        <div className="w-3.5 h-3.5 rounded flex items-center justify-center bg-gray-900 dark:bg-gray-600 overflow-hidden flex-shrink-0">
                          {item.business.logo ? (
                            <img src={item.business.logo} alt="" className="w-3.5 h-3.5 object-cover" />
                          ) : (
                            <span className="text-[5px] font-bold text-white">{initials}</span>
                          )}
                        </div>
                        <span className="font-medium group-hover/biz:underline underline-offset-2">{item.business.name}</span>
                      </button>
                      <span className={`px-1 py-0.5 text-[8px] font-semibold rounded ${typeColor}`}>{typeLabel}</span>
                    </div>
                  </div>
                  <span className={`px-1.5 py-0.5 text-[8px] font-semibold rounded-md flex-shrink-0 ${
                    item.alert.type === 'error' ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300' :
                    item.alert.type === 'warning' ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' :
                    'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                  }`}>
                    {meta.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
