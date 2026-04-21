import { useState, useMemo, useCallback, useEffect } from 'react';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import { useModalClose } from '../../hooks/useModalClose';
import {
  Search, Plus, X, Edit3, Trash2, CheckSquare, Clock,
  AlertTriangle, Loader2, CheckCircle, Ban, ArrowUp,
  ArrowRight, ArrowDown, Truck, Hammer, Paintbrush, Wrench, UserCog,
  ListChecks, TrendingUp,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { toast } from 'sonner';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

type TaskStatus = 'pendiente' | 'en_proceso' | 'completado' | 'bloqueado';
type Priority = 'alta' | 'media' | 'baja';
type Category = 'transporte' | 'montaje' | 'decoracion' | 'tecnico' | 'personal';

interface LogisticsTask extends VerticalEntity {
  evento: string;
  tarea: string;
  responsable: string;
  fechaLimite: string;
  estado: TaskStatus;
  prioridad: Priority;
  categoria: Category;
}

type LogisticsForm = Omit<LogisticsTask, keyof VerticalEntity>;

interface EventRecord extends VerticalEntity {
  nombre: string;
  tipo: string;
  fecha: string;
  lugar: string;
  cliente: string;
  invitados: number;
  presupuesto: number;
  estado: string;
}

const STATUS_CONFIG: Record<TaskStatus, { label: string; bg: string; text: string; icon: React.ReactNode }> = {
  pendiente:  { label: 'Pendiente',   bg: 'bg-slate-100 dark:bg-slate-800',       text: 'text-slate-700 dark:text-slate-300', icon: <Clock className="w-3.5 h-3.5" /> },
  en_proceso: { label: 'En proceso',  bg: 'bg-blue-50 dark:bg-blue-900/30',       text: 'text-blue-700 dark:text-blue-300', icon: <Loader2 className="w-3.5 h-3.5" /> },
  completado: { label: 'Completado',  bg: 'bg-emerald-50 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-300', icon: <CheckCircle className="w-3.5 h-3.5" /> },
  bloqueado:  { label: 'Bloqueado',   bg: 'bg-red-50 dark:bg-red-900/30',         text: 'text-red-700 dark:text-red-300', icon: <Ban className="w-3.5 h-3.5" /> },
};

const PRIORITY_CONFIG: Record<Priority, { label: string; bg: string; text: string; icon: React.ReactNode }> = {
  alta:  { label: 'Alta',  bg: 'bg-red-50 dark:bg-red-900/30',    text: 'text-red-700 dark:text-red-300', icon: <ArrowUp className="w-3.5 h-3.5" /> },
  media: { label: 'Media', bg: 'bg-amber-50 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-300', icon: <ArrowRight className="w-3.5 h-3.5" /> },
  baja:  { label: 'Baja',  bg: 'bg-blue-50 dark:bg-blue-900/30',  text: 'text-blue-700 dark:text-blue-300', icon: <ArrowDown className="w-3.5 h-3.5" /> },
};

const CATEGORY_CONFIG: Record<Category, { label: string; bg: string; text: string; icon: React.ReactNode }> = {
  transporte:  { label: 'Transporte',  bg: 'bg-cyan-100 dark:bg-cyan-900/40',    text: 'text-cyan-700 dark:text-cyan-300', icon: <Truck className="w-3.5 h-3.5" /> },
  montaje:     { label: 'Montaje',     bg: 'bg-orange-100 dark:bg-orange-900/40', text: 'text-orange-700 dark:text-orange-300', icon: <Hammer className="w-3.5 h-3.5" /> },
  decoracion:  { label: 'Decoración',  bg: 'bg-pink-100 dark:bg-pink-900/40',    text: 'text-pink-700 dark:text-pink-300', icon: <Paintbrush className="w-3.5 h-3.5" /> },
  tecnico:     { label: 'Técnico',     bg: 'bg-indigo-100 dark:bg-indigo-900/40', text: 'text-indigo-700 dark:text-indigo-300', icon: <Wrench className="w-3.5 h-3.5" /> },
  personal:    { label: 'Personal',    bg: 'bg-emerald-100 dark:bg-emerald-900/40', text: 'text-emerald-700 dark:text-emerald-300', icon: <UserCog className="w-3.5 h-3.5" /> },
};

const EMPTY_FORM: LogisticsForm = { evento: '', tarea: '', responsable: '', fechaLimite: '', estado: 'pendiente', prioridad: 'media', categoria: 'montaje' };

export function EventsLogistics() {
  const { user } = useAuth();
  const api = useMemo(() => createVerticalApi<LogisticsTask>('events', 'logistics'), []);
  const eventsCatalogApi = useMemo(() => createVerticalApi<EventRecord>('events', 'events'), []);
  const userId = user?.user_id || user?.id || '';

  const [tasks, setTasks] = useState<LogisticsTask[]>([]);
  const [eventCatalog, setEventCatalog] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<TaskStatus | ''>('');
  const [filterPriority, setFilterPriority] = useState<Priority | ''>('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<LogisticsTask | null>(null);
  const [form, setForm] = useState<LogisticsForm>(EMPTY_FORM);
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const loadData = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [list, evs] = await Promise.all([api.list(userId), eventsCatalogApi.list(userId)]);
      setTasks(list);
      setEventCatalog(evs);
    } finally {
      setLoading(false);
    }
  }, [userId, api, eventsCatalogApi]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const eventOptions = useMemo(() => {
    const s = new Set<string>();
    eventCatalog.forEach(e => {
      if (e.nombre) s.add(e.nombre);
    });
    tasks.forEach(t => {
      if (t.evento) s.add(t.evento);
    });
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [eventCatalog, tasks]);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'name', label: 'Nombre' },
    { key: 'event', label: 'Evento' },
    { key: 'assignee', label: 'Responsable' },
    { key: 'deadline', label: 'Fecha' },
    { key: 'status', label: 'Estado' },
    { key: 'notes', label: 'Notas' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'name', label: 'Nombre', required: true, example: '' },
    { key: 'event', label: 'Evento', example: '' },
    { key: 'assignee', label: 'Responsable', example: '' },
    { key: 'deadline', label: 'Fecha', example: '' },
    { key: 'status', label: 'Estado', example: '' },
    { key: 'notes', label: 'Notas', example: '' },
  ];

  const handleAIEntries = async (entries: Record<string, unknown>[]) => {
    toast.success(`${entries.length} tarea(s) parseado(s) con IA`);
  };

  const handleImportEntries = async (entries: Record<string, string>[]) => {
    toast.success(`${entries.length} tarea(s) importado(s)`);
  };

  useModalClose(showModal, () => setShowModal(false));

  const filtered = useMemo(() => tasks.filter(t => {
    const ms = t.tarea.toLowerCase().includes(search.toLowerCase()) || t.evento.toLowerCase().includes(search.toLowerCase()) || t.responsable.toLowerCase().includes(search.toLowerCase());
    const mst = !filterStatus || t.estado === filterStatus;
    const mp = !filterPriority || t.prioridad === filterPriority;
    return ms && mst && mp;
  }), [tasks, search, filterStatus, filterPriority]);

  const stats = useMemo(() => {
    const pendientes = tasks.filter(t => t.estado === 'pendiente').length;
    const enProceso = tasks.filter(t => t.estado === 'en_proceso').length;
    const completadas = tasks.filter(t => t.estado === 'completado').length;
    const total = tasks.length;
    return { pendientes, enProceso, completadas, total };
  }, [tasks]);

  const progressPercent = stats.total ? Math.round((stats.completadas / stats.total) * 100) : 0;

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setShowModal(true); };
  const openEdit = (t: LogisticsTask) => {
    setEditing(t);
    setForm({
      evento: t.evento,
      tarea: t.tarea,
      responsable: t.responsable,
      fechaLimite: t.fechaLimite,
      estado: t.estado,
      prioridad: t.prioridad,
      categoria: t.categoria,
    });
    setShowModal(true);
  };

  const handleDelete = async (docId: string) => {
    if (!userId) return;
    try {
      await api.remove(userId, docId);
      await loadData();
    } catch {
      /* error from fetch */
    }
  };

  const toggleComplete = async (docId: string) => {
    if (!userId) return;
    const t = tasks.find(x => x._id === docId);
    if (!t) return;
    const nuevoEstado: TaskStatus = t.estado === 'completado' ? 'pendiente' : 'completado';
    try {
      await api.update(userId, docId, { estado: nuevoEstado });
      await loadData();
    } catch {
      /* error from fetch */
    }
  };

  const handleSave = async () => {
    if (!form.tarea || !form.evento || !userId) return;
    try {
      if (editing) {
        await api.update(userId, editing._id, form);
      } else {
        await api.create(userId, form);
      }
      await loadData();
      setShowModal(false);
    } catch {
      /* error from fetch */
    }
  };

  const statsCards = [
    { label: 'Pendientes', value: stats.pendientes, icon: <Clock className="w-5 h-5 text-slate-500" />, bg: 'bg-slate-50 dark:bg-slate-800/50' },
    { label: 'En proceso', value: stats.enProceso, icon: <Loader2 className="w-5 h-5 text-blue-500" />, bg: 'bg-blue-50 dark:bg-blue-900/30' },
    { label: 'Completadas', value: stats.completadas, icon: <CheckCircle className="w-5 h-5 text-emerald-500" />, bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
  ];

  return (
    <Layout title="Logística">
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {statsCards.map(s => (
            <div key={s.label} className={`${s.bg} rounded-xl p-4 flex items-center gap-4`}>
              <div className="p-2 bg-white dark:bg-gray-800 rounded-lg shadow-sm">{s.icon}</div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{s.value}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2"><ListChecks className="w-4 h-4" /> Progreso general</span>
            <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{progressPercent}%</span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
            <div className="bg-emerald-500 h-3 rounded-full transition-all duration-500" style={{ width: `${progressPercent}%` }} />
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{stats.completadas} de {stats.total} tareas completadas</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="relative flex-1 max-w-md w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar tarea, evento, responsable..." disabled={loading} className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as any)} disabled={loading} className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-300">
              <option value="">Todos los estados</option>
              {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select value={filterPriority} onChange={e => setFilterPriority(e.target.value as any)} disabled={loading} className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-300">
              <option value="">Todas las prioridades</option>
              {Object.entries(PRIORITY_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <AddButtonDropdown
                label="Nueva Tarea"
                onQuickAdd={openCreate}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de tarea"
              />
          </div>
        </div>

        <div className="space-y-2">
          {loading ? (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-12 text-center text-gray-500 dark:text-gray-400">
              <span className="inline-flex items-center justify-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                Cargando…
              </span>
            </div>
          ) : filtered.map(t => {
            const st = STATUS_CONFIG[t.estado];
            const pr = PRIORITY_CONFIG[t.prioridad];
            const cat = CATEGORY_CONFIG[t.categoria];
            const isComplete = t.estado === 'completado';
            return (
              <div key={t._id} className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-4 transition-all hover:shadow-md ${isComplete ? 'opacity-70' : ''}`}>
                <button type="button" onClick={() => void toggleComplete(t._id)} className={`shrink-0 w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-colors ${isComplete ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-gray-300 dark:border-gray-600 hover:border-blue-400'}`}>
                  {isComplete && <CheckCircle className="w-4 h-4" />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`font-medium text-sm ${isComplete ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-gray-100'}`}>{t.tarea}</span>
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium ${cat.bg} ${cat.text}`}>{cat.icon}{cat.label}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
                    <span>{t.evento}</span>
                    <span>·</span>
                    <span>{t.responsable}</span>
                    <span>·</span>
                    <span>{t.fechaLimite}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${pr.bg} ${pr.text}`}>{pr.icon}{pr.label}</span>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${st.bg} ${st.text}`}>{st.icon}{st.label}</span>
                  <button onClick={() => openEdit(t)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"><Edit3 className="w-4 h-4" /></button>
                  <button type="button" onClick={() => void handleDelete(t._id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-500 hover:text-red-600 transition-colors"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            );
          })}
          {!loading && filtered.length === 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-12 text-center text-gray-400 dark:text-gray-500">No se encontraron tareas</div>
          )}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{editing ? 'Editar Tarea' : 'Nueva Tarea'}</h3>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Evento</label>
                <select value={form.evento} onChange={e => setForm(p => ({ ...p, evento: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                  <option value="">Seleccionar evento…</option>
                  {eventOptions.map(ev => <option key={ev} value={ev}>{ev}</option>)}
                  {form.evento && !eventOptions.includes(form.evento) ? (
                    <option value={form.evento}>{form.evento}</option>
                  ) : null}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tarea</label>
                <input value={form.tarea} onChange={e => setForm(p => ({ ...p, tarea: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Responsable</label>
                  <input value={form.responsable} onChange={e => setForm(p => ({ ...p, responsable: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Fecha límite</label>
                  <input type="date" value={form.fechaLimite} onChange={e => setForm(p => ({ ...p, fechaLimite: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Estado</label>
                  <select value={form.estado} onChange={e => setForm(p => ({ ...p, estado: e.target.value as TaskStatus }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                    {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Prioridad</label>
                  <select value={form.prioridad} onChange={e => setForm(p => ({ ...p, prioridad: e.target.value as Priority }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                    {Object.entries(PRIORITY_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Categoría</label>
                  <select value={form.categoria} onChange={e => setForm(p => ({ ...p, categoria: e.target.value as Category }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                    {Object.entries(CATEGORY_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="sticky bottom-0 bg-white dark:bg-gray-800 flex justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700 rounded-b-2xl">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">Cancelar</button>
              <button type="button" onClick={() => void handleSave()} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">Guardar</button>
            </div>
          </div>
        </div>
      )}
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="events_logistics"
        moduleLabel="Logística"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Logística"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
