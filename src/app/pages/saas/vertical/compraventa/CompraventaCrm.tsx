import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Layout } from '../../../../components/saas/Layout';
import { useApp } from '../../../../context/AppContext';
import { useAuth } from '../../../../context/AuthContext';
import { useFinanceUserId } from '../../../../hooks/useFinanceUserId';
import { listClientInvoicesRequest } from '../../../../lib/clientInvoicesApi';
import { summarizeClientInvoiceCollections } from '../../../../lib/clientInvoiceFinanceSync';
import { SalesFunnel } from '../../../../components/saas/SalesFunnel';
import { ActivityTimeline } from '../../../../components/saas/ActivityTimeline';
import { CrmAlertsPanel } from '../../../../components/saas/CrmAlertsPanel';
import { toast } from 'sonner';
import {
  listOpportunitiesRequest,
  getOpportunityStatsRequest,
  getOpportunityActivityRequest,
  createOpportunityRequest,
  changeOpportunityStageRequest,
  deleteOpportunityRequest,
  getTeamStatsRequest,
  type Opportunity,
  type OpportunityStatus,
  type OpportunityStats,
  type ActivityEvent,
  type TeamMember,
} from '../../../../lib/opportunitiesApi';
import {
  BarChart3, Users, Car, DollarSign, Clock, Target,
  Plus, Filter, LayoutGrid, List, MoreVertical, ExternalLink,
  TrendingUp, Briefcase, CalendarDays, Search, X,
  ChevronLeft, ChevronRight, AlertTriangle, BookMarked, Receipt, Wallet,
} from 'lucide-react';
import { AddButtonDropdown } from '../../../../components/saas/AddButtonDropdown';
import { AIAddModal, type AIFieldDef } from '../../../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../../../components/saas/GenericImportModal';

type TabId = 'panel' | 'opportunities' | 'leads' | 'clients' | 'reservations';

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'panel',          label: 'Panel',          icon: <BarChart3 className="w-4 h-4" /> },
  { id: 'opportunities',  label: 'Oportunidades',  icon: <Target className="w-4 h-4" /> },
  { id: 'leads',          label: 'Leads',          icon: <Users className="w-4 h-4" /> },
  { id: 'clients',        label: 'Clientes',       icon: <Briefcase className="w-4 h-4" /> },
  { id: 'reservations',   label: 'Reservas',       icon: <BookMarked className="w-4 h-4" /> },
];

const OPPORTUNITY_STAGES: { id: OpportunityStatus; label: string; color: string; bg: string; dot: string }[] = [
  { id: 'new',         label: 'Nuevo',        color: '#3b82f6', bg: 'bg-blue-50 dark:bg-blue-950/30',       dot: 'bg-blue-500' },
  { id: 'contacted',   label: 'Contactado',   color: '#8b5cf6', bg: 'bg-purple-50 dark:bg-purple-950/30',   dot: 'bg-purple-500' },
  { id: 'test_drive',  label: 'Test Drive',   color: '#f59e0b', bg: 'bg-amber-50 dark:bg-amber-950/30',     dot: 'bg-amber-500' },
  { id: 'quoted',      label: 'Presupuestado',color: '#6366f1', bg: 'bg-indigo-50 dark:bg-indigo-950/30',   dot: 'bg-indigo-500' },
  { id: 'negotiation', label: 'Negociacion',  color: '#f97316', bg: 'bg-orange-50 dark:bg-orange-950/30',   dot: 'bg-orange-500' },
  { id: 'reserved',    label: 'Reservado',    color: '#0ea5e9', bg: 'bg-sky-50 dark:bg-sky-950/30',         dot: 'bg-sky-500' },
  { id: 'won',         label: 'Ganado',       color: '#10b981', bg: 'bg-emerald-50 dark:bg-emerald-950/30', dot: 'bg-emerald-500' },
  { id: 'lost',        label: 'Perdido',      color: '#ef4444', bg: 'bg-red-50 dark:bg-red-950/30',         dot: 'bg-red-500' },
];

const STAGE_MAP = Object.fromEntries(OPPORTUNITY_STAGES.map((s) => [s.id, s]));

function formatCurrency(v: number) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v);
}

