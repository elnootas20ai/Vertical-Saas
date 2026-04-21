import { useEffect, useMemo, useState, useRef } from 'react';
import { useNavigate } from 'react-router';
import { Layout } from '../../components/saas/Layout';
import { useModalClose } from '../../hooks/useModalClose';
import { WorkflowsManager } from '../../components/saas/WorkflowsManager';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import type { Lead } from '../../context/AppContext';
import { useWorkCenters } from '../../hooks/useWorkCenters';
import { SAAS__NewLeadModal } from '../../components/design-system/SAAS__NewLeadModal';
import { computeLeadScore, getScoreColor } from '../../lib/leadScoring';
import { getPipelineConfig } from '../../lib/settingsApi';
import type { Workflow } from '../../lib/workflowsApi';
import {
  User, Phone, Car, DollarSign, Calendar, Flame,
  MoreVertical, ExternalLink, TrendingUp, RefreshCw, ChevronLeft, ChevronRight,
} from 'lucide-react';

// ─── Config de etapas del funnel ─────────────────────────────────────────────

type LeadStatus = 'new' | 'contacted' | 'appointment' | 'reserved' | 'negotiation' | 'won' | 'lost';

interface StageConfig {
  id: LeadStatus;
  label: string;
  color: string;
  headerBg: string;
  dotColor: string;
  cardBorder: string;
}

const STAGES: StageConfig[] = [
  { id: 'new',         label: 'Nuevo',        color: 'text-blue-700',   headerBg: 'bg-blue-50 border-blue-200',   dotColor: 'bg-blue-500',   cardBorder: 'border-t-blue-500' },
  { id: 'contacted',   label: 'Contactado',   color: 'text-purple-700', headerBg: 'bg-purple-50 border-purple-200', dotColor: 'bg-purple-500', cardBorder: 'border-t-purple-500' },
  { id: 'appointment', label: 'Cita',         color: 'text-amber-700',  headerBg: 'bg-amber-50 border-amber-200',  dotColor: 'bg-amber-500',  cardBorder: 'border-t-amber-500' },
  { id: 'reserved',    label: 'Reservado',    color: 'text-orange-700', headerBg: 'bg-orange-50 border-orange-200', dotColor: 'bg-orange-500', cardBorder: 'border-t-orange-500' },
  { id: 'negotiation', label: 'Negociación',  color: 'text-indigo-700', headerBg: 'bg-indigo-50 border-indigo-200', dotColor: 'bg-indigo-500', cardBorder: 'border-t-indigo-500' },
  { id: 'won',         label: 'Ganado',       color: 'text-emerald-700',headerBg: 'bg-emerald-50 border-emerald-200', dotColor: 'bg-emerald-500', cardBorder: 'border-t-emerald-500' },
  { id: 'lost',        label: 'Perdido',      color: 'text-red-700',    headerBg: 'bg-red-50 border-red-200',      dotColor: 'bg-red-500',    cardBorder: 'border-t-red-500' },
];

// ─── LeadCard ─────────────────────────────────────────────────────────────────

