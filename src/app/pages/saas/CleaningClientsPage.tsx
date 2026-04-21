import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  Users, Building2, MapPin, Phone, Mail, TrendingUp, TrendingDown,
  AlertTriangle, AlertCircle, FileText, Receipt, Star, Calendar,
  Search, Filter, Plus, Download, ChevronDown, ChevronRight, X, Eye,
  Edit2, MoreHorizontal, Clock, CheckCircle2, XCircle, DollarSign,
  BarChart3, ArrowUpRight, ArrowDownRight, UserCheck, UserX, Briefcase,
  Home, ExternalLink,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useBusiness } from '../../context/BusinessContext';
import { Layout } from '../../components/saas/Layout';
import {
  listCleaningClientsRequest,
  getCleaningClientProfileRequest,
  getCleaningClientStatsRequest,
  listCleaningClientAlertsRequest,
  dismissCleaningClientAlertRequest,
  listClientLocationsRequest,
  saveClientLocationRequest,
  deleteClientLocationRequest,
  getCleaningClientProfitabilityRequest,
  getPortfolioProfitabilityRequest,
  type CleaningClientListItem,
  type CleaningClientProfile,
  type CleaningClientStats,
  type CleaningClientAlert,
  type ClientLocationRecord,
  type ClientProfitability,
  type PortfolioProfitability,
  type ProfitabilityClass,
} from '../../lib/cleaningClientsApi';

// ─── Constants ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