function daysSince(dateStr: string) {
  if (!dateStr) return 999;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

export function CompraventaCrm() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { leads, clients, vehicles, user: authContextUser } = useApp();
  const { user } = useAuth();
  const userId = user?.user_id || '';
  const financeUserId = useFinanceUserId();
  const [billingSummary, setBillingSummary] = useState({ pendingAmount: 0, overdueCount: 0, linkedCount: 0 });

  const isManager = useMemo(() => {
    const role = (user as Record<string, unknown>)?.role || (user as Record<string, unknown>)?.accountRole || '';
    return ['admin', 'manager', 'owner'].includes(String(role).toLowerCase());
  }, [user]);

  const activeTab = (searchParams.get('tab') as TabId) || 'panel';
  const setActiveTab = (tab: TabId) => setSearchParams({ tab });

  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [stats, setStats] = useState<OpportunityStats | null>(null);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [teamStats, setTeamStats] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'table' | 'kanban'>('table');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterResponsible, setFilterResponsible] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [scopeAll, setScopeAll] = useState(isManager);
  const [dragOverStage, setDragOverStage] = useState<OpportunityStatus | null>(null);
  const draggingId = useRef<string | null>(null);

  const scope = scopeAll ? 'all' : 'mine';

  const loadData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const params = { scope, currentUserId: userId };
      const [opps, statsData, activityData] = await Promise.all([
        listOpportunitiesRequest(userId, params),
        getOpportunityStatsRequest(userId, params),
        getOpportunityActivityRequest(userId, { ...params, limit: 50 }),
      ]);
      setOpportunities(opps);
      setStats(statsData);
      setActivity(activityData);

      if (isManager) {
        const team = await getTeamStatsRequest(userId);
        setTeamStats(team);
      }
    } catch {
      toast.error('Error al cargar datos CRM');
    }
    setLoading(false);
  }, [userId, scope, isManager]);

  useEffect(() => {
    if (!financeUserId) return;
    listClientInvoicesRequest(financeUserId)
      .then((invs) => setBillingSummary(summarizeClientInvoiceCollections(invs)))
      .catch(() => {});
  }, [financeUserId]);

  useEffect(() => { loadData(); }, [loadData]);

  const filteredOpps = useMemo(() => {
    let result = opportunities;
    if (filterStatus !== 'all') result = result.filter((o) => o.commercialStatus === filterStatus);
    if (filterResponsible !== 'all') result = result.filter((o) => o.responsible === filterResponsible);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((o) =>
        o.vehicleName.toLowerCase().includes(q) ||
        o.vehiclePlate.toLowerCase().includes(q) ||
        o.responsibleName.toLowerCase().includes(q) ||
        o.notes.toLowerCase().includes(q),
      );
    }
    return result;
  }, [opportunities, filterStatus, filterResponsible, searchQuery]);

  const responsibles = useMemo(() => Array.from(new Set(opportunities.map((o) => o.responsible).filter(Boolean))), [opportunities]);
  const reservedOpps = useMemo(() => opportunities.filter((o) => o.commercialStatus === 'reserved'), [opportunities]);

  const funnelStages = useMemo(() => {
    return OPPORTUNITY_STAGES.filter((s) => s.id !== 'won' && s.id !== 'lost').map((s) => ({
      id: s.id,
      label: s.label,
      count: opportunities.filter((o) => o.commercialStatus === s.id).length,
      value: opportunities.filter((o) => o.commercialStatus === s.id).reduce((sum, o) => sum + o.budget, 0),
      color: s.color,
      bg: s.bg,
    }));
  }, [opportunities]);

  const handleStageChange = async (oppId: string, newStatus: OpportunityStatus) => {
    const result = await changeOpportunityStageRequest(userId, oppId, newStatus);
    if (result) {
      setOpportunities((prev) => prev.map((o) => o.id === oppId ? result : o));
      toast.success(`Oportunidad movida a ${STAGE_MAP[newStatus]?.label || newStatus}`);
    }
  };

  const handleDrop = (e: React.DragEvent, targetStatus: OpportunityStatus) => {
    e.preventDefault();
    const id = draggingId.current;
    if (!id) return;
    const opp = opportunities.find((o) => o.id === id);
    if (!opp || opp.commercialStatus === targetStatus) return;
    handleStageChange(id, targetStatus);
    draggingId.current = null;
  };

  // ─── KPI bar ────────────────────────────────────────────────────────────

  function renderKpis() {
    if (!stats) return null;
    const kpis = [
      { label: 'Oportunidades', value: String(stats.active), icon: <Target className="w-4 h-4 text-blue-600" />, bg: 'bg-blue-50 dark:bg-blue-950/30' },
      { label: 'Pipeline', value: formatCurrency(stats.pipelineValue), icon: <DollarSign className="w-4 h-4 text-emerald-600" />, bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
      { label: 'Conversion', value: `${stats.conversionRate}%`, icon: <TrendingUp className="w-4 h-4 text-purple-600" />, bg: 'bg-purple-50 dark:bg-purple-950/30' },
      { label: 'Reservas', value: String(stats.reserved), icon: <BookMarked className="w-4 h-4 text-sky-600" />, bg: 'bg-sky-50 dark:bg-sky-950/30' },
      { label: 'Tiempo medio', value: `${stats.avgCloseTimeDays}d`, icon: <Clock className="w-4 h-4 text-amber-600" />, bg: 'bg-amber-50 dark:bg-amber-950/30' },
    ];

    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 md:gap-3">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="flex items-center gap-2.5 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-800 px-3 py-2.5 shadow-sm">
            <div className={`w-8 h-8 rounded-lg ${kpi.bg} flex items-center justify-center flex-shrink-0`}>
              {kpi.icon}
            </div>
            <div className="min-w-0">
              <p className="text-[10px] md:text-xs text-gray-500 dark:text-gray-400 truncate">{kpi.label}</p>
              <p className="text-sm md:text-base font-bold text-gray-900 dark:text-gray-100">{kpi.value}</p>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ─── Panel tab ──────────────────────────────────────────────────────────

  function renderPanelTab() {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-4">
        <div className="lg:col-span-2 space-y-6">
          {/* Embudo */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
            <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-4 flex items-center gap-2">
              <BarChart3 className="w-4 h-4" /> Embudo de ventas
            </h3>
            <SalesFunnel
              stages={funnelStages}
              onStageClick={(id) => { setFilterStatus(id); setActiveTab('opportunities'); }}
            />
          </div>

          {/* Top oportunidades */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
            <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Target className="w-4 h-4" /> Oportunidades calientes
            </h3>
            <div className="space-y-2">
              {opportunities
                .filter((o) => !['won', 'lost'].includes(o.commercialStatus))
                .sort((a, b) => (b.probability * b.budget) - (a.probability * a.budget))
                .slice(0, 5)
                .map((opp) => {
                  const stage = STAGE_MAP[opp.commercialStatus];
                  return (
                    <button
                      key={opp.id}
                      onClick={() => navigate(`/saas/crm/clientes/${opp.clientId || opp.leadId}`)}
                      className="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left"
                    >
                      <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
                        <Car className="w-4 h-4 text-gray-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{opp.vehicleName}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{opp.responsibleName || opp.responsible}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{formatCurrency(opp.budget)}</p>
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${stage?.bg || ''}`} style={{ color: stage?.color }}>
                          <span className={`w-1.5 h-1.5 rounded-full ${stage?.dot || ''}`} />
                          {stage?.label}
                        </span>
                      </div>
                    </button>
                  );
                })}
              {opportunities.filter((o) => !['won', 'lost'].includes(o.commercialStatus)).length === 0 && (
                <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">Sin oportunidades activas</p>
              )}
            </div>
          </div>

          {/* Equipo (solo gerente) */}
          {isManager && teamStats.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
              <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Users className="w-4 h-4" /> Rendimiento del equipo
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {teamStats.map((m) => (
                  <div key={m.responsible} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 dark:border-gray-700">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                      {(m.responsibleName || m.responsible).slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{m.responsibleName || m.responsible}</p>
                      <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                        <span>{m.active} activas</span>
                        <span className="text-emerald-600">{m.won} ganadas</span>
                        <span>{m.conversionRate}% conv.</span>
                      </div>
                    </div>
                    <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{formatCurrency(m.pipelineValue)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar derecho */}
        <div className="space-y-6">
          <CrmAlertsPanel userId={userId} searchQuery={searchQuery} />

          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
            <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Receipt className="w-4 h-4" /> Facturación y cobros
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Pendiente de cobro</span>
                <span className="font-bold text-amber-600">{formatCurrency(billingSummary.pendingAmount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Facturas vencidas</span>
                <span className={`font-bold ${billingSummary.overdueCount > 0 ? 'text-red-600' : 'text-gray-400'}`}>{billingSummary.overdueCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">En finanzas</span>
                <span className="font-bold text-violet-600">{billingSummary.linkedCount}</span>
              </div>
            </div>
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => navigate('/saas/client-billing')}
                className="w-full py-2 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors"
              >
                Facturación clientes
              </button>
              <button
                type="button"
                onClick={() => navigate('/saas/finance')}
                className="w-full py-2 px-3 rounded-xl border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-xs font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex items-center justify-center gap-1.5"
              >
                <Wallet className="w-3.5 h-3.5" /> Visión financiera
              </button>
            </div>
          </div>

          {/* Proximas acciones */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
            <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-3 flex items-center gap-2">
              <CalendarDays className="w-4 h-4" /> Proximas acciones
            </h3>
            <div className="space-y-2">
              {opportunities
                .filter((o) => o.nextAction && !o.nextAction.completed && !['won', 'lost'].includes(o.commercialStatus))
                .sort((a, b) => String(a.nextAction?.dueDate || '').localeCompare(String(b.nextAction?.dueDate || '')))
                .slice(0, 8)
                .map((opp) => {
                  const isOverdue = opp.nextAction?.dueDate && new Date(opp.nextAction.dueDate) < new Date(new Date().toISOString().slice(0, 10));
                  return (
                    <div
                      key={opp.id}
                      className={`p-2.5 rounded-lg border text-left ${isOverdue ? 'border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20' : 'border-gray-100 dark:border-gray-700'}`}
                    >
                      <p className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">{opp.nextAction?.description}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-[10px] font-semibold ${isOverdue ? 'text-red-500' : 'text-gray-400'}`}>
                          {opp.nextAction?.dueDate}
                        </span>
                        <span className="text-[10px] text-gray-400 truncate flex items-center gap-1">
                          <Car className="w-3 h-3" /> {opp.vehicleName}
                        </span>
                      </div>
                    </div>
                  );
                })}
              {opportunities.filter((o) => o.nextAction && !o.nextAction.completed).length === 0 && (
                <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-4">Sin acciones pendientes</p>
              )}
            </div>
          </div>

          {/* Actividad */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
            <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-3">
              Actividad reciente
            </h3>
            <ActivityTimeline events={activity} maxItems={15} compact />
          </div>
        </div>
      </div>
    );
  }

  // ─── Opportunities tab ──────────────────────────────────────────────────

  function renderOpportunitiesTab() {
    const activeStages = OPPORTUNITY_STAGES.filter((s) => s.id !== 'won' && s.id !== 'lost');

    return (
      <div className="mt-4 space-y-4">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar vehiculo, matricula..."
              className="w-full pl-9 pr-8 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2">
                <X className="w-4 h-4 text-gray-400" />
              </button>
            )}
          </div>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
            className="text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800">
            <option value="all">Todos los estados</option>
            {OPPORTUNITY_STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <select value={filterResponsible} onChange={(e) => setFilterResponsible(e.target.value)}
            className="text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800">
            <option value="all">Todos los comerciales</option>
            {responsibles.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <div className="flex items-center border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <button onClick={() => setViewMode('table')} className={`p-2 ${viewMode === 'table' ? 'bg-gray-100 dark:bg-gray-700' : 'hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
              <List className="w-4 h-4" />
            </button>
            <button onClick={() => setViewMode('kanban')} className={`p-2 ${viewMode === 'kanban' ? 'bg-gray-100 dark:bg-gray-700' : 'hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
          <AddButtonDropdown
                label="Oportunidad"
                onQuickAdd={() => setShowCreateModal(true)}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de oportunidad"
              />
        </div>

        {viewMode === 'table' ? renderTable() : renderKanban(activeStages)}
      </div>
    );
  }

  function renderTable() {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-700">
                {['Vehiculo', 'Estado', 'Comercial', 'Presupuesto', 'Prob.', 'Proxima accion', 'Ultima act.'].map((h) => (
                  <th key={h} className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
              {filteredOpps.map((opp) => {
                const stage = STAGE_MAP[opp.commercialStatus];
                const days = daysSince(opp.lastContact || opp.updatedAt);
                return (
                  <tr
                    key={opp.id}
                    onClick={() => navigate(`/saas/crm/clientes/${opp.clientId || opp.leadId}`)}
                    className="hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
                          <Car className="w-4 h-4 text-gray-500" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{opp.vehicleName}</p>
                          <p className="text-xs text-gray-400">{opp.vehiclePlate}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-semibold ${stage?.bg || ''}`} style={{ color: stage?.color }}>
                        <span className={`w-1.5 h-1.5 rounded-full ${stage?.dot || ''}`} />
                        {stage?.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{opp.responsibleName || opp.responsible}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-gray-900 dark:text-gray-100">{formatCurrency(opp.budget)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <div className="w-12 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                          <div className="h-full rounded-full bg-blue-500" style={{ width: `${opp.probability}%` }} />
                        </div>
                        <span className="text-xs text-gray-500">{opp.probability}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 max-w-[150px] truncate">
                      {opp.nextAction?.description || <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs ${days > 3 ? 'text-red-500 font-semibold' : days > 1 ? 'text-amber-500' : 'text-gray-400'}`}>
                        {days === 0 ? 'Hoy' : days === 1 ? 'Ayer' : `Hace ${days}d`}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {filteredOpps.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-gray-400">
                    <Target className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Sin oportunidades{filterStatus !== 'all' || searchQuery ? ' con estos filtros' : ''}</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  function renderKanban(activeStages: typeof OPPORTUNITY_STAGES) {
    return (
      <div className="overflow-x-auto pb-4">
        <div className="flex gap-4 min-w-max">
          {activeStages.map((stage) => {
            const stageOpps = filteredOpps.filter((o) => o.commercialStatus === stage.id);
            const totalBudget = stageOpps.reduce((s, o) => s + o.budget, 0);
            const isDragOver = dragOverStage === stage.id;

            return (
              <div
                key={stage.id}
                className={`flex-shrink-0 w-72 flex flex-col rounded-xl border transition-all ${stage.bg} ${isDragOver ? 'ring-2 ring-blue-400' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setDragOverStage(stage.id); }}
                onDragLeave={() => setDragOverStage((prev) => (prev === stage.id ? null : prev))}
                onDrop={(e) => { setDragOverStage(null); handleDrop(e, stage.id); }}
              >
                <div className={`px-3 py-2.5 border-b ${stage.bg}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${stage.dot}`} />
                      <span className="font-semibold text-sm" style={{ color: stage.color }}>{stage.label}</span>
                    </div>
                    <span className="text-xs font-medium text-gray-500 bg-white/70 dark:bg-gray-800/70 px-1.5 py-0.5 rounded-full">{stageOpps.length}</span>
                  </div>
                  {totalBudget > 0 && (
                    <p className="text-xs text-gray-500 mt-0.5 pl-4">{formatCurrency(totalBudget)}</p>
                  )}
                </div>
                <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-380px)]">
                  {stageOpps.length === 0 && (
                    <div className="flex items-center justify-center h-20 rounded-lg border-2 border-dashed border-gray-200 dark:border-gray-700">
                      <p className="text-xs text-gray-400">Suelta aqui</p>
                    </div>
                  )}
                  {stageOpps.map((opp) => (
                    <div
                      key={opp.id}
                      draggable
                      onDragStart={(e) => { draggingId.current = opp.id; e.dataTransfer.effectAllowed = 'move'; }}
                      onDoubleClick={() => navigate(`/saas/crm/clientes/${opp.clientId || opp.leadId}`)}
                      className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3 shadow-sm hover:shadow-md transition-all cursor-grab active:cursor-grabbing active:opacity-70 group"
                    >
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{opp.vehicleName}</p>
                        <button onClick={(e) => { e.stopPropagation(); navigate(`/saas/crm/clientes/${opp.clientId || opp.leadId}`); }}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-opacity">
                          <ExternalLink className="w-3.5 h-3.5 text-gray-400" />
                        </button>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{opp.vehiclePlate}</p>
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                        <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{formatCurrency(opp.budget)}</span>
                        <span className="text-[10px] text-gray-400">{opp.responsibleName || opp.responsible}</span>
                      </div>
                      {opp.nextAction && !opp.nextAction.completed && (
                        <div className="mt-1.5 px-2 py-1 rounded bg-amber-50 dark:bg-amber-950/30 text-[10px] text-amber-700 dark:text-amber-400 truncate">
                          {opp.nextAction.description}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ─── Leads tab ──────────────────────────────────────────────────────────

  function renderLeadsTab() {
    const activeLeads = leads.filter((l) => l.status !== 'won' && l.status !== 'lost');
    return (
      <div className="mt-4 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500 dark:text-gray-400">{activeLeads.length} leads activos</p>
          <button onClick={() => navigate('/saas/pipeline')} className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1">
            <LayoutGrid className="w-4 h-4" /> Ver Pipeline
          </button>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-700">
                  {['Nombre', 'Estado', 'Vehiculo interes', 'Presupuesto', 'Fuente', 'Responsable', 'Oportunidades'].map((h) => (
                    <th key={h} className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                {activeLeads.slice(0, 50).map((lead) => {
                  const leadOpps = opportunities.filter((o) => o.leadId === lead.id);
                  return (
                    <tr key={lead.id} onClick={() => navigate(`/saas/crm/clientes/${lead.id}`)}
                      className="hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors">
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{lead.name}</p>
                        <p className="text-xs text-gray-400">{lead.phone}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${lead.status === 'new' ? 'bg-blue-50 text-blue-700' : lead.status === 'contacted' ? 'bg-purple-50 text-purple-700' : 'bg-gray-100 text-gray-700'}`}>
                          {lead.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{lead.vehicleInterest || '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{lead.budget || '—'}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{lead.source}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{lead.responsible}</td>
                      <td className="px-4 py-3">
                        {leadOpps.length > 0 ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700">
                            {leadOpps.length} opp.
                          </span>
                        ) : (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleQuickCreateOpp(lead.id, lead.vehicleInterest, lead.vehicleInterestId); }}
                            className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
                          >
                            <Plus className="w-3 h-3" /> Crear
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // ─── Clients tab ────────────────────────────────────────────────────────

  function renderClientsTab() {
    return (
      <div className="mt-4 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500 dark:text-gray-400">{clients.length} clientes</p>
          <button onClick={() => navigate('/saas/crm/clientes?tab=clients')} className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1">
            <ExternalLink className="w-4 h-4" /> Vista completa
          </button>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-700">
                  {['Cliente', 'Estado comercial', 'Telefono', 'Email', 'Responsable', 'Oportunidades'].map((h) => (
                    <th key={h} className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                {clients.slice(0, 50).map((client) => {
                  const clientOpps = opportunities.filter((o) => o.clientId === client.id);
                  return (
                    <tr key={client.id} onClick={() => navigate(`/saas/crm/clientes/${client.id}`)}
                      className="hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors">
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{client.name}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-medium text-gray-600 dark:text-gray-400 capitalize">{client.commercialStatus || 'active'}</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">{client.phone}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">{client.email}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{client.responsible}</td>
                      <td className="px-4 py-3">
                        {clientOpps.length > 0 && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700">
                            {clientOpps.length} opp.
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // ─── Reservations tab ───────────────────────────────────────────────────

  function renderReservationsTab() {
    return (
      <div className="mt-4 space-y-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">{reservedOpps.length} reservas activas</p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {reservedOpps.map((opp) => {
            const stageEntry = (opp.stageHistory || []).filter((h) => h.to === 'reserved').pop();
            const reservedDays = stageEntry ? daysSince(stageEntry.at) : daysSince(opp.updatedAt);
            const isStale = reservedDays > 5;

            return (
              <div
                key={opp.id}
                className={`bg-white dark:bg-gray-800 rounded-2xl border-2 p-4 transition-all hover:shadow-md ${isStale ? 'border-red-300 dark:border-red-700' : 'border-gray-200 dark:border-gray-700'}`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-xl bg-sky-100 dark:bg-sky-900/40 flex items-center justify-center">
                      <Car className="w-5 h-5 text-sky-600" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{opp.vehicleName}</p>
                      <p className="text-xs text-gray-400">{opp.vehiclePlate}</p>
                    </div>
                  </div>
                  {isStale && (
                    <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-red-50 dark:bg-red-950/30">
                      <AlertTriangle className="w-3 h-3 text-red-500" />
                      <span className="text-[10px] font-bold text-red-600">{reservedDays}d</span>
                    </div>
                  )}
                </div>

                <div className="space-y-1.5 text-xs text-gray-600 dark:text-gray-400">
                  <p><span className="font-medium text-gray-700 dark:text-gray-300">Comercial:</span> {opp.responsibleName || opp.responsible}</p>
                  <p><span className="font-medium text-gray-700 dark:text-gray-300">Presupuesto:</span> {formatCurrency(opp.budget)}</p>
                  {opp.nextAction && !opp.nextAction.completed && (
                    <p><span className="font-medium text-gray-700 dark:text-gray-300">Siguiente:</span> {opp.nextAction.description}</p>
                  )}
                </div>

                <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                  <button
                    onClick={() => handleStageChange(opp.id, 'won')}
                    className="flex-1 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors"
                  >
                    Cerrar venta
                  </button>
                  <button
                    onClick={() => navigate(`/saas/crm/clientes/${opp.clientId || opp.leadId}`)}
                    className="flex-1 py-1.5 text-xs font-semibold text-gray-600 bg-gray-50 hover:bg-gray-100 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-lg transition-colors"
                  >
                    Ver detalle
                  </button>
                </div>
              </div>
            );
          })}
          {reservedOpps.length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center py-12 text-gray-400">
              <BookMarked className="w-8 h-8 mb-2 opacity-50" />
              <p className="text-sm">Sin reservas activas</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── Quick create opportunity ───────────────────────────────────────────

  async function handleQuickCreateOpp(leadId: string, vehicleName?: string, vehicleId?: string) {
    if (!vehicleId) {
      toast.error('El lead no tiene vehiculo de interes asignado');
      return;
    }
    try {
      const result = await createOpportunityRequest(userId, {
        leadId,
        vehicleId,
        vehicleName: vehicleName || '',
        commercialStatus: 'new',
      });
      if (result) {
        setOpportunities((prev) => [result, ...prev]);
        toast.success('Oportunidad creada');
      }
    } catch {
      toast.error('Error al crear oportunidad');
    }
  }

  // ─── Main render ────────────────────────────────────────────────────────

  return (
    <Layout title="CRM Compraventa" subtitle="Gestion comercial de leads, clientes y oportunidades">
      <div className="space-y-4">
        {renderKpis()}

        {/* Tabs + scope toggle */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-x-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
            {TABS.map((tab, i) => {
              const isActive = tab.id === activeTab;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative flex-shrink-0 flex items-center gap-2 px-4 py-3 text-sm font-semibold transition-colors whitespace-nowrap ${
                    isActive ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600'
                  } ${i !== 0 ? 'border-l border-gray-100 dark:border-gray-800' : ''}`}
                >
                  {tab.icon}
                  {tab.label}
                  {isActive && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 rounded-t-full" />}
                </button>
              );
            })}
          </div>

          {isManager && (
            <div className="flex items-center gap-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-1">
              <button
                onClick={() => setScopeAll(false)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${!scopeAll ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Mi pipeline
              </button>
              <button
                onClick={() => setScopeAll(true)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${scopeAll ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Todo el equipo
              </button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
          </div>
        ) : (
          <>
            {activeTab === 'panel' && renderPanelTab()}
            {activeTab === 'opportunities' && renderOpportunitiesTab()}
            {activeTab === 'leads' && renderLeadsTab()}
            {activeTab === 'clients' && renderClientsTab()}
            {activeTab === 'reservations' && renderReservationsTab()}
          </>
        )}
      </div>

      {/* Create opportunity modal */}
      {showCreateModal && (
        <CreateOpportunityModal
          vehicles={vehicles}
          leads={leads}
          clients={clients}
          userId={userId}
          onClose={() => setShowCreateModal(false)}
          onCreate={(opp) => {
            setOpportunities((prev) => [opp, ...prev]);
            setShowCreateModal(false);
            toast.success('Oportunidad creada');
          }}
        />
      )}
    </Layout>
  );
}

// ─── Create Modal ────────────────────────────────────────────────────────────

interface CreateModalProps {
  vehicles: Array<{ id: string; brand?: string; model?: string; registrationPlate?: string; [k: string]: unknown }>;
  leads: Array<{ id: string; name: string; vehicleInterestId?: string; [k: string]: unknown }>;
  clients: Array<{ id: string; name: string; [k: string]: unknown }>;
  userId: string;
  onClose: () => void;
  onCreate: (opp: Opportunity) => void;
}

function CreateOpportunityModal({ vehicles, leads, clients, userId, onClose, onCreate }: CreateModalProps) {
  const [entityType, setEntityType] = useState<'lead' | 'client'>('lead');
  const [entityId, setEntityId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [budget, setBudget] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'client', label: 'Cliente' },
    { key: 'vehicle', label: 'Vehículo' },
    { key: 'value', label: 'Valor' },
    { key: 'status', label: 'Estado' },
    { key: 'notes', label: 'Notas' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'client', label: 'Cliente', example: '' },
    { key: 'vehicle', label: 'Vehículo', example: '' },
    { key: 'value', label: 'Valor', example: '' },
    { key: 'status', label: 'Estado', example: '' },
    { key: 'notes', label: 'Notas', example: '' },
  ];

  const handleAIEntries = async (entries: Record<string, unknown>[]) => {
    toast.success(`${entries.length} oportunidad(s) parseado(s) con IA`);
  };

  const handleImportEntries = async (entries: Record<string, string>[]) => {
    if (!userId) return;
    let created = 0;
    for (const entry of entries) {
      try {
        const vehicleName = String(entry.vehicle || '').trim();
        const matchedVehicle = vehicles.find((v) => {
          const label = `${v.brand || ''} ${v.model || ''}`.trim().toLowerCase();
          return label === vehicleName.toLowerCase()
            || String(v.registrationPlate || '').toLowerCase() === vehicleName.toLowerCase();
        });
        const result = await createOpportunityRequest(userId, {
          vehicleName: vehicleName || 'Sin vehículo',
          vehicleId: matchedVehicle?.id || '',
          vehiclePlate: matchedVehicle?.registrationPlate || '',
          budget: Number.parseFloat(String(entry.value || '0').replace(',', '.')) || 0,
          commercialStatus: (String(entry.status || 'new').trim() as OpportunityStatus) || 'new',
          notes: String(entry.notes || '').trim() || undefined,
        });
        if (result) {
          setOpportunities((prev) => [result, ...prev]);
          created++;
        }
      } catch { /* skip row */ }
    }
    toast.success(`${created} oportunidad(es) importada(s)`);
  };

  const selectedVehicle = vehicles.find((v) => v.id === vehicleId);
  const vehicleName = selectedVehicle ? `${selectedVehicle.brand || ''} ${selectedVehicle.model || ''}`.trim() : '';
  const vehiclePlate = selectedVehicle?.registrationPlate || '';

  const handleSubmit = async () => {
    if (!entityId || !vehicleId) { toast.error('Selecciona un lead/cliente y un vehiculo'); return; }
    setSaving(true);
    try {
      const result = await createOpportunityRequest(userId, {
        leadId: entityType === 'lead' ? entityId : '',
        clientId: entityType === 'client' ? entityId : '',
        vehicleId,
        vehicleName,
        vehiclePlate,
        budget: Number(budget || 0),
        notes,
        commercialStatus: 'new',
      });
      if (result) onCreate(result);
    } catch {
      toast.error('Error al crear oportunidad');
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-lg mx-4 p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Nueva oportunidad</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="flex gap-2">
            <button onClick={() => setEntityType('lead')}
              className={`flex-1 py-2 text-sm font-semibold rounded-lg border-2 transition-colors ${entityType === 'lead' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 dark:border-gray-700 text-gray-500'}`}>
              Lead
            </button>
            <button onClick={() => setEntityType('client')}
              className={`flex-1 py-2 text-sm font-semibold rounded-lg border-2 transition-colors ${entityType === 'client' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 dark:border-gray-700 text-gray-500'}`}>
              Cliente
            </button>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">{entityType === 'lead' ? 'Lead' : 'Cliente'}</label>
            <select value={entityId} onChange={(e) => setEntityId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 outline-none">
              <option value="">Seleccionar...</option>
              {entityType === 'lead'
                ? leads.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)
                : clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Vehiculo</label>
            <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 outline-none">
              <option value="">Seleccionar vehiculo...</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.brand} {v.model} — {v.registrationPlate}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Presupuesto estimado</label>
            <input type="number" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="0"
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Notas</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Notas comerciales..."
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 outline-none resize-none" />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 rounded-lg">
            Cancelar
          </button>
          <button onClick={handleSubmit} disabled={saving}
            className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors">
            {saving ? 'Creando...' : 'Crear oportunidad'}
          </button>
        </div>
      </div>
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="compraventa_crm"
        moduleLabel="Oportunidades"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Oportunidades"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </div>
  );
}
