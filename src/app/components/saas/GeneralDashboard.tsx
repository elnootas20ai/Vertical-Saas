import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  ArrowRight,
  Banknote,
  Building2,
  ChevronDown,
  ChevronRight,
  MapPin,
  Package,
  Receipt,
  RefreshCw,
  Search,
  ShoppingBag,
  Sparkles,
  Store,
  Tag,
  TrendingDown,
  TrendingUp,
  Users,
  Clock,
  FileText,
  Wallet,
} from 'lucide-react';
import { fmtEuro } from '../../lib/portfolioMetrics';
import { Layout } from './Layout';
import { BUSINESS_TYPE_COLORS, BUSINESS_TYPE_LABELS } from './BusinessCarousel';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import type { Business, BusinessType } from '../../lib/businessApi';
import {
  usePortfolioOverview,
  type PortfolioBusiness,
  type PortfolioTotals,
} from '../../hooks/usePortfolioOverview';
import { TeamRrhhCompactRow } from './TeamRrhhDashboardWidget';

interface GeneralDashboardProps {
  onSelectBusiness: (businessId: string) => void;
}

export function GeneralDashboard({ onSelectBusiness }: GeneralDashboardProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { businesses, switchBusiness } = useBusiness();

  const { rows, totals, finance, loading, error, reload } = usePortfolioOverview(user, businesses);

  const [businessFilter, setBusinessFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (rows.length > 0 && expandedIds.size === 0) {
      setExpandedIds(new Set(rows.map((r) => r.businessId)));
    }
  }, [rows, expandedIds.size]);

  const filteredRows = useMemo(() => {
    let list = rows;
    if (businessFilter !== 'all') {
      list = list.filter((r) => r.businessId === businessFilter);
    }
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((r) => {
      if (r.business.name.toLowerCase().includes(q)) return true;
      if (r.brands.some((b) => b.name.toLowerCase().includes(q))) return true;
      if (r.stores.some((s) => s.name.toLowerCase().includes(q))) return true;
      return false;
    });
  }, [rows, businessFilter, search]);

  const filteredTotals = useMemo((): PortfolioTotals => {
    return {
      businesses: filteredRows.length,
      brands: filteredRows.reduce((s, r) => s + r.brandCount, 0),
      stores: filteredRows.reduce((s, r) => s + r.storeCount, 0),
      pdv: filteredRows.reduce((s, r) => s + r.pdvCount, 0),
      members: filteredRows.reduce((s, r) => s + r.memberCount, 0),
      revenueToday: filteredRows.reduce((s, r) => s + r.metrics.revenueToday, 0),
      revenueMonth: filteredRows.reduce((s, r) => s + r.metrics.revenueMonth, 0),
      ordersMonth: filteredRows.reduce((s, r) => s + r.metrics.ordersMonth, 0),
      activeOrders: filteredRows.reduce((s, r) => s + r.metrics.activeOrders, 0),
      openCashRegisters: filteredRows.reduce((s, r) => s + r.metrics.openCashRegisters, 0),
      clockedInNow: filteredRows.reduce((s, r) => s + r.team.clockedInNow, 0),
      pendingVacations: filteredRows.reduce((s, r) => s + r.team.pendingVacationRequests, 0),
      payslipsThisMonth: filteredRows.reduce((s, r) => s + r.team.payslipsThisMonth, 0),
    };
  }, [filteredRows]);

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const enterBusiness = (businessId: string) => {
    switchBusiness(businessId);
    onSelectBusiness(businessId);
  };

  const openBusinessSettings = (businessId: string) => {
    switchBusiness(businessId);
    navigate('/saas/settings/empresas');
  };

  const openBrands = (businessId: string) => {
    switchBusiness(businessId);
    navigate('/saas/settings/marca');
  };

  const openStores = (businessId: string) => {
    switchBusiness(businessId);
    navigate('/saas/settings/tienda');
  };

  const openTeam = (businessId: string) => {
    switchBusiness(businessId);
    navigate('/saas/team');
  };

  const openPayroll = (businessId: string) => {
    switchBusiness(businessId);
    navigate('/saas/payroll');
  };

  return (
    <Layout
      title="Centro de control"
      subtitle="Todas tus empresas, marcas y tiendas en un solo lugar"
    >
      <div className="flex flex-col gap-6 -mt-1">
        {/* Hero + toolbar */}
        <div className="relative overflow-hidden rounded-2xl border border-gray-200/80 dark:border-gray-700/80 bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 text-white p-5 sm:p-6">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(99,102,241,0.35),_transparent_50%)]" />
          <div className="relative flex flex-col gap-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-indigo-200 text-xs font-semibold uppercase tracking-wider mb-1">
                  <Sparkles className="w-3.5 h-3.5" />
                  Portfolio multi-empresa
                </div>
                <h2 className="text-xl sm:text-2xl font-black tracking-tight">
                  Vista completa del negocio
                </h2>
                <p className="text-sm text-slate-300 mt-1 max-w-xl">
                  Empresas, marcas, tiendas e ingresos del mes en una sola vista.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void reload()}
                disabled={loading}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/20 text-sm font-semibold transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                Actualizar
              </button>
            </div>
          </div>
        </div>

        {/* Finanzas globales (cuenta titular) */}
        <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2 mb-4">
            <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Wallet className="w-4 h-4 text-indigo-500" />
              Finanzas del mes (cuenta global)
            </h3>
            <button
              type="button"
              onClick={() => navigate('/saas/finance')}
              className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              Ir a finanzas →
            </button>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <MoneyCard label="Ingresos" value={fmtEuro(finance.incomeMonth)} tone="emerald" icon={<TrendingUp className="w-4 h-4" />} />
            <MoneyCard label="Gastos" value={fmtEuro(finance.expensesMonth)} tone="rose" icon={<TrendingDown className="w-4 h-4" />} />
            <MoneyCard label="Resultado" value={fmtEuro(finance.profitMonth)} tone={finance.profitMonth >= 0 ? 'emerald' : 'rose'} icon={<Banknote className="w-4 h-4" />} />
            <MoneyCard label="Pendiente cobro" value={fmtEuro(finance.pendingAmount)} tone="amber" icon={<Receipt className="w-4 h-4" />} />
            <MoneyCard label="Saldo bancos" value={fmtEuro(finance.cashBalance)} tone="blue" icon={<Wallet className="w-4 h-4" />} />
          </div>
        </section>

        {/* KPIs operativos delivery + RRHH */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard label="Ingresos mes" value={fmtEuro(filteredTotals.revenueMonth)} icon={<TrendingUp className="w-4 h-4" />} tone="emerald" sub={`Hoy: ${fmtEuro(filteredTotals.revenueToday)}`} />
          <StatCard label="Pedidos mes" value={String(filteredTotals.ordersMonth)} icon={<ShoppingBag className="w-4 h-4" />} tone="blue" sub="Creados este mes" />
          <StatCard label="En curso" value={String(filteredTotals.activeOrders)} icon={<Package className="w-4 h-4" />} tone="amber" sub="Pedidos activos" />
          <StatCard label="Fichados ahora" value={String(filteredTotals.clockedInNow)} icon={<Clock className="w-4 h-4" />} tone="violet" sub="Equipo en turno" />
          <StatCard label="Vac. pendientes" value={String(filteredTotals.pendingVacations)} icon={<Users className="w-4 h-4" />} tone="rose" sub="Por revisar" />
          <StatCard label="Nóminas mes" value={String(filteredTotals.payslipsThisMonth)} icon={<FileText className="w-4 h-4" />} tone="slate" sub="Subidas este mes" />
        </div>

        {/* Filters */}
        <div className="sticky top-0 z-10 flex flex-col gap-3 p-4 rounded-2xl bg-white/90 dark:bg-gray-900/90 backdrop-blur-md border border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar empresa, marca o tienda…"
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 outline-none focus:border-indigo-500 dark:focus:border-indigo-400"
            />
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mr-1">Empresa</span>
            <FilterChip active={businessFilter === 'all'} onClick={() => setBusinessFilter('all')}>
              Todas
            </FilterChip>
            {rows.map((r) => (
              <FilterChip
                key={r.businessId}
                active={businessFilter === r.businessId}
                onClick={() => setBusinessFilter((prev) => (prev === r.businessId ? 'all' : r.businessId))}
              >
                {r.business.name}
              </FilterChip>
            ))}
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-800 px-4 py-3 text-sm text-red-800 dark:text-red-200">
            {error}
          </div>
        )}

        {loading && filteredRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-500">
            <RefreshCw className="w-8 h-8 animate-spin mb-3" />
            <p className="text-sm font-medium">Cargando portfolio…</p>
          </div>
        ) : filteredRows.length === 0 ? (
          <EmptyPortfolio onCreate={() => navigate('/saas/settings/empresas')} />
        ) : (
          <div className="flex flex-col gap-4">
            {filteredRows.map((row) => (
              <BusinessCard
                key={row.businessId}
                row={row}
                expanded={expandedIds.has(row.businessId)}
                onToggleExpand={() => toggleExpanded(row.businessId)}
                onEnter={() => enterBusiness(row.businessId)}
                onOpenBrands={() => openBrands(row.businessId)}
                onOpenStores={() => openStores(row.businessId)}
                onOpenSettings={() => openBusinessSettings(row.businessId)}
                onOpenOps={() => {
                  switchBusiness(row.businessId);
                  navigate('/saas/delivery-ops');
                }}
                onOpenCaja={() => {
                  switchBusiness(row.businessId);
                  navigate('/saas/vertical/delivery/caja');
                }}
                onOpenTeam={() => openTeam(row.businessId)}
                onOpenPayroll={() => openPayroll(row.businessId)}
              />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}

// ── Subcomponents ───────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  icon,
  tone,
  className = '',
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  tone: 'blue' | 'violet' | 'emerald' | 'amber' | 'rose' | 'slate';
  className?: string;
}) {
  const tones = {
    blue: 'from-blue-500/10 to-blue-600/5 border-blue-200/80 dark:border-blue-800 text-blue-600 dark:text-blue-400',
    violet: 'from-violet-500/10 to-violet-600/5 border-violet-200/80 dark:border-violet-800 text-violet-600 dark:text-violet-400',
    emerald: 'from-emerald-500/10 to-emerald-600/5 border-emerald-200/80 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400',
    amber: 'from-amber-500/10 to-amber-600/5 border-amber-200/80 dark:border-amber-800 text-amber-600 dark:text-amber-400',
    rose: 'from-rose-500/10 to-rose-600/5 border-rose-200/80 dark:border-rose-800 text-rose-600 dark:text-rose-400',
    slate: 'from-slate-500/10 to-slate-600/5 border-slate-200/80 dark:border-slate-700 text-slate-600 dark:text-slate-400',
  };
  return (
    <div
      className={`rounded-2xl border bg-gradient-to-br p-4 ${tones[tone]} ${className}`}
    >
      <div className="flex items-center justify-between mb-2 opacity-80">{icon}</div>
      <p className="text-xl sm:text-2xl font-black text-gray-900 dark:text-gray-100 tabular-nums leading-tight">{value}</p>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mt-0.5">
        {label}
      </p>
      {sub ? <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">{sub}</p> : null}
    </div>
  );
}

function MoneyCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone: 'emerald' | 'rose' | 'amber' | 'blue';
}) {
  const tones = {
    emerald: 'text-emerald-600 dark:text-emerald-400',
    rose: 'text-rose-600 dark:text-rose-400',
    amber: 'text-amber-600 dark:text-amber-400',
    blue: 'text-blue-600 dark:text-blue-400',
  };
  return (
    <div className="rounded-xl border border-gray-100 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-900/40 p-3">
      <div className={`flex items-center gap-1.5 mb-1 ${tones[tone]}`}>{icon}<span className="text-[10px] font-bold uppercase tracking-wide">{label}</span></div>
      <p className="text-lg font-black text-gray-900 dark:text-gray-100 tabular-nums">{value}</p>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1 rounded-lg text-xs font-semibold border-2 transition-colors ${
        active
          ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 border-gray-900 dark:border-gray-100'
          : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-gray-400'
      }`}
    >
      {children}
    </button>
  );
}

function BusinessCard({
  row,
  expanded,
  onToggleExpand,
  onEnter,
  onOpenBrands,
  onOpenStores,
  onOpenSettings,
  onOpenOps,
  onOpenCaja,
  onOpenTeam,
  onOpenPayroll,
}: {
  row: PortfolioBusiness;
  expanded: boolean;
  onToggleExpand: () => void;
  onEnter: () => void;
  onOpenBrands: () => void;
  onOpenStores: () => void;
  onOpenSettings: () => void;
  onOpenOps: () => void;
  onOpenCaja: () => void;
  onOpenTeam: () => void;
  onOpenPayroll: () => void;
}) {
  const b = row.business;
  const m = row.metrics;
  const typeLabel = BUSINESS_TYPE_LABELS[b.businessType as BusinessType] || b.businessType;
  const typeColor = BUSINESS_TYPE_COLORS[b.businessType] || 'bg-gray-100 text-gray-700';
  const revenue = m.revenueMonth;
  const orders = m.ordersMonth;
  const delivered = m.deliveredMonth;
  const channels = Object.entries(m.revenueByChannel).sort((a, b) => b[1] - a[1]);

  return (
    <article className="rounded-2xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      <div className="p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={onToggleExpand}
            className="mt-1 p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
            aria-expanded={expanded}
          >
            {expanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
          </button>

          <div className="w-12 h-12 rounded-xl bg-gray-900 dark:bg-gray-700 flex items-center justify-center flex-shrink-0 overflow-hidden">
            {b.logo ? (
              <img src={b.logo} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-sm font-black text-white">{b.name.slice(0, 2).toUpperCase()}</span>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 truncate">{b.name}</h3>
              <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-md ${typeColor}`}>{typeLabel}</span>
              {b.city && (
                <span className="text-[11px] text-gray-400 flex items-center gap-0.5">
                  <MapPin className="w-3 h-3" />
                  {b.city}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-3 mt-2 text-xs text-gray-600 dark:text-gray-400">
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">{fmtEuro(revenue)} ingresos</span>
              <span className="text-gray-300">·</span>
              <span>{orders} pedidos · {delivered} entregados</span>
              <span className="text-gray-300">·</span>
              <span>{row.brandCount} marcas · {row.storeCount} tiendas</span>
            </div>
            {row.isDelivery && channels.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {channels.slice(0, 4).map(([ch, amt]) => (
                  <span key={ch} className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                    {ch}: {fmtEuro(amt)}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          <button
            type="button"
            onClick={onEnter}
            className="inline-flex items-center justify-center gap-1 px-3 py-1.5 text-[11px] font-bold rounded-lg bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 hover:opacity-90 flex-shrink-0"
          >
            Entrar
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {expanded && (
          <div className="mt-5 pt-5 border-t border-gray-100 dark:border-gray-700 space-y-5">
            {row.isDelivery ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                <MetricPill label="Ingresos" value={fmtEuro(revenue)} highlight />
                <MetricPill label="Ticket medio" value={fmtEuro(m.avgTicketMonth)} />
                <MetricPill label="Activos" value={String(m.activeOrders)} />
                <MetricPill label="Cancelados" value={String(m.cancelledMonth)} />
                <MetricPill label="Cajas abiertas" value={String(m.openCashRegisters)} />
                <MetricPill label="Efectivo en caja" value={fmtEuro(m.cashInRegisters)} />
              </div>
            ) : (
              <p className="text-xs text-gray-500 italic">Métricas de pedidos disponibles para negocios tipo delivery con tiendas configuradas.</p>
            )}

            {row.isDelivery && (m.openCashRegisters > 0 || m.cashInRegisters > 0) ? (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onOpenCaja(); }}
                className="flex items-center gap-2 w-full px-3 py-2.5 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-left hover:bg-amber-100 dark:hover:bg-amber-900/20 transition-colors"
              >
                <Banknote className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0" />
                <span className="text-xs font-semibold text-amber-900 dark:text-amber-100">
                  Panel de caja — {m.openCashRegisters} abierta{m.openCashRegisters !== 1 ? 's' : ''} · {fmtEuro(m.cashInRegisters)} en efectivo
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-amber-700 ml-auto shrink-0" />
              </button>
            ) : null}

            <section>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-bold uppercase tracking-wide text-gray-500 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-violet-500" />
                  Equipo y RRHH
                </h4>
                <div className="flex items-center gap-3">
                  <button type="button" onClick={onOpenTeam} className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">
                    Equipo
                  </button>
                  <button type="button" onClick={onOpenPayroll} className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">
                    Nóminas
                  </button>
                </div>
              </div>
              <TeamRrhhCompactRow snapshot={row.team} />
            </section>

            <div className="grid gap-5 lg:grid-cols-2">
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-bold uppercase tracking-wide text-gray-500 flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-violet-500" />
                    Marcas ({row.brands.length})
                  </h4>
                  <button type="button" onClick={onOpenBrands} className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">
                    Gestionar
                  </button>
                </div>
                {row.brands.length === 0 ? (
                  <p className="text-xs text-gray-400 italic">Sin marcas — créalas en Ajustes → Marca</p>
                ) : (
                  <ul className="space-y-2">
                    {row.brands.map((brand) => (
                      <li
                        key={brand.id}
                        className="flex items-start gap-2 p-2.5 rounded-xl bg-violet-50/80 dark:bg-violet-950/20 border border-violet-100 dark:border-violet-900/50"
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0"
                          style={{ backgroundColor: brand.primaryColor || '#8b5cf6' }}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                            {brand.name}
                            {brand.isDefault && (
                              <span className="ml-1.5 text-[9px] font-bold uppercase text-violet-600">default</span>
                            )}
                          </p>
                          {brand.revenueMonth > 0 ? (
                            <p className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5">
                              {fmtEuro(brand.revenueMonth)} este mes
                            </p>
                          ) : null}
                          {brand.linkedStoreNames.length > 0 ? (
                            <p className="text-[11px] text-gray-500 mt-0.5 truncate">
                              Tiendas: {brand.linkedStoreNames.join(', ')}
                            </p>
                          ) : (
                            <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">Sin tiendas enlazadas</p>
                          )}
                        </div>
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                            brand.active
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                              : 'bg-gray-200 text-gray-600'
                          }`}
                        >
                          {brand.active ? 'Activa' : 'Off'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-bold uppercase tracking-wide text-gray-500 flex items-center gap-1.5">
                    <Store className="w-3.5 h-3.5 text-emerald-500" />
                    Tiendas / PDV ({row.stores.length})
                  </h4>
                  <button type="button" onClick={onOpenStores} className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">
                    Gestionar
                  </button>
                </div>
                {row.stores.length === 0 ? (
                  <p className="text-xs text-gray-400 italic">Sin tiendas — créalas en Ajustes → Tienda</p>
                ) : (
                  <ul className="space-y-2">
                    {row.stores.map((store) => (
                      <li
                        key={store.id}
                        className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/50"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{store.name}</p>
                          <p className="text-[11px] text-gray-500">
                            {store.city || 'Sin ciudad'}
                            {store.hasPdv ? ' · PDV caja OK' : ' · Sin PDV caja'}
                          </p>
                        </div>
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${
                            store.active
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-gray-200 text-gray-600'
                          }`}
                        >
                          {store.active ? 'Activa' : 'Off'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

            <div className="lg:col-span-2 flex flex-wrap gap-3">
              {row.isDelivery ? (
                <button type="button" onClick={onOpenOps} className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">
                  Centro operativo →
                </button>
              ) : null}
              <button type="button" onClick={onOpenSettings} className="text-xs font-semibold text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 underline underline-offset-2">
                Ajustes de empresa
              </button>
            </div>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

function MetricPill({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl px-3 py-2 border ${highlight ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30' : 'border-gray-100 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/40'}`}>
      <p className="text-[9px] font-bold uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`text-sm font-black tabular-nums ${highlight ? 'text-emerald-700 dark:text-emerald-300' : 'text-gray-900 dark:text-gray-100'}`}>{value}</p>
    </div>
  );
}

function EmptyPortfolio({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-gray-300 dark:border-gray-600 p-12 text-center bg-white dark:bg-gray-800">
      <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
      <p className="text-base font-bold text-gray-900 dark:text-gray-100">Sin empresas en el portfolio</p>
      <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">
        Crea tu primera empresa para ver marcas, tiendas e ingresos aquí.
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="mt-4 px-4 py-2 rounded-xl bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-sm font-bold"
      >
        Ir a empresas
      </button>
    </div>
  );
}