const PROFITABILITY_STYLES: Record<ProfitabilityClass, { label: string; bg: string; text: string }> = {
  high:     { label: 'Alta',       bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-400' },
  medium:   { label: 'Media',      bg: 'bg-blue-100 dark:bg-blue-900/30',      text: 'text-blue-700 dark:text-blue-400' },
  low:      { label: 'Baja',       bg: 'bg-amber-100 dark:bg-amber-900/30',    text: 'text-amber-700 dark:text-amber-400' },
  negative: { label: 'Negativa',   bg: 'bg-red-100 dark:bg-red-900/30',        text: 'text-red-700 dark:text-red-400' },
  unknown:  { label: 'Sin datos',  bg: 'bg-gray-100 dark:bg-gray-800',         text: 'text-gray-500 dark:text-gray-400' },
};

const CONTRACT_STATUS_STYLES: Record<string, { label: string; bg: string; text: string }> = {
  all_active:      { label: 'Activo',           bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-400' },
  some_paused:     { label: 'Pausado',          bg: 'bg-amber-100 dark:bg-amber-900/30',     text: 'text-amber-700 dark:text-amber-400' },
  pending_renewal: { label: 'Renovación pend.', bg: 'bg-blue-100 dark:bg-blue-900/30',       text: 'text-blue-700 dark:text-blue-400' },
  expired:         { label: 'Expirado',         bg: 'bg-red-100 dark:bg-red-900/30',         text: 'text-red-700 dark:text-red-400' },
  no_contracts:    { label: 'Sin contratos',    bg: 'bg-gray-100 dark:bg-gray-800',          text: 'text-gray-500 dark:text-gray-400' },
};

const ALERT_STYLES: Record<string, string> = {
  critical: 'border-l-4 border-red-500 bg-red-50 dark:bg-red-900/20',
  warning:  'border-l-4 border-amber-500 bg-amber-50 dark:bg-amber-900/20',
  info:     'border-l-4 border-blue-500 bg-blue-50 dark:bg-blue-900/20',
};

const SORT_OPTIONS = [
  { value: 'name_asc', label: 'Nombre A-Z', sort: 'name', dir: 'asc' },
  { value: 'name_desc', label: 'Nombre Z-A', sort: 'name', dir: 'desc' },
  { value: 'revenue_desc', label: 'Mayor facturación', sort: 'revenue', dir: 'desc' },
  { value: 'revenue_asc', label: 'Menor facturación', sort: 'revenue', dir: 'asc' },
  { value: 'incidents_desc', label: 'Más incidencias', sort: 'incidents', dir: 'desc' },
  { value: 'unpaid_desc', label: 'Mayor impago', sort: 'unpaid', dir: 'desc' },
  { value: 'renewal_asc', label: 'Renovación próxima', sort: 'renewal', dir: 'asc' },
  { value: 'created_desc', label: 'Más reciente', sort: 'created', dir: 'desc' },
];

type DrawerTab = 'contratos' | 'ubicaciones' | 'servicios' | 'incidencias' | 'facturas' | 'rentabilidad' | 'notas';
const DRAWER_TABS: { key: DrawerTab; label: string; icon: typeof FileText; managerOnly?: boolean }[] = [
  { key: 'contratos',    label: 'Contratos',    icon: FileText },
  { key: 'ubicaciones',  label: 'Ubicaciones',  icon: MapPin },
  { key: 'servicios',    label: 'Servicios',    icon: CheckCircle2 },
  { key: 'incidencias',  label: 'Incidencias',  icon: AlertTriangle },
  { key: 'facturas',     label: 'Facturas',     icon: Receipt, managerOnly: true },
  { key: 'rentabilidad', label: 'Rentabilidad', icon: BarChart3, managerOnly: true },
  { key: 'notas',        label: 'Notas',        icon: Edit2 },
];

// ─── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
}

function fmtDecimal(n: number): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function fmtPercent(n: number): string {
  return new Intl.NumberFormat('es-ES', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n / 100);
}

function fmtDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

function daysUntil(d: string | null): number | null {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
}

function getInitials(name: string): string {
  return name.split(' ').map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

// ─── Skeleton Components ───────────────────────────────────────────────────────

function KpiSkeleton() {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5 animate-pulse">
      <div className="h-3 w-24 bg-gray-200 dark:bg-gray-700 rounded mb-3" />
      <div className="h-8 w-20 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
      <div className="h-3 w-16 bg-gray-200 dark:bg-gray-700 rounded" />
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-sm p-5 animate-pulse">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded-full" />
        <div className="flex-1">
          <div className="h-4 w-40 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
          <div className="h-3 w-28 bg-gray-200 dark:bg-gray-700 rounded" />
        </div>
      </div>
      <div className="space-y-2">
        <div className="h-3 w-full bg-gray-200 dark:bg-gray-700 rounded" />
        <div className="h-3 w-3/4 bg-gray-200 dark:bg-gray-700 rounded" />
      </div>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="animate-pulse space-y-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-12 bg-gray-100 dark:bg-gray-800 rounded" />
      ))}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function CleaningClientsPage() {
  const { userId } = useApp() as any;
  const { currentBusiness: business } = useBusiness();
  const [searchParams, setSearchParams] = useSearchParams();

  // Role detection
  const isManager = useMemo(() => {
    if (!business?.members || !userId) return false;
    const member = business.members.find((m: any) => m.user_id === userId || m.userId === userId);
    return member ? ['owner', 'admin', 'manager'].includes(member.role) : false;
  }, [business, userId]);

  // ─── State ─────────────────────────────────────────────────────────────────

  const [clients, setClients] = useState<CleaningClientListItem[]>([]);
  const [stats, setStats] = useState<CleaningClientStats | null>(null);
  const [alerts, setAlerts] = useState<CleaningClientAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingStats, setLoadingStats] = useState(true);

  const [viewMode, setViewMode] = useState<'cards' | 'table'>(() =>
    (searchParams.get('view') as 'cards' | 'table') || 'cards',
  );
  const [searchText, setSearchText] = useState(searchParams.get('q') || '');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || 'all');
  const [responsibleFilter, setResponsibleFilter] = useState(searchParams.get('responsible') || 'all');
  const [zoneFilter, setZoneFilter] = useState(searchParams.get('zone') || 'all');
  const [profitabilityFilter, setProfitabilityFilter] = useState(searchParams.get('profitability') || 'all');
  const [sortOption, setSortOption] = useState(searchParams.get('sort') || 'name_asc');
  const [page, setPage] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const [alertsExpanded, setAlertsExpanded] = useState(true);

  // Drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [clientProfile, setClientProfile] = useState<CleaningClientProfile | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<DrawerTab>('contratos');

  // Portfolio panel
  const [portfolioOpen, setPortfolioOpen] = useState(false);
  const [portfolio, setPortfolio] = useState<PortfolioProfitability | null>(null);
  const [portfolioLoading, setPortfolioLoading] = useState(false);

  // ─── Derived values ────────────────────────────────────────────────────────

  const uniqueZones = useMemo(() => {
    const zones = new Set<string>();
    clients.forEach(c => c.locations?.forEach(l => { if (l.zone) zones.add(l.zone); }));
    return Array.from(zones).sort();
  }, [clients]);

  const uniqueResponsibles = useMemo(() => {
    const set = new Set<string>();
    clients.forEach(c => { if (c.assignedResponsible) set.add(c.assignedResponsible); });
    return Array.from(set).sort();
  }, [clients]);

  const activeAlerts = useMemo(() => alerts.filter(a => !a.dismissed), [alerts]);
  const criticalAlerts = useMemo(() => activeAlerts.filter(a => a.severity === 'critical'), [activeAlerts]);
  const warningAlerts = useMemo(() => activeAlerts.filter(a => a.severity === 'warning'), [activeAlerts]);
  const infoAlerts = useMemo(() => activeAlerts.filter(a => a.severity === 'info'), [activeAlerts]);

  // Client-side filtering/sorting/pagination
  const filteredClients = useMemo(() => {
    let list = [...clients];
    if (searchText) {
      const q = searchText.toLowerCase();
      list = list.filter(c =>
        c.clientName.toLowerCase().includes(q) ||
        c.clientPhone.includes(q) ||
        c.clientEmail.toLowerCase().includes(q) ||
        c.locations?.some(l => l.address.toLowerCase().includes(q) || l.zone.toLowerCase().includes(q)),
      );
    }
    if (statusFilter !== 'all') list = list.filter(c => c.contractStatus === statusFilter);
    if (responsibleFilter !== 'all') list = list.filter(c => c.assignedResponsible === responsibleFilter);
    if (zoneFilter !== 'all') list = list.filter(c => c.locations?.some(l => l.zone === zoneFilter));
    if (profitabilityFilter !== 'all') list = list.filter(c => c.profitability === profitabilityFilter);

    const opt = SORT_OPTIONS.find(o => o.value === sortOption) || SORT_OPTIONS[0];
    list.sort((a, b) => {
      const dir = opt.dir === 'asc' ? 1 : -1;
      switch (opt.sort) {
        case 'name': return dir * a.clientName.localeCompare(b.clientName);
        case 'revenue': return dir * (a.monthlyRevenue - b.monthlyRevenue);
        case 'incidents': return dir * (a.openIncidents - b.openIncidents);
        case 'unpaid': return dir * (a.unpaidAmount - b.unpaidAmount);
        case 'renewal': {
          const da = a.nearestRenewal ? new Date(a.nearestRenewal).getTime() : Infinity;
          const db = b.nearestRenewal ? new Date(b.nearestRenewal).getTime() : Infinity;
          return dir * (da - db);
        }
        case 'created': return dir * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        default: return 0;
      }
    });
    return list;
  }, [clients, searchText, statusFilter, responsibleFilter, zoneFilter, profitabilityFilter, sortOption]);

  const totalPages = Math.max(1, Math.ceil(filteredClients.length / PAGE_SIZE));
  const paginatedClients = useMemo(
    () => filteredClients.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [filteredClients, page],
  );

  // ─── URL sync ──────────────────────────────────────────────────────────────

  useEffect(() => {
    const params = new URLSearchParams();
    if (searchText) params.set('q', searchText);
    if (statusFilter !== 'all') params.set('status', statusFilter);
    if (responsibleFilter !== 'all') params.set('responsible', responsibleFilter);
    if (zoneFilter !== 'all') params.set('zone', zoneFilter);
    if (profitabilityFilter !== 'all') params.set('profitability', profitabilityFilter);
    if (sortOption !== 'name_asc') params.set('sort', sortOption);
    if (viewMode !== 'cards') params.set('view', viewMode);
    setSearchParams(params, { replace: true });
  }, [searchText, statusFilter, responsibleFilter, zoneFilter, profitabilityFilter, sortOption, viewMode, setSearchParams]);

  // ─── Data loading ──────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setLoadingStats(true);
    try {
      const [clientsData, statsData, alertsData] = await Promise.all([
        listCleaningClientsRequest(userId),
        getCleaningClientStatsRequest(userId),
        listCleaningClientAlertsRequest(userId),
      ]);
      setClients(clientsData);
      setStats(statsData);
      setAlerts(alertsData);
    } catch (err: any) {
      toast.error('Error al cargar clientes: ' + (err?.message || 'Error desconocido'));
    } finally {
      setLoading(false);
      setLoadingStats(false);
    }
  }, [userId]);

  useEffect(() => { loadData(); }, [loadData]);

  // ─── Drawer ────────────────────────────────────────────────────────────────

  const openDrawer = useCallback(async (clientId: string) => {
    setSelectedClientId(clientId);
    setDrawerOpen(true);
    setActiveTab('contratos');
    setDrawerLoading(true);
    try {
      const profile = await getCleaningClientProfileRequest(userId, clientId);
      setClientProfile(profile);
    } catch (err: any) {
      toast.error('Error al cargar perfil: ' + (err?.message || ''));
    } finally {
      setDrawerLoading(false);
    }
  }, [userId]);

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    setTimeout(() => {
      setClientProfile(null);
      setSelectedClientId(null);
    }, 300);
  }, []);

  // ─── Alert actions ─────────────────────────────────────────────────────────

  const handleDismissAlert = useCallback(async (alertId: string) => {
    try {
      await dismissCleaningClientAlertRequest(userId, alertId);
      setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, dismissed: true } : a));
      toast.success('Alerta descartada');
    } catch {
      toast.error('Error al descartar alerta');
    }
  }, [userId]);

  // ─── Portfolio ─────────────────────────────────────────────────────────────

  const loadPortfolio = useCallback(async () => {
    if (!userId) return;
    setPortfolioLoading(true);
    try {
      const data = await getPortfolioProfitabilityRequest(userId);
      setPortfolio(data);
    } catch (err: any) {
      toast.error('Error al cargar análisis de cartera');
    } finally {
      setPortfolioLoading(false);
    }
  }, [userId]);

  const openPortfolio = useCallback(() => {
    setPortfolioOpen(true);
    loadPortfolio();
  }, [loadPortfolio]);

  // ─── Export ────────────────────────────────────────────────────────────────

  const handleExport = useCallback(() => {
    const headers = ['Nombre', 'Teléfono', 'Email', 'Contratos activos', 'Facturación/mes', 'Impagos', 'Incidencias', 'Rentabilidad', 'Responsable', 'Zona'];
    const rows = filteredClients.map(c => [
      c.clientName,
      c.clientPhone,
      c.clientEmail,
      c.activeContracts,
      c.monthlyRevenue,
      c.unpaidAmount,
      c.openIncidents,
      c.profitability,
      c.assignedResponsible,
      c.locations?.[0]?.zone || '',
    ]);
    const csv = [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clientes-limpieza-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exportado');
  }, [filteredClients]);

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <Layout>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6 space-y-6">
          {/* Header */}
          <PageHeader
            isManager={isManager}
            totalClients={stats?.activeClients ?? 0}
            onOpenPortfolio={openPortfolio}
          />

          {/* Alert Banner */}
          {isManager && activeAlerts.length > 0 && (
            <AlertBanner
              criticalAlerts={criticalAlerts}
              warningAlerts={warningAlerts}
              infoAlerts={infoAlerts}
              expanded={alertsExpanded}
              onToggle={() => setAlertsExpanded(prev => !prev)}
              onDismiss={handleDismissAlert}
              onViewClient={openDrawer}
            />
          )}

          {/* KPI Cards */}
          {isManager && (
            <KpiRow stats={stats} loading={loadingStats} />
          )}

          {/* Controls */}
          <ControlsRow
            searchText={searchText}
            onSearchChange={(v) => { setSearchText(v); setPage(0); }}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            sortOption={sortOption}
            onSortChange={(v) => { setSortOption(v); setPage(0); }}
            showFilters={showFilters}
            onToggleFilters={() => setShowFilters(prev => !prev)}
            statusFilter={statusFilter}
            onStatusChange={(v) => { setStatusFilter(v); setPage(0); }}
            responsibleFilter={responsibleFilter}
            onResponsibleChange={(v) => { setResponsibleFilter(v); setPage(0); }}
            zoneFilter={zoneFilter}
            onZoneChange={(v) => { setZoneFilter(v); setPage(0); }}
            profitabilityFilter={profitabilityFilter}
            onProfitabilityChange={(v) => { setProfitabilityFilter(v); setPage(0); }}
            uniqueZones={uniqueZones}
            uniqueResponsibles={uniqueResponsibles}
            isManager={isManager}
            onExport={handleExport}
            totalResults={filteredClients.length}
          />

          {/* Client list */}
          {loading ? (
            viewMode === 'cards' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
              </div>
            ) : (
              <TableSkeleton />
            )
          ) : filteredClients.length === 0 ? (
            <EmptyState searchText={searchText} />
          ) : (
            <>
              {viewMode === 'cards' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {paginatedClients.map(client => (
                    <ClientCard
                      key={client.clientId}
                      client={client}
                      isManager={isManager}
                      onClick={() => openDrawer(client.clientId)}
                    />
                  ))}
                </div>
              ) : (
                <ClientTable
                  clients={paginatedClients}
                  isManager={isManager}
                  onClickClient={(id) => openDrawer(id)}
                />
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <Pagination page={page} totalPages={totalPages} onChange={setPage} />
              )}
            </>
          )}
        </div>

        {/* Drawer */}
        <ClientDrawer
          open={drawerOpen}
          onClose={closeDrawer}
          profile={clientProfile}
          loading={drawerLoading}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          isManager={isManager}
          userId={userId}
        />

        {/* Portfolio Analysis Panel */}
        {isManager && (
          <PortfolioPanel
            open={portfolioOpen}
            onClose={() => setPortfolioOpen(false)}
            portfolio={portfolio}
            loading={portfolioLoading}
          />
        )}
      </div>
    </Layout>
  );
}

