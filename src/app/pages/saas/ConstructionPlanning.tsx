import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Layout } from '../../components/saas/Layout';
import { useModalClose } from '../../hooks/useModalClose';
import { useAuth } from '../../context/AuthContext';
import {
  CalendarRange, Plus, X, Edit3, Search, Filter, ChevronLeft, ChevronRight,
  AlertTriangle, Clock, Flag, Package, UserX, HardHat, Truck, UsersRound,
  CheckCircle2, PauseCircle, Bell, Calendar, TableIcon, LayoutGrid,
  Trash2, Copy, Play, Square, Check, MoreHorizontal, MapPin, GanttChart,
  FileText, Eye, Ban, PackageX, CalendarX2, UserCheck,
} from 'lucide-react';
import type {
  ConstructionPlanningEntry, ConstructionMilestone, ConstructionMaterialNeed,
  ConstructionProject, ConstructionWorker, ConstructionGuild, ConstructionTask,
  PlanningOverview, PlanningOverviewResumen, ConstructionAlert, PlanningConflicto,
} from '../../lib/constructionApi';
import {
  getPlanningOverview, createPlanningEntry, updatePlanningEntry, deletePlanningEntry,
  confirmPlanningEntry, startPlanningEntry, completePlanningEntry, cancelPlanningEntry,
  duplicatePlanningEntry, createMilestone, completeMilestone as completeMilestoneApi,
  createMaterialNeed, requestMaterialNeed, updateMaterialNeed,
  listConstructionProjects, listConstructionWorkers, listConstructionGuilds,
  listConstructionTasks,
} from '../../lib/constructionApi';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';
import { toast } from 'sonner';
import { bulkCreateVerticalEntries, entryStr, entryNum } from '../../lib/bulkVerticalImport';

const MANAGER_ROLES = new Set(['Admin', 'Gerente', 'owner', 'admin', 'manager']);

const estadoColors: Record<string, string> = {
  planificado: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  confirmado: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  en_curso: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  completado: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  cancelado: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
};

const tipoRecursoConfig: Record<string, { icon: typeof HardHat; color: string; label: string }> = {
  trabajador: { icon: HardHat, color: 'text-amber-600', label: 'Trabajador' },
  maquinaria: { icon: Truck, color: 'text-sky-600', label: 'Maquinaria' },
  subcontrata: { icon: UsersRound, color: 'text-violet-600', label: 'Subcontrata' },
};

const milestoneIcons: Record<string, string> = {
  inicio_obra: '🏗️', fin_fase: '🔨', entrega_parcial: '📦', recepcion_material: '📥',
  inspeccion: '🔍', permiso: '📋', entrega_final: '🏁', otro: '📌',
};

const fmtDate = (d: string) => { if (!d) return '—'; try { return new Date(d).toLocaleDateString('es-ES'); } catch { return d; } };
const inputClass = 'w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 dark:focus:border-gray-400 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm';
const labelClass = 'block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1';
const btnPrimary = 'px-4 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-xl text-sm font-semibold hover:opacity-90 transition-all';
const btnSecondary = 'px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-all';

function getMonday(d: Date) {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.getFullYear(), d.getMonth(), diff);
}

function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }

const WEEKDAY_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export function ConstructionPlanning() {
  const { user } = useAuth();
  const userId = user?.user_id || user?.id || '';
  const isManager = MANAGER_ROLES.has(user?.role || '');
  const [searchParams] = useSearchParams();

  const [view, setView] = useState<'calendar' | 'table'>('calendar');
  const [calMode, setCalMode] = useState<'week' | 'month' | 'gantt'>('week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [data, setData] = useState<PlanningOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterProject, setFilterProject] = useState(searchParams.get('projectId') || '');
  const [filterTipoRecurso, setFilterTipoRecurso] = useState(searchParams.get('tipoRecurso') || '');
  const [filterEstado, setFilterEstado] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<ConstructionPlanningEntry | null>(null);
  const [milestoneModal, setMilestoneModal] = useState(false);
  const [materialModal, setMaterialModal] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(true);
  const [projects, setProjects] = useState<ConstructionProject[]>([]);
  const [workers, setWorkers] = useState<ConstructionWorker[]>([]);
  const [guilds, setGuilds] = useState<ConstructionGuild[]>([]);
  const [tasks, setTasks] = useState<ConstructionTask[]>([]);

  useModalClose(drawerOpen, () => setDrawerOpen(false));
  useModalClose(milestoneModal, () => setMilestoneModal(false));
  useModalClose(materialModal, () => setMaterialModal(false));

  const loadRef = useRef(0);
  const load = useCallback(async () => {
    if (!userId) return;
    const tick = ++loadRef.current;
    try {
      const monday = getMonday(currentDate);
      const sunday = addDays(monday, 6);
      const dateFrom = calMode === 'month'
        ? new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).toISOString().slice(0, 10)
        : monday.toISOString().slice(0, 10);
      const dateTo = calMode === 'month'
        ? new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).toISOString().slice(0, 10)
        : sunday.toISOString().slice(0, 10);

      const [overview, prj, wrk, gld, tsk] = await Promise.all([
        getPlanningOverview(userId, { projectId: filterProject || undefined, dateFrom, dateTo, tipoRecurso: filterTipoRecurso || undefined }),
        listConstructionProjects(userId),
        listConstructionWorkers(userId),
        listConstructionGuilds(userId),
        listConstructionTasks(userId),
      ]);
      if (tick !== loadRef.current) return;
      setData(overview);
      setProjects(prj); setWorkers(wrk); setGuilds(gld); setTasks(tsk);
    } catch { /* ignore */ }
    if (tick === loadRef.current) setLoading(false);
  }, [userId, filterProject, filterTipoRecurso, currentDate, calMode]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const iv = setInterval(load, 60000); return () => clearInterval(iv); }, [load]);

  const resumen = data?.resumen || {} as PlanningOverviewResumen;
  const entries = data?.entries || [];
  const milestones = data?.milestones || [];
  const materialNeeds = data?.materialNeeds || [];
  const alertas = data?.alertas || [];

  const filteredEntries = useMemo(() => {
    let list = entries;
    if (filterEstado) list = list.filter(e => e.estado === filterEstado);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(e => `${e.referencia} ${e.obraNombre} ${e.recursoNombre} ${e.gremio} ${e.descripcion}`.toLowerCase().includes(q));
    }
    return list;
  }, [entries, filterEstado, search]);

  const navigate = (dir: number) => {
    if (calMode === 'week') setCurrentDate(prev => addDays(prev, dir * 7));
    else if (calMode === 'month') setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + dir, 1));
    else setCurrentDate(prev => addDays(prev, dir * 30));
  };

  const openCreate = (prefill?: Partial<ConstructionPlanningEntry>) => {
    setEditingEntry({ ...({} as ConstructionPlanningEntry), ...prefill } as ConstructionPlanningEntry);
    setDrawerOpen(true);
  };
  const openEdit = (entry: ConstructionPlanningEntry) => { setEditingEntry(entry); setDrawerOpen(true); };

  const handleAction = async (entry: ConstructionPlanningEntry, action: string) => {
    try {
      if (action === 'confirm') await confirmPlanningEntry(userId, entry._id, userId);
      else if (action === 'start') await startPlanningEntry(userId, entry._id);
      else if (action === 'complete') await completePlanningEntry(userId, entry._id);
      else if (action === 'cancel') await cancelPlanningEntry(userId, entry._id);
      else if (action === 'delete') await deletePlanningEntry(userId, entry._id);
      else if (action === 'duplicate') await duplicatePlanningEntry(userId, entry._id, { fechaInicio: entry.fechaInicio, fechaFin: entry.fechaFin });
      load();
    } catch { /* ignore */ }
  };

  if (loading) return <Layout title="Planificación de Obra"><div className="flex items-center justify-center py-20 text-gray-400">Cargando...</div></Layout>;

  return (
    <Layout title="Planificación de Obra">
      <div className="space-y-5">
        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          {[
            { label: 'Asignaciones activas', value: (resumen.entradasPlanificadas || 0) + (resumen.entradasConfirmadas || 0) + (resumen.entradasEnCurso || 0), icon: CalendarRange, color: 'text-sky-600' },
            { label: 'Conflictos', value: resumen.totalConflictos || 0, icon: AlertTriangle, color: resumen.totalConflictos ? 'text-red-600' : 'text-gray-400' },
            { label: 'Hitos próximos', value: resumen.hitosProximos || 0, icon: Flag, color: 'text-amber-600' },
            { label: 'Hitos retrasados', value: resumen.hitosRetrasados || 0, icon: Clock, color: resumen.hitosRetrasados ? 'text-red-600' : 'text-gray-400' },
            { label: 'Materiales pend.', value: resumen.materialesPendientes || 0, icon: Package, color: resumen.materialesPendientes ? 'text-orange-600' : 'text-gray-400' },
            { label: 'Subcontr. sin confirm.', value: resumen.subcontratasPendientesConfirmar || 0, icon: UserX, color: resumen.subcontratasPendientesConfirmar ? 'text-red-600' : 'text-gray-400' },
          ].map(s => (
            <div key={s.label} className="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2 mb-1"><s.icon className={`w-4 h-4 ${s.color}`} /><span className="text-xs text-gray-500 dark:text-gray-400">{s.label}</span></div>
              <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{s.value}</p>
            </div>
          ))}
        </div>

        {/* Alertas */}
        {alertas.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <button onClick={() => setAlertsOpen(!alertsOpen)} className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-750 transition-all">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-amber-500" />
                <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Alertas de Planificación</span>
                <span className="px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-xs font-bold">{alertas.length}</span>
              </div>
              <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${alertsOpen ? 'rotate-90' : ''}`} />
            </button>
            {alertsOpen && (
              <div className="px-5 pb-4 space-y-2">
                {alertas.slice(0, 8).map(a => (
                  <div key={a.id} className={`flex items-center gap-3 p-3 rounded-xl border-l-4 ${a.severity === 'high' ? 'border-l-red-500 bg-red-50 dark:bg-red-900/10' : 'border-l-amber-500 bg-amber-50 dark:bg-amber-900/10'}`}>
                    {a.type === 'planning_obra_sin_planificar' && <CalendarX2 className="w-4 h-4 text-red-500 shrink-0" />}
                    {a.type === 'planning_trabajador_no_asignado' && <UserX className="w-4 h-4 text-amber-500 shrink-0" />}
                    {a.type === 'planning_conflicto_fechas' && <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />}
                    {a.type === 'planning_material_no_previsto' && <PackageX className="w-4 h-4 text-amber-500 shrink-0" />}
                    {a.type === 'planning_subcontrata_pendiente' && <UserCheck className="w-4 h-4 text-red-500 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{a.label}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{a.detail}</p>
                    </div>
                    {isManager && a.type === 'planning_obra_sin_planificar' && (
                      <button onClick={() => openCreate({ obraId: a.obraId, obraNombre: a.obraNombre })} className="text-xs text-blue-600 hover:underline whitespace-nowrap">Planificar</button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Filtros + toggle vista */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar PLAN-xxx, obra, recurso..." className={`${inputClass} pl-9`} />
          </div>
          <select value={filterProject} onChange={e => setFilterProject(e.target.value)} className={`${inputClass} w-auto min-w-[150px]`}>
            <option value="">Todas las obras</option>
            {(data?.obras || projects).map(p => <option key={p._id} value={p._id}>{p.nombre}</option>)}
          </select>
          <select value={filterTipoRecurso} onChange={e => setFilterTipoRecurso(e.target.value)} className={`${inputClass} w-auto`}>
            <option value="">Todos los recursos</option>
            <option value="trabajador">Trabajadores</option>
            <option value="maquinaria">Maquinaria</option>
            <option value="subcontrata">Subcontratas</option>
          </select>
          <select value={filterEstado} onChange={e => setFilterEstado(e.target.value)} className={`${inputClass} w-auto`}>
            <option value="">Todos los estados</option>
            <option value="planificado">Planificado</option>
            <option value="confirmado">Confirmado</option>
            <option value="en_curso">En curso</option>
            <option value="completado">Completado</option>
            <option value="cancelado">Cancelado</option>
          </select>
          <div className="flex items-center rounded-xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
            <button onClick={() => setView('calendar')} className={`px-3 py-2 text-sm font-medium ${view === 'calendar' ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900' : 'text-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
              <Calendar className="w-4 h-4" />
            </button>
            <button onClick={() => setView('table')} className={`px-3 py-2 text-sm font-medium ${view === 'table' ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900' : 'text-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
              <TableIcon className="w-4 h-4" />
            </button>
          </div>
          {isManager && <AddButtonDropdown
                label="Nueva tarea"
                onQuickAdd={() => openCreate()}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de tarea"
              />}
        </div>

        {/* Vista principal */}
        {view === 'calendar' ? (
          <CalendarView entries={filteredEntries} milestones={milestones} currentDate={currentDate}
            calMode={calMode} setCalMode={setCalMode} navigate={navigate} setCurrentDate={setCurrentDate}
            onClickEntry={openEdit} onClickEmpty={isManager ? openCreate : undefined}
            isManager={isManager} onAction={handleAction} workers={data?.trabajadores || []} guilds={guilds} />
        ) : (
          <TableView entries={filteredEntries} isManager={isManager} onClickEntry={openEdit}
            onAction={handleAction} />
        )}

        {/* Paneles inferiores */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <MilestonesPanel milestones={milestones} isManager={isManager} onComplete={async (id) => { await completeMilestoneApi(userId, id); load(); }} onAdd={() => setMilestoneModal(true)} />
          <MaterialsPanel needs={materialNeeds} isManager={isManager} onRequest={async (id) => { await requestMaterialNeed(userId, id); load(); }} onAdd={() => setMaterialModal(true)} />
          <SubcontractorsPanel entries={entries} guilds={guilds} isManager={isManager}
            onConfirm={async (id) => { await confirmPlanningEntry(userId, id, userId); load(); }} />
          {isManager && <NotesPanel entries={entries} milestones={milestones} />}
        </div>
      </div>

      {/* Drawer */}
      {drawerOpen && (
        <EntryDrawer entry={editingEntry} projects={projects} workers={workers} guilds={guilds} tasks={tasks}
          isManager={isManager} userId={userId} onClose={() => { setDrawerOpen(false); setEditingEntry(null); }}
          onSave={async (entryData) => {
            if (editingEntry?._id) await updatePlanningEntry(userId, { ...editingEntry, ...entryData } as ConstructionPlanningEntry);
            else await createPlanningEntry(userId, entryData);
            setDrawerOpen(false); setEditingEntry(null); load();
          }} />
      )}

      {/* Modal Hito */}
      {milestoneModal && (
        <MilestoneModal projects={projects} userId={userId}
          onClose={() => setMilestoneModal(false)}
          onSave={async (d) => { await createMilestone(userId, d); setMilestoneModal(false); load(); }} />
      )}

      {/* Modal Material */}
      {materialModal && (
        <MaterialModal projects={projects} userId={userId}
          onClose={() => setMaterialModal(false)}
          onSave={async (d) => { await createMaterialNeed(userId, d); setMaterialModal(false); load(); }} />
      )}
    </Layout>
  );
}

/* ─── Calendar View ─────────────────────────────────────────────────────────── */

function CalendarView({ entries, milestones, currentDate, calMode, setCalMode, navigate, setCurrentDate, onClickEntry, onClickEmpty, isManager, onAction, workers, guilds }: {
  entries: ConstructionPlanningEntry[]; milestones: ConstructionMilestone[]; currentDate: Date;
  calMode: 'week' | 'month' | 'gantt'; setCalMode: (m: 'week' | 'month' | 'gantt') => void;
  navigate: (d: number) => void; setCurrentDate: (d: Date) => void;
  onClickEntry: (e: ConstructionPlanningEntry) => void; onClickEmpty?: (p?: Partial<ConstructionPlanningEntry>) => void;
  isManager: boolean; onAction: (e: ConstructionPlanningEntry, a: string) => void;
  workers: ConstructionWorker[]; guilds: ConstructionGuild[];
}) {
  const monday = getMonday(currentDate);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const today = new Date().toISOString().slice(0, 10);

  const resources = useMemo(() => {
    const map = new Map<string, { id: string; name: string; type: string; gremio: string }>();
    for (const e of entries) {
      if (!map.has(e.recursoId)) map.set(e.recursoId, { id: e.recursoId, name: e.recursoNombre, type: e.tipoRecurso, gremio: e.gremio });
    }
    return Array.from(map.values()).sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
  }, [entries]);

  const monthLabel = currentDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  const weekLabel = `${fmtDate(weekDays[0].toISOString().slice(0, 10))} — ${fmtDate(weekDays[6].toISOString().slice(0, 10))}`;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><ChevronLeft className="w-4 h-4" /></button>
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 min-w-[180px] text-center">
            {calMode === 'week' ? weekLabel : monthLabel}
          </span>
          <button onClick={() => navigate(1)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><ChevronRight className="w-4 h-4" /></button>
          <button onClick={() => setCurrentDate(new Date())} className="text-xs text-blue-600 hover:underline ml-2">Hoy</button>
        </div>
        <div className="flex items-center rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          {(['week', 'month', 'gantt'] as const).map(m => (
            <button key={m} onClick={() => setCalMode(m)} className={`px-3 py-1.5 text-xs font-medium ${calMode === m ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900' : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
              {m === 'week' ? 'Semana' : m === 'month' ? 'Mes' : 'Gantt'}
            </button>
          ))}
        </div>
      </div>

      {calMode === 'week' && (
        <div className="overflow-x-auto">
          <div className="min-w-[800px]">
            {/* Day headers */}
            <div className="grid grid-cols-[180px_repeat(7,1fr)] border-b border-gray-200 dark:border-gray-700">
              <div className="px-3 py-2 text-xs font-semibold text-gray-500 border-r border-gray-200 dark:border-gray-700">Recurso</div>
              {weekDays.map((d, i) => {
                const ds = d.toISOString().slice(0, 10);
                const isToday = ds === today;
                const ms = milestones.filter(m => m.fecha === ds);
                return (
                  <div key={i} className={`px-2 py-2 text-center border-r last:border-r-0 border-gray-200 dark:border-gray-700 ${isToday ? 'bg-blue-50 dark:bg-blue-900/10' : ''}`}>
                    <div className="text-xs font-semibold text-gray-700 dark:text-gray-300">{WEEKDAY_SHORT[i]}</div>
                    <div className={`text-lg font-bold ${isToday ? 'text-blue-600' : 'text-gray-900 dark:text-gray-100'}`}>{d.getDate()}</div>
                    {ms.map(m => (
                      <div key={m._id} className="text-[10px] leading-tight mt-0.5" title={`${m.nombre} — ${m.obraNombre}`}>
                        <span>{milestoneIcons[m.tipo] || '📌'}</span> <span className={m.estado === 'cumplido' ? 'text-green-600 line-through' : m.estado === 'retrasado' || (m.fecha < today && m.estado === 'pendiente') ? 'text-red-600' : 'text-amber-600'}>{m.nombre.slice(0, 15)}</span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>

            {/* Resource rows */}
            {resources.length === 0 && (
              <div className="py-12 text-center text-gray-400 text-sm">
                No hay asignaciones en este rango.
                {onClickEmpty && <button onClick={() => onClickEmpty()} className="block mx-auto mt-2 text-blue-600 hover:underline text-sm">+ Crear primera asignación</button>}
              </div>
            )}
            {resources.map(resource => {
              const TIcon = tipoRecursoConfig[resource.type]?.icon || HardHat;
              const resEntries = entries.filter(e => e.recursoId === resource.id);
              return (
                <div key={resource.id} className="grid grid-cols-[180px_repeat(7,1fr)] border-b last:border-b-0 border-gray-200 dark:border-gray-700 hover:bg-gray-50/50 dark:hover:bg-gray-750/50">
                  <div className="px-3 py-3 border-r border-gray-200 dark:border-gray-700 flex items-center gap-2">
                    <TIcon className={`w-4 h-4 ${tipoRecursoConfig[resource.type]?.color || 'text-gray-500'} shrink-0`} />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{resource.name}</div>
                      <div className="text-[10px] text-gray-500 truncate">{resource.gremio}</div>
                    </div>
                  </div>
                  {weekDays.map((d, di) => {
                    const ds = d.toISOString().slice(0, 10);
                    const dayEntries = resEntries.filter(e => e.fechaInicio <= ds && e.fechaFin >= ds);
                    return (
                      <div key={di} className={`px-1 py-1.5 border-r last:border-r-0 border-gray-200 dark:border-gray-700 min-h-[52px] ${ds === today ? 'bg-blue-50/50 dark:bg-blue-900/5' : ''}`}
                        onClick={() => dayEntries.length === 0 && onClickEmpty?.({ fechaInicio: ds, fechaFin: ds, recursoId: resource.id, recursoNombre: resource.name, tipoRecurso: resource.type as 'trabajador' | 'subcontrata' | 'maquinaria', gremio: resource.gremio })}>
                        {dayEntries.map(e => (
                          <button key={e._id} onClick={(ev) => { ev.stopPropagation(); onClickEntry(e); }}
                            className={`w-full text-left text-[10px] leading-tight px-1.5 py-1 rounded-md mb-0.5 truncate border ${e.estado === 'planificado' ? 'border-dashed border-gray-400 bg-gray-50 dark:bg-gray-700' : e.estado === 'confirmado' ? 'border-blue-300 bg-blue-50 dark:bg-blue-900/20' : e.estado === 'en_curso' ? 'border-green-300 bg-green-50 dark:bg-green-900/20' : e.estado === 'completado' ? 'border-emerald-200 bg-emerald-50/50 dark:bg-emerald-900/10 opacity-60' : 'border-red-200 bg-red-50/50 dark:bg-red-900/10 opacity-40'}`}>
                            <span className="font-medium">{e.obraNombre.slice(0, 12)}</span>
                            {e.conflictos?.length > 0 && <AlertTriangle className="w-3 h-3 text-red-500 inline ml-0.5" />}
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {calMode === 'month' && (
        <MonthView entries={entries} milestones={milestones} currentDate={currentDate} onClickEntry={onClickEntry} onClickEmpty={onClickEmpty} />
      )}

      {calMode === 'gantt' && (
        <GanttView entries={entries} milestones={milestones} currentDate={currentDate} projects={entries.reduce((acc, e) => { if (!acc.find(p => p.obraId === e.obraId)) acc.push({ obraId: e.obraId, obraNombre: e.obraNombre }); return acc; }, [] as { obraId: string; obraNombre: string }[])} onClickEntry={onClickEntry} />
      )}
    </div>
  );
}

/* ─── Month View ────────────────────────────────────────────────────────────── */

function MonthView({ entries, milestones, currentDate, onClickEntry, onClickEmpty }: {
  entries: ConstructionPlanningEntry[]; milestones: ConstructionMilestone[];
  currentDate: Date; onClickEntry: (e: ConstructionPlanningEntry) => void;
  onClickEmpty?: (p?: Partial<ConstructionPlanningEntry>) => void;
}) {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date().toISOString().slice(0, 10);
  const cells: (number | null)[] = Array(startOffset).fill(null).concat(Array.from({ length: daysInMonth }, (_, i) => i + 1));
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="p-3">
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAY_SHORT.map(d => <div key={d} className="text-xs font-semibold text-gray-500 text-center py-1">{d}</div>)}
        {cells.map((day, i) => {
          if (!day) return <div key={i} className="h-20" />;
          const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const dayEntries = entries.filter(e => e.fechaInicio <= ds && e.fechaFin >= ds);
          const dayMilestones = milestones.filter(m => m.fecha === ds);
          const isToday = ds === today;
          return (
            <div key={i} className={`h-20 rounded-lg border border-gray-100 dark:border-gray-700 p-1 overflow-hidden cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-750 ${isToday ? 'ring-2 ring-blue-400' : ''}`}
              onClick={() => onClickEmpty?.({ fechaInicio: ds, fechaFin: ds })}>
              <div className={`text-xs font-bold ${isToday ? 'text-blue-600' : 'text-gray-700 dark:text-gray-300'}`}>{day}</div>
              {dayMilestones.slice(0, 1).map(m => <div key={m._id} className="text-[9px] truncate text-amber-600">{milestoneIcons[m.tipo]} {m.nombre}</div>)}
              {dayEntries.slice(0, 2).map(e => (
                <button key={e._id} onClick={ev => { ev.stopPropagation(); onClickEntry(e); }}
                  className="w-full text-[9px] leading-tight truncate rounded px-1 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-left">{e.recursoNombre}</button>
              ))}
              {dayEntries.length > 2 && <div className="text-[9px] text-gray-400 text-center">+{dayEntries.length - 2}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Gantt View ────────────────────────────────────────────────────────────── */

function GanttView({ entries, milestones, currentDate, projects, onClickEntry }: {
  entries: ConstructionPlanningEntry[]; milestones: ConstructionMilestone[];
  currentDate: Date; projects: { obraId: string; obraNombre: string }[];
  onClickEntry: (e: ConstructionPlanningEntry) => void;
}) {
  const startDate = getMonday(currentDate);
  const days = Array.from({ length: 28 }, (_, i) => addDays(startDate, i));
  const startStr = startDate.toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);

  const dayWidth = 36;

  const getOffset = (dateStr: string) => {
    const diff = (new Date(dateStr).getTime() - startDate.getTime()) / 86400000;
    return Math.max(0, Math.round(diff)) * dayWidth;
  };
  const getWidth = (start: string, end: string) => {
    const d = (new Date(end).getTime() - new Date(start).getTime()) / 86400000 + 1;
    return Math.max(1, Math.round(d)) * dayWidth;
  };

  return (
    <div className="overflow-x-auto p-3">
      <div style={{ minWidth: days.length * dayWidth + 180 }}>
        <div className="flex border-b border-gray-200 dark:border-gray-700">
          <div className="w-[180px] shrink-0 px-3 py-2 text-xs font-semibold text-gray-500">Obra</div>
          <div className="flex">
            {days.map((d, i) => (
              <div key={i} style={{ width: dayWidth }} className={`text-center text-[10px] py-1 border-l border-gray-100 dark:border-gray-700 ${d.toISOString().slice(0, 10) === today ? 'bg-blue-50 dark:bg-blue-900/10 font-bold text-blue-600' : 'text-gray-500'}`}>
                {d.getDate()}
              </div>
            ))}
          </div>
        </div>
        {projects.map(proj => {
          const projEntries = entries.filter(e => e.obraId === proj.obraId);
          const projMilestones = milestones.filter(m => m.obraId === proj.obraId);
          return (
            <div key={proj.obraId} className="flex border-b border-gray-100 dark:border-gray-700 min-h-[40px] hover:bg-gray-50/50 dark:hover:bg-gray-750/50">
              <div className="w-[180px] shrink-0 px-3 py-2 text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{proj.obraNombre}</div>
              <div className="relative flex-1" style={{ height: 40 }}>
                {projEntries.map(e => (
                  <button key={e._id} onClick={() => onClickEntry(e)} title={`${e.recursoNombre} (${e.fechaInicio} → ${e.fechaFin})`}
                    className={`absolute top-1 h-7 rounded-md text-[10px] font-medium px-1 truncate border ${e.tipoRecurso === 'trabajador' ? 'bg-amber-100 border-amber-300 text-amber-800 dark:bg-amber-900/20 dark:border-amber-700 dark:text-amber-300' : e.tipoRecurso === 'maquinaria' ? 'bg-sky-100 border-sky-300 text-sky-800 dark:bg-sky-900/20 dark:border-sky-700 dark:text-sky-300' : 'bg-violet-100 border-violet-300 text-violet-800 dark:bg-violet-900/20 dark:border-violet-700 dark:text-violet-300'}`}
                    style={{ left: getOffset(e.fechaInicio), width: Math.min(getWidth(e.fechaInicio, e.fechaFin), (days.length * dayWidth) - getOffset(e.fechaInicio)) }}>
                    {e.recursoNombre}
                  </button>
                ))}
                {projMilestones.map(m => (
                  <div key={m._id} className="absolute top-0 w-0 h-full" style={{ left: getOffset(m.fecha) + dayWidth / 2 }} title={`${m.nombre} (${fmtDate(m.fecha)})`}>
                    <div className="w-3 h-3 bg-amber-500 rotate-45 -translate-x-1.5 mt-3" />
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

/* ─── Table View ────────────────────────────────────────────────────────────── */

function TableView({ entries, isManager, onClickEntry, onAction }: {
  entries: ConstructionPlanningEntry[]; isManager: boolean;
  onClickEntry: (e: ConstructionPlanningEntry) => void;
  onAction: (e: ConstructionPlanningEntry, a: string) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggleSelect = (id: string) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSelected(prev => prev.size === entries.length ? new Set() : new Set(entries.map(e => e._id)));

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      {isManager && selected.size > 0 && (
        <div className="px-4 py-2 bg-blue-50 dark:bg-blue-900/10 flex items-center gap-3 border-b border-gray-200 dark:border-gray-700">
          <span className="text-sm font-medium text-blue-700 dark:text-blue-300">{selected.size} seleccionados</span>
          <button onClick={() => { entries.filter(e => selected.has(e._id) && e.estado === 'planificado').forEach(e => onAction(e, 'confirm')); setSelected(new Set()); }}
            className="text-xs text-blue-600 hover:underline">Confirmar sel.</button>
          <button onClick={() => { entries.filter(e => selected.has(e._id) && (e.estado === 'planificado' || e.estado === 'cancelado')).forEach(e => onAction(e, 'delete')); setSelected(new Set()); }}
            className="text-xs text-red-600 hover:underline">Eliminar sel.</button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 dark:border-gray-700">
            <tr className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
              {isManager && <th className="px-3 py-3 w-10"><input type="checkbox" checked={selected.size === entries.length && entries.length > 0} onChange={toggleAll} className="rounded" /></th>}
              <th className="px-3 py-3">Ref</th>
              <th className="px-3 py-3">Obra</th>
              <th className="px-3 py-3">Tipo</th>
              <th className="px-3 py-3">Recurso</th>
              <th className="px-3 py-3">Gremio</th>
              <th className="px-3 py-3">Inicio</th>
              <th className="px-3 py-3">Fin</th>
              <th className="px-3 py-3">Estado</th>
              <th className="px-3 py-3 text-center">Confl.</th>
              <th className="px-3 py-3 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {entries.map(e => {
              const TIcon = tipoRecursoConfig[e.tipoRecurso]?.icon || HardHat;
              return (
                <tr key={e._id} className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750 cursor-pointer" onClick={() => onClickEntry(e)}>
                  {isManager && <td className="px-3 py-2" onClick={ev => ev.stopPropagation()}><input type="checkbox" checked={selected.has(e._id)} onChange={() => toggleSelect(e._id)} className="rounded" /></td>}
                  <td className="px-3 py-2 font-mono text-xs text-gray-600">{e.referencia}</td>
                  <td className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100">{e.obraNombre}</td>
                  <td className="px-3 py-2"><span className="flex items-center gap-1"><TIcon className={`w-3.5 h-3.5 ${tipoRecursoConfig[e.tipoRecurso]?.color}`} /><span className="text-xs">{tipoRecursoConfig[e.tipoRecurso]?.label}</span></span></td>
                  <td className="px-3 py-2">{e.recursoNombre}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{e.gremio}</td>
                  <td className="px-3 py-2 text-xs">{fmtDate(e.fechaInicio)}</td>
                  <td className="px-3 py-2 text-xs">{fmtDate(e.fechaFin)}</td>
                  <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${estadoColors[e.estado] || ''}`}>{e.estado}</span></td>
                  <td className="px-3 py-2 text-center">
                    {e.conflictos?.length > 0 ? <span className="inline-flex items-center gap-0.5 text-red-600"><AlertTriangle className="w-3.5 h-3.5" /><span className="text-xs font-bold">{e.conflictos.length}</span></span> : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-2" onClick={ev => ev.stopPropagation()}>
                    <ActionMenu entry={e} isManager={isManager} onAction={onAction} />
                  </td>
                </tr>
              );
            })}
            {entries.length === 0 && <tr><td colSpan={11} className="py-12 text-center text-gray-400">No hay asignaciones</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ActionMenu({ entry, isManager, onAction }: { entry: ConstructionPlanningEntry; isManager: boolean; onAction: (e: ConstructionPlanningEntry, a: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, []);
  if (!isManager) return null;
  const actions: { label: string; action: string; icon: typeof Edit3; color?: string }[] = [];
  if (entry.estado === 'planificado') { actions.push({ label: 'Confirmar', action: 'confirm', icon: Check }); actions.push({ label: 'Duplicar', action: 'duplicate', icon: Copy }); actions.push({ label: 'Eliminar', action: 'delete', icon: Trash2, color: 'text-red-600' }); }
  if (entry.estado === 'confirmado') { actions.push({ label: 'Iniciar', action: 'start', icon: Play }); actions.push({ label: 'Cancelar', action: 'cancel', icon: Ban }); actions.push({ label: 'Duplicar', action: 'duplicate', icon: Copy }); }
  if (entry.estado === 'en_curso') { actions.push({ label: 'Completar', action: 'complete', icon: Square }); actions.push({ label: 'Cancelar', action: 'cancel', icon: Ban }); }
  if (entry.estado === 'completado' || entry.estado === 'cancelado') { actions.push({ label: 'Duplicar', action: 'duplicate', icon: Copy }); }
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><MoreHorizontal className="w-4 h-4" /></button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-lg py-1 min-w-[140px]">
          {actions.map(a => (<button key={a.action} onClick={() => { onAction(entry, a.action); setOpen(false); }}
            className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 ${a.color || 'text-gray-700 dark:text-gray-300'}`}>
            <a.icon className="w-3.5 h-3.5" /> {a.label}
          </button>))}
        </div>
      )}
    </div>
  );
}

/* ─── Entry Drawer ──────────────────────────────────────────────────────────── */

function EntryDrawer({ entry, projects, workers, guilds, tasks, isManager, userId, onClose, onSave }: {
  entry: ConstructionPlanningEntry | null; projects: ConstructionProject[]; workers: ConstructionWorker[];
  guilds: ConstructionGuild[]; tasks: ConstructionTask[]; isManager: boolean; userId: string;
  onClose: () => void; onSave: (data: Partial<ConstructionPlanningEntry>) => void;
}) {
  const isNew = !entry?._id;
  const [tab, setTab] = useState<'datos' | 'materiales' | 'conflictos' | 'notas' | 'historial'>('datos');
  const [form, setForm] = useState({
    obraId: entry?.obraId || '', obraNombre: entry?.obraNombre || '',
    tipoRecurso: entry?.tipoRecurso || 'trabajador' as string,
    recursoId: entry?.recursoId || '', recursoNombre: entry?.recursoNombre || '',
    gremio: entry?.gremio || '', tareaId: entry?.tareaId || '', tareaNombre: entry?.tareaNombre || '',
    fechaInicio: entry?.fechaInicio || new Date().toISOString().slice(0, 10),
    fechaFin: entry?.fechaFin || new Date().toISOString().slice(0, 10),
    horaInicio: entry?.horaInicio || '08:00', horaFin: entry?.horaFin || '17:00',
    todoElDia: entry?.todoElDia || false, descripcion: entry?.descripcion || '',
    prioridad: entry?.prioridad || 'media', notas: entry?.notas || '',
    notasGerencia: entry?.notasGerencia || '',
    requiereConfirmacion: entry?.requiereConfirmacion ?? false,
  });

  const filteredWorkers = workers.filter(w => !form.obraId || w.obraAsignada === form.obraId || !w.obraAsignada);
  const filteredTasks = tasks.filter(t => !form.obraId || t.obraId === form.obraId);
  const resourceList = form.tipoRecurso === 'trabajador' ? filteredWorkers.map(w => ({ id: w._id, name: w.nombre, gremio: w.gremio }))
    : form.tipoRecurso === 'subcontrata' ? guilds.map(g => ({ id: g._id, name: g.nombre, gremio: g.tipo }))
    : [];

  const onProjectChange = (pId: string) => {
    const p = projects.find(pr => pr._id === pId);
    setForm(f => ({ ...f, obraId: pId, obraNombre: p?.nombre || '' }));
  };
  const onResourceChange = (rId: string) => {
    const r = resourceList.find(x => x.id === rId);
    setForm(f => ({ ...f, recursoId: rId, recursoNombre: r?.name || '', gremio: r?.gremio || f.gremio }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.obraId || !form.fechaInicio) return;
    onSave(form);
  };

  const readOnly = !isManager || (entry?.estado === 'completado') || (entry?.estado === 'cancelado');

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-white dark:bg-gray-800 shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{isNew ? 'Nueva asignación' : entry?.referencia}</h2>
            {!isNew && <p className="text-xs text-gray-500">{entry?.obraNombre} — {entry?.recursoNombre}</p>}
          </div>
          <div className="flex items-center gap-2">
            {!isNew && <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${estadoColors[entry?.estado || '']}`}>{entry?.estado}</span>}
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><X className="w-5 h-5" /></button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700 px-5 gap-1">
          {(['datos', 'materiales', 'conflictos', 'notas', 'historial'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-2.5 text-sm font-medium border-b-2 transition-all ${tab === t ? 'border-gray-900 dark:border-gray-100 text-gray-900 dark:text-gray-100' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {t === 'datos' ? 'Datos' : t === 'materiales' ? 'Materiales' : t === 'conflictos' ? `Conflictos${entry?.conflictos?.length ? ` (${entry.conflictos.length})` : ''}` : t === 'notas' ? 'Notas' : 'Historial'}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {tab === 'datos' && (
            <form id="entry-form" onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Obra *</label>
                  <select value={form.obraId} onChange={e => onProjectChange(e.target.value)} className={inputClass} disabled={readOnly} required>
                    <option value="">Seleccionar obra</option>
                    {projects.filter(p => p.estado !== 'finalizada').map(p => <option key={p._id} value={p._id}>{p.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Tipo de recurso *</label>
                  <div className="flex gap-2">
                    {(['trabajador', 'maquinaria', 'subcontrata'] as const).map(t => (
                      <button key={t} type="button" disabled={readOnly} onClick={() => setForm(f => ({ ...f, tipoRecurso: t, recursoId: '', recursoNombre: '', requiereConfirmacion: t === 'subcontrata' }))}
                        className={`flex-1 py-2 rounded-xl text-xs font-medium border-2 transition-all ${form.tipoRecurso === t ? 'border-gray-900 dark:border-gray-100 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900' : 'border-gray-200 dark:border-gray-700'}`}>
                        {tipoRecursoConfig[t].label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className={labelClass}>{tipoRecursoConfig[form.tipoRecurso]?.label || 'Recurso'} *</label>
                  {form.tipoRecurso === 'maquinaria' ? (
                    <input value={form.recursoNombre} onChange={e => setForm(f => ({ ...f, recursoNombre: e.target.value, recursoId: e.target.value }))} className={inputClass} placeholder="Nombre maquinaria" disabled={readOnly} />
                  ) : (
                    <select value={form.recursoId} onChange={e => onResourceChange(e.target.value)} className={inputClass} disabled={readOnly}>
                      <option value="">Seleccionar</option>
                      {resourceList.map(r => <option key={r.id} value={r.id}>{r.name} {r.gremio ? `(${r.gremio})` : ''}</option>)}
                    </select>
                  )}
                </div>
                <div>
                  <label className={labelClass}>Gremio</label>
                  <input value={form.gremio} onChange={e => setForm(f => ({ ...f, gremio: e.target.value }))} className={inputClass} disabled={readOnly} />
                </div>
                <div>
                  <label className={labelClass}>Fecha inicio *</label>
                  <input type="date" value={form.fechaInicio} onChange={e => setForm(f => ({ ...f, fechaInicio: e.target.value }))} className={inputClass} disabled={readOnly} required />
                </div>
                <div>
                  <label className={labelClass}>Fecha fin *</label>
                  <input type="date" value={form.fechaFin} onChange={e => setForm(f => ({ ...f, fechaFin: e.target.value }))} className={inputClass} disabled={readOnly} required />
                </div>
                {!form.todoElDia && <>
                  <div>
                    <label className={labelClass}>Hora inicio</label>
                    <input type="time" value={form.horaInicio} onChange={e => setForm(f => ({ ...f, horaInicio: e.target.value }))} className={inputClass} disabled={readOnly} />
                  </div>
                  <div>
                    <label className={labelClass}>Hora fin</label>
                    <input type="time" value={form.horaFin} onChange={e => setForm(f => ({ ...f, horaFin: e.target.value }))} className={inputClass} disabled={readOnly} />
                  </div>
                </>}
                <div className="col-span-full flex items-center gap-2">
                  <input type="checkbox" checked={form.todoElDia} onChange={e => setForm(f => ({ ...f, todoElDia: e.target.checked }))} disabled={readOnly} className="rounded" id="allday" />
                  <label htmlFor="allday" className="text-sm text-gray-700 dark:text-gray-300">Todo el día</label>
                </div>
                <div>
                  <label className={labelClass}>Tarea vinculada</label>
                  <select value={form.tareaId} onChange={e => { const t = filteredTasks.find(tk => tk._id === e.target.value); setForm(f => ({ ...f, tareaId: e.target.value, tareaNombre: t?.titulo || '' })); }} className={inputClass} disabled={readOnly}>
                    <option value="">Sin tarea</option>
                    {filteredTasks.map(t => <option key={t._id} value={t._id}>{t.titulo}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Prioridad</label>
                  <select value={form.prioridad} onChange={e => setForm(f => ({ ...f, prioridad: e.target.value }))} className={inputClass} disabled={readOnly}>
                    <option value="baja">Baja</option>
                    <option value="media">Media</option>
                    <option value="alta">Alta</option>
                    <option value="urgente">Urgente</option>
                  </select>
                </div>
                <div className="col-span-full">
                  <label className={labelClass}>Descripción</label>
                  <textarea value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} className={`${inputClass} resize-none`} rows={2} disabled={readOnly} />
                </div>
                <div className="col-span-full">
                  <label className={labelClass}>Notas</label>
                  <textarea value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} className={`${inputClass} resize-none`} rows={2} disabled={readOnly} />
                </div>
                {isManager && (
                  <div className="col-span-full">
                    <label className={labelClass}>Notas de gerencia</label>
                    <textarea value={form.notasGerencia} onChange={e => setForm(f => ({ ...f, notasGerencia: e.target.value }))} className={`${inputClass} resize-none`} rows={2} />
                  </div>
                )}
              </div>
            </form>
          )}

          {tab === 'materiales' && (
            <div className="space-y-3">
              <p className="text-sm text-gray-500">Materiales previstos para esta asignación.</p>
              {entry?.materialesPrevistos && entry.materialesPrevistos.length > 0 ? (
                <div className="space-y-2">
                  {entry.materialesPrevistos.map((m, i) => (
                    <div key={i} className="flex items-center justify-between p-3 rounded-xl border border-gray-200 dark:border-gray-700">
                      <div><span className="text-sm font-medium">{m.nombre}</span><span className="text-xs text-gray-500 ml-2">{m.cantidad} {m.unidad}</span></div>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${m.estado === 'recibido' ? 'bg-green-100 text-green-700' : m.estado === 'solicitado' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>{m.estado}</span>
                    </div>
                  ))}
                </div>
              ) : <p className="text-sm text-gray-400 py-4 text-center">Sin materiales previstos</p>}
            </div>
          )}

          {tab === 'conflictos' && (
            <div className="space-y-3">
              {entry?.conflictos && entry.conflictos.length > 0 ? entry.conflictos.map((c, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-xl border-l-4 border-l-red-500 bg-red-50 dark:bg-red-900/10">
                  <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <div><p className="text-sm font-medium text-gray-900 dark:text-gray-100">{c.mensaje}</p><p className="text-xs text-gray-500">{c.fechas}</p></div>
                </div>
              )) : (
                <div className="text-center py-8"><CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-2" /><p className="text-sm text-green-600 font-medium">Sin conflictos detectados</p></div>
              )}
            </div>
          )}

          {tab === 'notas' && (
            <div className="space-y-4">
              <div><label className={labelClass}>Notas generales</label><p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{entry?.notas || '—'}</p></div>
              {isManager && <div><label className={labelClass}>Notas de gerencia</label><p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{entry?.notasGerencia || '—'}</p></div>}
            </div>
          )}

          {tab === 'historial' && (
            <div className="space-y-3">
              {entry?.historial && entry.historial.length > 0 ? entry.historial.map((h, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-750">
                  <div className="w-2 h-2 rounded-full bg-gray-400 mt-1.5 shrink-0" />
                  <div><p className="text-sm font-medium text-gray-900 dark:text-gray-100 capitalize">{h.accion}</p><p className="text-xs text-gray-500">{fmtDate(h.fecha)} {h.detalle && `— ${h.detalle}`}</p></div>
                </div>
              )) : <p className="text-sm text-gray-400 text-center py-4">Sin historial</p>}
            </div>
          )}
        </div>

        {/* Footer */}
        {!readOnly && (
          <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-200 dark:border-gray-700">
            <button type="button" onClick={onClose} className={btnSecondary}>Cancelar</button>
            <button type="submit" form="entry-form" className={btnPrimary}>{isNew ? 'Crear asignación' : 'Guardar cambios'}</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Milestones Panel ──────────────────────────────────────────────────────── */

function MilestonesPanel({ milestones, isManager, onComplete, onAdd }: {
  milestones: ConstructionMilestone[]; isManager: boolean;
  onComplete: (id: string) => void; onAdd: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const sorted = [...milestones].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const proximos = sorted.filter(m => m.estado === 'pendiente' && m.fecha >= today).length;
  const retrasados = sorted.filter(m => (m.estado === 'retrasado') || (m.estado === 'pendiente' && m.fecha < today)).length;
  const cumplidos = sorted.filter(m => m.estado === 'cumplido').length;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2"><Flag className="w-5 h-5 text-amber-600" /><span className="font-semibold text-gray-900 dark:text-gray-100">Hitos y Fechas Clave</span></div>
        {isManager && <button onClick={onAdd} className="text-xs text-blue-600 hover:underline">+ Nuevo hito</button>}
      </div>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="text-center p-2 rounded-xl bg-amber-50 dark:bg-amber-900/10"><p className="text-lg font-bold text-amber-600">{proximos}</p><p className="text-[10px] text-gray-500">Próximos</p></div>
        <div className="text-center p-2 rounded-xl bg-red-50 dark:bg-red-900/10"><p className="text-lg font-bold text-red-600">{retrasados}</p><p className="text-[10px] text-gray-500">Retrasados</p></div>
        <div className="text-center p-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/10"><p className="text-lg font-bold text-emerald-600">{cumplidos}</p><p className="text-[10px] text-gray-500">Cumplidos</p></div>
      </div>
      <div className="space-y-2">
        {sorted.slice(0, 8).map(m => {
          const isLate = m.estado === 'pendiente' && m.fecha < today;
          return (
            <div key={m._id} className={`flex items-center gap-3 p-2.5 rounded-xl border ${isLate ? 'border-red-200 bg-red-50/50 dark:bg-red-900/10' : 'border-gray-100 dark:border-gray-700'}`}>
              <span className="text-base">{milestoneIcons[m.tipo] || '📌'}</span>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${m.estado === 'cumplido' ? 'line-through text-gray-400' : 'text-gray-900 dark:text-gray-100'}`}>{m.nombre}</p>
                <p className="text-[10px] text-gray-500">{m.obraNombre} · {fmtDate(m.fecha)}</p>
              </div>
              {isLate && <span className="text-[10px] text-red-600 font-bold whitespace-nowrap">⏰ Retrasado</span>}
              {m.estado === 'cumplido' && <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />}
              {m.estado === 'pendiente' && isManager && (
                <button onClick={() => onComplete(m._id)} className="text-[10px] text-blue-600 hover:underline whitespace-nowrap">Completar</button>
              )}
            </div>
          );
        })}
        {milestones.length === 0 && <p className="text-sm text-gray-400 text-center py-3">Sin hitos registrados</p>}
      </div>
    </div>
  );
}

/* ─── Materials Panel ───────────────────────────────────────────────────────── */

function MaterialsPanel({ needs, isManager, onRequest, onAdd }: {
  needs: ConstructionMaterialNeed[]; isManager: boolean;
  onRequest: (id: string) => void; onAdd: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const in3d = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const in7d = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const pendientes = needs.filter(n => n.estado === 'previsto').length;
  const requierenCompra = needs.filter(n => n.requiereCompra).length;
  const recibidos = needs.filter(n => n.estado === 'recibido').length;
  const sorted = [...needs].filter(n => n.estado !== 'recibido' && n.estado !== 'cancelado').sort((a, b) => a.fechaNecesaria.localeCompare(b.fechaNecesaria));

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2"><Package className="w-5 h-5 text-orange-600" /><span className="font-semibold text-gray-900 dark:text-gray-100">Materiales Previstos</span></div>
        {isManager && <button onClick={onAdd} className="text-xs text-blue-600 hover:underline">+ Prever material</button>}
      </div>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="text-center p-2 rounded-xl bg-amber-50 dark:bg-amber-900/10"><p className="text-lg font-bold text-amber-600">{pendientes}</p><p className="text-[10px] text-gray-500">Pendientes</p></div>
        <div className="text-center p-2 rounded-xl bg-red-50 dark:bg-red-900/10"><p className="text-lg font-bold text-red-600">{requierenCompra}</p><p className="text-[10px] text-gray-500">Req. compra</p></div>
        <div className="text-center p-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/10"><p className="text-lg font-bold text-emerald-600">{recibidos}</p><p className="text-[10px] text-gray-500">Recibidos</p></div>
      </div>
      <div className="space-y-2">
        {sorted.slice(0, 8).map(n => {
          const urgent = n.fechaNecesaria && n.fechaNecesaria <= in3d;
          const soon = !urgent && n.fechaNecesaria && n.fechaNecesaria <= in7d;
          return (
            <div key={n._id} className={`flex items-center gap-3 p-2.5 rounded-xl border ${urgent ? 'border-red-200 bg-red-50/50 dark:bg-red-900/10' : 'border-gray-100 dark:border-gray-700'}`}>
              <Package className={`w-4 h-4 shrink-0 ${urgent ? 'text-red-500' : soon ? 'text-amber-500' : 'text-gray-400'}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{n.materialNombre}</p>
                <p className="text-[10px] text-gray-500">{n.obraNombre} · {n.cantidad} {n.unidad} · {fmtDate(n.fechaNecesaria)}</p>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${n.estado === 'solicitado' ? 'bg-amber-100 text-amber-700' : n.estado === 'pedido' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>{n.estado}</span>
              {n.estado === 'previsto' && isManager && (
                <button onClick={() => onRequest(n._id)} className="text-[10px] text-blue-600 hover:underline whitespace-nowrap">Solicitar</button>
              )}
            </div>
          );
        })}
        {needs.length === 0 && <p className="text-sm text-gray-400 text-center py-3">Sin materiales previstos</p>}
      </div>
    </div>
  );
}

/* ─── Subcontractors Panel ──────────────────────────────────────────────────── */

function SubcontractorsPanel({ entries, guilds, isManager, onConfirm }: {
  entries: ConstructionPlanningEntry[]; guilds: ConstructionGuild[]; isManager: boolean;
  onConfirm: (id: string) => void;
}) {
  const subEntries = entries.filter(e => e.tipoRecurso === 'subcontrata' && e.estado !== 'cancelado' && e.estado !== 'completado');
  const pendingConfirm = subEntries.filter(e => e.requiereConfirmacion && !e.confirmado).length;
  const active = subEntries.filter(e => e.estado === 'confirmado' || e.estado === 'en_curso').length;

  const grouped = useMemo(() => {
    const map = new Map<string, { guild: ConstructionGuild | undefined; entries: ConstructionPlanningEntry[] }>();
    for (const e of subEntries) {
      if (!map.has(e.recursoId)) map.set(e.recursoId, { guild: guilds.find(g => g._id === e.recursoId), entries: [] });
      map.get(e.recursoId)!.entries.push(e);
    }
    return Array.from(map.values());
  }, [subEntries, guilds]);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center gap-2 mb-4">
        <UsersRound className="w-5 h-5 text-violet-600" />
        <span className="font-semibold text-gray-900 dark:text-gray-100">Subcontratas y Gremios</span>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="text-center p-2 rounded-xl bg-red-50 dark:bg-red-900/10"><p className="text-lg font-bold text-red-600">{pendingConfirm}</p><p className="text-[10px] text-gray-500">Pend. confirmar</p></div>
        <div className="text-center p-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/10"><p className="text-lg font-bold text-emerald-600">{active}</p><p className="text-[10px] text-gray-500">Activas</p></div>
      </div>
      <div className="space-y-3">
        {grouped.map(g => (
          <div key={g.guild?._id || 'unknown'} className="rounded-xl border border-gray-100 dark:border-gray-700 p-3">
            <div className="flex items-center gap-2 mb-2">
              <UsersRound className="w-4 h-4 text-violet-500" />
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{g.guild?.nombre || 'Subcontrata'}</span>
              <span className="text-[10px] text-gray-500">{g.guild?.tipo}</span>
            </div>
            {g.entries.map(e => (
              <div key={e._id} className="flex items-center justify-between py-1.5 text-xs">
                <span className="text-gray-700 dark:text-gray-300">{e.obraNombre} · {fmtDate(e.fechaInicio)} → {fmtDate(e.fechaFin)}</span>
                {e.requiereConfirmacion && !e.confirmado ? (
                  isManager ? <button onClick={() => onConfirm(e._id)} className="text-blue-600 hover:underline font-medium">Confirmar</button>
                    : <span className="text-amber-600">⏳ Pendiente</span>
                ) : <span className={`px-1.5 py-0.5 rounded-full ${estadoColors[e.estado]}`}>{e.estado}</span>}
              </div>
            ))}
          </div>
        ))}
        {grouped.length === 0 && <p className="text-sm text-gray-400 text-center py-3">Sin subcontratas asignadas</p>}
      </div>
    </div>
  );
}

/* ─── Notes Panel ───────────────────────────────────────────────────────────── */

function NotesPanel({ entries, milestones }: { entries: ConstructionPlanningEntry[]; milestones: ConstructionMilestone[] }) {
  const recentNotes = entries.filter(e => e.notasGerencia).slice(0, 5);
  const milestoneDocs = milestones.flatMap(m => (m.documentos || []).map(d => ({ ...d, milestone: m.nombre, obra: m.obraNombre })));

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center gap-2 mb-4">
        <FileText className="w-5 h-5 text-gray-500" />
        <span className="font-semibold text-gray-900 dark:text-gray-100">Notas y Documentación</span>
      </div>
      <div className="space-y-3">
        {recentNotes.length > 0 ? recentNotes.map(e => (
          <div key={e._id} className="p-3 rounded-xl bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-800">
            <p className="text-xs font-semibold text-gray-600 mb-1">{e.obraNombre} — {e.referencia}</p>
            <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">{e.notasGerencia}</p>
          </div>
        )) : <p className="text-sm text-gray-400 text-center py-3">Sin notas de gerencia</p>}
        {milestoneDocs.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-2">Documentos de hitos</p>
            {milestoneDocs.slice(0, 5).map((d, i) => (
              <div key={i} className="flex items-center gap-2 py-1.5 text-xs">
                <FileText className="w-3.5 h-3.5 text-gray-400" />
                <span className="text-gray-700 dark:text-gray-300">{d.nombre}</span>
                <span className="text-gray-400">({d.milestone})</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Milestone Modal ───────────────────────────────────────────────────────── */

function MilestoneModal({ projects, userId, onClose, onSave }: {
  projects: ConstructionProject[]; userId: string; onClose: () => void;
  onSave: (data: Partial<ConstructionMilestone>) => void;
}) {
  const [form, setForm] = useState({ obraId: '', obraNombre: '', nombre: '', tipo: 'otro', fecha: '', responsableId: userId, responsableNombre: '', descripcion: '' });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-900 dark:text-gray-100">Nuevo Hito</h3>
          <button onClick={onClose} className="p-1"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={e => { e.preventDefault(); onSave(form); }} className="space-y-3">
          <div><label className={labelClass}>Obra *</label><select value={form.obraId} onChange={e => { const p = projects.find(pr => pr._id === e.target.value); setForm(f => ({ ...f, obraId: e.target.value, obraNombre: p?.nombre || '' })); }} className={inputClass} required><option value="">Seleccionar</option>{projects.map(p => <option key={p._id} value={p._id}>{p.nombre}</option>)}</select></div>
          <div><label className={labelClass}>Nombre *</label><input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} className={inputClass} required /></div>
          <div><label className={labelClass}>Tipo</label><select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))} className={inputClass}>
            {['inicio_obra', 'fin_fase', 'entrega_parcial', 'recepcion_material', 'inspeccion', 'permiso', 'entrega_final', 'otro'].map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
          </select></div>
          <div><label className={labelClass}>Fecha *</label><input type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} className={inputClass} required /></div>
          <div><label className={labelClass}>Descripción</label><textarea value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} className={`${inputClass} resize-none`} rows={2} /></div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className={btnSecondary}>Cancelar</button>
            <button type="submit" className={btnPrimary}>Crear hito</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Material Modal ────────────────────────────────────────────────────────── */

function MaterialModal({ projects, userId, onClose, onSave }: {
  projects: ConstructionProject[]; userId: string; onClose: () => void;
  onSave: (data: Partial<ConstructionMaterialNeed>) => void;
}) {
  const [form, setForm] = useState({ obraId: '', obraNombre: '', materialNombre: '', cantidad: 0, unidad: 'unidades', fechaNecesaria: '', costeEstimado: 0, notas: '' });
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'name', label: 'Nombre' },
    { key: 'project', label: 'Proyecto' },
    { key: 'startDate', label: 'Fecha inicio' },
    { key: 'endDate', label: 'Fecha fin' },
    { key: 'assignee', label: 'Responsable' },
    { key: 'notes', label: 'Notas' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'name', label: 'Nombre', required: true, example: '' },
    { key: 'project', label: 'Proyecto', example: '' },
    { key: 'startDate', label: 'Fecha inicio', example: '' },
    { key: 'endDate', label: 'Fecha fin', example: '' },
    { key: 'assignee', label: 'Responsable', example: '' },
    { key: 'notes', label: 'Notas', example: '' },
  ];

  const persistEntries = async (entries: Record<string, unknown>[]) => {
    if (!userId) {
      toast.error('Sesión no válida');
      return;
    }
    const created = await bulkCreateVerticalEntries(userId, {
      create: (uid, data) => createPlanningEntry(uid, data as Partial<ConstructionPlanningEntry>),
    }, entries, (entry) => ({
      titulo: entryStr(entry, 'name', 'titulo', 'title'),
      fecha: entryStr(entry, 'date', 'fecha') || new Date().toISOString().slice(0, 10),
    }));
    if (created > 0) {
      toast.success(`${created} planificación(es) creado(s)`);
      void load();
    } else {
      toast.error('No se pudo crear ningún registro');
    }
  };

  const handleAIEntries = persistEntries;
  const handleImportEntries = async (entries: Record<string, string>[]) => persistEntries(entries);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-900 dark:text-gray-100">Prever Material</h3>
          <button onClick={onClose} className="p-1"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={e => { e.preventDefault(); onSave(form); }} className="space-y-3">
          <div><label className={labelClass}>Obra *</label><select value={form.obraId} onChange={e => { const p = projects.find(pr => pr._id === e.target.value); setForm(f => ({ ...f, obraId: e.target.value, obraNombre: p?.nombre || '' })); }} className={inputClass} required><option value="">Seleccionar</option>{projects.map(p => <option key={p._id} value={p._id}>{p.nombre}</option>)}</select></div>
          <div><label className={labelClass}>Material *</label><input value={form.materialNombre} onChange={e => setForm(f => ({ ...f, materialNombre: e.target.value }))} className={inputClass} required placeholder="Ej: Cemento Portland" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelClass}>Cantidad *</label><input type="number" value={form.cantidad} onChange={e => setForm(f => ({ ...f, cantidad: Number(e.target.value) }))} className={inputClass} required min={0} step="any" /></div>
            <div><label className={labelClass}>Unidad</label><select value={form.unidad} onChange={e => setForm(f => ({ ...f, unidad: e.target.value }))} className={inputClass}>
              {['unidades', 'kg', 'm²', 'm³', 'm', 'litros', 'sacos', 'palés'].map(u => <option key={u} value={u}>{u}</option>)}
            </select></div>
          </div>
          <div><label className={labelClass}>Fecha necesaria *</label><input type="date" value={form.fechaNecesaria} onChange={e => setForm(f => ({ ...f, fechaNecesaria: e.target.value }))} className={inputClass} required /></div>
          <div><label className={labelClass}>Coste estimado (€)</label><input type="number" value={form.costeEstimado} onChange={e => setForm(f => ({ ...f, costeEstimado: Number(e.target.value) }))} className={inputClass} min={0} step="any" /></div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className={btnSecondary}>Cancelar</button>
            <button type="submit" className={btnPrimary}>Crear necesidad</button>
          </div>
        </form>
      </div>
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="construction_planning"
        moduleLabel="Planificación"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Planificación"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </div>
  );
}