function LeadCard({
  lead,
  onDragStart,
  onMenuOpen,
  navigate,
}: {
  lead: Lead;
  onDragStart: (e: React.DragEvent, leadId: string) => void;
  onMenuOpen: (leadId: string) => void;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const daysSince = Math.floor(
    (Date.now() - new Date(lead.createdAt).getTime()) / 86400000,
  );

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, lead.id)}
      onDoubleClick={() => navigate(`/saas/crm/clientes/${lead.id}`)}
      className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 border-t-4 border-t-current shadow-sm hover:shadow-md transition-all cursor-grab active:cursor-grabbing active:opacity-70 active:scale-95 select-none group"
      style={{ borderTopColor: 'inherit' }}
    >
      <div className="p-3">
        {/* Cabecera */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
              <User className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
            </div>
            <span className="font-medium text-gray-900 dark:text-gray-100 text-sm truncate">{lead.name}</span>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onMenuOpen(lead.id); }}
            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 flex-shrink-0 transition-opacity"
          >
            <MoreVertical className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* Info */}
        <div className="space-y-1 text-xs text-gray-500 dark:text-gray-400">
          {lead.vehicleInterest && (
            <div className="flex items-center gap-1.5">
              <Car className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{lead.vehicleInterest}</span>
            </div>
          )}
          {lead.budget && (
            <div className="flex items-center gap-1.5">
              <DollarSign className="w-3 h-3 flex-shrink-0" />
              <span>{lead.budget}</span>
            </div>
          )}
          {lead.phone && (
            <div className="flex items-center gap-1.5">
              <Phone className="w-3 h-3 flex-shrink-0" />
              <span>{lead.phone}</span>
            </div>
          )}
        </div>

        {/* Tags */}
        {lead.tags && lead.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {lead.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded text-[10px] font-medium">
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100 dark:border-gray-800">
          <span className="text-[10px] text-gray-400 dark:text-gray-500 flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {daysSince === 0 ? 'Hoy' : daysSince === 1 ? 'Ayer' : `Hace ${daysSince}d`}
          </span>
          <div className="flex items-center gap-1.5">
            {(() => {
              const { total } = computeLeadScore(lead);
              const colorCls = getScoreColor(total);
              return (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border flex items-center gap-0.5 ${colorCls}`}>
                  <Flame className="w-2.5 h-2.5" />
                  {total}
                </span>
              );
            })()}
            <button
              onClick={() => navigate(`/saas/crm/clientes/${lead.id}`)}
              className="text-[10px] text-blue-600 hover:text-blue-700 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <ExternalLink className="w-3 h-3" />
              Ver
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── DropZone (columna Kanban) ────────────────────────────────────────────────

function KanbanColumn({
  stage,
  leads,
  workflowCount,
  onDragStart,
  onDrop,
  onMenuOpen,
  navigate,
}: {
  stage: StageConfig;
  leads: Lead[];
  workflowCount: number;
  onDragStart: (e: React.DragEvent, leadId: string) => void;
  onDrop: (e: React.DragEvent, targetStatus: LeadStatus) => void;
  onMenuOpen: (leadId: string) => void;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const [isDragOver, setIsDragOver] = useState(false);

  const totalBudget = leads.reduce((sum, l) => {
    const num = parseFloat(String(l.budget || '0').replace(/[^0-9.]/g, ''));
    return sum + (isNaN(num) ? 0 : num);
  }, 0);

  return (
    <div
      className={`flex-shrink-0 w-64 flex flex-col rounded-xl border ${stage.headerBg} transition-all ${isDragOver ? 'ring-2 ring-blue-400 ring-offset-1' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => { setIsDragOver(false); onDrop(e, stage.id); }}
    >
      {/* Header */}
      <div className={`px-3 py-2.5 border-b ${stage.headerBg}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${stage.dotColor}`} />
            <span className={`font-semibold text-sm ${stage.color}`}>{stage.label}</span>
          </div>
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400 bg-white/70 dark:bg-gray-800/70 px-1.5 py-0.5 rounded-full">
            {leads.length}
          </span>
        </div>
        {totalBudget > 0 && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 pl-4">
            {totalBudget.toLocaleString('es-ES', { maximumFractionDigits: 0 })} € potencial
          </p>
        )}
        {workflowCount > 0 && (
          <p className="text-xs text-indigo-600 mt-1 pl-4 font-medium">
            {workflowCount} workflow{workflowCount !== 1 ? 's' : ''}
          </p>
        )}
      </div>

      {/* Cards */}
      <div className="flex-1 p-2 space-y-2 overflow-y-auto min-h-[120px] max-h-[calc(100vh-280px)]">
        {leads.length === 0 && (
          <div className={`flex flex-col items-center justify-center h-20 rounded-lg border-2 border-dashed border-gray-200 dark:border-gray-700 transition-all ${isDragOver ? 'border-blue-300 bg-blue-50/50' : ''}`}>
            <p className="text-xs text-gray-400 dark:text-gray-500">Suelta aquí</p>
          </div>
        )}
        {leads.map((lead) => (
          <LeadCard
            key={lead.id}
            lead={lead}
            onDragStart={onDragStart}
            onMenuOpen={onMenuOpen}
            navigate={navigate}
          />
        ))}
      </div>
    </div>
  );
}

// ─── LeadContextMenu ──────────────────────────────────────────────────────────

function LeadContextMenu({
  lead,
  onClose,
  onMoveToStage,
  onNavigate,
  stages,
}: {
  lead: Lead;
  onClose: () => void;
  onMoveToStage: (stage: LeadStatus) => void;
  onNavigate: () => void;
  stages: StageConfig[];
}) {
  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
        <div
        className="absolute bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 p-1 w-52 z-50"
        style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-800 mb-1">
          <p className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">{lead.name}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Mover a...</p>
        </div>
        {stages.filter((s) => s.id !== lead.status).map((stage) => (
          <button
            key={stage.id}
            onClick={() => { onMoveToStage(stage.id); onClose(); }}
            className={`w-full text-left px-3 py-1.5 text-sm rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-2 ${stage.color}`}
          >
            <span className={`w-2 h-2 rounded-full ${stage.dotColor}`} />
            {stage.label}
          </button>
        ))}
        <div className="border-t border-gray-100 dark:border-gray-800 mt-1 pt-1">
          <button
            onClick={() => { onNavigate(); onClose(); }}
            className="w-full text-left px-3 py-1.5 text-sm rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-2 text-gray-700 dark:text-gray-300"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Ver ficha
          </button>
          {lead.vehicleInterestId && (
            <button
              onClick={() => {
                onClose();
                window.location.href = `/saas/vertical/compraventa/crm?tab=opportunities`;
              }}
              className="w-full text-left px-3 py-1.5 text-sm rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-2 text-blue-600"
            >
              <TrendingUp className="w-3.5 h-3.5" />
              Crear oportunidad
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Página principal ────────────────────────────────────────────────────────

export function Pipeline() {
  const navigate = useNavigate();
  const { leads, updateLead, addLead, vehicles } = useApp();
  const { user } = useAuth();
  const [showNewLeadModal, setShowNewLeadModal] = useState(false);
  const [openCreateWorkflowSignal, setOpenCreateWorkflowSignal] = useState(0);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [menuLeadId, setMenuLeadId] = useState<string | null>(null);

  useModalClose(!!menuLeadId, () => setMenuLeadId(null));

  const { activeWorkCenters, hasWorkCenters } = useWorkCenters();
  const [filterSource, setFilterSource] = useState<string>('all');
  const [filterResponsible, setFilterResponsible] = useState<string>('all');
  const [filterWorkCenter, setFilterWorkCenter] = useState<string>('all');
  const draggingId = useRef<string | null>(null);
  const [customLabels, setCustomLabels] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!user?.user_id) return;
    getPipelineConfig(user.user_id)
      .then((stages) => {
        const labels: Record<string, string> = {};
        for (const s of stages) labels[s.id] = s.label;
        setCustomLabels(labels);
      })
      .catch(() => {});
  }, [user?.user_id]);

  const stages = useMemo(
    () => STAGES.map((s) => ({ ...s, label: customLabels[s.id] ?? s.label })),
    [customLabels],
  );

  // Filtra sólo los leads activos (no won/lost por defecto, pero el usuario puede verlos)
  const [showClosed, setShowClosed] = useState(false);

  const visibleLeads = leads.filter((l) => {
    if (!showClosed && (l.status === 'won' || l.status === 'lost')) return false;
    if (filterSource !== 'all' && l.source !== filterSource) return false;
    if (filterResponsible !== 'all' && l.responsible !== filterResponsible) return false;
    if (filterWorkCenter !== 'all' && (l as any).workCenterId !== filterWorkCenter) return false;
    return true;
  });

  const sources = Array.from(new Set(leads.map((l) => l.source).filter(Boolean)));
  const responsibles = Array.from(new Set(leads.map((l) => l.responsible).filter(Boolean)));

  const visibleStages = showClosed ? stages : stages.filter((s) => s.id !== 'won' && s.id !== 'lost');

  const leadsByStage = visibleStages.reduce<Record<string, Lead[]>>((acc, stage) => {
    acc[stage.id] = visibleLeads.filter((l) => l.status === stage.id);
    return acc;
  }, {});
  const workflowCountByStage = useMemo(() => {
    return workflows.reduce<Record<string, number>>((acc, wf) => {
      if (wf.trigger?.type !== 'status_is' || !wf.trigger.status) return acc;
      acc[wf.trigger.status] = (acc[wf.trigger.status] || 0) + 1;
      return acc;
    }, {});
  }, [workflows]);

  const menuLead = menuLeadId ? leads.find((l) => l.id === menuLeadId) : null;

  const handleDragStart = (e: React.DragEvent, leadId: string) => {
    draggingId.current = leadId;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', leadId);
  };

  const handleDrop = (e: React.DragEvent, targetStatus: LeadStatus) => {
    e.preventDefault();
    const id = draggingId.current || e.dataTransfer.getData('text/plain');
    if (!id) return;
    const lead = leads.find((l) => l.id === id);
    if (!lead || lead.status === targetStatus) return;
    updateLead(id, { status: targetStatus });
    draggingId.current = null;
  };

  const totalActive = leads.filter((l) => l.status !== 'won' && l.status !== 'lost').length;
  const totalWon = leads.filter((l) => l.status === 'won').length;
  const conversionRate = leads.length > 0 ? Math.round((totalWon / leads.length) * 100) : 0;
  const totalPotential = leads
    .filter((l) => l.status !== 'lost')
    .reduce((sum, l) => {
      const n = parseFloat(String(l.budget || '0').replace(/[^0-9.]/g, ''));
      return sum + (isNaN(n) ? 0 : n);
    }, 0);

  const [mobileStageIdx, setMobileStageIdx] = useState(0);
  const mobileStage = visibleStages[mobileStageIdx] ?? visibleStages[0];

  return (
    <Layout title="Pipeline" subtitle="Seguimiento de leads por etapas y conversión">
      <div className="flex flex-col h-full min-h-screen">
        {/* Header */}
        <div className="bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 md:gap-3 mt-3 md:mt-4">
            {[
              { label: 'Leads activos', value: totalActive, icon: <User className="w-4 h-4 text-blue-600" />, bg: 'bg-blue-50' },
              { label: 'Ganados', value: totalWon, icon: <TrendingUp className="w-4 h-4 text-emerald-600" />, bg: 'bg-emerald-50' },
              { label: 'Conversión', value: `${conversionRate}%`, icon: <RefreshCw className="w-4 h-4 text-purple-600" />, bg: 'bg-purple-50' },
              { label: 'Potencial', value: `${(totalPotential / 1000).toFixed(0)}K€`, icon: <DollarSign className="w-4 h-4 text-amber-600" />, bg: 'bg-amber-50' },
            ].map((kpi) => (
              <div key={kpi.label} className="flex items-center gap-2 md:gap-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-800 px-2.5 md:px-3 py-2 md:py-2.5 shadow-sm">
                <div className={`w-7 h-7 md:w-8 md:h-8 rounded-lg ${kpi.bg} flex items-center justify-center flex-shrink-0`}>
                  {kpi.icon}
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] md:text-xs text-gray-500 dark:text-gray-400 truncate">{kpi.label}</p>
                  <p className="text-sm md:text-base font-bold text-gray-900 dark:text-gray-100">{kpi.value}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Filtros */}
          <div className="flex items-center gap-2 mt-2 md:mt-3 flex-wrap">
            <select
              value={filterSource}
              onChange={(e) => setFilterSource(e.target.value)}
              className="text-xs md:text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Todas las fuentes</option>
              {sources.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select
              value={filterResponsible}
              onChange={(e) => setFilterResponsible(e.target.value)}
              className="text-xs md:text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Todos los responsables</option>
              {responsibles.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            {hasWorkCenters && (
              <select
                value={filterWorkCenter}
                onChange={(e) => setFilterWorkCenter(e.target.value)}
                className="text-xs md:text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">Todos los centros</option>
                {activeWorkCenters.map((wc) => <option key={wc.id} value={wc.id}>{wc.name}</option>)}
              </select>
            )}
            <label className="flex items-center gap-1.5 text-xs md:text-sm text-gray-600 dark:text-gray-400 cursor-pointer">
              <input
                type="checkbox"
                checked={showClosed}
                onChange={(e) => setShowClosed(e.target.checked)}
                className="rounded border-gray-300"
              />
              Cerrados
            </label>
            <button
              onClick={() => navigate('/saas/crm/clientes')}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 transition-colors"
              title="Vista lista"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Vista lista</span>
            </button>
            <button
              onClick={() => setOpenCreateWorkflowSignal((prev) => prev + 1)}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              + Workflow
            </button>
            <button
              onClick={() => setShowNewLeadModal(true)}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              +Lead
            </button>
          </div>
        </div>

        <WorkflowsManager
          compact
          openCreateSignal={openCreateWorkflowSignal}
          onLoaded={setWorkflows}
        />

        {/* ── Mobile: navegación por etapas ─────────────────────────── */}
        <div className="md:hidden bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
              <div className="flex overflow-x-auto [&::-webkit-scrollbar]:hidden px-4 gap-1 py-2" style={{ scrollbarWidth: 'none' }}>
                {visibleStages.map((stage, idx) => {
                  const count = leadsByStage[stage.id]?.length ?? 0;
                  const isActive = idx === mobileStageIdx;
                  return (
                    <button
                      key={stage.id}
                      onClick={() => setMobileStageIdx(idx)}
                      className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                        isActive
                          ? 'bg-gray-900 border-gray-900 text-white'
                          : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${stage.dotColor}`} />
                      {stage.label}
                      <span className={`text-[10px] font-bold px-1 rounded-full ${isActive ? 'bg-white/20' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center justify-between px-4 pb-2">
                <button
                  onClick={() => setMobileStageIdx((i) => Math.max(0, i - 1))}
                  disabled={mobileStageIdx === 0}
                  className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 disabled:opacity-30"
                >
                  <ChevronLeft className="w-4 h-4" />
                  {visibleStages[mobileStageIdx - 1]?.label ?? ''}
                </button>
                <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">
                  {mobileStageIdx + 1} / {visibleStages.length}
                </span>
                <button
                  onClick={() => setMobileStageIdx((i) => Math.min(visibleStages.length - 1, i + 1))}
                  disabled={mobileStageIdx === visibleStages.length - 1}
                  className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 disabled:opacity-30"
                >
                  {visibleStages[mobileStageIdx + 1]?.label ?? ''}
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

        {mobileStage && (
              <div className="md:hidden flex-1 overflow-y-auto px-4 py-4">
                <div className={`rounded-xl border ${mobileStage.headerBg} min-h-[200px]`}>
                  <div className={`px-3 py-2.5 border-b ${mobileStage.headerBg} rounded-t-xl`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${mobileStage.dotColor}`} />
                        <span className={`font-semibold text-sm ${mobileStage.color}`}>{mobileStage.label}</span>
                      </div>
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400 bg-white/70 dark:bg-gray-800/70 px-1.5 py-0.5 rounded-full">
                        {leadsByStage[mobileStage.id]?.length ?? 0}
                      </span>
                    </div>
                  </div>
                  <div className="p-2 space-y-2">
                    {(leadsByStage[mobileStage.id] ?? []).length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-24 rounded-lg border-2 border-dashed border-gray-200 dark:border-gray-700">
                        <p className="text-xs text-gray-400 dark:text-gray-500">Sin leads en esta etapa</p>
                      </div>
                    ) : (
                      (leadsByStage[mobileStage.id] ?? []).map((lead) => (
                        <LeadCard
                          key={lead.id}
                          lead={lead}
                          onDragStart={handleDragStart}
                          onMenuOpen={setMenuLeadId}
                          navigate={navigate}
                        />
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

        <div className="hidden md:block flex-1 overflow-x-auto px-6 py-4">
          <div className="flex gap-4 h-full min-w-max">
            {visibleStages.map((stage) => (
              <KanbanColumn
                key={stage.id}
                stage={stage}
                leads={leadsByStage[stage.id] || []}
                workflowCount={workflowCountByStage[stage.id] || 0}
                onDragStart={handleDragStart}
                onDrop={handleDrop}
                onMenuOpen={setMenuLeadId}
                navigate={navigate}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Menú contextual */}
      {menuLead && (
        <LeadContextMenu
          lead={menuLead}
          onClose={() => setMenuLeadId(null)}
          onMoveToStage={(stage) => updateLead(menuLead.id, { status: stage })}
          onNavigate={() => navigate(`/saas/crm/clientes/${menuLead.id}`)}
          stages={stages}
        />
      )}

      {/* Modal nuevo lead */}
      {showNewLeadModal && (
        <SAAS__NewLeadModal
          isOpen={showNewLeadModal}
          onClose={() => setShowNewLeadModal(false)}
          vehicles={vehicles}
          onCreate={(data) => {
            void addLead({
              name: data.name,
              phone: data.phone,
              email: data.email || undefined,
              source: data.source,
              vehicleInterest: data.vehicleInterest || undefined,
              vehicleInterestId: data.vehicleInterestId || undefined,
              budget: data.budget || undefined,
              notes: data.notes || undefined,
              responsible: data.responsible || undefined,
            });
          }}
          onCheckDuplicates={async (phone, email) => {
            const normalizedPhone = String(phone || '').trim();
            const normalizedEmail = String(email || '').trim().toLowerCase();
            return leads
              .filter((lead) => {
                const samePhone = normalizedPhone && String(lead.phone || '').trim() === normalizedPhone;
                const sameEmail = normalizedEmail && String(lead.email || '').trim().toLowerCase() === normalizedEmail;
                return Boolean(samePhone || sameEmail);
              })
              .map((lead) => ({
                id: lead.id,
                name: lead.name,
                phone: lead.phone,
                email: lead.email,
                status: lead.status,
              }));
          }}
          onViewLead={(leadId) => navigate(`/saas/crm/clientes/${leadId}`)}
        />
      )}
    </Layout>
  );
}
