import { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { useModalClose } from '../../hooks/useModalClose';
import {
  listConstructionIncidents,
  createConstructionIncident,
  updateConstructionIncident,
  resolveConstructionIncident,
  reopenConstructionIncident,
  deleteConstructionIncident,
  listConstructionProjects,
  listConstructionWorkers,
  type ConstructionIncident,
  type ConstructionIncidentType,
  type ConstructionIncidentStatus,
  type ConstructionIncidentPriority,
  type ConstructionProject,
  type ConstructionWorker,
} from '../../lib/constructionApi';
import {
  AlertTriangle, Plus, Search, X, Loader2, Calendar, User,
  Clock, Filter, RotateCcw, CheckCircle2, XCircle, AlertCircle,
  ShieldAlert, Trash2, Edit3, Camera, ArrowUpRight, Wrench,
  Package, UserX, Zap, HardHat, Building2, FileText, Eye,
  ChevronRight, RefreshCw, MessageSquareWarning, CircleDot,
  Timer, Ban,
} from 'lucide-react';

// ─── Configuration ────────────────────────────────────────────────────────────

const INCIDENT_TYPES_CONFIG: Record<ConstructionIncidentType, { label: string; icon: React.ReactNode; color: string }> = {
  falta_material:    { label: 'Falta material',       icon: <Package className="w-4 h-4" />,                color: 'text-sky-600 bg-sky-50 border-sky-200 dark:text-sky-400 dark:bg-sky-950/40 dark:border-sky-800' },
  averia:            { label: 'Avería',                icon: <Wrench className="w-4 h-4" />,                 color: 'text-red-600 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-950/40 dark:border-red-800' },
  retraso_gremio:    { label: 'Retraso gremio',        icon: <UserX className="w-4 h-4" />,                  color: 'text-violet-600 bg-violet-50 border-violet-200 dark:text-violet-400 dark:bg-violet-950/40 dark:border-violet-800' },
  cambio_cliente:    { label: 'Cambio cliente',        icon: <MessageSquareWarning className="w-4 h-4" />,   color: 'text-orange-600 bg-orange-50 border-orange-200 dark:text-orange-400 dark:bg-orange-950/40 dark:border-orange-800' },
  error_tecnico:     { label: 'Error técnico',         icon: <Zap className="w-4 h-4" />,                    color: 'text-rose-600 bg-rose-50 border-rose-200 dark:text-rose-400 dark:bg-rose-950/40 dark:border-rose-800' },
  riesgo_seguridad:  { label: 'Riesgo de seguridad',   icon: <ShieldAlert className="w-4 h-4" />,            color: 'text-amber-600 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950/40 dark:border-amber-800' },
  otro:              { label: 'Otra',                  icon: <AlertTriangle className="w-4 h-4" />,          color: 'text-slate-600 bg-slate-50 border-slate-200 dark:text-slate-400 dark:bg-slate-950/40 dark:border-slate-800' },
};

const STATUS_CONFIG: Record<ConstructionIncidentStatus, { label: string; icon: React.ReactNode; bg: string; text: string; dot: string }> = {
  abierta:     { label: 'Abierta',      icon: <AlertCircle className="w-3.5 h-3.5" />,   bg: 'bg-red-50 dark:bg-red-950/40',     text: 'text-red-700 dark:text-red-400',     dot: 'bg-red-500' },
  en_revision: { label: 'En revisión',  icon: <Clock className="w-3.5 h-3.5" />,         bg: 'bg-blue-50 dark:bg-blue-950/40',   text: 'text-blue-700 dark:text-blue-400',   dot: 'bg-blue-500' },
  resuelta:    { label: 'Resuelta',     icon: <CheckCircle2 className="w-3.5 h-3.5" />,  bg: 'bg-emerald-50 dark:bg-emerald-950/40', text: 'text-emerald-700 dark:text-emerald-400', dot: 'bg-emerald-500' },
  cerrada:     { label: 'Cerrada',      icon: <XCircle className="w-3.5 h-3.5" />,       bg: 'bg-gray-100 dark:bg-gray-800',     text: 'text-gray-500 dark:text-gray-400',   dot: 'bg-gray-400' },
  reabierta:   { label: 'Reabierta',    icon: <RotateCcw className="w-3.5 h-3.5" />,     bg: 'bg-amber-50 dark:bg-amber-950/40', text: 'text-amber-700 dark:text-amber-400', dot: 'bg-amber-500' },
};

const PRIORITY_CONFIG: Record<ConstructionIncidentPriority, { label: string; color: string }> = {
  baja:     { label: 'Baja',     color: 'text-gray-500 bg-gray-100 dark:bg-gray-800 dark:text-gray-400' },
  media:    { label: 'Media',    color: 'text-amber-700 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-400' },
  alta:     { label: 'Alta',     color: 'text-orange-700 bg-orange-50 dark:bg-orange-950/40 dark:text-orange-400' },
  critica:  { label: 'Crítica',  color: 'text-red-700 bg-red-50 dark:bg-red-950/40 dark:text-red-400' },
};

interface IncidentForm {
  tipo: ConstructionIncidentType;
  obraId: string;
  obraNombre: string;
  fecha: string;
  trabajadorId: string;
  trabajadorNombre: string;
  asignadoA: string;
  asignadoANombre: string;
  prioridad: ConstructionIncidentPriority;
  descripcion: string;
  fechaLimite: string;
  fotos: { id: string; url: string; base64: string; mimeType: string; descripcion: string; fecha: string }[];
}

const emptyForm = (): IncidentForm => ({
  tipo: 'falta_material',
  obraId: '',
  obraNombre: '',
  fecha: new Date().toISOString().slice(0, 10),
  trabajadorId: '',
  trabajadorNombre: '',
  asignadoA: '',
  asignadoANombre: '',
  prioridad: 'media',
  descripcion: '',
  fechaLimite: '',
  fotos: [],
});

// ─── Component ────────────────────────────────────────────────────────────────

export function ConstructionIncidents() {
  const { user } = useAuth();
  const userId = user?.user_id || user?.id || '';
  const isWorker = user?.role === 'worker' || user?.role === 'employee';

  const [incidents, setIncidents] = useState<ConstructionIncident[]>([]);
  const [projects, setProjects] = useState<ConstructionProject[]>([]);
  const [workers, setWorkers] = useState<ConstructionWorker[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | ConstructionIncidentStatus>('all');
  const [priorityFilter, setPriorityFilter] = useState<ConstructionIncidentPriority | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<ConstructionIncidentType | 'all'>('all');
  const [projectFilter, setProjectFilter] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [editingIncident, setEditingIncident] = useState<ConstructionIncident | null>(null);
  const [form, setForm] = useState<IncidentForm>(emptyForm());
  const [saving, setSaving] = useState(false);

  const [detailIncident, setDetailIncident] = useState<ConstructionIncident | null>(null);
  const [resolutionText, setResolutionText] = useState('');
  const [showResolvePanel, setShowResolvePanel] = useState(false);
  const [reopenMotivo, setReopenMotivo] = useState('');
  const [showReopenPanel, setShowReopenPanel] = useState(false);

  useModalClose(showModal, () => setShowModal(false));
  useModalClose(!!detailIncident, () => { setDetailIncident(null); setShowResolvePanel(false); setShowReopenPanel(false); });

  const loadData = useCallback(async () => {
    if (!userId) return;
    try {
      const [inc, prj, wrk] = await Promise.all([
        listConstructionIncidents(userId),
        listConstructionProjects(userId),
        listConstructionWorkers(userId),
      ]);
      setIncidents(inc);
      setProjects(prj);
      setWorkers(wrk);
    } catch (err: any) {
      toast.error(err.message || 'Error al cargar incidencias');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { loadData(); }, [loadData]);

  // ─── KPIs ──────────────────────────────────────────────────────────

  const kpis = useMemo(() => {
    const open = incidents.filter(i => i.estado === 'abierta' || i.estado === 'reabierta').length;
    const critical = incidents.filter(i => i.prioridad === 'critica' && i.estado !== 'resuelta' && i.estado !== 'cerrada').length;
    const today = new Date().toISOString().slice(0, 10);
    const resolvedToday = incidents.filter(i => i.fechaResolucion && i.fechaResolucion.slice(0, 10) === today).length;

    const resolved = incidents.filter(i => i.fechaResolucion && i.createdAt);
    let avgHours = 0;
    if (resolved.length > 0) {
      const totalMs = resolved.reduce((sum, i) => sum + (new Date(i.fechaResolucion).getTime() - new Date(i.createdAt).getTime()), 0);
      avgHours = Math.round(totalMs / resolved.length / 3600000);
    }

    const overdue = incidents.filter(i => {
      if (i.estado === 'resuelta' || i.estado === 'cerrada') return false;
      if (!i.fechaLimite) return false;
      return i.fechaLimite < today;
    }).length;

    return { open, critical, resolvedToday, avgHours, overdue };
  }, [incidents]);

  // ─── Filters ───────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let list = incidents;

    if (isWorker) {
      list = list.filter(i => i.trabajadorNombre === (user?.fullName || user?.name || '') || i.reportadoPorNombre === (user?.fullName || user?.name || ''));
    }
    if (activeTab !== 'all') list = list.filter(i => i.estado === activeTab);
    if (priorityFilter !== 'all') list = list.filter(i => i.prioridad === priorityFilter);
    if (typeFilter !== 'all') list = list.filter(i => i.tipo === typeFilter);
    if (projectFilter !== 'all') list = list.filter(i => i.obraId === projectFilter);

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(i =>
        i.referencia.toLowerCase().includes(q) ||
        i.obraNombre.toLowerCase().includes(q) ||
        i.descripcion.toLowerCase().includes(q) ||
        i.asignadoANombre.toLowerCase().includes(q) ||
        i.trabajadorNombre.toLowerCase().includes(q) ||
        i.reportadoPorNombre.toLowerCase().includes(q) ||
        (i.titulo || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [incidents, activeTab, priorityFilter, typeFilter, projectFilter, search, isWorker, user]);

  // ─── CRUD handlers ────────────────────────────────────────────────

  const openCreate = () => {
    setEditingIncident(null);
    setForm(emptyForm());
    setShowModal(true);
  };

  const openEdit = (inc: ConstructionIncident) => {
    setEditingIncident(inc);
    setForm({
      tipo: inc.tipo,
      obraId: inc.obraId,
      obraNombre: inc.obraNombre,
      fecha: inc.fecha,
      trabajadorId: inc.trabajadorId,
      trabajadorNombre: inc.trabajadorNombre,
      asignadoA: inc.asignadoA,
      asignadoANombre: inc.asignadoANombre,
      prioridad: inc.prioridad,
      descripcion: inc.descripcion,
      fechaLimite: inc.fechaLimite,
      fotos: inc.fotos || [],
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!userId) return;
    if (!form.descripcion.trim()) { toast.error('La descripción es obligatoria'); return; }
    if (!form.obraId) { toast.error('Selecciona una obra'); return; }

    setSaving(true);
    try {
      const payload: Partial<ConstructionIncident> = {
        tipo: form.tipo,
        obraId: form.obraId,
        obraNombre: form.obraNombre,
        fecha: form.fecha,
        trabajadorId: form.trabajadorId,
        trabajadorNombre: form.trabajadorNombre,
        asignadoA: form.asignadoA,
        asignadoANombre: form.asignadoANombre,
        prioridad: form.prioridad,
        descripcion: form.descripcion,
        fechaLimite: form.fechaLimite,
        fotos: form.fotos as any,
        reportadoPor: user?.id || '',
        reportadoPorNombre: user?.fullName || user?.name || '',
      };

      if (editingIncident) {
        const updated = await updateConstructionIncident(userId, { ...editingIncident, ...payload } as ConstructionIncident);
        setIncidents(prev => prev.map(i => i._id === updated._id ? updated : i));
        toast.success('Incidencia actualizada');
      } else {
        const created = await createConstructionIncident(userId, payload);
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

  const handleStatusChange = async (inc: ConstructionIncident, newStatus: ConstructionIncidentStatus) => {
    if (!userId) return;
    try {
      const updated = await updateConstructionIncident(userId, { ...inc, estado: newStatus } as ConstructionIncident);
      setIncidents(prev => prev.map(i => i._id === updated._id ? updated : i));
      if (detailIncident?._id === updated._id) setDetailIncident(updated);
      toast.success(`Estado → ${STATUS_CONFIG[newStatus].label}`);
    } catch (err: any) {
      toast.error(err.message || 'Error al cambiar estado');
    }
  };

  const handleResolve = async (inc: ConstructionIncident) => {
    if (!userId || !resolutionText.trim()) { toast.error('Describe la resolución'); return; }
    try {
      const updated = await resolveConstructionIncident(userId, inc._id, resolutionText);
      setIncidents(prev => prev.map(i => i._id === updated._id ? updated : i));
      setDetailIncident(updated);
      setResolutionText('');
      setShowResolvePanel(false);
      toast.success('Incidencia resuelta');
    } catch (err: any) {
      toast.error(err.message || 'Error al resolver');
    }
  };

  const handleReopen = async (inc: ConstructionIncident) => {
    if (!userId) return;
    try {
      const updated = await reopenConstructionIncident(userId, inc._id, reopenMotivo);
      setIncidents(prev => prev.map(i => i._id === updated._id ? updated : i));
      setDetailIncident(updated);
      setReopenMotivo('');
      setShowReopenPanel(false);
      toast.success('Incidencia reabierta');
    } catch (err: any) {
      toast.error(err.message || 'Error al reabrir');
    }
  };

  const handleDelete = async (inc: ConstructionIncident) => {
    if (!userId) return;
    if (!confirm('¿Eliminar esta incidencia?')) return;
    try {
      await deleteConstructionIncident(userId, inc._id);
      setIncidents(prev => prev.filter(i => i._id !== inc._id));
      setDetailIncident(null);
      toast.success('Incidencia eliminada');
    } catch (err: any) {
      toast.error(err.message || 'Error al eliminar');
    }
  };

  const handlePhotoAdd = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.onchange = async (e: any) => {
      const files = Array.from(e.target.files || []) as File[];
      for (const file of files) {
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1] || '';
          setForm(prev => ({
            ...prev,
            fotos: [...prev.fotos, {
              id: `foto-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              url: '',
              base64,
              mimeType: file.type || 'image/jpeg',
              descripcion: file.name,
              fecha: new Date().toISOString(),
            }],
          }));
        };
        reader.readAsDataURL(file);
      }
    };
    input.click();
  };

  // ─── Tabs ──────────────────────────────────────────────────────────

  const tabs: { key: 'all' | ConstructionIncidentStatus; label: string; count?: number }[] = [
    { key: 'all', label: 'Todas', count: incidents.length },
    { key: 'abierta', label: 'Abiertas', count: incidents.filter(i => i.estado === 'abierta').length },
    { key: 'en_revision', label: 'En revisión', count: incidents.filter(i => i.estado === 'en_revision').length },
    { key: 'reabierta', label: 'Reabiertas', count: incidents.filter(i => i.estado === 'reabierta').length },
    { key: 'resuelta', label: 'Resueltas', count: incidents.filter(i => i.estado === 'resuelta').length },
    { key: 'cerrada', label: 'Cerradas', count: incidents.filter(i => i.estado === 'cerrada').length },
  ];

  // ─── Helpers ───────────────────────────────────────────────────────

  const isOverdue = (inc: ConstructionIncident) => {
    if (inc.estado === 'resuelta' || inc.estado === 'cerrada') return false;
    if (!inc.fechaLimite) return false;
    return inc.fechaLimite < new Date().toISOString().slice(0, 10);
  };

  const daysSince = (dateStr: string) => {
    if (!dateStr) return 0;
    return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  };

  const onProjectChange = (projectId: string) => {
    const p = projects.find(pr => pr._id === projectId);
    setForm(prev => ({ ...prev, obraId: projectId, obraNombre: p?.nombre || '' }));
  };

  const onWorkerChange = (workerId: string) => {
    const w = workers.find(wr => wr._id === workerId);
    setForm(prev => ({ ...prev, trabajadorId: workerId, trabajadorNombre: w?.nombre || '' }));
  };

  const onResponsibleChange = (workerId: string) => {
    const w = workers.find(wr => wr._id === workerId);
    setForm(prev => ({ ...prev, asignadoA: workerId, asignadoANombre: w?.nombre || '' }));
  };

  const activeProjects = useMemo(() => projects.filter(p => p.estado !== 'finalizada'), [projects]);
  const activeWorkers = useMemo(() => workers.filter(w => w.activo), [workers]);

  // ─── Render ────────────────────────────────────────────────────────

  return (
    <Layout title="Incidencias de Obra" subtitle="Control y seguimiento de problemas operativos, técnicos o económicos">
      <div className="flex flex-col gap-5">

        {/* ─── KPI Cards ─── */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[
            { label: 'Abiertas', value: kpis.open, icon: <AlertCircle className="w-4 h-4" />, bg: 'bg-red-50 dark:bg-red-950/30', text: 'text-red-600 dark:text-red-400', border: 'border-red-200 dark:border-red-800' },
            { label: 'Críticas', value: kpis.critical, icon: <ShieldAlert className="w-4 h-4" />, bg: 'bg-rose-50 dark:bg-rose-950/30', text: 'text-rose-600 dark:text-rose-400', border: 'border-rose-200 dark:border-rose-800' },
            { label: 'Resueltas hoy', value: kpis.resolvedToday, icon: <CheckCircle2 className="w-4 h-4" />, bg: 'bg-emerald-50 dark:bg-emerald-950/30', text: 'text-emerald-600 dark:text-emerald-400', border: 'border-emerald-200 dark:border-emerald-800' },
            { label: 'Tiempo medio', value: kpis.avgHours > 0 ? `${kpis.avgHours}h` : '—', icon: <Timer className="w-4 h-4" />, bg: 'bg-blue-50 dark:bg-blue-950/30', text: 'text-blue-600 dark:text-blue-400', border: 'border-blue-200 dark:border-blue-800' },
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
                    }`}>{tab.count}</span>
                  )}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar incidencia..."
                  className="pl-9 pr-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/40 w-56"
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
                className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-sm font-semibold transition-colors shadow-sm"
              >
                <Plus className="w-4 h-4" />
                {isWorker ? 'Reportar' : 'Nueva incidencia'}
              </button>
            </div>
          </div>

          {showFilters && (
            <div className="flex items-center gap-3 flex-wrap bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Prioridad:</span>
                <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value as any)} className="px-2.5 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-orange-500/40">
                  <option value="all">Todas</option>
                  {(Object.keys(PRIORITY_CONFIG) as ConstructionIncidentPriority[]).map(p => (
                    <option key={p} value={p}>{PRIORITY_CONFIG[p].label}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Tipo:</span>
                <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as any)} className="px-2.5 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-orange-500/40">
                  <option value="all">Todos</option>
                  {(Object.keys(INCIDENT_TYPES_CONFIG) as ConstructionIncidentType[]).map(t => (
                    <option key={t} value={t}>{INCIDENT_TYPES_CONFIG[t].label}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Obra:</span>
                <select value={projectFilter} onChange={e => setProjectFilter(e.target.value)} className="px-2.5 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-orange-500/40 max-w-[200px]">
                  <option value="all">Todas</option>
                  {projects.map(p => (
                    <option key={p._id} value={p._id}>{p.nombre}</option>
                  ))}
                </select>
              </div>
              {(priorityFilter !== 'all' || typeFilter !== 'all' || projectFilter !== 'all') && (
                <button onClick={() => { setPriorityFilter('all'); setTypeFilter('all'); setProjectFilter('all'); }} className="text-xs text-orange-600 dark:text-orange-400 hover:underline font-semibold">
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
              <div className="w-16 h-16 bg-orange-100 dark:bg-orange-900/30 rounded-2xl flex items-center justify-center mx-auto mb-5">
                <HardHat className="w-8 h-8 text-orange-400" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">Sin incidencias</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                {search || priorityFilter !== 'all' || typeFilter !== 'all' || projectFilter !== 'all' || activeTab !== 'all'
                  ? 'No hay incidencias que coincidan con los filtros aplicados.'
                  : 'No hay incidencias registradas. ¡Buen trabajo!'}
              </p>
              {!search && activeTab === 'all' && (
                <button onClick={openCreate} className="px-6 py-3 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-semibold text-sm flex items-center gap-2 mx-auto transition-colors">
                  <Plus className="w-4 h-4" /> Registrar incidencia
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="grid gap-2.5">
            {filtered.map(inc => {
              const statusCfg = STATUS_CONFIG[inc.estado] || STATUS_CONFIG.abierta;
              const typeCfg = INCIDENT_TYPES_CONFIG[inc.tipo] || INCIDENT_TYPES_CONFIG.otro;
              const priCfg = PRIORITY_CONFIG[inc.prioridad] || PRIORITY_CONFIG.media;
              const overdue = isOverdue(inc);
              const days = daysSince(inc.createdAt);

              return (
                <div
                  key={inc._id}
                  onClick={() => { setDetailIncident(inc); setShowResolvePanel(false); setShowReopenPanel(false); setResolutionText(inc.resolucion || ''); }}
                  className={`bg-white dark:bg-gray-800 border rounded-xl p-4 transition-all cursor-pointer hover:shadow-md ${
                    overdue
                      ? 'border-red-300 dark:border-red-700 ring-1 ring-red-200 dark:ring-red-800'
                      : inc.prioridad === 'critica' && inc.estado !== 'resuelta' && inc.estado !== 'cerrada'
                        ? 'border-rose-200 dark:border-rose-800'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${typeCfg.color}`}>
                        {typeCfg.icon}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-mono text-gray-400 dark:text-gray-500">{inc.referencia}</span>
                          <span className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">{inc.obraNombre || 'Sin obra'}</span>
                          {overdue && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 animate-pulse">
                              <AlertTriangle className="w-3 h-3" /> VENCIDA
                            </span>
                          )}
                          {inc.reabiertaCount > 0 && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400">
                              <RotateCcw className="w-3 h-3" /> x{inc.reabiertaCount}
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-1">{inc.descripcion}</p>

                        <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border ${typeCfg.color}`}>
                            {typeCfg.label}
                          </span>
                          <span className="flex items-center gap-1 text-[11px] text-gray-400 dark:text-gray-500">
                            <Calendar className="w-3 h-3" />{inc.fecha}
                          </span>
                          {inc.trabajadorNombre && (
                            <span className="flex items-center gap-1 text-[11px] text-gray-400 dark:text-gray-500">
                              <User className="w-3 h-3" />{inc.trabajadorNombre}
                            </span>
                          )}
                          {inc.asignadoANombre && (
                            <span className="flex items-center gap-1 text-[11px] text-violet-500 dark:text-violet-400">
                              <ArrowUpRight className="w-3 h-3" />{inc.asignadoANombre}
                            </span>
                          )}
                          {inc.fotos && inc.fotos.length > 0 && (
                            <span className="flex items-center gap-1 text-[11px] text-gray-400">
                              <Camera className="w-3 h-3" />{inc.fotos.length}
                            </span>
                          )}
                          {days > 0 && inc.estado !== 'resuelta' && inc.estado !== 'cerrada' && (
                            <span className="text-[11px] text-gray-400">hace {days}d</span>
                          )}
                        </div>
                      </div>
                    </div>

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
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-orange-100 dark:bg-orange-900/30 rounded-xl flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-orange-500" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                    {editingIncident ? 'Editar incidencia' : 'Nueva incidencia'}
                  </h2>
                  <p className="text-xs text-gray-400">
                    {editingIncident ? editingIncident.referencia : 'Registra un problema operativo o técnico de obra'}
                  </p>
                </div>
              </div>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {/* Incident type selector */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">Tipo de incidencia *</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(Object.keys(INCIDENT_TYPES_CONFIG) as ConstructionIncidentType[]).map(t => {
                    const cfg = INCIDENT_TYPES_CONFIG[t];
                    const selected = form.tipo === t;
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setForm(f => ({ ...f, tipo: t }))}
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

              {/* Obra + Fecha */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Obra *</label>
                  <select
                    value={form.obraId}
                    onChange={e => onProjectChange(e.target.value)}
                    className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/40"
                  >
                    <option value="">— Seleccionar obra —</option>
                    {activeProjects.map(p => <option key={p._id} value={p._id}>{p.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Fecha *</label>
                  <input
                    type="date"
                    value={form.fecha}
                    onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))}
                    className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/40"
                  />
                </div>
              </div>

              {/* Trabajador + Responsable + Prioridad + Fecha límite */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Trabajador</label>
                  <select
                    value={form.trabajadorId}
                    onChange={e => onWorkerChange(e.target.value)}
                    className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/40"
                  >
                    <option value="">— Ninguno —</option>
                    {activeWorkers.map(w => <option key={w._id} value={w._id}>{w.nombre}</option>)}
                  </select>
                </div>
                {!isWorker && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Responsable</label>
                    <select
                      value={form.asignadoA}
                      onChange={e => onResponsibleChange(e.target.value)}
                      className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/40"
                    >
                      <option value="">— Sin asignar —</option>
                      {activeWorkers.map(w => <option key={w._id} value={w._id}>{w.nombre}</option>)}
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Prioridad</label>
                  <select
                    value={form.prioridad}
                    onChange={e => setForm(f => ({ ...f, prioridad: e.target.value as ConstructionIncidentPriority }))}
                    className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/40"
                  >
                    {(Object.keys(PRIORITY_CONFIG) as ConstructionIncidentPriority[]).map(p => (
                      <option key={p} value={p}>{PRIORITY_CONFIG[p].label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Fecha límite</label>
                  <input
                    type="date"
                    value={form.fechaLimite}
                    onChange={e => setForm(f => ({ ...f, fechaLimite: e.target.value }))}
                    className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/40"
                  />
                </div>
              </div>

              {/* Descripción */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Descripción *</label>
                <textarea
                  value={form.descripcion}
                  onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
                  rows={4}
                  placeholder="Describe el problema con el mayor detalle posible..."
                  className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/40 resize-none"
                />
              </div>

              {/* Fotos */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">Fotos</label>
                <div className="flex items-center gap-2 flex-wrap">
                  {form.fotos.map((foto, idx) => (
                    <div key={foto.id} className="relative group">
                      <div className="w-20 h-20 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800">
                        {foto.base64 ? (
                          <img src={`data:${foto.mimeType};base64,${foto.base64}`} alt="" className="w-full h-full object-cover" />
                        ) : foto.url ? (
                          <img src={foto.url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center"><Camera className="w-5 h-5 text-gray-400" /></div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setForm(prev => ({ ...prev, fotos: prev.fotos.filter((_, i) => i !== idx) })); }}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={handlePhotoAdd}
                    className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 flex flex-col items-center justify-center gap-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:border-gray-400 dark:hover:border-gray-500 transition-colors"
                  >
                    <Camera className="w-5 h-5" />
                    <span className="text-[10px] font-semibold">Añadir</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 bg-white dark:bg-gray-900 flex items-center justify-end gap-2 p-5 border-t border-gray-200 dark:border-gray-700 rounded-b-2xl">
              <button onClick={() => setShowModal(false)} className="px-4 py-2.5 text-sm font-semibold text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors">
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 flex items-center gap-2 shadow-sm"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => { setDetailIncident(null); setShowResolvePanel(false); setShowReopenPanel(false); }}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${(INCIDENT_TYPES_CONFIG[detailIncident.tipo] || INCIDENT_TYPES_CONFIG.otro).color}`}>
                  {(INCIDENT_TYPES_CONFIG[detailIncident.tipo] || INCIDENT_TYPES_CONFIG.otro).icon}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{detailIncident.obraNombre || 'Incidencia'}</h2>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${(STATUS_CONFIG[detailIncident.estado] || STATUS_CONFIG.abierta).bg} ${(STATUS_CONFIG[detailIncident.estado] || STATUS_CONFIG.abierta).text}`}>
                      {(STATUS_CONFIG[detailIncident.estado] || STATUS_CONFIG.abierta).icon} {(STATUS_CONFIG[detailIncident.estado] || STATUS_CONFIG.abierta).label}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400">{detailIncident.referencia} — {(INCIDENT_TYPES_CONFIG[detailIncident.tipo] || INCIDENT_TYPES_CONFIG.otro).label}</p>
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
                <button onClick={() => { setDetailIncident(null); setShowResolvePanel(false); setShowReopenPanel(false); }} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-5 space-y-5">
              {/* Priority + Overdue + Reopen badges */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`inline-flex items-center px-3 py-1 rounded-lg text-xs font-bold ${(PRIORITY_CONFIG[detailIncident.prioridad] || PRIORITY_CONFIG.media).color}`}>
                  Prioridad: {(PRIORITY_CONFIG[detailIncident.prioridad] || PRIORITY_CONFIG.media).label}
                </span>
                {isOverdue(detailIncident) && (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-bold bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 animate-pulse">
                    <AlertTriangle className="w-3.5 h-3.5" /> Fuera de plazo
                  </span>
                )}
                {detailIncident.reabiertaCount > 0 && (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-bold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400">
                    <RotateCcw className="w-3.5 h-3.5" /> Reabierta {detailIncident.reabiertaCount} {detailIncident.reabiertaCount === 1 ? 'vez' : 'veces'}
                  </span>
                )}
              </div>

              {/* Status actions (manager only) */}
              {!isWorker && (
                <div className="flex items-center gap-2 flex-wrap">
                  {(['abierta', 'en_revision'] as ConstructionIncidentStatus[]).map(status => (
                    <button
                      key={status}
                      onClick={() => handleStatusChange(detailIncident, status)}
                      disabled={detailIncident.estado === status}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all disabled:opacity-30 ${
                        detailIncident.estado === status
                          ? `${STATUS_CONFIG[status].bg} ${STATUS_CONFIG[status].text} border-current`
                          : 'bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                    >{STATUS_CONFIG[status].label}</button>
                  ))}
                  <button
                    onClick={() => { setShowResolvePanel(true); setShowReopenPanel(false); }}
                    disabled={detailIncident.estado === 'resuelta' || detailIncident.estado === 'cerrada'}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all disabled:opacity-30 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-700 hover:bg-emerald-100 dark:hover:bg-emerald-900/40"
                  >Resolver</button>
                  <button
                    onClick={() => handleStatusChange(detailIncident, 'cerrada')}
                    disabled={detailIncident.estado === 'cerrada'}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all disabled:opacity-30 ${
                      detailIncident.estado === 'cerrada'
                        ? `${STATUS_CONFIG.cerrada.bg} ${STATUS_CONFIG.cerrada.text} border-current`
                        : 'bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >Cerrar</button>
                  {(detailIncident.estado === 'resuelta' || detailIncident.estado === 'cerrada') && (
                    <button
                      onClick={() => { setShowReopenPanel(true); setShowResolvePanel(false); }}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/40"
                    >
                      <span className="flex items-center gap-1"><RotateCcw className="w-3 h-3" /> Reabrir</span>
                    </button>
                  )}
                </div>
              )}

              {/* Info grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2.5 text-sm text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3">
                  <Building2 className="w-4 h-4 text-gray-400 shrink-0" />
                  <div>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase">Obra</p>
                    <p className="font-medium">{detailIncident.obraNombre || '—'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 text-sm text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3">
                  <Calendar className="w-4 h-4 text-gray-400 shrink-0" />
                  <div>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase">Fecha</p>
                    <p className="font-medium">{detailIncident.fecha}</p>
                  </div>
                </div>
                {detailIncident.trabajadorNombre && (
                  <div className="flex items-center gap-2.5 text-sm text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3">
                    <User className="w-4 h-4 text-gray-400 shrink-0" />
                    <div>
                      <p className="text-[10px] font-semibold text-gray-400 uppercase">Trabajador</p>
                      <p className="font-medium">{detailIncident.trabajadorNombre}</p>
                    </div>
                  </div>
                )}
                {detailIncident.asignadoANombre && (
                  <div className="flex items-center gap-2.5 text-sm text-gray-600 dark:text-gray-300 bg-violet-50 dark:bg-violet-950/30 rounded-xl p-3">
                    <ArrowUpRight className="w-4 h-4 text-violet-500 shrink-0" />
                    <div>
                      <p className="text-[10px] font-semibold text-violet-400 uppercase">Responsable</p>
                      <p className="font-medium text-violet-700 dark:text-violet-300">{detailIncident.asignadoANombre}</p>
                    </div>
                  </div>
                )}
                {detailIncident.reportadoPorNombre && (
                  <div className="flex items-center gap-2.5 text-sm text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3">
                    <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                    <div>
                      <p className="text-[10px] font-semibold text-gray-400 uppercase">Reportado por</p>
                      <p className="font-medium">{detailIncident.reportadoPorNombre}</p>
                    </div>
                  </div>
                )}
                {detailIncident.fechaLimite && (
                  <div className={`flex items-center gap-2.5 text-sm rounded-xl p-3 ${isOverdue(detailIncident) ? 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300' : 'bg-gray-50 dark:bg-gray-800/50 text-gray-600 dark:text-gray-300'}`}>
                    <Clock className="w-4 h-4 shrink-0 opacity-60" />
                    <div>
                      <p className={`text-[10px] font-semibold uppercase ${isOverdue(detailIncident) ? 'text-red-400' : 'text-gray-400'}`}>Fecha límite</p>
                      <p className="font-medium">{detailIncident.fechaLimite}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Description */}
              <div>
                <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Descripción</h4>
                <p className="text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 rounded-xl p-4 leading-relaxed whitespace-pre-wrap">
                  {detailIncident.descripcion || 'Sin descripción'}
                </p>
              </div>

              {/* Photos */}
              {detailIncident.fotos && detailIncident.fotos.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Fotos ({detailIncident.fotos.length})</h4>
                  <div className="flex gap-2 flex-wrap">
                    {detailIncident.fotos.map((foto, idx) => (
                      <div key={foto.id || idx} className="w-24 h-24 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800">
                        {foto.base64 ? (
                          <img src={`data:${foto.mimeType};base64,${foto.base64}`} alt="" className="w-full h-full object-cover" />
                        ) : foto.url ? (
                          <img src={foto.url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center"><Camera className="w-5 h-5 text-gray-400" /></div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Resolution */}
              {detailIncident.resolucion && (
                <div>
                  <h4 className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide mb-2">Resolución</h4>
                  <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4">
                    <p className="text-sm text-emerald-800 dark:text-emerald-300 leading-relaxed whitespace-pre-wrap">{detailIncident.resolucion}</p>
                    {detailIncident.resueltoPor && (
                      <p className="text-xs text-emerald-500 mt-2">
                        Resuelto por {detailIncident.resueltoPor}
                        {detailIncident.fechaResolucion && ` — ${new Date(detailIncident.fechaResolucion).toLocaleString('es-ES')}`}
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
                    <button onClick={() => setShowResolvePanel(false)} className="px-3 py-1.5 text-xs font-semibold text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
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

              {/* Reopen panel */}
              {showReopenPanel && (
                <div className="border-2 border-amber-300 dark:border-amber-700 rounded-xl p-4 bg-amber-50/50 dark:bg-amber-950/20">
                  <h4 className="text-sm font-bold text-amber-700 dark:text-amber-400 mb-2 flex items-center gap-2">
                    <RotateCcw className="w-4 h-4" /> Reabrir incidencia
                  </h4>
                  <textarea
                    value={reopenMotivo}
                    onChange={e => setReopenMotivo(e.target.value)}
                    rows={2}
                    placeholder="Motivo de la reapertura (opcional)..."
                    className="w-full px-3 py-2.5 bg-white dark:bg-gray-800 border border-amber-200 dark:border-amber-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40 resize-none mb-3"
                  />
                  <div className="flex items-center gap-2 justify-end">
                    <button onClick={() => setShowReopenPanel(false)} className="px-3 py-1.5 text-xs font-semibold text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
                      Cancelar
                    </button>
                    <button
                      onClick={() => handleReopen(detailIncident)}
                      className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Confirmar reapertura
                    </button>
                  </div>
                </div>
              )}

              {/* Status History / Timeline */}
              {detailIncident.historial && detailIncident.historial.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Historial</h4>
                  <div className="space-y-0">
                    {[...detailIncident.historial].reverse().map((entry, idx) => {
                      const actionColors: Record<string, string> = {
                        creada: 'bg-blue-500',
                        editada: 'bg-gray-400',
                        resuelta: 'bg-emerald-500',
                        reabierta: 'bg-amber-500',
                        cerrada: 'bg-gray-400',
                      };
                      return (
                        <div key={idx} className="flex items-start gap-3 py-2">
                          <div className="flex flex-col items-center">
                            <div className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${actionColors[entry.accion] || 'bg-gray-400'}`} />
                            {idx < detailIncident.historial.length - 1 && <div className="w-px flex-1 bg-gray-200 dark:bg-gray-700 min-h-[16px]" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-gray-700 dark:text-gray-300">
                              <span className="font-semibold capitalize">{entry.accion}</span>
                              {entry.usuario && <span className="text-gray-400"> por {entry.usuario}</span>}
                            </p>
                            <p className="text-[11px] text-gray-400 mt-0.5">
                              {new Date(entry.fecha).toLocaleString('es-ES')}
                            </p>
                            {entry.detalle && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 italic">{entry.detalle}</p>}
                          </div>
                        </div>
                      );
                    })}
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