// ─── PageHeader ────────────────────────────────────────────────────────────────

function PageHeader({ isManager, totalClients, onOpenPortfolio }: {
  isManager: boolean;
  totalClients: number;
  onOpenPortfolio: () => void;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          {isManager ? 'Clientes y Contratos Activos' : 'Mis Clientes'}
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {isManager
            ? `Gestión integral de la cartera de clientes · ${totalClients} clientes activos`
            : 'Clientes asignados a tu zona de trabajo'}
        </p>
      </div>
      {isManager && (
        <button
          onClick={onOpenPortfolio}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-medium transition-colors"
        >
          <BarChart3 className="w-4 h-4" />
          Análisis de cartera
        </button>
      )}
    </div>
  );
}

// ─── Alert Banner ──────────────────────────────────────────────────────────────

function AlertBanner({ criticalAlerts, warningAlerts, infoAlerts, expanded, onToggle, onDismiss, onViewClient }: {
  criticalAlerts: CleaningClientAlert[];
  warningAlerts: CleaningClientAlert[];
  infoAlerts: CleaningClientAlert[];
  expanded: boolean;
  onToggle: () => void;
  onDismiss: (id: string) => void;
  onViewClient: (clientId: string) => void;
}) {
  const total = criticalAlerts.length + warningAlerts.length + infoAlerts.length;

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-sm overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-500" />
          <span className="font-semibold text-gray-900 dark:text-white text-sm">
            {total} alerta{total !== 1 ? 's' : ''} activa{total !== 1 ? 's' : ''}
          </span>
          {criticalAlerts.length > 0 && (
            <span className="px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 rounded-full">
              {criticalAlerts.length} crítica{criticalAlerts.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && (
        <div className="px-5 pb-4 space-y-2 max-h-64 overflow-y-auto">
          {[...criticalAlerts, ...warningAlerts, ...infoAlerts].map(alert => (
            <div
              key={alert.id}
              className={`${ALERT_STYLES[alert.severity] || ALERT_STYLES.info} rounded-lg px-4 py-3 flex items-start gap-3`}
            >
              {alert.severity === 'critical' ? (
                <XCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
              ) : alert.severity === 'warning' ? (
                <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white">{alert.title}</p>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">{alert.description}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => onViewClient(alert.clientId)}
                  className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  Ver
                </button>
                <button
                  onClick={() => onDismiss(alert.id)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── KPI Row ───────────────────────────────────────────────────────────────────

function KpiRow({ stats, loading }: { stats: CleaningClientStats | null; loading: boolean }) {
  if (loading || !stats) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 overflow-x-auto">
        {Array.from({ length: 6 }).map((_, i) => <KpiSkeleton key={i} />)}
      </div>
    );
  }

  const kpis: { label: string; value: string; sub: string; icon: typeof Users; iconBg: string; trend?: 'up' | 'down' }[] = [
    {
      label: 'Clientes activos',
      value: String(stats.activeClients),
      sub: `${stats.newClientsThisMonth} nuevos este mes`,
      icon: Users,
      iconBg: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400',
      trend: stats.newClientsThisMonth > 0 ? 'up' : undefined,
    },
    {
      label: 'Facturación mensual',
      value: fmt(stats.totalMonthlyRevenue),
      sub: `${fmt(stats.avgRevenuePerClient)} avg/cliente`,
      icon: DollarSign,
      iconBg: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400',
    },
    {
      label: 'Beneficio mensual',
      value: fmt(stats.totalMonthlyProfit),
      sub: `margen ${stats.totalMonthlyRevenue > 0 ? fmtPercent((stats.totalMonthlyProfit / stats.totalMonthlyRevenue) * 100) : '—'}`,
      icon: TrendingUp,
      iconBg: 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400',
      trend: stats.totalMonthlyProfit > 0 ? 'up' : 'down',
    },
    {
      label: 'Impagos pendientes',
      value: String(stats.clientsWithUnpaid),
      sub: 'clientes con saldo',
      icon: Receipt,
      iconBg: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
      trend: stats.clientsWithUnpaid > 0 ? 'down' : undefined,
    },
    {
      label: 'Incidencias abiertas',
      value: String(stats.clientsWithOpenIncidents),
      sub: 'clientes afectados',
      icon: AlertTriangle,
      iconBg: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400',
      trend: stats.clientsWithOpenIncidents > 0 ? 'down' : undefined,
    },
    {
      label: 'Renovaciones próximas',
      value: String(stats.contractsExpiringThisMonth),
      sub: 'este mes',
      icon: Calendar,
      iconBg: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
    },
  ];

  return (
    <div className="flex gap-4 overflow-x-auto pb-1 scrollbar-thin">
      {kpis.map((kpi) => {
        const Icon = kpi.icon;
        return (
          <div
            key={kpi.label}
            className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5 min-w-[180px] flex-1"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {kpi.label}
              </span>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${kpi.iconBg}`}>
                <Icon className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-end gap-2">
              <span className="text-2xl font-bold text-gray-900 dark:text-white">{kpi.value}</span>
              {kpi.trend && (
                kpi.trend === 'up'
                  ? <ArrowUpRight className="w-4 h-4 text-emerald-500 mb-1" />
                  : <ArrowDownRight className="w-4 h-4 text-red-500 mb-1" />
              )}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{kpi.sub}</p>
          </div>
        );
      })}
    </div>
  );
}

// ─── Controls Row ──────────────────────────────────────────────────────────────

function ControlsRow({
  searchText, onSearchChange, viewMode, onViewModeChange, sortOption, onSortChange,
  showFilters, onToggleFilters, statusFilter, onStatusChange, responsibleFilter,
  onResponsibleChange, zoneFilter, onZoneChange, profitabilityFilter, onProfitabilityChange,
  uniqueZones, uniqueResponsibles, isManager, onExport, totalResults,
}: {
  searchText: string;
  onSearchChange: (v: string) => void;
  viewMode: 'cards' | 'table';
  onViewModeChange: (v: 'cards' | 'table') => void;
  sortOption: string;
  onSortChange: (v: string) => void;
  showFilters: boolean;
  onToggleFilters: () => void;
  statusFilter: string;
  onStatusChange: (v: string) => void;
  responsibleFilter: string;
  onResponsibleChange: (v: string) => void;
  zoneFilter: string;
  onZoneChange: (v: string) => void;
  profitabilityFilter: string;
  onProfitabilityChange: (v: string) => void;
  uniqueZones: string[];
  uniqueResponsibles: string[];
  isManager: boolean;
  onExport: () => void;
  totalResults: number;
}) {
  const hasActiveFilters = statusFilter !== 'all' || responsibleFilter !== 'all' || zoneFilter !== 'all' || profitabilityFilter !== 'all';

  return (
    <div className="space-y-3">
      {/* Main controls row */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchText}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Buscar cliente, teléfono, dirección..."
            className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white placeholder:text-gray-400"
          />
        </div>

        {/* Filter toggle */}
        <button
          onClick={onToggleFilters}
          className={`inline-flex items-center gap-2 px-4 py-2.5 border rounded-xl text-sm font-medium transition-colors ${
            hasActiveFilters
              ? 'border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400'
              : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
          }`}
        >
          <Filter className="w-4 h-4" />
          Filtros
          {hasActiveFilters && (
            <span className="w-2 h-2 bg-indigo-500 rounded-full" />
          )}
        </button>

        {/* Sort */}
        <select
          value={sortOption}
          onChange={(e) => onSortChange(e.target.value)}
          className="px-3 py-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          {SORT_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        {/* View toggle */}
        <div className="hidden sm:flex items-center border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
          <button
            onClick={() => onViewModeChange('cards')}
            className={`px-3 py-2.5 text-sm ${viewMode === 'cards' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400' : 'bg-white dark:bg-gray-900 text-gray-500'}`}
          >
            <Building2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => onViewModeChange('table')}
            className={`px-3 py-2.5 text-sm ${viewMode === 'table' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400' : 'bg-white dark:bg-gray-900 text-gray-500'}`}
          >
            <FileText className="w-4 h-4" />
          </button>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {isManager && (
            <button
              onClick={onExport}
              className="inline-flex items-center gap-2 px-4 py-2.5 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Exportar</span>
            </button>
          )}
        </div>
      </div>

      {/* Filters panel */}
      {showFilters && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <FilterSelect
              label="Estado"
              value={statusFilter}
              onChange={onStatusChange}
              options={[
                { value: 'all', label: 'Todos' },
                { value: 'all_active', label: 'Activos' },
                { value: 'some_paused', label: 'Pausados' },
                { value: 'pending_renewal', label: 'Renovación pend.' },
                { value: 'expired', label: 'Expirados' },
                { value: 'no_contracts', label: 'Sin contratos' },
              ]}
            />
            {isManager && (
              <FilterSelect
                label="Responsable"
                value={responsibleFilter}
                onChange={onResponsibleChange}
                options={[{ value: 'all', label: 'Todos' }, ...uniqueResponsibles.map(r => ({ value: r, label: r }))]}
              />
            )}
            <FilterSelect
              label="Zona"
              value={zoneFilter}
              onChange={onZoneChange}
              options={[{ value: 'all', label: 'Todas' }, ...uniqueZones.map(z => ({ value: z, label: z }))]}
            />
            {isManager && (
              <FilterSelect
                label="Rentabilidad"
                value={profitabilityFilter}
                onChange={onProfitabilityChange}
                options={[
                  { value: 'all', label: 'Todas' },
                  { value: 'high', label: 'Alta' },
                  { value: 'medium', label: 'Media' },
                  { value: 'low', label: 'Baja' },
                  { value: 'negative', label: 'Negativa' },
                ]}
              />
            )}
          </div>
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {totalResults} resultado{totalResults !== 1 ? 's' : ''}
            </span>
            {hasActiveFilters && (
              <button
                onClick={() => {
                  onStatusChange('all');
                  onResponsibleChange('all');
                  onZoneChange('all');
                  onProfitabilityChange('all');
                }}
                className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
              >
                Limpiar filtros
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

// ─── Client Card ───────────────────────────────────────────────────────────────

function ClientCard({ client, isManager, onClick }: {
  client: CleaningClientListItem;
  isManager: boolean;
  onClick: () => void;
}) {
  const profStyle = PROFITABILITY_STYLES[client.profitability] || PROFITABILITY_STYLES.unknown;
  const statusStyle = CONTRACT_STATUS_STYLES[client.contractStatus] || CONTRACT_STATUS_STYLES.no_contracts;
  const renewalDays = daysUntil(client.nearestRenewal);
  const mainLocation = client.locations?.[0];

  return (
    <div
      onClick={onClick}
      className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-sm p-5 cursor-pointer hover:shadow-md hover:border-gray-300 dark:hover:border-gray-700 transition-all group"
    >
      {/* Header */}
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-sm font-bold text-indigo-700 dark:text-indigo-400 shrink-0">
          {getInitials(client.clientName)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-gray-900 dark:text-white truncate text-sm group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
              {client.clientName}
            </h3>
            <span className={`shrink-0 px-2 py-0.5 text-[10px] font-medium rounded-full ${statusStyle.bg} ${statusStyle.text}`}>
              {statusStyle.label}
            </span>
          </div>
          {mainLocation && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 flex items-center gap-1 truncate">
              <MapPin className="w-3 h-3 shrink-0" />
              {mainLocation.address}{mainLocation.zone ? ` · ${mainLocation.zone}` : ''}
            </p>
          )}
        </div>
        <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 group-hover:text-indigo-500 transition-colors shrink-0 mt-1" />
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
          <Briefcase className="w-3.5 h-3.5 shrink-0" />
          <span>{client.activeContracts}/{client.totalContracts} contratos</span>
        </div>
        {isManager && (
          <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
            <DollarSign className="w-3.5 h-3.5 shrink-0" />
            <span>{fmt(client.monthlyRevenue)}/mes</span>
          </div>
        )}
        <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
          <UserCheck className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{client.assignedResponsible || 'Sin asignar'}</span>
        </div>
        {client.openIncidents > 0 && (
          <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>{client.openIncidents} incidencia{client.openIncidents !== 1 ? 's' : ''}</span>
          </div>
        )}
        {isManager && client.unpaidAmount > 0 && (
          <div className="flex items-center gap-1.5 text-red-600 dark:text-red-400">
            <Receipt className="w-3.5 h-3.5 shrink-0" />
            <span>{fmt(client.unpaidAmount)} impagado</span>
          </div>
        )}
        {renewalDays !== null && renewalDays <= 30 && (
          <div className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
            <Calendar className="w-3.5 h-3.5 shrink-0" />
            <span>{renewalDays <= 0 ? 'Vencido' : `${renewalDays}d renovación`}</span>
          </div>
        )}
      </div>

      {/* Footer badges */}
      {isManager && (
        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center gap-2">
          <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${profStyle.bg} ${profStyle.text}`}>
            {profStyle.label}
          </span>
          {client.assignedWorkers.length > 0 && (
            <span className="text-[10px] text-gray-400 dark:text-gray-500">
              {client.assignedWorkers.length} trabajador{client.assignedWorkers.length !== 1 ? 'es' : ''}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Client Table ──────────────────────────────────────────────────────────────

function ClientTable({ clients, isManager, onClickClient }: {
  clients: CleaningClientListItem[];
  isManager: boolean;
  onClickClient: (id: string) => void;
}) {
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 dark:border-gray-800">
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Cliente</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Estado</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Contratos</th>
              {isManager && <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Fact./mes</th>}
              {isManager && <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Impagos</th>}
              <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Incid.</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Responsable</th>
              {isManager && <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Rentab.</th>}
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Renovación</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50">
            {clients.map(c => {
              const statusStyle = CONTRACT_STATUS_STYLES[c.contractStatus] || CONTRACT_STATUS_STYLES.no_contracts;
              const profStyle = PROFITABILITY_STYLES[c.profitability] || PROFITABILITY_STYLES.unknown;
              return (
                <tr
                  key={c.clientId}
                  onClick={() => onClickClient(c.clientId)}
                  className="hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-xs font-bold text-indigo-700 dark:text-indigo-400 shrink-0">
                        {getInitials(c.clientName)}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 dark:text-white truncate">{c.clientName}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{c.locations?.[0]?.address || '—'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${statusStyle.bg} ${statusStyle.text}`}>
                      {statusStyle.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                    {c.activeContracts}/{c.totalContracts}
                  </td>
                  {isManager && (
                    <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-white">
                      {fmt(c.monthlyRevenue)}
                    </td>
                  )}
                  {isManager && (
                    <td className={`px-4 py-3 text-right ${c.unpaidAmount > 0 ? 'text-red-600 dark:text-red-400 font-medium' : 'text-gray-400'}`}>
                      {c.unpaidAmount > 0 ? fmt(c.unpaidAmount) : '—'}
                    </td>
                  )}
                  <td className="px-4 py-3 text-center">
                    {c.openIncidents > 0 ? (
                      <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        {c.openIncidents}
                      </span>
                    ) : (
                      <span className="text-gray-400">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400 truncate max-w-[140px]">
                    {c.assignedResponsible || '—'}
                  </td>
                  {isManager && (
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${profStyle.bg} ${profStyle.text}`}>
                        {profStyle.label}
                      </span>
                    </td>
                  )}
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400 text-xs whitespace-nowrap">
                    {fmtDate(c.nearestRenewal)}
                  </td>
                  <td className="px-4 py-3">
                    <Eye className="w-4 h-4 text-gray-400 hover:text-indigo-500 transition-colors" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Pagination ────────────────────────────────────────────────────────────────

function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) {
  return (
    <div className="flex items-center justify-center gap-2 pt-2">
      <button
        disabled={page === 0}
        onClick={() => onChange(page - 1)}
        className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
      >
        Anterior
      </button>
      <span className="text-sm text-gray-500 dark:text-gray-400">
        {page + 1} / {totalPages}
      </span>
      <button
        disabled={page >= totalPages - 1}
        onClick={() => onChange(page + 1)}
        className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
      >
        Siguiente
      </button>
    </div>
  );
}

// ─── Empty State ───────────────────────────────────────────────────────────────

function EmptyState({ searchText }: { searchText: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-2xl flex items-center justify-center mb-4">
        <Users className="w-8 h-8 text-gray-400" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
        {searchText ? 'Sin resultados' : 'No hay clientes'}
      </h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm">
        {searchText
          ? `No se encontraron clientes para "${searchText}". Prueba con otro término de búsqueda.`
          : 'Aún no hay clientes registrados. Los clientes aparecerán aquí cuando se creen contratos.'}
      </p>
    </div>
  );
}

// ─── Client Detail Drawer ──────────────────────────────────────────────────────

function ClientDrawer({ open, onClose, profile, loading, activeTab, onTabChange, isManager, userId }: {
  open: boolean;
  onClose: () => void;
  profile: CleaningClientProfile | null;
  loading: boolean;
  activeTab: DrawerTab;
  onTabChange: (t: DrawerTab) => void;
  isManager: boolean;
  userId: string;
}) {
  const visibleTabs = useMemo(
    () => DRAWER_TABS.filter(t => !t.managerOnly || isManager),
    [isManager],
  );

  return (
    <>
      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/30 dark:bg-black/50 z-40 transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <div
        className={`fixed top-0 right-0 h-full w-full sm:w-[700px] bg-white dark:bg-gray-950 shadow-2xl z-50 transform transition-transform duration-300 ease-out flex flex-col ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {loading ? (
          <DrawerSkeleton onClose={onClose} />
        ) : profile ? (
          <>
            {/* Sticky header */}
            <DrawerHeader profile={profile} onClose={onClose} isManager={isManager} />

            {/* Mini KPIs */}
            {isManager && <DrawerMiniKpis profile={profile} />}

            {/* Tabs */}
            <div className="border-b border-gray-200 dark:border-gray-800 overflow-x-auto">
              <div className="flex px-6">
                {visibleTabs.map(tab => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.key}
                      onClick={() => onTabChange(tab.key)}
                      className={`flex items-center gap-1.5 px-3 py-3 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
                        activeTab === tab.key
                          ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400'
                          : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto p-6">
              <DrawerTabContent
                tab={activeTab}
                profile={profile}
                isManager={isManager}
                userId={userId}
              />
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
            <p>No se pudo cargar el perfil del cliente</p>
          </div>
        )}
      </div>
    </>
  );
}

function DrawerSkeleton({ onClose }: { onClose: () => void }) {
  return (
    <div className="animate-pulse p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="h-6 w-48 bg-gray-200 dark:bg-gray-700 rounded" />
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="space-y-3">
        <div className="h-4 w-64 bg-gray-200 dark:bg-gray-700 rounded" />
        <div className="h-4 w-40 bg-gray-200 dark:bg-gray-700 rounded" />
      </div>
      <div className="grid grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 bg-gray-200 dark:bg-gray-700 rounded-xl" />
        ))}
      </div>
      <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded" />
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-12 bg-gray-100 dark:bg-gray-800 rounded" />
        ))}
      </div>
    </div>
  );
}

function DrawerHeader({ profile, onClose, isManager }: {
  profile: CleaningClientProfile;
  onClose: () => void;
  isManager: boolean;
}) {
  const { client } = profile;
  const statusBg = client.status === 'active'
    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
    : client.status === 'paused'
      ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
      : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400';

  return (
    <div className="p-6 border-b border-gray-200 dark:border-gray-800 shrink-0">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-lg font-bold text-indigo-700 dark:text-indigo-400">
            {getInitials(client.name)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">{client.name}</h2>
              <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${statusBg}`}>
                {client.status === 'active' ? 'Activo' : client.status === 'paused' ? 'Pausado' : client.status}
              </span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">{client.clientType}</p>
          </div>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
        {client.phone && (
          <span className="flex items-center gap-1">
            <Phone className="w-3.5 h-3.5" />
            {client.phone}
          </span>
        )}
        {client.email && (
          <span className="flex items-center gap-1">
            <Mail className="w-3.5 h-3.5" />
            {client.email}
          </span>
        )}
        {client.address && (
          <span className="flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5" />
            {client.address}, {client.city}
          </span>
        )}
        {client.responsible && (
          <span className="flex items-center gap-1">
            <UserCheck className="w-3.5 h-3.5" />
            {client.responsible}
          </span>
        )}
      </div>

      {client.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {client.tags.map(tag => (
            <span key={tag} className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function DrawerMiniKpis({ profile }: { profile: CleaningClientProfile }) {
  const { invoiceStats, incidentStats, profitability, serviceStats } = profile;
  const kpis = [
    { label: 'Facturación', value: fmt(invoiceStats.totalInvoiced), color: 'text-indigo-600 dark:text-indigo-400' },
    { label: 'Margen', value: fmtPercent(profitability.marginPercent), color: profitability.marginPercent >= 20 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400' },
    { label: 'Impagos', value: fmt(invoiceStats.totalOverdue), color: invoiceStats.totalOverdue > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-600 dark:text-gray-400' },
    { label: 'Incidencias', value: String(incidentStats.open), color: incidentStats.open > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-600 dark:text-gray-400' },
    { label: 'Calidad', value: serviceStats.avgQualityRating > 0 ? `${serviceStats.avgQualityRating.toFixed(1)}/5` : '—', color: 'text-blue-600 dark:text-blue-400' },
  ];

  return (
    <div className="grid grid-cols-5 gap-2 px-6 py-3 border-b border-gray-200 dark:border-gray-800 shrink-0">
      {kpis.map(k => (
        <div key={k.label} className="text-center">
          <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase">{k.label}</p>
          <p className={`text-sm font-bold ${k.color}`}>{k.value}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Drawer Tab Content ────────────────────────────────────────────────────────

function DrawerTabContent({ tab, profile, isManager, userId }: {
  tab: DrawerTab;
  profile: CleaningClientProfile;
  isManager: boolean;
  userId: string;
}) {
  switch (tab) {
    case 'contratos': return <ContractosTab profile={profile} />;
    case 'ubicaciones': return <UbicacionesTab profile={profile} userId={userId} />;
    case 'servicios': return <ServiciosTab profile={profile} />;
    case 'incidencias': return <IncidenciasTab profile={profile} />;
    case 'facturas': return isManager ? <FacturasTab profile={profile} /> : null;
    case 'rentabilidad': return isManager ? <RentabilidadTab profile={profile} userId={userId} /> : null;
    case 'notas': return <NotasTab profile={profile} />;
    default: return null;
  }
}

// ─── Tab: Contratos ────────────────────────────────────────────────────────────

function ContractosTab({ profile }: { profile: CleaningClientProfile }) {
  const { contracts } = profile;

  if (contracts.length === 0) {
    return <TabEmpty icon={FileText} text="No hay contratos registrados" />;
  }

  return (
    <div className="space-y-3">
      {contracts.map(c => {
        const isActive = c.contractStatus === 'active';
        const isPaused = c.contractStatus === 'paused';
        return (
          <div
            key={c.id}
            className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4"
          >
            <div className="flex items-start justify-between mb-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">{c.contractNumber}</span>
                  <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${
                    isActive ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                      : isPaused ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                        : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                  }`}>
                    {c.contractStatus}
                  </span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{c.cleaningType} · {c.frequency}</p>
              </div>
              <span className="text-sm font-bold text-gray-900 dark:text-white">{fmt(c.monthlyPrice)}/mes</span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 dark:text-gray-400 mt-3">
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                <span>{c.hoursPerMonth}h/mes · {c.scheduleSummary}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5" />
                <span>{c.assignedWorkerName || 'Sin asignar'}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5" />
                <span className="truncate">{c.address}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                <span>{fmtDate(c.startDate)} → {c.endDate ? fmtDate(c.endDate) : 'Indefinido'}</span>
              </div>
            </div>

            {c.renewalDate && (
              <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-800 text-xs">
                <span className="text-blue-600 dark:text-blue-400 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  Renovación: {fmtDate(c.renewalDate)} {c.autoRenew ? '(auto)' : ''}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Tab: Ubicaciones ──────────────────────────────────────────────────────────

function UbicacionesTab({ profile, userId }: { profile: CleaningClientProfile; userId: string }) {
  const { locations } = profile;

  if (locations.length === 0) {
    return <TabEmpty icon={MapPin} text="No hay ubicaciones registradas" />;
  }

  return (
    <div className="space-y-3">
      {locations.map(loc => (
        <div
          key={loc.id}
          className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4"
        >
          <div className="flex items-start justify-between mb-2">
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{loc.name || loc.address}</h4>
                {!loc.isActive && (
                  <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                    Inactiva
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">{loc.address}{loc.addressLine2 ? `, ${loc.addressLine2}` : ''}</p>
            </div>
            {loc.zone && (
              <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                {loc.zone}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 dark:text-gray-400">
            <div className="flex items-center gap-1.5">
              <Home className="w-3.5 h-3.5" />
              <span>{loc.squareMeters > 0 ? `${loc.squareMeters} m²` : '—'} · {loc.floors > 0 ? `${loc.floors} plantas` : '—'}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5" />
              <span>{loc.city} {loc.postalCode}</span>
            </div>
            {loc.contactName && (
              <div className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" />
                <span>{loc.contactName}</span>
              </div>
            )}
            {loc.contactPhone && (
              <div className="flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5" />
                <span>{loc.contactPhone}</span>
              </div>
            )}
          </div>

          {(loc.accessInstructions || loc.parkingNotes) && (
            <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-800 text-xs text-gray-500 dark:text-gray-400 space-y-1">
              {loc.accessInstructions && <p>Acceso: {loc.accessInstructions}</p>}
              {loc.parkingNotes && <p>Parking: {loc.parkingNotes}</p>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Tab: Servicios ────────────────────────────────────────────────────────────

function ServiciosTab({ profile }: { profile: CleaningClientProfile }) {
  const { recentServices, serviceStats } = profile;

  return (
    <div className="space-y-4">
      {/* Stats summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MiniStat label="Completados" value={String(serviceStats.totalCompleted)} />
        <MiniStat label="Cancelados" value={String(serviceStats.totalCancelled)} />
        <MiniStat label="Calidad media" value={serviceStats.avgQualityRating > 0 ? `${serviceStats.avgQualityRating.toFixed(1)}/5` : '—'} />
        <MiniStat label="Horas trabajadas" value={`${serviceStats.totalHoursWorked}h`} />
      </div>

      {recentServices.length === 0 ? (
        <TabEmpty icon={CheckCircle2} text="No hay servicios recientes" />
      ) : (
        <div className="space-y-2">
          {recentServices.map(s => (
            <div
              key={s.id}
              className="flex items-center gap-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg px-4 py-3"
            >
              <div className={`w-2 h-2 rounded-full shrink-0 ${
                s.status === 'completed' ? 'bg-emerald-500'
                  : s.status === 'cancelled' ? 'bg-red-500'
                    : s.status === 'in_progress' ? 'bg-blue-500'
                      : 'bg-gray-400'
              }`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-900 dark:text-white font-medium">{s.serviceNumber}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {fmtDate(s.date)} · {s.time} · {s.assignedToName} · {s.duration}
                </p>
              </div>
              {s.qualityRating !== null && s.qualityRating > 0 && (
                <div className="flex items-center gap-0.5 shrink-0">
                  <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{s.qualityRating}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Tab: Incidencias ──────────────────────────────────────────────────────────

function IncidenciasTab({ profile }: { profile: CleaningClientProfile }) {
  const { incidents, incidentStats } = profile;

  const trendIcon = incidentStats.trend === 'improving'
    ? <TrendingDown className="w-3.5 h-3.5 text-emerald-500" />
    : incidentStats.trend === 'worsening'
      ? <TrendingUp className="w-3.5 h-3.5 text-red-500" />
      : <MoreHorizontal className="w-3.5 h-3.5 text-gray-400" />;

  const trendLabel = incidentStats.trend === 'improving' ? 'Mejorando' : incidentStats.trend === 'worsening' ? 'Empeorando' : 'Estable';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MiniStat label="Total" value={String(incidentStats.total)} />
        <MiniStat label="Abiertas" value={String(incidentStats.open)} highlight={incidentStats.open > 0} />
        <MiniStat label="Resolución media" value={`${incidentStats.resolvedAvgDays}d`} />
        <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-2 text-center">
          <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase mb-0.5">Tendencia</p>
          <div className="flex items-center justify-center gap-1">
            {trendIcon}
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{trendLabel}</span>
          </div>
        </div>
      </div>

      {incidents.length === 0 ? (
        <TabEmpty icon={AlertTriangle} text="No hay incidencias registradas" />
      ) : (
        <div className="space-y-2">
          {incidents.map(inc => {
            const isOpen = inc.status === 'open' || inc.status === 'in_progress';
            return (
              <div
                key={inc.id}
                className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg px-4 py-3"
              >
                <div className="flex items-start justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">{inc.incidentNumber}</span>
                    <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${
                      inc.priority === 'high' || inc.priority === 'critical'
                        ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                        : inc.priority === 'medium'
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                          : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                    }`}>
                      {inc.priority}
                    </span>
                  </div>
                  <span className={`text-[10px] font-medium ${isOpen ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400'}`}>
                    {inc.status}
                  </span>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400">{inc.description}</p>
                <div className="flex items-center gap-3 mt-2 text-[11px] text-gray-500 dark:text-gray-400">
                  <span>{fmtDate(inc.date)}</span>
                  <span>{inc.incidentType}</span>
                  <span>{inc.workerName}</span>
                </div>
                {inc.resolution && (
                  <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">Resolución: {inc.resolution}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Tab: Facturas ─────────────────────────────────────────────────────────────

function FacturasTab({ profile }: { profile: CleaningClientProfile }) {
  const { invoices, invoiceStats } = profile;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MiniStat label="Total facturado" value={fmt(invoiceStats.totalInvoiced)} />
        <MiniStat label="Cobrado" value={fmt(invoiceStats.totalPaid)} />
        <MiniStat label="Pendiente" value={fmt(invoiceStats.totalPending)} highlight={invoiceStats.totalPending > 0} />
        <MiniStat label="Días pago medio" value={`${invoiceStats.avgPaymentDays}d`} />
      </div>

      {invoices.length === 0 ? (
        <TabEmpty icon={Receipt} text="No hay facturas registradas" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800">
                <th className="text-left py-2 text-xs font-medium text-gray-500 dark:text-gray-400">Nº</th>
                <th className="text-left py-2 text-xs font-medium text-gray-500 dark:text-gray-400">Fecha</th>
                <th className="text-left py-2 text-xs font-medium text-gray-500 dark:text-gray-400">Vencimiento</th>
                <th className="text-right py-2 text-xs font-medium text-gray-500 dark:text-gray-400">Total</th>
                <th className="text-right py-2 text-xs font-medium text-gray-500 dark:text-gray-400">Pagado</th>
                <th className="text-center py-2 text-xs font-medium text-gray-500 dark:text-gray-400">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {invoices.map(inv => (
                <tr key={inv.id}>
                  <td className="py-2.5 text-gray-900 dark:text-white font-medium">{inv.number}</td>
                  <td className="py-2.5 text-gray-600 dark:text-gray-400">{fmtDate(inv.date)}</td>
                  <td className="py-2.5 text-gray-600 dark:text-gray-400">{fmtDate(inv.dueDate)}</td>
                  <td className="py-2.5 text-right font-medium text-gray-900 dark:text-white">{fmtDecimal(inv.total)}</td>
                  <td className="py-2.5 text-right text-gray-600 dark:text-gray-400">{fmtDecimal(inv.paid)}</td>
                  <td className="py-2.5 text-center">
                    <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${
                      inv.status === 'paid' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                        : inv.status === 'overdue' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                    }`}>
                      {inv.status === 'paid' ? 'Pagada' : inv.status === 'overdue' ? 'Vencida' : 'Pendiente'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Rentabilidad ─────────────────────────────────────────────────────────

function RentabilidadTab({ profile, userId }: { profile: CleaningClientProfile; userId: string }) {
  const { profitability } = profile;
  const profStyle = PROFITABILITY_STYLES[profitability.classification] || PROFITABILITY_STYLES.unknown;

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MiniStat label="Ingresos/mes" value={fmt(profitability.monthlyRevenue)} />
        <MiniStat label="Costes/mes" value={fmt(profitability.monthlyCost)} />
        <MiniStat label="Beneficio/mes" value={fmt(profitability.monthlyProfit)} highlight={profitability.monthlyProfit < 0} />
        <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-2 text-center">
          <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase mb-0.5">Clasificación</p>
          <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${profStyle.bg} ${profStyle.text}`}>
            {profStyle.label} ({fmtPercent(profitability.marginPercent)})
          </span>
        </div>
      </div>

      {/* Chart */}
      {profitability.revenueHistory.length > 0 && (
        <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Evolución mensual</h4>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={profitability.revenueHistory} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} className="text-gray-500" />
              <YAxis tick={{ fontSize: 11 }} className="text-gray-500" />
              <Tooltip
                formatter={(value: number) => fmtDecimal(value)}
                contentStyle={{ backgroundColor: 'var(--tooltip-bg, #fff)', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '12px' }}
              />
              <Legend wrapperStyle={{ fontSize: '11px' }} />
              <Bar dataKey="revenue" name="Ingresos" fill="#6366f1" radius={[4, 4, 0, 0]} />
              <Bar dataKey="cost" name="Costes" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              <Bar dataKey="profit" name="Beneficio" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Notas ────────────────────────────────────────────────────────────────

function NotasTab({ profile }: { profile: CleaningClientProfile }) {
  const { notes } = profile;

  if (notes.length === 0) {
    return <TabEmpty icon={Edit2} text="No hay notas registradas" />;
  }

  return (
    <div className="space-y-3">
      {notes.map(note => (
        <div
          key={note.id}
          className={`bg-gray-50 dark:bg-gray-900 border rounded-lg px-4 py-3 ${
            note.important
              ? 'border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-900/10'
              : 'border-gray-200 dark:border-gray-800'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-900 dark:text-white">{note.authorName}</span>
              {note.important && <Star className="w-3 h-3 text-amber-500 fill-amber-500" />}
            </div>
            <span className="text-[10px] text-gray-400 dark:text-gray-500">{fmtDate(note.createdAt)}</span>
          </div>
          <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{note.text}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Shared mini-components ────────────────────────────────────────────────────

function MiniStat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-2 text-center">
      <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase mb-0.5">{label}</p>
      <p className={`text-sm font-bold ${highlight ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>
        {value}
      </p>
    </div>
  );
}

function TabEmpty({ icon: Icon, text }: { icon: typeof FileText; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Icon className="w-10 h-10 text-gray-300 dark:text-gray-600 mb-3" />
      <p className="text-sm text-gray-500 dark:text-gray-400">{text}</p>
    </div>
  );
}

// ─── Portfolio Analysis Panel ──────────────────────────────────────────────────

function PortfolioPanel({ open, onClose, portfolio, loading }: {
  open: boolean;
  onClose: () => void;
  portfolio: PortfolioProfitability | null;
  loading: boolean;
}) {
  const top5Profitable = useMemo(() => {
    if (!portfolio) return [];
    return [...portfolio.clients].sort((a, b) => b.monthlyProfit - a.monthlyProfit).slice(0, 5);
  }, [portfolio]);

  const problematicClients = useMemo(() => {
    if (!portfolio) return [];
    return portfolio.clients.filter(c => c.classification === 'negative' || c.classification === 'low');
  }, [portfolio]);

  const distributionData = useMemo(() => {
    if (!portfolio) return [];
    return (Object.entries(portfolio.distribution) as [ProfitabilityClass, number][]).map(([key, count]) => ({
      name: PROFITABILITY_STYLES[key]?.label || key,
      value: count,
      fill: key === 'high' ? '#10b981' : key === 'medium' ? '#3b82f6' : key === 'low' ? '#f59e0b' : key === 'negative' ? '#ef4444' : '#9ca3af',
    }));
  }, [portfolio]);

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 bg-black/30 dark:bg-black/50 z-40 transition-opacity"
          onClick={onClose}
        />
      )}

      <div
        className={`fixed top-0 right-0 h-full w-full sm:w-[700px] bg-white dark:bg-gray-950 shadow-2xl z-50 transform transition-transform duration-300 ease-out flex flex-col ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-800 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-indigo-500" />
              Análisis de cartera
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Rentabilidad y distribución de clientes</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="animate-spin w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full" />
          </div>
        ) : portfolio ? (
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Totals */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <MiniStat label="Ingresos totales" value={fmt(portfolio.totals.totalRevenue)} />
              <MiniStat label="Costes totales" value={fmt(portfolio.totals.totalCost)} />
              <MiniStat label="Beneficio total" value={fmt(portfolio.totals.totalProfit)} highlight={portfolio.totals.totalProfit < 0} />
              <MiniStat label="Margen medio" value={fmtPercent(portfolio.totals.avgMargin)} />
            </div>

            {/* Profitability distribution chart */}
            {distributionData.length > 0 && (
              <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Distribución de rentabilidad</h4>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={distributionData} layout="vertical" margin={{ top: 5, right: 20, bottom: 5, left: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ backgroundColor: 'var(--tooltip-bg, #fff)', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '12px' }} />
                    <Bar dataKey="value" name="Clientes" radius={[0, 4, 4, 0]}>
                      {distributionData.map((entry, idx) => (
                        <rect key={idx} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Top 5 profitable */}
            {top5Profitable.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-500" />
                  Top 5 más rentables
                </h4>
                <div className="space-y-2">
                  {top5Profitable.map((c, i) => (
                    <div key={c.clientId} className="flex items-center gap-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg px-4 py-3">
                      <span className="text-sm font-bold text-gray-400 w-6">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{c.clientName}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Ingreso: {fmt(c.monthlyRevenue)} · Coste: {fmt(c.monthlyCost)}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{fmt(c.monthlyProfit)}</p>
                        <p className="text-[10px] text-gray-400">{fmtPercent(c.marginPercent)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Problematic clients */}
            {problematicClients.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                  Clientes problemáticos ({problematicClients.length})
                </h4>
                <div className="space-y-2">
                  {problematicClients.map(c => {
                    const profStyle = PROFITABILITY_STYLES[c.classification] || PROFITABILITY_STYLES.unknown;
                    return (
                      <div key={c.clientId} className="flex items-center gap-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg px-4 py-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{c.clientName}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            Margen: {fmtPercent(c.marginPercent)} · Beneficio: {fmt(c.monthlyProfit)}
                          </p>
                        </div>
                        <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${profStyle.bg} ${profStyle.text}`}>
                          {profStyle.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500 dark:text-gray-400">
            No se pudieron cargar los datos
          </div>
        )}
      </div>
    </>
  );
}
