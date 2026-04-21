import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Layout } from '../../components/saas/Layout';
import { useModalClose } from '../../hooks/useModalClose';
import { useAuth } from '../../context/AuthContext';
import {
  Search, Plus, X, Edit3, Trash2, Filter, ClipboardList, Camera,
  HardHat, Building2, Clock, CheckCircle2, AlertTriangle, Zap,
  Image as ImageIcon, Eye,
} from 'lucide-react';
import type { ConstructionTask, TaskFoto, ConstructionWorker, ConstructionProject } from '../../lib/constructionApi';
import {
  listConstructionTasks, createConstructionTask, updateConstructionTask,
  deleteConstructionTask, listConstructionWorkers, listConstructionProjects,
} from '../../lib/constructionApi';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';
import { toast } from 'sonner';

const PRIORIDADES = [
  { id: 'baja', label: 'Baja', color: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300', icon: Clock },
  { id: 'media', label: 'Media', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', icon: Clock },
  { id: 'alta', label: 'Alta', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400', icon: AlertTriangle },
  { id: 'urgente', label: 'Urgente', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', icon: Zap },
];

const ESTADOS = [
  { id: 'pendiente', label: 'Pendiente', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
  { id: 'en_progreso', label: 'En progreso', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  { id: 'completada', label: 'Completada', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  { id: 'cancelada', label: 'Cancelada', color: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' },
];

const GREMIOS = ['carpintería', 'peletería', 'lampistería', 'pradurista', 'yesero', 'pintor', 'herrero', 'electricista', 'fontanero', 'albañil', 'otro'];

const emptyForm = {
  titulo: '', descripcion: '', obraId: '', obraNombre: '', trabajadorId: '', trabajadorNombre: '',
  gremio: '', prioridad: 'media', estado: 'pendiente', fechaLimite: '', notasAdmin: '',
};

export function ConstructionTasks() {
  const { user } = useAuth();
  const userId = user?.user_id || user?.id || '';

  const [tasks, setTasks] = useState<ConstructionTask[]>([]);
  const [workers, setWorkers] = useState<ConstructionWorker[]>([]);
  const [projects, setProjects] = useState<ConstructionProject[]>([]);
  const [search, setSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState('todos');
  const [filterWorker, setFilterWorker] = useState('todos');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ConstructionTask | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [fotos, setFotos] = useState<TaskFoto[]>([]);
  const [loading, setLoading] = useState(true);

  const [viewTask, setViewTask] = useState<ConstructionTask | null>(null);
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'name', label: 'Nombre' },
    { key: 'project', label: 'Proyecto' },
    { key: 'assignee', label: 'Responsable' },
    { key: 'priority', label: 'Prioridad' },
    { key: 'deadline', label: 'Fecha límite' },
    { key: 'status', label: 'Estado' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'name', label: 'Nombre', required: true, example: '' },
    { key: 'project', label: 'Proyecto', example: '' },
    { key: 'assignee', label: 'Responsable', example: '' },
    { key: 'priority', label: 'Prioridad', example: '' },
    { key: 'deadline', label: 'Fecha límite', example: '' },
    { key: 'status', label: 'Estado', example: '' },
  ];

  const handleAIEntries = async (entries: Record<string, unknown>[]) => {
    toast.success(`${entries.length} tarea(s) parseado(s) con IA`);
  };

  const handleImportEntries = async (entries: Record<string, string>[]) => {
    toast.success(`${entries.length} tarea(s) importado(s)`);
  };

  const fotoInputRef = useRef<HTMLInputElement>(null);

  useModalClose(modalOpen, () => setModalOpen(false));
  useModalClose(!!viewTask, () => setViewTask(null));

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const [t, w, p] = await Promise.all([
        listConstructionTasks(userId),
        listConstructionWorkers(userId),
        listConstructionProjects(userId),
      ]);
      setTasks(t); setWorkers(w); setProjects(p);
    } catch { /* silently fail */ }
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => tasks.filter(t => {
    const q = `${t.titulo} ${t.trabajadorNombre} ${t.obraNombre} ${t.gremio}`.toLowerCase();
    const matchSearch = q.includes(search.toLowerCase());
    const matchEstado = filterEstado === 'todos' || t.estado === filterEstado;
    const matchWorker = filterWorker === 'todos' || t.trabajadorId === filterWorker;
    return matchSearch && matchEstado && matchWorker;
  }), [tasks, search, filterEstado, filterWorker]);

  const stats = useMemo(() => ({
    pendientes: tasks.filter(t => t.estado === 'pendiente').length,
    enProgreso: tasks.filter(t => t.estado === 'en_progreso').length,
    completadas: tasks.filter(t => t.estado === 'completada').length,
    total: tasks.length,
  }), [tasks]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFotos([]);
    setModalOpen(true);
  };

  const openEdit = (t: ConstructionTask) => {
    setEditing(t);
    setForm({
      titulo: t.titulo, descripcion: t.descripcion, obraId: t.obraId, obraNombre: t.obraNombre,
      trabajadorId: t.trabajadorId, trabajadorNombre: t.trabajadorNombre,
      gremio: t.gremio, prioridad: t.prioridad, estado: t.estado,
      fechaLimite: t.fechaLimite, notasAdmin: t.notasAdmin,
    });
    setFotos(t.fotos || []);
    setModalOpen(true);
  };

  const onWorkerChange = (workerId: string) => {
    const w = workers.find(wr => wr._id === workerId);
    setForm(prev => ({ ...prev, trabajadorId: workerId, trabajadorNombre: w?.nombre || '', gremio: w?.gremio || prev.gremio }));
  };

  const onProjectChange = (projectId: string) => {
    const p = projects.find(pr => pr._id === projectId);
    setForm(prev => ({ ...prev, obraId: projectId, obraNombre: p?.nombre || '' }));
  };

  const addFoto = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1] || '';
      setFotos(prev => [...prev, {
        id: `foto-${Date.now()}`,
        url: URL.createObjectURL(file),
        base64,
        mimeType: file.type || 'image/jpeg',
        descripcion: '',
        fecha: new Date().toISOString(),
      }]);
    };
    reader.readAsDataURL(file);
  };

  const removeFoto = (id: string) => setFotos(prev => prev.filter(f => f.id !== id));
  const updateFotoDesc = (id: string, desc: string) => setFotos(prev => prev.map(f => f.id === id ? { ...f, descripcion: desc } : f));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.titulo.trim() || !userId) return;
    try {
      const payload = { ...form, fotos };
      if (editing) {
        const updated = await updateConstructionTask(userId, { ...editing, ...payload } as ConstructionTask);
        setTasks(prev => prev.map(t => t._id === updated._id ? updated : t));
      } else {
        const created = await createConstructionTask(userId, payload);
        setTasks(prev => [created, ...prev]);
      }
      setModalOpen(false);
    } catch { /* silently fail */ }
  };

  const handleDelete = async (id: string) => {
    if (!userId) return;
    try { await deleteConstructionTask(userId, id); setTasks(prev => prev.filter(t => t._id !== id)); } catch { /* silently fail */ }
  };

  const handleStatusChange = async (task: ConstructionTask, newEstado: string) => {
    if (!userId) return;
    try {
      const updated = await updateConstructionTask(userId, { ...task, estado: newEstado } as ConstructionTask);
      setTasks(prev => prev.map(t => t._id === updated._id ? updated : t));
    } catch { /* silently fail */ }
  };

  const getPrioridadConfig = (p: string) => PRIORIDADES.find(pr => pr.id === p) || PRIORIDADES[1];
  const getEstadoConfig = (e: string) => ESTADOS.find(es => es.id === e) || ESTADOS[0];

  const inputClass = 'w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 dark:focus:border-gray-400 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100';
  const labelClass = 'block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5';

  if (loading) return <Layout title="Tareas de Obra"><div className="flex items-center justify-center py-20 text-gray-400">Cargando...</div></Layout>;

  return (
    <Layout title="Tareas de Obra">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Pendientes', value: stats.pendientes, icon: Clock, color: 'text-yellow-600' },
          { label: 'En progreso', value: stats.enProgreso, icon: ClipboardList, color: 'text-blue-600' },
          { label: 'Completadas', value: stats.completadas, icon: CheckCircle2, color: 'text-green-600' },
          { label: 'Total tareas', value: stats.total, icon: ClipboardList, color: 'text-purple-600' },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3 mb-2"><s.icon className={`w-5 h-5 ${s.color}`} /><span className="text-sm text-gray-500 dark:text-gray-400">{s.label}</span></div>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input type="text" placeholder="Buscar tareas..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none focus:border-gray-900 dark:focus:border-gray-400" />
        </div>
        <div className="flex gap-2 flex-wrap">
          <select value={filterEstado} onChange={e => setFilterEstado(e.target.value)} className="px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none text-sm">
            <option value="todos">Todos los estados</option>
            {ESTADOS.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
          </select>
          <select value={filterWorker} onChange={e => setFilterWorker(e.target.value)} className="px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none text-sm">
            <option value="todos">Todos los trabajadores</option>
            {workers.map(w => <option key={w._id} value={w._id}>{w.nombre}</option>)}
          </select>
          <AddButtonDropdown
                label="Nueva tarea"
                onQuickAdd={openCreate}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de tarea"
              />
        </div>
      </div>

      {/* Task cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map(t => {
          const prio = getPrioridadConfig(t.prioridad);
          const estado = getEstadoConfig(t.estado);
          const PrioIcon = prio.icon;
          return (
            <div key={t._id} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate">{t.titulo}</h3>
                  <div className="flex gap-2 mt-1 flex-wrap">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold ${prio.color}`}><PrioIcon className="w-3 h-3" />{prio.label}</span>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold ${estado.color}`}>{estado.label}</span>
                  </div>
                </div>
                <div className="flex gap-1 shrink-0 ml-2">
                  <button onClick={() => setViewTask(t)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"><Eye className="w-4 h-4 text-gray-500" /></button>
                  <button onClick={() => openEdit(t)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"><Edit3 className="w-4 h-4 text-gray-500" /></button>
                  <button onClick={() => handleDelete(t._id)} className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"><Trash2 className="w-4 h-4 text-red-500" /></button>
                </div>
              </div>

              {t.descripcion && <p className="text-sm text-gray-600 dark:text-gray-300 mb-3 line-clamp-2">{t.descripcion}</p>}

              <div className="space-y-1.5 text-sm text-gray-500 dark:text-gray-400">
                {t.trabajadorNombre && <p className="flex items-center gap-1.5"><HardHat className="w-3.5 h-3.5" />{t.trabajadorNombre}{t.gremio && <span className="text-xs capitalize">({t.gremio})</span>}</p>}
                {t.obraNombre && <p className="flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5" />{t.obraNombre}</p>}
                {t.fechaLimite && <p className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" />Límite: {t.fechaLimite}</p>}
                {t.fotos && t.fotos.length > 0 && <p className="flex items-center gap-1.5"><ImageIcon className="w-3.5 h-3.5" />{t.fotos.length} foto{t.fotos.length > 1 ? 's' : ''}</p>}
              </div>

              {/* Fotos thumbnail */}
              {t.fotos && t.fotos.length > 0 && (
                <div className="flex gap-2 mt-3 overflow-x-auto">
                  {t.fotos.slice(0, 4).map(f => (
                    <div key={f.id} className="w-16 h-16 rounded-lg overflow-hidden shrink-0 border border-gray-200 dark:border-gray-700">
                      {f.base64 ? (
                        <img src={`data:${f.mimeType};base64,${f.base64}`} alt={f.descripcion} className="w-full h-full object-cover" />
                      ) : f.url ? (
                        <img src={f.url} alt={f.descripcion} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center"><ImageIcon className="w-6 h-6 text-gray-400" /></div>
                      )}
                    </div>
                  ))}
                  {t.fotos.length > 4 && <div className="w-16 h-16 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center shrink-0 text-sm font-bold text-gray-500">+{t.fotos.length - 4}</div>}
                </div>
              )}

              {/* Quick status change */}
              {t.estado !== 'completada' && t.estado !== 'cancelada' && (
                <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700/50 flex gap-2">
                  {t.estado === 'pendiente' && <button onClick={() => handleStatusChange(t, 'en_progreso')} className="flex-1 text-xs px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400 rounded-lg font-semibold transition-colors">Iniciar</button>}
                  {t.estado === 'en_progreso' && <button onClick={() => handleStatusChange(t, 'completada')} className="flex-1 text-xs px-3 py-2 bg-green-50 hover:bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400 rounded-lg font-semibold transition-colors">Completar</button>}
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && <div className="col-span-full text-center py-12 text-gray-400">No se encontraron tareas</div>}
      </div>

      {/* Modal crear / editar tarea */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setModalOpen(false)}>
          <form onSubmit={handleSave} className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{editing ? 'Editar tarea' : 'Nueva tarea'}</h2>
              <button type="button" onClick={() => setModalOpen(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div><label className={labelClass}>Título de la tarea</label><input className={inputClass} value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })} required /></div>
              <div><label className={labelClass}>Descripción</label><textarea className={inputClass} rows={3} value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })} placeholder="Describe la faena que tiene que hacer el trabajador..." /></div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Trabajador asignado</label>
                  <select className={inputClass} value={form.trabajadorId} onChange={e => onWorkerChange(e.target.value)}>
                    <option value="">— Sin asignar —</option>
                    {workers.filter(w => w.activo).map(w => <option key={w._id} value={w._id}>{w.nombre} ({w.gremio})</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Obra</label>
                  <select className={inputClass} value={form.obraId} onChange={e => onProjectChange(e.target.value)}>
                    <option value="">— Sin obra —</option>
                    {projects.map(p => <option key={p._id} value={p._id}>{p.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Prioridad</label>
                  <select className={inputClass} value={form.prioridad} onChange={e => setForm({ ...form, prioridad: e.target.value })}>
                    {PRIORIDADES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                </div>
                <div><label className={labelClass}>Fecha límite</label><input type="date" className={inputClass} value={form.fechaLimite} onChange={e => setForm({ ...form, fechaLimite: e.target.value })} /></div>
                <div>
                  <label className={labelClass}>Estado</label>
                  <select className={inputClass} value={form.estado} onChange={e => setForm({ ...form, estado: e.target.value })}>
                    {ESTADOS.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Gremio</label>
                  <select className={inputClass} value={form.gremio} onChange={e => setForm({ ...form, gremio: e.target.value })}>
                    <option value="">— Sin gremio —</option>
                    {GREMIOS.map(g => <option key={g} value={g}>{g.charAt(0).toUpperCase() + g.slice(1)}</option>)}
                  </select>
                </div>
              </div>

              {/* Fotos */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Fotos de la tarea</label>
                  <button type="button" onClick={() => fotoInputRef.current?.click()} className="text-sm font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 flex items-center gap-1"><Camera className="w-4 h-4" />Añadir foto</button>
                  <input ref={fotoInputRef} type="file" accept="image/*" multiple onChange={e => { const files = e.target.files; if (files) Array.from(files).forEach(addFoto); e.target.value = ''; }} className="hidden" />
                </div>
                {fotos.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {fotos.map(f => (
                      <div key={f.id} className="relative group rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700">
                        <div className="aspect-square">
                          {f.base64 ? (
                            <img src={`data:${f.mimeType};base64,${f.base64}`} alt="" className="w-full h-full object-cover" />
                          ) : f.url ? (
                            <img src={f.url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center"><ImageIcon className="w-8 h-8 text-gray-400" /></div>
                          )}
                        </div>
                        <button type="button" onClick={() => removeFoto(f.id)} className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"><X className="w-3 h-3" /></button>
                        <input
                          className="w-full px-2 py-1.5 text-xs border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 outline-none"
                          placeholder="Descripción..."
                          value={f.descripcion}
                          onChange={e => updateFotoDesc(f.id, e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                )}
                {fotos.length === 0 && (
                  <div className="border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-6 text-center cursor-pointer hover:border-blue-400 transition-colors" onClick={() => fotoInputRef.current?.click()}>
                    <Camera className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">Sube fotos para que el trabajador vea qué tiene que hacer</p>
                  </div>
                )}
              </div>

              <div><label className={labelClass}>Notas del administrador</label><textarea className={inputClass} rows={2} value={form.notasAdmin} onChange={e => setForm({ ...form, notasAdmin: e.target.value })} placeholder="Instrucciones adicionales para el trabajador..." /></div>
            </div>
            <div className="sticky bottom-0 bg-white dark:bg-gray-800 flex gap-3 p-6 border-t border-gray-200 dark:border-gray-700 rounded-b-2xl">
              <button type="button" onClick={() => setModalOpen(false)} className="flex-1 px-4 py-3 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">Cancelar</button>
              <button type="submit" className="flex-1 px-4 py-3 bg-gray-900 hover:bg-black dark:bg-gray-100 dark:hover:bg-white text-white dark:text-gray-900 rounded-xl font-semibold transition-colors">Guardar tarea</button>
            </div>
          </form>
        </div>
      )}

      {/* Modal vista detalle tarea */}
      {viewTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setViewTask(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{viewTask.titulo}</h2>
                <div className="flex gap-2 mt-1">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold ${getPrioridadConfig(viewTask.prioridad).color}`}>{getPrioridadConfig(viewTask.prioridad).label}</span>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold ${getEstadoConfig(viewTask.estado).color}`}>{getEstadoConfig(viewTask.estado).label}</span>
                </div>
              </div>
              <button onClick={() => setViewTask(null)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-6 space-y-4">
              {viewTask.descripcion && <p className="text-gray-700 dark:text-gray-200">{viewTask.descripcion}</p>}

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3"><div className="text-xs text-gray-500 mb-1">Trabajador</div><div className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-1"><HardHat className="w-3.5 h-3.5" />{viewTask.trabajadorNombre || '—'}</div></div>
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3"><div className="text-xs text-gray-500 mb-1">Obra</div><div className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-1"><Building2 className="w-3.5 h-3.5" />{viewTask.obraNombre || '—'}</div></div>
                {viewTask.gremio && <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3"><div className="text-xs text-gray-500 mb-1">Gremio</div><div className="font-semibold text-gray-900 dark:text-gray-100 capitalize">{viewTask.gremio}</div></div>}
                {viewTask.fechaLimite && <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3"><div className="text-xs text-gray-500 mb-1">Fecha límite</div><div className="font-semibold text-gray-900 dark:text-gray-100">{viewTask.fechaLimite}</div></div>}
              </div>

              {viewTask.notasAdmin && (
                <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl text-sm text-amber-800 dark:text-amber-300">
                  <strong>Notas del responsable:</strong> {viewTask.notasAdmin}
                </div>
              )}

              {viewTask.fotos && viewTask.fotos.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Fotos ({viewTask.fotos.length})</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {viewTask.fotos.map(f => (
                      <div key={f.id} className="rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700">
                        <div className="aspect-square">
                          {f.base64 ? (
                            <img src={`data:${f.mimeType};base64,${f.base64}`} alt={f.descripcion} className="w-full h-full object-cover" />
                          ) : f.url ? (
                            <img src={f.url} alt={f.descripcion} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center"><ImageIcon className="w-8 h-8 text-gray-400" /></div>
                          )}
                        </div>
                        {f.descripcion && <p className="px-2 py-1.5 text-xs text-gray-600 dark:text-gray-300 border-t border-gray-200 dark:border-gray-700">{f.descripcion}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {viewTask.creadoPorNombre && <p className="text-xs text-gray-400">Creada por {viewTask.creadoPorNombre}</p>}
            </div>
          </div>
        </div>
      )}
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="construction_tasks"
        moduleLabel="Tareas"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Tareas"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
