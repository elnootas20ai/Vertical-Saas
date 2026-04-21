import { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { useModalClose } from '../../hooks/useModalClose';
import {
  listCleaningIncidentsRequest,
  createCleaningIncidentRequest,
  updateCleaningIncidentRequest,
  deleteCleaningIncidentRequest,
  type CleaningIncident,
  type IncidentType,
  type IncidentStatus,
  type IncidentPriority,
} from '../../lib/cleaningApi';
import {
  AlertTriangle, Plus, Search, X, Loader2, Calendar, User,
  Clock, ChevronRight, Filter, RotateCcw, CheckCircle2,
  XCircle, AlertCircle, ShieldAlert, Trash2, Edit3,
  Camera, FileText, ArrowUpRight, Ban, Wrench, Package,
  UserX, Zap, KeyRound, MessageSquareWarning, SprayCan,
} from 'lucide-react';

// ─── Configuration ────────────────────────────────────────────────────────────

const INCIDENT_TYPES_CONFIG: Record<IncidentType, { label: string; icon: React.ReactNode; color: string }> = {
  falta_limpieza:     { label: 'Falta de limpieza',    icon: <SprayCan className="w-4 h-4" />,               color: 'text-amber-600 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950/40 dark:border-amber-800' },
  rotura:             { label: 'Rotura',                icon: <Wrench className="w-4 h-4" />,                 color: 'text-red-600 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-950/40 dark:border-red-800' },
  ausencia:           { label: 'Ausencia',              icon: <UserX className="w-4 h-4" />,                  color: 'text-violet-600 bg-violet-50 border-violet-200 dark:text-violet-400 dark:bg-violet-950/40 dark:border-violet-800' },
  queja_cliente:      { label: 'Queja de cliente',      icon: <MessageSquareWarning className="w-4 h-4" />,   color: 'text-orange-600 bg-orange-50 border-orange-200 dark:text-orange-400 dark:bg-orange-950/40 dark:border-orange-800' },
  urgencia_extra:     { label: 'Urgencia extra',        icon: <Zap className="w-4 h-4" />,                    color: 'text-rose-600 bg-rose-50 border-rose-200 dark:text-rose-400 dark:bg-rose-950/40 dark:border-rose-800' },
  material_faltante:  { label: 'Material faltante',     icon: <Package className="w-4 h-4" />,                color: 'text-sky-600 bg-sky-50 border-sky-200 dark:text-sky-400 dark:bg-sky-950/40 dark:border-sky-800' },
  acceso_no_permitido:{ label: 'Acceso no permitido',   icon: <KeyRound className="w-4 h-4" />,               color: 'text-slate-600 bg-slate-50 border-slate-200 dark:text-slate-400 dark:bg-slate-950/40 dark:border-slate-800' },
};

const STATUS_CONFIG: Record<IncidentStatus, { label: string; icon: React.ReactNode; bg: string; text: string; dot: string }> = {
  open:        { label: 'Abierta',      icon: <AlertCircle className="w-3.5 h-3.5" />,   bg: 'bg-red-50 dark:bg-red-950/40',     text: 'text-red-700 dark:text-red-400',     dot: 'bg-red-500' },
  in_progress: { label: 'En progreso',  icon: <Clock className="w-3.5 h-3.5" />,         bg: 'bg-blue-50 dark:bg-blue-950/40',   text: 'text-blue-700 dark:text-blue-400',   dot: 'bg-blue-500' },
  resolved:    { label: 'Resuelta',     icon: <CheckCircle2 className="w-3.5 h-3.5" />,  bg: 'bg-emerald-50 dark:bg-emerald-950/40', text: 'text-emerald-700 dark:text-emerald-400', dot: 'bg-emerald-500' },
  closed:      { label: 'Cerrada',      icon: <XCircle className="w-3.5 h-3.5" />,       bg: 'bg-gray-100 dark:bg-gray-800',     text: 'text-gray-500 dark:text-gray-400',   dot: 'bg-gray-400' },
  reopened:    { label: 'Reabierta',    icon: <RotateCcw className="w-3.5 h-3.5" />,     bg: 'bg-amber-50 dark:bg-amber-950/40', text: 'text-amber-700 dark:text-amber-400', dot: 'bg-amber-500' },
};

const PRIORITY_CONFIG: Record<IncidentPriority, { label: string; color: string; ring: string }> = {
  low:      { label: 'Baja',     color: 'text-gray-500 bg-gray-100 dark:bg-gray-800 dark:text-gray-400',   ring: 'ring-gray-300' },
  medium:   { label: 'Media',    color: 'text-amber-700 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-400', ring: 'ring-amber-300' },
  high:     { label: 'Alta',     color: 'text-orange-700 bg-orange-50 dark:bg-orange-950/40 dark:text-orange-400', ring: 'ring-orange-300' },
  critical: { label: 'Crítica',  color: 'text-red-700 bg-red-50 dark:bg-red-950/40 dark:text-red-400',     ring: 'ring-red-400' },
};

interface IncidentForm {
  incidentType: IncidentType;
  clientName: string;
  serviceNumber: string;
  date: string;
  workerName: string;
  priority: IncidentPriority;
  description: string;
  responsibleName: string;
  dueDate: string;
}

const emptyForm = (): IncidentForm => ({
  incidentType: 'falta_limpieza',
  clientName: '',
  serviceNumber: '',
  date: new Date().toISOString().slice(0, 10),
  workerName: '',
  priority: 'medium',
  description: '',
  responsibleName: '',
  dueDate: '',
});

// ─── Component ────────────────────────────────────────────────────────────────

export function CleaningIncidents() {
  const { user } = useAuth();
  const isWorker = user?.role === 'worker' || user?.role === 'employee';

  const [incidents, setIncidents] = useState<CleaningIncident[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | IncidentStatus>('all');
  const [priorityFilter, setPriorityFilter] = useState<IncidentPriority | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<IncidentType | 'all'>('all');
  const [showFilters, setShowFilters] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [editingIncident, setEditingIncident] = useState<CleaningIncident | null>(null);
  const [form, setForm] = useState<IncidentForm>(emptyForm());
  const [saving, setSaving] = useState(false);

  const [detailIncident, setDetailIncident] = useState<CleaningIncident | null>(null);
  const [resolutionText, setResolutionText] = useState('');
  const [showResolvePanel, setShowResolvePanel] = useState(false);

  useModalClose(showModal, () => setShowModal(false));
  useModalClose(!!detailIncident, () => { setDetailIncident(null); setShowResolvePanel(false); });

  const loadData = useCallback(async () => {
    if (!user?.id) return;
    try {
      const data = await listCleaningIncidentsRequest(user.id);
      setIncidents(data);
    } catch (err: any) {
      toast.error(err.message || 'Error al cargar incidencias');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { loadData(); }, [loadData]);

  // ─── KPIs ──────────────────────────────────────────────────────────

  const kpis = useMemo(() => {
    const open = incidents.filter(i => i.status === 'open' || i.status === 'reopened').length;
    const critical = incidents.filter(i => i.priority === 'critical' && (i.status === 'open' || i.status === 'in_progress' || i.status === 'reopened')).length;
    const today = new Date().toISOString().slice(0, 10);
    const resolvedToday = incidents.filter(i => i.resolvedAt && i.resolvedAt.slice(0, 10) === today).length;

    const resolved = incidents.filter(i => i.resolvedAt && i.createdAt);
    let avgResolutionHours = 0;
    if (resolved.length > 0) {
      const totalMs = resolved.reduce((sum, i) => sum + (new Date(i.resolvedAt).getTime() - new Date(i.createdAt).getTime()), 0);
      avgResolutionHours = Math.round(totalMs / resolved.length / 3600000);
    }

    const overdue = incidents.filter(i => {
      if (i.status === 'resolved' || i.status === 'closed') return false;
      if (!i.dueDate) return false;
      return i.dueDate < today;
    }).length;

    return { open, critical, resolvedToday, avgResolutionHours, overdue };
  }, [incidents]);

  // ─── Filters ───────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let list = incidents;

    if (isWorker) {
      list = list.filter(i => i.workerName === (user?.fullName || user?.name || ''));
    }

    if (activeTab !== 'all') {
      list = list.filter(i => i.status === activeTab);
    }
    if (priorityFilter !== 'all') {
      list = list.filter(i => i.priority === priorityFilter);
    }
    if (typeFilter !== 'all') {
      list = list.filter(i => i.incidentType === typeFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(i =>
        i.clientName.toLowerCase().includes(q) ||
        i.incidentNumber.toLowerCase().includes(q) ||
        i.workerName.toLowerCase().includes(q) ||
        i.description.toLowerCase().includes(q) ||
        i.responsibleName.toLowerCase().includes(q) ||
        i.serviceNumber.toLowerCase().includes(q)
      );
    }
    return list;
  }, [incidents, activeTab, priorityFilter, typeFilter, search, isWorker, user]);

  // ─── CRUD handlers ────────────────────────────────────────────────

  const openCreate = () => {
    setEditingIncident(null);
    setForm(emptyForm());
    setShowModal(true);
  };

  const openEdit = (inc: CleaningIncident) => {
    setEditingIncident(inc);
    setForm({
      incidentType: inc.incidentType,
      clientName: inc.clientName,
      serviceNumber: inc.serviceNumber,
      date: inc.date,
      workerName: inc.workerName,
      priority: inc.priority,
      description: inc.description,
      responsibleName: inc.responsibleName,
      dueDate: inc.dueDate,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!user?.id) return;
    if (!form.description.trim()) { toast.error('La descripción es obligatoria'); return; }
    if (!form.clientName.trim()) { toast.error('El cliente es obligatorio'); return; }

    setSaving(true);
    try {
      const payload: Partial<CleaningIncident> = {
        incidentType: form.incidentType,
        clientName: form.clientName,
        serviceNumber: form.serviceNumber,
        date: form.date,
        workerName: form.workerName,
        priority: form.priority,
        description: form.description,
        responsibleName: form.responsibleName,
        dueDate: form.dueDate,
        status: editingIncident?.status || 'open',
        _changedBy: user.fullName || user.name || '',
      } as any;

      if (editingIncident) {
        const updated = await updateCleaningIncidentRequest(user.id, { ...editingIncident, ...payload } as CleaningIncident);
        setIncidents(prev => prev.map(i => i._id === updated._id ? updated : i));
        toast.success('Incidencia actualizada');
      } else {
        if (form.responsibleName.trim()) {
          (payload as any).status = 'open';
        }
        const created = await createCleaningIncidentRequest(user.id, payload);
        setIncidents(prev => [created, ...prev]);
        toast.success('Incidencia registrada');
      }
      setShowModal(false);
    } catch (err: any) {
      toast.error(err.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (inc: CleaningIncident, newStatus: IncidentStatus) => {
    if (!user?.id) return;
    try {
      const updates: Partial<CleaningIncident> = {
        ...inc,
        status: newStatus,
        _changedBy: user.fullName || user.name || '',
      } as any;

      if (newStatus === 'reopened') {
        (updates as any).reopenCount = (inc.reopenCount || 0) + 1;
        updates.resolution = '';
        updates.resolvedAt = '';
        updates.resolvedBy = '';
      }

      const updated = await updateCleaningIncidentRequest(user.id, updates as CleaningIncident);
      setIncidents(prev => prev.map(i => i._id === updated._id ? updated : i));
      if (detailIncident?._id === updated._id) setDetailIncident(updated);
      toast.success(`Estado → ${STATUS_CONFIG[newStatus].label}`);
    } catch (err: any) {
      toast.error(err.message || 'Error al cambiar estado');
    }
  };

  const handleResolve = async (inc: CleaningIncident) => {
    if (!user?.id || !resolutionText.trim()) {
      toast.error('Describe la resolución');
      return;
    }
    try {
      const now = new Date().toISOString();
      const updated = await updateCleaningIncidentRequest(user.id, {
        ...inc,
        status: 'resolved',
        resolution: resolutionText,
        resolvedAt: now,
        resolvedBy: user.fullName || user.name || '',
        _changedBy: user.fullName || user.name || '',
      } as any);
      setIncidents(prev => prev.map(i => i._id === updated._id ? updated : i));
      setDetailIncident(updated);
      setResolutionText('');
      setShowResolvePanel(false);
      toast.success('Incidencia resuelta');
    } catch (err: any) {
      toast.error(err.message || 'Error al resolver');
    }
  };

  const handleDelete = async (inc: CleaningIncident) => {
    if (!user?.id) return;
    if (!confirm('¿Eliminar esta incidencia?')) return;
    try {
      await deleteCleaningIncidentRequest(user.id, inc._id);
      setIncidents(prev => prev.filter(i => i._id !== inc._id));
      setDetailIncident(null);
      toast.success('Incidencia eliminada');
    } catch (err: any) {
      toast.error(err.message || 'Error al eliminar');
    }
  };

  // ─── Tabs ──────────────────────────────────────────────────────────

  const tabs: { key: 'all' | IncidentStatus; label: string; count?: number }[] = [
    { key: 'all', label: 'Todas', count: incidents.length },
    { key: 'open', label: 'Abiertas', count: incidents.filter(i => i.status === 'open').length },
    { key: 'in_progress', label: 'En progreso', count: incidents.filter(i => i.status === 'in_progress').length },
    { key: 'reopened', label: 'Reabiertas', count: incidents.filter(i => i.status === 'reopened').length },
    { key: 'resolved', label: 'Resueltas', count: incidents.filter(i => i.status === 'resolved').length },
    { key: 'closed', label: 'Cerradas', count: incidents.filter(i => i.status === 'closed').length },
  ];

  // ─── Helpers ───────────────────────────────────────────────────────

  const isOverdue = (inc: CleaningIncident) => {
    if (inc.status === 'resolved' || inc.status === 'closed') return false;
    if (!inc.dueDate) return false;
    return inc.dueDate < new Date().toISOString().slice(0, 10);
  };

  const daysSince = (dateStr: string) => {
    if (!dateStr) return 0;
    return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  };

  // ─── Render ────────────────────────────────────────────────────────

  return (
    <Layout title="Incidencias" subtitle="Registro y seguimiento de problemas operativos">
      <div className="flex flex-col gap-5">

        {/* ─── KPI Cards ─── */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[
            { label: 'Abiertas', value: kpis.open, icon: <AlertCircle className="w-4 h-4" />, bg: 'bg-red-50 dark:bg-red-950/30', text: 'text-red-600 dark:text-red-400', border: 'border-red-200 dark:border-red-800' },
            { label: 'Críticas', value: kpis.critical, icon: <ShieldAlert className="w-4 h-4" />, bg: 'bg-rose-50 dark:bg-rose-950/30', text: 'text-rose-600 dark:text-rose-400', border: 'border-rose-200 dark:border-rose-800' },
            { label: 'Resueltas hoy', value: kpis.resolvedToday, icon: <CheckCircle2 className="w-4 h-4" />, bg: 'bg-emerald-50 dark:bg-emerald-950/30', text: 'text-emerald-600 dark:text-emerald-400', border: 'border-emerald-200 dark:border-emerald-800' },
            { label: 'Tiempo medio', value: kpis.avgResolutionHours > 0 ? `${kpis.avgResolutionHours}h` : '—', icon: <Clock className="w-4 h-4" />, bg: 'bg-blue-50 dark:bg-blue-950/30', text: 'text-blue-600 dark:text-blue-400', border: 'border-blue-200 dark:border-blue-800' },
            { label: 'Fuera de plazo', value: kpis.overdue, icon: <AlertTriangle className="w-4 h-4" />, bg: 'bg-amber-50 dark:bg-amber-950/30', text: 'text-amber-600 dark:text-amber-400', border: 'border-amber-200 dark:border-amber-800' },
          ].map(stat => (
            <div key={stat.label} className={`${stat.bg} rounded-2xl p-4 border ${stat.border}`}>
              <div className="flex items-center gap-2 mb-2">
                <span className={stat.text}>{stat.icon}</span>
                <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{stat.label}</p>
              </div>
              <p className={`text-2xl font-black ${stat.text}`}>{stat.value}</p>
            </div>
          ))}
        </div>

        {/* ─── Toolbar ─── */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            {/* Tabs */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {tabs.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    activeTab === tab.key
                      ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900 shadow-sm'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  {tab.label}
                  {(tab.count || 0) > 0 && (
                    <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                      activeTab === tab.key
                        ? 'bg-white/20 text-white dark:bg-gray-900/30 dark:text-gray-900'
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                    }`}>
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar incidencia..."
                  className="pl-9 pr-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500/40 w-56"
                />
              </div>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`p-2 rounded-xl border transition-colors ${showFilters ? 'bg-gray-900 text-white border-gray-900 dark:bg-gray-100 dark:text-gray-900 dark:border-gray-100' : 'bg-white dark:bg-gray-800 text-gray-500 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
              >
                <Filter className="w-4 h-4" />
              </button>
              <button
                onClick={openCreate}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-semibold transition-colors shadow-sm"
              >
                <Plus className="w-4 h-4" />
                {isWorker ? 'Reportar' : 'Nueva incidencia'}
              </button>
            </div>
          </div>

          {/* Filter row */}
          {showFilters && (
            <div className="flex items-center gap-3 flex-wrap bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Prioridad:</span>
                <select
                  value={priorityFilter}
                  onChange={e => setPriorityFilter(e.target.value as any)}
                  className="px-2.5 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-red-500/40"
                >
                  <option value="all">Todas</option>
                  {(Object.keys(PRIORITY_CONFIG) as IncidentPriority[]).map(p => (
                    <option key={p} value={p}>{PRIORITY_CONFIG[p].label}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Tipo:</span>
                <select
                  value={typeFilter}
                  onChange={e => setTypeFilter(e.target.value as any)}
                  className="px-2.5 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-red-500/40"
                >
                  <option value="all">Todos</option>
                  {(Object.keys(INCIDENT_TYPES_CONFIG) as IncidentType[]).map(t => (
                    <option key={t} value={t}>{INCIDENT_TYPES_CONFIG[t].label}</option>
                  ))}
                </select>
              </div>
              {(priorityFilter !== 'all' || typeFilter !== 'all') && (
                <button
                  onClick={() => { setPriorityFilter('all'); setTypeFilter('all'); }}
                  className="text-xs text-red-600 dark:text-red-400 hover:underline font-semibold"
                >
                  Limpiar filtros
                </button>
              )}
            </div>
          )}
        </div>

        {/* ─── Content ─── */}
        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
        ) : filtered.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl p-12 text-center">
            <div className="max-w-sm mx-auto">
              <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-2xl flex items-center justify-center mx-auto mb-5">
                <AlertTriangle className="w-8 h-8 text-red-400" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">Sin incidencias</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                {search || priorityFilter !== 'all' || typeFilter !== 'all' || activeTab !== 'all'
                  ? 'No hay incidencias que coincidan con los filtros aplicados.'
                  : 'No hay incidencias registradas. ¡Buen trabajo!'}
              </p>
              {!search && activeTab === 'all' && (
                <button onClick={openCreate} className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-semibold text-sm flex items-center gap-2 mx-auto transition-colors">
                  <Plus className="w-4 h-4" /> Registrar incidencia
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="grid gap-2.5">
            {filtered.map(inc => {
              const statusCfg = STATUS_CONFIG[inc.status];
              const typeCfg = INCIDENT_TYPES_CONFIG[inc.incidentType];
              const priCfg = PRIORITY_CONFIG[inc.priority];
              const overdue = isOverdue(inc);
              const days = daysSince(inc.createdAt);

              return (
                <div
                  key={inc._id}
                  onClick={() => { setDetailIncident(inc); setShowResolvePanel(false); setResolutionText(inc.resolution || ''); }}
                  className={`bg-white dark:bg-gray-800 border rounded-xl p-4 transition-all cursor-pointer hover:shadow-md ${
                    overdue
                      ? 'border-red-300 dark:border-red-700 ring-1 ring-red-200 dark:ring-red-800'
                      : inc.priority === 'critical' && inc.status !== 'resolved' && inc.status !== 'closed'
                        ? 'border-rose-200 dark:border-rose-800'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      {/* Type icon */}
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${typeCfg.color}`}>
                        {typeCfg.icon}
                      </div>

                      <div className="min-w-0 flex-1">
                        {/* Row 1: number + client */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-mono text-gray-400 dark:text-gray-500">{inc.incidentNumber}</span>
                          <span className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">{inc.clientName}</span>
                          {overdue && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 animate-pulse">
                              <AlertTriangle className="w-3 h-3" /> VENCIDA
                            </span>
                          )}
                          {inc.reopenCount > 0 && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400">
                              <RotateCcw className="w-3 h-3" /> x{inc.reopenCount}
                            </span>
                          )}
                        </div>

                        {/* Row 2: description excerpt */}
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-1">{inc.description}</p>

                        {/* Row 3: metadata */}
                        <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border ${typeCfg.color}`}>
                            {typeCfg.label}
                          </span>
                          <span className="flex items-center gap-1 text-[11px] text-gray-400 dark:text-gray-500">
                            <Calendar className="w-3 h-3" />{inc.date}
                          </span>
                          {inc.workerName && (
                            <span className="flex items-center gap-1 text-[11px] text-gray-400 dark:text-gray-500">
                              <User className="w-3 h-3" />{inc.workerName}
                            </span>
                          )}
                          {inc.responsibleName && (
                            <span className="flex items-center gap-1 text-[11px] text-violet-500 dark:text-violet-400">
                              <ArrowUpRight className="w-3 h-3" />{inc.responsibleName}
                            </span>
                          )}
                          {days > 0 && inc.status !== 'resolved' && inc.status !== 'closed' && (
                            <span className="text-[11px] text-gray-400">hace {days}d</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right side: priority + status */}
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold ${statusCfg.bg} ${statusCfg.text}`}>
                        {statusCfg.icon} {statusCfg.label}
                      </span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold ${priCfg.color}`}>
                        {priCfg.label}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════════
          CREATE / EDIT MODAL
         ═══════════════════════════════════════════════════════════════════════════ */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-xl flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-red-500" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                    {editingIncident ? 'Editar incidencia' : 'Nueva incidencia'}
                  </h2>
                  <p className="text-xs text-gray-400">
                    {editingIncident ? editingIncident.incidentNumber : 'Registra un problema operativo o reclamación'}
                  </p>
                </div>
              </div>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-5">
              {/* Incident type selector */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">Tipo de incidencia *</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(Object.keys(INCIDENT_TYPES_CONFIG) as IncidentType[]).map(t => {
                    const cfg = INCIDENT_TYPES_CONFIG[t];
                    const selected = form.incidentType === t;
                    return (
                      <button
                        key={t}
                        onClick={() => setForm(f => ({ ...f, incidentType: t }))}
                        className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-semibold transition-all ${
                          selected
                            ? `${cfg.color} ring-2 ring-offset-1 dark:ring-offset-gray-900`
                            : 'bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700'
                        }`}
                      >
                        {cfg.icon}
                        <span className="truncate">{cfg.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Client + Service */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Cliente *</label>
                  <input
                    value={form.clientName}
                    onChange={e => setForm(f => ({ ...f, clientName: e.target.value }))}
                    placeholder="Nombre del cliente"
                    className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500/40"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Servicio asociado</label>
                  <input
                    value={form.serviceNumber}
                    onChange={e => setForm(f => ({ ...f, serviceNumber: e.target.value }))}
                    placeholder="Nº de servicio (ej: SVC-A1B2C3)"
                    className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500/40"
                  />
                </div>
              </div>

              {/* Date + Worker + Priority + Due date */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Fecha *</label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                    className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500/40"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Trabajador</label>
                  <input
                    value={form.workerName}
                    onChange={e => setForm(f => ({ ...f, workerName: e.target.value }))}
                    placeholder="Nombre"
                    className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500/40"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Prioridad</label>
                  <select
                    value={form.priority}
                    onChange={e => setForm(f => ({ ...f, priority: e.target.value as IncidentPriority }))}
                    className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500/40"
                  >
                    {(Object.keys(PRIORITY_CONFIG) as IncidentPriority[]).map(p => (
                      <option key={p} value={p}>{PRIORITY_CONFIG[p].label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Fecha límite</label>
                  <input
                    type="date"
                    value={form.dueDate}
                    onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))}
                    className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500/40"
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Descripción *</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={4}
                  placeholder="Describe el problema con el mayor detalle posible..."
                  className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500/40 resize-none"
                />
              </div>

              {/* Responsible (only manager) */}
              {!isWorker && (
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Responsable asignado</label>
                  <input
                    value={form.responsibleName}
                    onChange={e => setForm(f => ({ ...f, responsibleName: e.target.value }))}
                    placeholder="Nombre del responsable de resolver la incidencia"
                    className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500/40"
                  />
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 bg-white dark:bg-gray-900 flex items-center justify-end gap-2 p-5 border-t border-gray-200 dark:border-gray-700 rounded-b-2xl">
              <button onClick={() => setShowModal(false)} className="px-4 py-2.5 text-sm font-semibold text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors">
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 flex items-center gap-2 shadow-sm"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {editingIncident ? 'Guardar cambios' : 'Registrar incidencia'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════════
          DETAIL MODAL
         ═══════════════════════════════════════════════════════════════════════════ */}
      {detailIncident && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => { setDetailIncident(null); setShowResolvePanel(false); }}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${INCIDENT_TYPES_CONFIG[detailIncident.incidentType].color}`}>
                  {INCIDENT_TYPES_CONFIG[detailIncident.incidentType].icon}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{detailIncident.clientName}</h2>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${STATUS_CONFIG[detailIncident.status].bg} ${STATUS_CONFIG[detailIncident.status].text}`}>
                      {STATUS_CONFIG[detailIncident.status].icon} {STATUS_CONFIG[detailIncident.status].label}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400">{detailIncident.incidentNumber} — {INCIDENT_TYPES_CONFIG[detailIncident.incidentType].label}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {!isWorker && (
                  <>
                    <button onClick={() => { openEdit(detailIncident); setDetailIncident(null); }} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400" title="Editar">
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(detailIncident)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500" title="Eliminar">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                )}
                <button onClick={() => { setDetailIncident(null); setShowResolvePanel(false); }} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-5 space-y-5">
              {/* Priority + Overdue alert */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`inline-flex items-center px-3 py-1 rounded-lg text-xs font-bold ${PRIORITY_CONFIG[detailIncident.priority].color}`}>
                  Prioridad: {PRIORITY_CONFIG[detailIncident.priority].label}
                </span>
                {isOverdue(detailIncident) && (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-bold bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 animate-pulse">
                    <AlertTriangle className="w-3.5 h-3.5" /> Fuera de plazo
                  </span>
                )}
                {detailIncident.reopenCount > 0 && (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-bold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400">
                    <RotateCcw className="w-3.5 h-3.5" /> Reabierta {detailIncident.reopenCount} {detailIncident.reopenCount === 1 ? 'vez' : 'veces'}
                  </span>
                )}
              </div>

              {/* Status actions (manager only) */}
              {!isWorker && (
                <div className="flex items-center gap-2 flex-wrap">
                  {(Object.keys(STATUS_CONFIG) as IncidentStatus[]).map(status => (
                    <button
                      key={status}
                      onClick={() => {
                        if (status === 'resolved') {
                          setShowResolvePanel(true);
                        } else {
                          handleStatusChange(detailIncident, status);
                        }
                      }}
                      disabled={detailIncident.status === status}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all disabled:opacity-30 ${
                        detailIncident.status === status
                          ? `${STATUS_CONFIG[status].bg} ${STATUS_CONFIG[status].text} border-current`
                          : 'bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                    >
                      {STATUS_CONFIG[status].label}
                    </button>
                  ))}
                </div>
              )}

              {/* Info grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2.5 text-sm text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3">
                  <Calendar className="w-4 h-4 text-gray-400 shrink-0" />
                  <div>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase">Fecha</p>
                    <p className="font-medium">{detailIncident.date}</p>
                  </div>
                </div>
                {detailIncident.workerName && (
                  <div className="flex items-center gap-2.5 text-sm text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3">
                    <User className="w-4 h-4 text-gray-400 shrink-0" />
                    <div>
                      <p className="text-[10px] font-semibold text-gray-400 uppercase">Trabajador</p>
                      <p className="font-medium">{detailIncident.workerName}</p>
                    </div>
                  </div>
                )}
                {detailIncident.responsibleName && (
                  <div className="flex items-center gap-2.5 text-sm text-gray-600 dark:text-gray-300 bg-violet-50 dark:bg-violet-950/30 rounded-xl p-3">
                    <ArrowUpRight className="w-4 h-4 text-violet-500 shrink-0" />
                    <div>
                      <p className="text-[10px] font-semibold text-violet-400 uppercase">Responsable</p>
                      <p className="font-medium text-violet-700 dark:text-violet-300">{detailIncident.responsibleName}</p>
                    </div>
                  </div>
                )}
                {detailIncident.serviceNumber && (
                  <div className="flex items-center gap-2.5 text-sm text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3">
                    <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                    <div>
                      <p className="text-[10px] font-semibold text-gray-400 uppercase">Servicio</p>
                      <p className="font-medium">{detailIncident.serviceNumber}</p>
                    </div>
                  </div>
                )}
                {detailIncident.dueDate && (
                  <div className={`flex items-center gap-2.5 text-sm rounded-xl p-3 ${isOverdue(detailIncident) ? 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300' : 'bg-gray-50 dark:bg-gray-800/50 text-gray-600 dark:text-gray-300'}`}>
                    <Clock className="w-4 h-4 shrink-0 opacity-60" />
                    <div>
                      <p className={`text-[10px] font-semibold uppercase ${isOverdue(detailIncident) ? 'text-red-400' : 'text-gray-400'}`}>Fecha límite</p>
                      <p className="font-medium">{detailIncident.dueDate}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Description */}
              <div>
                <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Descripción</h4>
                <p className="text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 rounded-xl p-4 leading-relaxed whitespace-pre-wrap">
                  {detailIncident.description || 'Sin descripción'}
                </p>
              </div>

              {/* Resolution */}
              {detailIncident.resolution && (
                <div>
                  <h4 className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide mb-2">Resolución</h4>
                  <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4">
                    <p className="text-sm text-emerald-800 dark:text-emerald-300 leading-relaxed whitespace-pre-wrap">{detailIncident.resolution}</p>
                    {detailIncident.resolvedBy && (
                      <p className="text-xs text-emerald-500 mt-2">
                        Resuelto por {detailIncident.resolvedBy}
                        {detailIncident.resolvedAt && ` — ${new Date(detailIncident.resolvedAt).toLocaleString('es-ES')}`}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Resolve panel */}
              {showResolvePanel && (
                <div className="border-2 border-emerald-300 dark:border-emerald-700 rounded-xl p-4 bg-emerald-50/50 dark:bg-emerald-950/20">
                  <h4 className="text-sm font-bold text-emerald-700 dark:text-emerald-400 mb-2 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" /> Resolver incidencia
                  </h4>
                  <textarea
                    value={resolutionText}
                    onChange={e => setResolutionText(e.target.value)}
                    rows={3}
                    placeholder="Describe cómo se resolvió la incidencia..."
                    className="w-full px-3 py-2.5 bg-white dark:bg-gray-800 border border-emerald-200 dark:border-emerald-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 resize-none mb-3"
                  />
                  <div className="flex items-center gap-2 justify-end">
                    <button
                      onClick={() => setShowResolvePanel(false)}
                      className="px-3 py-1.5 text-xs font-semibold text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => handleResolve(detailIncident)}
                      className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> Marcar como resuelta
                    </button>
                  </div>
                </div>
              )}

              {/* Status History / Timeline */}
              {detailIncident.statusHistory.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Historial</h4>
                  <div className="space-y-0">
                    {[...detailIncident.statusHistory].reverse().map((entry, idx) => (
                      <div key={idx} className="flex items-start gap-3 py-2">
                        <div className="flex flex-col items-center">
                          <div className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${STATUS_CONFIG[entry.to as IncidentStatus]?.dot || 'bg-gray-400'}`} />
                          {idx < detailIncident.statusHistory.length - 1 && <div className="w-px flex-1 bg-gray-200 dark:bg-gray-700 min-h-[16px]" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-gray-700 dark:text-gray-300">
                            <span className="font-semibold">{STATUS_CONFIG[entry.from as IncidentStatus]?.label || entry.from}</span>
                            <span className="text-gray-400 mx-1.5">→</span>
                            <span className="font-semibold">{STATUS_CONFIG[entry.to as IncidentStatus]?.label || entry.to}</span>
                          </p>
                          <p className="text-[11px] text-gray-400 mt-0.5">
                            {entry.user && `${entry.user} — `}
                            {new Date(entry.date).toLocaleString('es-ES')}
                          </p>
                          {entry.notes && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 italic">{entry.notes}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Created info */}
              <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
                <p className="text-[11px] text-gray-400">
                  Creada el {new Date(detailIncident.createdAt).toLocaleString('es-ES')}
                  {detailIncident.updatedAt !== detailIncident.createdAt && ` — Actualizada ${new Date(detailIncident.updatedAt).toLocaleString('es-ES')}`}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
