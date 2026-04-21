import { useState, useMemo, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { useModalClose } from '../../hooks/useModalClose';
import {
  ArrowLeft, Building2, MapPin, Calendar, Clock, HardHat, Edit3, Trash2,
  Plus, X, CheckCircle2, AlertTriangle, Users, UserCircle, FileText,
  TrendingUp, Banknote, Receipt, ChevronDown, ChevronRight,
  Upload, Eye, Activity, Send, Calculator, Lock, XCircle, GripVertical,
  Briefcase, ClipboardList, BarChart3, Package, Wrench,
} from 'lucide-react';
import type {
  ConstructionProject, ConstructionClient, ConstructionWorker, ConstructionBudget,
  ConstructionTask, ConstructionObraDocument, ConstructionIncident,
  EstadoObra, ObraFase, ObraTrabajadorAsignado, ObraPagoInterno, ObraActividad,
  EstadoFase,
} from '../../lib/constructionApi';
import {
  listConstructionProjects, updateConstructionProject, deleteConstructionProject,
  listConstructionClients, listConstructionWorkers, listConstructionBudgets,
  listConstructionTasks, listObraDocuments, listConstructionIncidents,
  createObraDocument, deleteObraDocument,
  ESTADO_OBRA_CONFIG, ESTADO_OBRA_TRANSICIONES, normalizeEstadoObra,
  FASES_POR_DEFECTO,
  getPaymentsByProject,
  PAYMENT_STATUS_CONFIG,
} from '../../lib/constructionApi';
import type { ConstructionPayment, PaymentProjectSummary } from '../../lib/constructionApi';

const fmt = (n: number) => (n || 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

function timeAgo(dateStr: string): string {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `hace ${days}d`;
  return fmtDate(dateStr);
}

const ESTADO_ICONS: Record<EstadoObra, typeof Clock> = {
  borrador: Edit3, presupuesto_en_preparacion: Calculator, presupuesto_enviado: Send,
  presupuesto_aceptado: CheckCircle2, pendiente_de_planificacion: Clock, en_ejecucion: HardHat,
  pendiente_de_cobro: Banknote, finalizada: CheckCircle2, cerrada: Lock, cancelada: XCircle,
};

const FASE_ESTADO_CONFIG: Record<EstadoFase, { label: string; color: string; bg: string }> = {
  pendiente:   { label: 'Pendiente',   color: 'text-gray-600 dark:text-gray-400',  bg: 'bg-gray-100 dark:bg-gray-700' },
  en_curso:    { label: 'En curso',    color: 'text-blue-700 dark:text-blue-400',   bg: 'bg-blue-100 dark:bg-blue-900/30' },
  completada:  { label: 'Completada',  color: 'text-green-700 dark:text-green-400', bg: 'bg-green-100 dark:bg-green-900/30' },
  bloqueada:   { label: 'Bloqueada',   color: 'text-red-700 dark:text-red-400',     bg: 'bg-red-100 dark:bg-red-900/30' },
};

type TabId = 'general' | 'fases' | 'equipo' | 'economia' | 'documentos' | 'actividad' | 'alertas';

const TABS: { id: TabId; label: string; icon: typeof Building2 }[] = [
  { id: 'general', label: 'General', icon: Building2 },
  { id: 'fases', label: 'Fases', icon: ClipboardList },
  { id: 'equipo', label: 'Equipo', icon: Users },
  { id: 'economia', label: 'Economía', icon: BarChart3 },
  { id: 'documentos', label: 'Documentos', icon: FileText },
  { id: 'actividad', label: 'Actividad', icon: Activity },
  { id: 'alertas', label: 'Alertas', icon: AlertTriangle },
];

export function ConstructionProjectDetail() {
  const { id: projectId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = user?.user_id || user?.id || '';
  const isWorker = user?.role === 'worker' || user?.role === 'trabajador';

  const [project, setProject] = useState<ConstructionProject | null>(null);
  const [clients, setClients] = useState<ConstructionClient[]>([]);
  const [workers, setWorkers] = useState<ConstructionWorker[]>([]);
  const [budgets, setBudgets] = useState<ConstructionBudget[]>([]);
  const [tasks, setTasks] = useState<ConstructionTask[]>([]);
  const [documents, setDocuments] = useState<ConstructionObraDocument[]>([]);
  const [incidents, setIncidents] = useState<ConstructionIncident[]>([]);
  const [obraPayments, setObraPayments] = useState<ConstructionPayment[]>([]);
  const [paymentSummary, setPaymentSummary] = useState<PaymentProjectSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>('general');
  const [statusModal, setStatusModal] = useState(false);
  const [faseModal, setFaseModal] = useState<ObraFase | null>(null);
  const [workerModal, setWorkerModal] = useState(false);
  const [pagoModal, setPagoModal] = useState(false);

  useModalClose(statusModal, () => setStatusModal(false));
  useModalClose(!!faseModal, () => setFaseModal(null));
  useModalClose(workerModal, () => setWorkerModal(false));
  useModalClose(pagoModal, () => setPagoModal(false));

  const load = useCallback(async () => {
    if (!userId || !projectId) return;
    try {
      const [projects, c, w, b, t, docs, inc] = await Promise.all([
        listConstructionProjects(userId),
        listConstructionClients(userId),
        listConstructionWorkers(userId),
        listConstructionBudgets(userId),
        listConstructionTasks(userId, { projectId }),
        listObraDocuments(userId, { obraId: projectId }),
        listConstructionIncidents(userId, { projectId }),
      ]);
      const p = projects.find(pr => pr._id === projectId);
      if (p) setProject(p);
      setClients(c); setWorkers(w); setBudgets(b); setTasks(t); setDocuments(docs); setIncidents(inc);
      try {
        const pData = await getPaymentsByProject(userId, projectId);
        setObraPayments(pData.payments); setPaymentSummary(pData.summary);
      } catch { /* payments module may not be available yet */ }
    } catch { /* silent */ }
    setLoading(false);
  }, [userId, projectId]);

  useEffect(() => { load(); }, [load]);

  const estado = project ? normalizeEstadoObra(project.estado) : 'borrador';
  const cfg = ESTADO_OBRA_CONFIG[estado];
  const EstadoIcon = ESTADO_ICONS[estado];
  const presup = project ? (project.presupuestoTotal || project.importeTotal || 0) : 0;
  const cobrado = project?.totalCobrado || 0;
  const costes = project?.costesReales || project?.costeAcumulado || 0;
  const rentabilidad = presup > 0 ? ((presup - costes) / presup) * 100 : 0;
  const linkedBudget = budgets.find(b => b.proyectoId === projectId || b._id === project?.presupuestoId);
  const fases = project?.fases || [];
  const trabajadores = project?.trabajadores || [];
  const actividad = [...(project?.actividad || [])].reverse();
  const pagosInternos = project?.pagosInternos || [];

  const alertas = useMemo(() => {
    if (!project) return [];
    const a: { tipo: string; mensaje: string; severidad: 'warning' | 'critical' }[] = [];
    if (!project.responsableId && estado !== 'borrador' && estado !== 'cancelada' && estado !== 'cerrada')
      a.push({ tipo: 'sin_responsable', mensaje: 'Esta obra no tiene responsable asignado', severidad: 'warning' });
    if (estado === 'pendiente_de_planificacion' && fases.length === 0)
      a.push({ tipo: 'sin_planificacion', mensaje: 'Obra pendiente de planificación sin fases definidas', severidad: 'warning' });
    if (presup > 0 && costes > presup * 1.1)
      a.push({ tipo: 'costes_disparados', mensaje: `Costes (${fmt(costes)}) superan el presupuesto en un ${Math.round(((costes / presup) - 1) * 100)}%`, severidad: 'critical' });
    if (incidents.filter(i => i.estado === 'abierta' && (i.prioridad === 'critica' || i.prioridad === 'alta')).length > 0)
      a.push({ tipo: 'incidencia_critica', mensaje: `${incidents.filter(i => i.estado === 'abierta').length} incidencia(s) abiertas de alta prioridad`, severidad: 'critical' });
    return a;
  }, [project, estado, fases, presup, costes, incidents]);

  const visibleTabs = isWorker
    ? TABS.filter(t => !['economia', 'alertas'].includes(t.id))
    : TABS;

  const changeStatus = async (nuevoEstado: EstadoObra) => {
    if (!project || !userId) return;
    try {
      const act: ObraActividad = {
        id: Date.now().toString(),
        tipo: 'estado_cambio',
        descripcion: `Estado cambiado de "${ESTADO_OBRA_CONFIG[estado].label}" a "${ESTADO_OBRA_CONFIG[nuevoEstado].label}"`,
        usuario: user?.fullName || user?.firstName || 'Sistema',
        fecha: new Date().toISOString(),
      };
      const updated = await updateConstructionProject(userId, {
        ...project,
        estado: nuevoEstado,
        actividad: [...(project.actividad || []), act],
      });
      setProject(updated);
      setStatusModal(false);
    } catch { /* silent */ }
  };

  const addFase = async (fase: Omit<ObraFase, 'id'>) => {
    if (!project || !userId) return;
    const newFase: ObraFase = { ...fase, id: Date.now().toString() };
    const act: ObraActividad = {
      id: Date.now().toString() + '_a',
      tipo: 'fase',
      descripcion: `Fase "${fase.nombre}" añadida`,
      usuario: user?.fullName || user?.firstName || 'Sistema',
      fecha: new Date().toISOString(),
    };
    try {
      const updated = await updateConstructionProject(userId, {
        ...project,
        fases: [...(project.fases || []), newFase],
        actividad: [...(project.actividad || []), act],
      });
      setProject(updated);
      setFaseModal(null);
    } catch { /* silent */ }
  };

  const updateFase = async (faseId: string, data: Partial<ObraFase>) => {
    if (!project || !userId) return;
    const newFases = (project.fases || []).map(f => f.id === faseId ? { ...f, ...data } : f);
    const progresoGlobal = newFases.length > 0 ? Math.round(newFases.reduce((s, f) => s + f.progreso, 0) / newFases.length) : project.progreso;
    try {
      const updated = await updateConstructionProject(userId, {
        ...project,
        fases: newFases,
        progreso: progresoGlobal,
      });
      setProject(updated);
    } catch { /* silent */ }
  };

  const removeFase = async (faseId: string) => {
    if (!project || !userId) return;
    try {
      const updated = await updateConstructionProject(userId, {
        ...project,
        fases: (project.fases || []).filter(f => f.id !== faseId),
      });
      setProject(updated);
    } catch { /* silent */ }
  };

  const loadDefaultFases = async () => {
    if (!project || !userId) return;
    const newFases = FASES_POR_DEFECTO.map((f, i) => ({ ...f, id: `${Date.now()}_${i}` }));
    try {
      const updated = await updateConstructionProject(userId, {
        ...project,
        fases: [...(project.fases || []), ...newFases],
      });
      setProject(updated);
    } catch { /* silent */ }
  };

  const assignWorker = async (workerId: string) => {
    if (!project || !userId) return;
    const w = workers.find(wr => wr._id === workerId);
    if (!w || (project.trabajadores || []).some(t => t.trabajadorId === workerId)) return;
    const newTrab: ObraTrabajadorAsignado = {
      trabajadorId: w._id, trabajadorNombre: w.nombre,
      rol: 'Operario', gremio: w.gremio, fechaAsignacion: new Date().toISOString().slice(0, 10),
    };
    const act: ObraActividad = {
      id: Date.now().toString(),
      tipo: 'trabajador',
      descripcion: `Trabajador "${w.nombre}" asignado a la obra`,
      usuario: user?.fullName || user?.firstName || 'Sistema',
      fecha: new Date().toISOString(),
    };
    try {
      const updated = await updateConstructionProject(userId, {
        ...project,
        trabajadores: [...(project.trabajadores || []), newTrab],
        actividad: [...(project.actividad || []), act],
      });
      setProject(updated);
      setWorkerModal(false);
    } catch { /* silent */ }
  };

  const removeWorker = async (trabajadorId: string) => {
    if (!project || !userId) return;
    const w = (project.trabajadores || []).find(t => t.trabajadorId === trabajadorId);
    const act: ObraActividad = {
      id: Date.now().toString(),
      tipo: 'trabajador',
      descripcion: `Trabajador "${w?.trabajadorNombre || ''}" desasignado de la obra`,
      usuario: user?.fullName || user?.firstName || 'Sistema',
      fecha: new Date().toISOString(),
    };
    try {
      const updated = await updateConstructionProject(userId, {
        ...project,
        trabajadores: (project.trabajadores || []).filter(t => t.trabajadorId !== trabajadorId),
        actividad: [...(project.actividad || []), act],
      });
      setProject(updated);
    } catch { /* silent */ }
  };

  const addPagoInterno = async (pago: Omit<ObraPagoInterno, 'id'>) => {
    if (!project || !userId) return;
    const newPago: ObraPagoInterno = { ...pago, id: Date.now().toString() };
    const newCostes = [...(project.pagosInternos || []), newPago].reduce((s, p) => s + p.importe, 0);
    try {
      const updated = await updateConstructionProject(userId, {
        ...project,
        pagosInternos: [...(project.pagosInternos || []), newPago],
        costesReales: newCostes,
      });
      setProject(updated);
      setPagoModal(false);
    } catch { /* silent */ }
  };

  const handleDeleteProject = async () => {
    if (!project || !userId || !confirm('¿Eliminar esta obra permanentemente?')) return;
    try {
      await deleteConstructionProject(userId, project._id);
      navigate('/saas/construction-projects');
    } catch { /* silent */ }
  };

  const handleUploadDoc = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId || !projectId || !project) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = (reader.result as string).split(',')[1];
      try {
        await createObraDocument(userId, {
          obraId: projectId,
          obraNombre: project.nombre,
          nombre: file.name,
          categoria: 'otro',
          descripcion: '',
          estado: 'vigente',
          fechaEmision: new Date().toISOString().slice(0, 10),
          fechaCaducidad: '',
          obligatorio: false,
          archivoUrl: '',
          archivoBase64: base64,
          archivoMimeType: file.type,
          archivoNombre: file.name,
          notas: '',
        });
        load();
      } catch { /* silent */ }
    };
    reader.readAsDataURL(file);
  };

  const inputClass = 'w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 dark:focus:border-gray-400 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100';
  const labelClass = 'block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5';

  if (loading) return <Layout title="Ficha de obra"><div className="flex items-center justify-center py-20 text-gray-400">Cargando...</div></Layout>;
  if (!project) return <Layout title="Obra no encontrada"><div className="flex flex-col items-center justify-center py-20"><Building2 className="w-12 h-12 text-gray-300 mb-3" /><p className="text-gray-500">Obra no encontrada</p><button onClick={() => navigate('/saas/construction-projects')} className="mt-4 text-sm text-amber-600 hover:underline">Volver al listado</button></div></Layout>;

  return (
    <Layout title={project.nombre}>
      {/* Cabecera */}
      <div className="mb-6">
        <button onClick={() => navigate('/saas/construction-projects')} className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 mb-3 transition-colors">
          <ArrowLeft className="w-4 h-4" />Obras activas
        </button>

        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-2xl bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                <Building2 className="w-7 h-7 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{project.nombre}</h1>
                <div className="flex flex-wrap items-center gap-3 mt-1.5 text-sm text-gray-500 dark:text-gray-400">
                  <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{project.ciudad || project.ubicacion || 'Sin ubicación'}</span>
                  {project.clienteNombre && <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" />{project.clienteNombre}</span>}
                  <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{fmtDate(project.fechaInicio)} — {fmtDate(project.fechaFinPrevista)}</span>
                </div>
                {project.responsableNombre && (
                  <p className="text-sm text-gray-600 dark:text-gray-300 mt-1 flex items-center gap-1"><UserCircle className="w-4 h-4" />Responsable: <strong>{project.responsableNombre}</strong></p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => setStatusModal(true)} className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold ${cfg.bg} ${cfg.color} hover:opacity-80 transition-opacity`}>
                <EstadoIcon className="w-4 h-4" />{cfg.label}<ChevronDown className="w-3.5 h-3.5" />
              </button>
              {!isWorker && (
                <button onClick={handleDeleteProject} className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors" title="Eliminar">
                  <Trash2 className="w-4 h-4 text-red-500" />
                </button>
              )}
            </div>
          </div>

          {/* Alertas banner */}
          {alertas.filter(a => a.severidad === 'critical').length > 0 && (
            <div className="mt-4 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              {alertas.filter(a => a.severidad === 'critical').map((a, i) => (
                <p key={i} className="flex items-center gap-2 text-sm text-red-700 dark:text-red-400 font-medium">
                  <AlertTriangle className="w-4 h-4 shrink-0" />{a.mensaje}
                </p>
              ))}
            </div>
          )}

          {/* KPIs rapidos */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-5">
            {[
              { label: 'Presupuesto', value: presup ? fmt(presup) : '—', color: 'text-gray-900 dark:text-gray-100' },
              { label: 'Coste real', value: costes ? fmt(costes) : '—', color: costes > presup && presup > 0 ? 'text-red-600' : 'text-gray-900 dark:text-gray-100' },
              { label: 'Rentabilidad', value: presup > 0 ? `${rentabilidad.toFixed(1)}%` : '—', color: rentabilidad >= 10 ? 'text-emerald-600' : rentabilidad >= 0 ? 'text-amber-600' : 'text-red-600' },
              { label: 'Cobrado', value: cobrado ? fmt(cobrado) : '—', color: 'text-emerald-600' },
              { label: 'Progreso', value: `${project.progreso || 0}%`, color: 'text-blue-600' },
              { label: 'Días', value: project.fechaInicio ? `${Math.max(0, Math.floor((Date.now() - new Date(project.fechaInicio).getTime()) / 86400000))}` : '—', color: 'text-gray-900 dark:text-gray-100' },
            ].map(k => (
              <div key={k.label} className="text-center p-3 rounded-xl bg-gray-50 dark:bg-gray-900/40">
                <p className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-0.5">{k.label}</p>
                <p className={`text-lg font-bold ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 overflow-x-auto pb-1">
        {visibleTabs.map(tab => {
          const TabIcon = tab.icon;
          const isActive = activeTab === tab.id;
          const badge = tab.id === 'alertas' ? alertas.length : tab.id === 'equipo' ? trabajadores.length : tab.id === 'fases' ? fases.length : tab.id === 'documentos' ? documents.length : 0;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${isActive ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
              <TabIcon className="w-4 h-4" />{tab.label}
              {badge > 0 && <span className={`ml-1 px-1.5 py-0.5 text-[10px] font-bold rounded-full ${isActive ? 'bg-white/20 text-white dark:bg-gray-900/20 dark:text-gray-900' : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>{badge}</span>}
            </button>
          );
        })}
      </div>

      {/* Tab: General */}
      {activeTab === 'general' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 space-y-4">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2"><Building2 className="w-4 h-4 text-gray-400" />Información general</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                ['Tipo de obra', project.tipoObra],
                ['Dirección', project.direccion || project.ubicacion || '—'],
                ['Ciudad', project.ciudad || '—'],
                ['Provincia', project.provincia || '—'],
                ['C.P.', project.codigoPostal || '—'],
                ['Cliente', project.clienteNombre || '—'],
                ['Responsable', project.responsableNombre || 'Sin asignar'],
                ['Fecha inicio', fmtDate(project.fechaInicio)],
                ['Fecha fin prev.', fmtDate(project.fechaFinPrevista)],
                ['Fecha fin real', project.fechaFinReal ? fmtDate(project.fechaFinReal) : '—'],
              ].map(([label, value]) => (
                <div key={label as string}>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
                  <p className="font-medium text-gray-900 dark:text-gray-100 capitalize">{value}</p>
                </div>
              ))}
            </div>
            {project.notas && (
              <div className="pt-3 border-t border-gray-100 dark:border-gray-700/50">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Notas</p>
                <p className="text-sm text-gray-700 dark:text-gray-300">{project.notas}</p>
              </div>
            )}
          </div>

          <div className="space-y-5">
            {/* Tareas vinculadas */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2 mb-3"><ClipboardList className="w-4 h-4 text-gray-400" />Tareas ({tasks.length})</h3>
              {tasks.length === 0 ? (
                <p className="text-sm text-gray-400">No hay tareas asignadas</p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {tasks.slice(0, 10).map(t => (
                    <div key={t._id} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700/50 last:border-0">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{t.titulo}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{t.trabajadorNombre || 'Sin asignar'} · {t.estado}</p>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${t.estado === 'completada' ? 'bg-green-100 text-green-700' : t.estado === 'en_progreso' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>{t.estado}</span>
                    </div>
                  ))}
                </div>
              )}
              <button onClick={() => navigate('/saas/construction-tasks')} className="mt-3 text-sm text-amber-600 hover:text-amber-700 font-medium flex items-center gap-1">Ver todas las tareas <ChevronRight className="w-3.5 h-3.5" /></button>
            </div>

            {/* Incidencias */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2 mb-3"><AlertTriangle className="w-4 h-4 text-gray-400" />Incidencias abiertas ({incidents.filter(i => i.estado === 'abierta' || i.estado === 'en_revision').length})</h3>
              {incidents.filter(i => i.estado === 'abierta' || i.estado === 'en_revision').length === 0 ? (
                <p className="text-sm text-gray-400">Sin incidencias abiertas</p>
              ) : (
                <div className="space-y-2">
                  {incidents.filter(i => i.estado === 'abierta' || i.estado === 'en_revision').slice(0, 5).map(inc => (
                    <div key={inc._id} className="flex items-center gap-2 py-2 border-b border-gray-100 dark:border-gray-700/50 last:border-0">
                      <AlertTriangle className={`w-4 h-4 shrink-0 ${inc.prioridad === 'critica' || inc.prioridad === 'alta' ? 'text-red-500' : 'text-amber-500'}`} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{inc.titulo || inc.descripcion}</p>
                        <p className="text-xs text-gray-500">{inc.tipo} · {inc.prioridad || inc.gravedad}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab: Fases */}
      {activeTab === 'fases' && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Fases de obra ({fases.length})</h3>
            <div className="flex gap-2">
              {fases.length === 0 && (
                <button onClick={loadDefaultFases} className="text-sm text-blue-600 hover:text-blue-700 font-medium">Cargar plantilla</button>
              )}
              <button onClick={() => setFaseModal({ id: '', nombre: '', orden: fases.length + 1, estado: 'pendiente', fechaInicio: '', fechaFin: '', progreso: 0, notas: '' })} className="flex items-center gap-1 px-3 py-1.5 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-lg text-sm font-medium">
                <Plus className="w-3.5 h-3.5" />Añadir fase
              </button>
            </div>
          </div>

          {fases.length === 0 ? (
            <div className="text-center py-12">
              <ClipboardList className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No hay fases definidas</p>
              <p className="text-sm text-gray-400 mt-1">Carga la plantilla por defecto o añade fases manualmente</p>
            </div>
          ) : (
            <div className="space-y-2">
              {[...fases].sort((a, b) => a.orden - b.orden).map((fase, idx) => {
                const fcfg = FASE_ESTADO_CONFIG[fase.estado] || FASE_ESTADO_CONFIG.pendiente;
                return (
                  <div key={fase.id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/20 transition-colors">
                    <GripVertical className="w-4 h-4 text-gray-300 shrink-0" />
                    <span className="w-7 h-7 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-xs font-bold text-gray-500">{idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 dark:text-gray-100 text-sm">{fase.nombre}</p>
                      {(fase.fechaInicio || fase.fechaFin) && <p className="text-xs text-gray-500">{fmtDate(fase.fechaInicio)} — {fmtDate(fase.fechaFin)}</p>}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="w-24 flex items-center gap-1.5">
                        <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${fase.progreso === 100 ? 'bg-green-500' : 'bg-blue-500'}`} style={{ width: `${fase.progreso}%` }} />
                        </div>
                        <span className="text-xs font-bold text-gray-500 w-7 text-right">{fase.progreso}%</span>
                      </div>
                      <select value={fase.estado} onChange={e => updateFase(fase.id, { estado: e.target.value as EstadoFase })} className={`px-2 py-1 rounded-lg text-xs font-semibold border-0 cursor-pointer ${fcfg.bg} ${fcfg.color}`}>
                        <option value="pendiente">Pendiente</option>
                        <option value="en_curso">En curso</option>
                        <option value="completada">Completada</option>
                        <option value="bloqueada">Bloqueada</option>
                      </select>
                      <input type="number" min={0} max={100} value={fase.progreso} onChange={e => updateFase(fase.id, { progreso: Number(e.target.value) })} className="w-14 px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs text-center" />
                      <button onClick={() => removeFase(fase.id)} className="p-1 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"><Trash2 className="w-3.5 h-3.5 text-red-500" /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab: Equipo */}
      {activeTab === 'equipo' && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Equipo asignado ({trabajadores.length})</h3>
            {!isWorker && <button onClick={() => setWorkerModal(true)} className="flex items-center gap-1 px-3 py-1.5 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-lg text-sm font-medium"><Plus className="w-3.5 h-3.5" />Asignar</button>}
          </div>

          {trabajadores.length === 0 ? (
            <div className="text-center py-12">
              <Users className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No hay trabajadores asignados</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {trabajadores.map(t => (
                <div key={t.trabajadorId} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 dark:border-gray-700/50">
                  <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                    <span className="text-sm font-bold text-blue-700 dark:text-blue-400">{t.trabajadorNombre.slice(0, 2).toUpperCase()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 dark:text-gray-100 text-sm truncate">{t.trabajadorNombre}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{t.gremio} · {t.rol}</p>
                  </div>
                  {!isWorker && <button onClick={() => removeWorker(t.trabajadorId)} className="p-1 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"><X className="w-3.5 h-3.5 text-red-500" /></button>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Economía */}
      {activeTab === 'economia' && !isWorker && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Presupuesto aprobado', value: fmt(presup), color: 'text-gray-900 dark:text-gray-100', bgIcon: 'bg-gray-100 dark:bg-gray-700', icon: Receipt },
              { label: 'Costes reales', value: fmt(costes), color: costes > presup && presup > 0 ? 'text-red-600' : 'text-gray-900 dark:text-gray-100', bgIcon: 'bg-orange-50 dark:bg-orange-900/30', icon: Package },
              { label: 'Margen', value: presup > 0 ? fmt(presup - costes) : '—', color: (presup - costes) >= 0 ? 'text-emerald-600' : 'text-red-600', bgIcon: 'bg-emerald-50 dark:bg-emerald-900/30', icon: TrendingUp },
              { label: 'Rentabilidad', value: presup > 0 ? `${rentabilidad.toFixed(1)}%` : '—', color: rentabilidad >= 10 ? 'text-emerald-600' : rentabilidad >= 0 ? 'text-amber-600' : 'text-red-600', bgIcon: rentabilidad >= 10 ? 'bg-emerald-50 dark:bg-emerald-900/30' : 'bg-red-50 dark:bg-red-900/30', icon: BarChart3 },
            ].map(k => (
              <div key={k.label} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
                <div className="flex items-center gap-2.5 mb-2">
                  <div className={`p-2 rounded-xl ${k.bgIcon}`}><k.icon className="w-4 h-4 text-gray-500" /></div>
                  <span className="text-xs text-gray-500 dark:text-gray-400">{k.label}</span>
                </div>
                <p className={`text-2xl font-bold ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>

          {/* Presupuesto vinculado */}
          {linkedBudget && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2 mb-3"><Receipt className="w-4 h-4 text-gray-400" />Presupuesto vinculado</h3>
              <div className="flex flex-wrap gap-6 text-sm">
                <div><p className="text-xs text-gray-500">Referencia</p><p className="font-semibold">{linkedBudget.referencia}</p></div>
                <div><p className="text-xs text-gray-500">Total</p><p className="font-semibold">{fmt(linkedBudget.totalConMargen)}</p></div>
                <div><p className="text-xs text-gray-500">Cobrado</p><p className="font-semibold text-emerald-600">{fmt(linkedBudget.totalPagado)}</p></div>
                <div><p className="text-xs text-gray-500">Pendiente</p><p className="font-semibold text-orange-600">{fmt(linkedBudget.pendientePago)}</p></div>
                <div><p className="text-xs text-gray-500">Estado</p><p className="font-semibold capitalize">{linkedBudget.estado}</p></div>
              </div>
              {linkedBudget.pagos?.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase">Plazos de cobro</p>
                  {linkedBudget.pagos.map(p => (
                    <div key={p.id} className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm ${p.pagado ? 'bg-green-50 dark:bg-green-900/20' : 'bg-gray-50 dark:bg-gray-900/30'}`}>
                      <span className="text-gray-700 dark:text-gray-300">{p.concepto}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{fmt(p.importe)}</span>
                        {p.pagado ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <Clock className="w-4 h-4 text-gray-400" />}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Pagos internos — datos reales */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2"><Banknote className="w-4 h-4 text-gray-400" />Pagos internos ({obraPayments.length})</h3>
              <a href="/saas/construction-payments" className="flex items-center gap-1 px-3 py-1.5 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-lg text-sm font-medium">Ver todos →</a>
            </div>
            {paymentSummary && (
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-500">Pactado</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-white">{fmt(paymentSummary.totalPactado)}</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-500">Pagado</p>
                  <p className="text-lg font-bold text-emerald-600">{fmt(paymentSummary.totalPagado)}</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-500">Pendiente</p>
                  <p className="text-lg font-bold text-amber-600">{fmt(paymentSummary.totalPendiente)}</p>
                </div>
              </div>
            )}
            {obraPayments.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">No hay pagos internos registrados</p>
            ) : (
              <div className="space-y-2">
                {obraPayments.slice(0, 8).map(p => (
                  <div key={p._id} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700/50 last:border-0 text-sm">
                    <div>
                      <p className="font-medium text-gray-900 dark:text-gray-100">{p.nombre}</p>
                      <p className="text-xs text-gray-500">{p.referencia} · {p.gremioNombre || p.proveedorNombre} · {PAYMENT_STATUS_CONFIG[p.estado]?.label || p.estado}</p>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-gray-900 dark:text-gray-100">{fmt(p.importePactado)}</span>
                      {p.pendiente > 0 && <p className="text-xs text-amber-500">Pend: {fmt(p.pendiente)}</p>}
                    </div>
                  </div>
                ))}
                {obraPayments.length > 8 && <p className="text-xs text-gray-400 text-center pt-2">+{obraPayments.length - 8} más...</p>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab: Documentos */}
      {activeTab === 'documentos' && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Documentos ({documents.length})</h3>
            <div className="flex items-center gap-2">
              <button onClick={() => navigate(`/saas/construction-documents?obraId=${projectId}`)} className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition">
                <FileText className="w-3.5 h-3.5" />Ver documentación completa
              </button>
              <label className="flex items-center gap-1 px-3 py-1.5 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-lg text-sm font-medium cursor-pointer">
                <Upload className="w-3.5 h-3.5" />Subir documento
                <input type="file" className="hidden" onChange={handleUploadDoc} accept=".pdf,.jpg,.jpeg,.png,.docx" />
              </label>
            </div>
          </div>

          {documents.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
              <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No hay documentos</p>
              <p className="text-sm text-gray-400 mt-1">Sube licencias, planos, contratos, fotos...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {documents.map(doc => (
                <div key={doc._id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/20 transition-colors">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                    <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 dark:text-gray-100 text-sm truncate">{doc.nombre}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{doc.categoria} · {fmtDate(doc.fechaEmision || doc.createdAt)}</p>
                  </div>
                  <button onClick={async () => { if (confirm('¿Eliminar?')) { await deleteObraDocument(userId, doc._id); load(); } }} className="p-1 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"><Trash2 className="w-3.5 h-3.5 text-red-500" /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Actividad */}
      {activeTab === 'actividad' && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-5">Historial de actividad</h3>
          {actividad.length === 0 && (project.historial || []).length === 0 ? (
            <div className="text-center py-12">
              <Activity className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">Sin actividad registrada</p>
            </div>
          ) : (
            <div className="space-y-0 relative">
              <div className="absolute left-5 top-0 bottom-0 w-px bg-gray-200 dark:bg-gray-700" />
              {[...actividad, ...(project.historial || []).map((h, i) => ({
                id: `hist_${i}`,
                tipo: 'nota' as const,
                descripcion: `${h.accion}: ${h.detalle}`,
                usuario: h.actor,
                fecha: h.fecha,
              }))].sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()).slice(0, 50).map((act, idx) => {
                const iconMap: Record<string, typeof Activity> = {
                  estado_cambio: ArrowLeft, documento: FileText, trabajador: Users, fase: ClipboardList,
                  pago: Banknote, cobro: Receipt, incidencia: AlertTriangle, creacion: Plus, edicion: Edit3, nota: Activity,
                };
                const ActIcon = iconMap[act.tipo] || Activity;
                return (
                  <div key={act.id || idx} className="relative pl-12 pb-4">
                    <div className="absolute left-3 w-5 h-5 rounded-full bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 flex items-center justify-center z-10">
                      <ActIcon className="w-2.5 h-2.5 text-gray-500" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-900 dark:text-gray-100">{act.descripcion}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{act.usuario} · {timeAgo(act.fecha)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab: Alertas */}
      {activeTab === 'alertas' && !isWorker && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-5">Alertas activas ({alertas.length})</h3>
          {alertas.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle2 className="w-10 h-10 text-green-300 mx-auto mb-3" />
              <p className="text-gray-500">Todo en orden, sin alertas activas</p>
            </div>
          ) : (
            <div className="space-y-3">
              {alertas.map((a, i) => (
                <div key={i} className={`flex items-start gap-3 p-4 rounded-xl border ${a.severidad === 'critical' ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20' : 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20'}`}>
                  <AlertTriangle className={`w-5 h-5 shrink-0 mt-0.5 ${a.severidad === 'critical' ? 'text-red-600' : 'text-amber-600'}`} />
                  <div>
                    <p className={`font-medium text-sm ${a.severidad === 'critical' ? 'text-red-800 dark:text-red-300' : 'text-amber-800 dark:text-amber-300'}`}>{a.mensaje}</p>
                    <p className="text-xs text-gray-500 mt-1 capitalize">{a.tipo.replace(/_/g, ' ')}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal: Cambiar estado */}
      {statusModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setStatusModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Cambiar estado</h2>
              <p className="text-sm text-gray-500 mt-1">Estado actual: <strong>{cfg.label}</strong></p>
            </div>
            <div className="p-5 space-y-2">
              {ESTADO_OBRA_TRANSICIONES[estado].length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">No hay transiciones disponibles desde este estado</p>
              ) : (
                ESTADO_OBRA_TRANSICIONES[estado].map(e => {
                  const eCfg = ESTADO_OBRA_CONFIG[e];
                  const EIcon = ESTADO_ICONS[e];
                  return (
                    <button key={e} onClick={() => changeStatus(e)} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500 transition-colors text-left`}>
                      <span className={`p-2 rounded-lg ${eCfg.bg}`}><EIcon className={`w-4 h-4 ${eCfg.color}`} /></span>
                      <span className="font-medium text-gray-900 dark:text-gray-100">{eCfg.label}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Añadir fase */}
      {faseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setFaseModal(null)}>
          <form onSubmit={e => { e.preventDefault(); addFase(faseModal); }} className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Añadir fase</h2>
            </div>
            <div className="p-5 space-y-3">
              <div><label className={labelClass}>Nombre</label><input className={inputClass} value={faseModal.nombre} onChange={e => setFaseModal({ ...faseModal, nombre: e.target.value })} required /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={labelClass}>Fecha inicio</label><input type="date" className={inputClass} value={faseModal.fechaInicio} onChange={e => setFaseModal({ ...faseModal, fechaInicio: e.target.value })} /></div>
                <div><label className={labelClass}>Fecha fin</label><input type="date" className={inputClass} value={faseModal.fechaFin} onChange={e => setFaseModal({ ...faseModal, fechaFin: e.target.value })} /></div>
              </div>
              <div><label className={labelClass}>Notas</label><textarea className={inputClass} rows={2} value={faseModal.notas} onChange={e => setFaseModal({ ...faseModal, notas: e.target.value })} /></div>
            </div>
            <div className="flex gap-3 p-5 border-t border-gray-200 dark:border-gray-700">
              <button type="button" onClick={() => setFaseModal(null)} className="flex-1 px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm font-medium">Cancelar</button>
              <button type="submit" className="flex-1 px-4 py-2.5 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-xl text-sm font-semibold">Guardar</button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Asignar trabajador */}
      {workerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setWorkerModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Asignar trabajador</h2>
              <button onClick={() => setWorkerModal(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-5 max-h-80 overflow-y-auto space-y-2">
              {workers.filter(w => w.activo && !(project?.trabajadores || []).some(t => t.trabajadorId === w._id)).map(w => (
                <button key={w._id} onClick={() => assignWorker(w._id)} className="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-600 transition-colors text-left">
                  <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-blue-700 dark:text-blue-400">{w.nombre.slice(0, 2).toUpperCase()}</span>
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 dark:text-gray-100 text-sm">{w.nombre}</p>
                    <p className="text-xs text-gray-500">{w.gremio} · {w.email}</p>
                  </div>
                </button>
              ))}
              {workers.filter(w => w.activo && !(project?.trabajadores || []).some(t => t.trabajadorId === w._id)).length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">No hay trabajadores disponibles</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Añadir pago interno */}
      {pagoModal && (
        <PagoInternoModal onClose={() => setPagoModal(false)} onSave={addPagoInterno} inputClass={inputClass} labelClass={labelClass} />
      )}
    </Layout>
  );
}

function PagoInternoModal({ onClose, onSave, inputClass, labelClass }: {
  onClose: () => void;
  onSave: (pago: Omit<ObraPagoInterno, 'id'>) => void;
  inputClass: string;
  labelClass: string;
}) {
  const [form, setForm] = useState({ concepto: '', importe: 0, fecha: new Date().toISOString().slice(0, 10), proveedor: '', tipo: 'material' as ObraPagoInterno['tipo'], pagado: true });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <form onSubmit={e => { e.preventDefault(); onSave(form); }} className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Registrar pago interno</h2>
        </div>
        <div className="p-5 space-y-3">
          <div><label className={labelClass}>Concepto</label><input className={inputClass} value={form.concepto} onChange={e => setForm({ ...form, concepto: e.target.value })} required /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelClass}>Importe (EUR)</label><input type="number" step="0.01" className={inputClass} value={form.importe} onChange={e => setForm({ ...form, importe: Number(e.target.value) })} required /></div>
            <div><label className={labelClass}>Fecha</label><input type="date" className={inputClass} value={form.fecha} onChange={e => setForm({ ...form, fecha: e.target.value })} /></div>
          </div>
          <div><label className={labelClass}>Proveedor</label><input className={inputClass} value={form.proveedor} onChange={e => setForm({ ...form, proveedor: e.target.value })} /></div>
          <div>
            <label className={labelClass}>Tipo</label>
            <select className={inputClass} value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value as ObraPagoInterno['tipo'] })}>
              <option value="material">Material</option>
              <option value="subcontratista">Subcontratista</option>
              <option value="maquinaria">Maquinaria</option>
              <option value="otro">Otro</option>
            </select>
          </div>
        </div>
        <div className="flex gap-3 p-5 border-t border-gray-200 dark:border-gray-700">
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm font-medium">Cancelar</button>
          <button type="submit" className="flex-1 px-4 py-2.5 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-xl text-sm font-semibold">Guardar</button>
        </div>
      </form>
    </div>
  );
}
