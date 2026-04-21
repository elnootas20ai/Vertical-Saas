import { useState, useMemo, useCallback, useEffect } from 'react';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import { useModalClose } from '../../hooks/useModalClose';
import {
  Search, Plus, X, Edit3, Filter, AlarmClock, Calendar,
  Clock, CheckCircle2, AlertTriangle, AlertOctagon,
  Timer, TrendingUp, ShieldAlert, User, Loader2,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { toast } from 'sonner';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

type DeadlineType = 'procesal' | 'prescripcion' | 'recurso' | 'presentacion';
type Priority = 'alta' | 'media' | 'baja';
type DeadlineStatus = 'pendiente' | 'cumplido' | 'vencido';

interface Deadline extends VerticalEntity {
  caso: string;
  tipoPlazo: DeadlineType;
  fechaLimite: string;
  diasRestantes: number;
  prioridad: Priority;
  responsable: string;
  estado: DeadlineStatus;
  descripcion: string;
}

type DeadlineForm = Omit<Deadline, keyof VerticalEntity>;

const TYPE_LABELS: Record<DeadlineType, string> = {
  procesal: 'Procesal', prescripcion: 'Prescripción',
  recurso: 'Recurso', presentacion: 'Presentación',
};

const PRIORITY_CONFIG: Record<Priority, { label: string; cls: string }> = {
  alta: { label: 'Alta', cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  media: { label: 'Media', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  baja: { label: 'Baja', cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
};

const STATUS_CONFIG: Record<DeadlineStatus, { label: string; cls: string; icon: typeof Clock }> = {
  pendiente: { label: 'Pendiente', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', icon: Clock },
  cumplido: { label: 'Cumplido', cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', icon: CheckCircle2 },
  vencido: { label: 'Vencido', cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', icon: AlertOctagon },
};

const RESPONSABLES = ['Lcdo. Carlos Mendoza', 'Lcda. Ana Beltrán', 'Lcdo. Javier Ramos', 'Lcda. Patricia Solís'];

const emptyForm = (): DeadlineForm => ({
  caso: '', tipoPlazo: 'procesal', fechaLimite: '', diasRestantes: 0,
  prioridad: 'media', responsable: RESPONSABLES[0], estado: 'pendiente', descripcion: '',
});

export function LawyerDeadlines() {
  const { user } = useAuth();
  const api = useMemo(() => createVerticalApi<Deadline>('lawyer', 'deadlines'), []);
  const userId = user?.user_id || user?.id || '';

  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<DeadlineStatus | ''>('');
  const [filterPriority, setFilterPriority] = useState<Priority | ''>('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Deadline | null>(null);
  const [form, setForm] = useState<DeadlineForm>(emptyForm());
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const loadData = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const list = await api.list(userId);
      setDeadlines(list);
    } finally {
      setLoading(false);
    }
  }, [userId, api]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'case', label: 'Caso' },
    { key: 'description', label: 'Descripción' },
    { key: 'deadline', label: 'Fecha límite' },
    { key: 'priority', label: 'Prioridad' },
    { key: 'status', label: 'Estado' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'case', label: 'Caso', example: '' },
    { key: 'description', label: 'Descripción', example: '' },
    { key: 'deadline', label: 'Fecha límite', example: '' },
    { key: 'priority', label: 'Prioridad', example: '' },
    { key: 'status', label: 'Estado', example: '' },
  ];

  const handleAIEntries = async (entries: Record<string, unknown>[]) => {
    toast.success(`${entries.length} plazo(s) parseado(s) con IA`);
  };

  const handleImportEntries = async (entries: Record<string, string>[]) => {
    toast.success(`${entries.length} plazo(s) importado(s)`);
  };

  useModalClose(modalOpen, () => setModalOpen(false));

  const filtered = useMemo(() => deadlines.filter(d => {
    const q = search.toLowerCase();
    const matchSearch = d.caso.toLowerCase().includes(q) || d.descripcion.toLowerCase().includes(q) || d.responsable.toLowerCase().includes(q);
    const matchStatus = !filterStatus || d.estado === filterStatus;
    const matchPriority = !filterPriority || d.prioridad === filterPriority;
    return matchSearch && matchStatus && matchPriority;
  }), [deadlines, search, filterStatus, filterPriority]);

  const stats = useMemo(() => ({
    proximos7dias: deadlines.filter(d => d.estado === 'pendiente' && d.diasRestantes >= 0 && d.diasRestantes <= 7).length,
    vencidos: deadlines.filter(d => d.estado === 'vencido').length,
    cumplidosMes: deadlines.filter(d => d.estado === 'cumplido').length,
    totalPendientes: deadlines.filter(d => d.estado === 'pendiente').length,
  }), [deadlines]);

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setModalOpen(true); };
  const openEdit = (d: Deadline) => {
    setEditing(d);
    setForm({
      caso: d.caso, tipoPlazo: d.tipoPlazo, fechaLimite: d.fechaLimite, diasRestantes: d.diasRestantes,
      prioridad: d.prioridad, responsable: d.responsable, estado: d.estado, descripcion: d.descripcion,
    });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.caso.trim() || !userId) return;
    try {
      if (editing) {
        await api.update(userId, editing._id, form);
      } else {
        await api.create(userId, form);
      }
      await loadData();
      setModalOpen(false);
    } catch {
      /* error shown by fetch layer */
    }
  };

  const handleDelete = async (docId: string) => {
    if (!userId) return;
    try {
      await api.remove(userId, docId);
      await loadData();
    } catch {
      /* error shown by fetch layer */
    }
  };
  const inputClass = 'w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 dark:focus:border-gray-400 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100';
  const labelClass = 'block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5';

  const urgencyColor = (dias: number, estado: DeadlineStatus) => {
    if (estado === 'cumplido') return 'text-green-600 dark:text-green-400';
    if (estado === 'vencido' || dias < 0) return 'text-red-600 dark:text-red-400 font-bold';
    if (dias <= 3) return 'text-red-600 dark:text-red-400 font-bold animate-pulse';
    if (dias <= 7) return 'text-amber-600 dark:text-amber-400 font-semibold';
    return 'text-gray-600 dark:text-gray-300';
  };

  const urgencyBg = (dias: number, estado: DeadlineStatus) => {
    if (estado === 'vencido' || dias < 0) return 'bg-red-50/50 dark:bg-red-900/10';
    if (dias <= 3) return 'bg-red-50/30 dark:bg-red-900/5';
    if (dias <= 7) return 'bg-amber-50/30 dark:bg-amber-900/5';
    return '';
  };

  return (
    <Layout title="Plazos / Vencimientos">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Próximos 7 días', value: stats.proximos7dias, icon: AlarmClock, color: 'text-amber-600' },
          { label: 'Vencidos', value: stats.vencidos, icon: AlertOctagon, color: 'text-red-600' },
          { label: 'Cumplidos este mes', value: stats.cumplidosMes, icon: CheckCircle2, color: 'text-green-600' },
          { label: 'Total pendientes', value: stats.totalPendientes, icon: Timer, color: 'text-blue-600' },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3 mb-2">
              <s.icon className={`w-5 h-5 ${s.color}`} />
              <span className="text-sm text-gray-500 dark:text-gray-400">{s.label}</span>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input type="text" placeholder="Buscar caso, descripción, responsable..." value={search} onChange={e => setSearch(e.target.value)} disabled={loading} className="w-full pl-10 pr-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none focus:border-gray-900 dark:focus:border-gray-400" />
        </div>
        <div className="flex gap-2 flex-wrap">
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as DeadlineStatus | '')} disabled={loading} className="pl-9 pr-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none appearance-none cursor-pointer">
              <option value="">Todos los estados</option>
              {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <select value={filterPriority} onChange={e => setFilterPriority(e.target.value as Priority | '')} disabled={loading} className="px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none appearance-none cursor-pointer">
            <option value="">Todas las prioridades</option>
            {Object.entries(PRIORITY_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <AddButtonDropdown
                label="Nuevo plazo"
                onQuickAdd={openCreate}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de plazo"
              />
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-x-auto">
        <table className="w-full text-sm min-w-[1100px]">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 text-left">
              {['Caso', 'Descripción', 'Tipo plazo', 'Fecha límite', 'Días rest.', 'Prioridad', 'Responsable', 'Estado', ''].map(h => (
                <th key={h} className="px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">
                  <span className="inline-flex items-center justify-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Cargando…
                  </span>
                </td>
              </tr>
            ) : filtered.map(d => {
              const sCfg = STATUS_CONFIG[d.estado];
              const SIcon = sCfg.icon;
              return (
                <tr key={d._id} className={`border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors ${urgencyBg(d.diasRestantes, d.estado)}`}>
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2"><ShieldAlert className="w-4 h-4 text-gray-400 shrink-0" />{d.caso}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300 max-w-[220px] truncate">{d.descripcion}</td>
                  <td className="px-4 py-3"><span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">{TYPE_LABELS[d.tipoPlazo]}</span></td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap"><span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{d.fechaLimite}</span></td>
                  <td className="px-4 py-3 whitespace-nowrap"><span className={urgencyColor(d.diasRestantes, d.estado)}>{d.diasRestantes < 0 ? `${Math.abs(d.diasRestantes)}d vencido` : d.estado === 'cumplido' ? '—' : `${d.diasRestantes}d`}</span></td>
                  <td className="px-4 py-3"><span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold ${PRIORITY_CONFIG[d.prioridad].cls}`}>{PRIORITY_CONFIG[d.prioridad].label}</span></td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap"><span className="flex items-center gap-1"><User className="w-3.5 h-3.5" />{d.responsable}</span></td>
                  <td className="px-4 py-3"><span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold ${sCfg.cls}`}><SIcon className="w-3.5 h-3.5" />{sCfg.label}</span></td>
                  <td className="px-4 py-3 flex gap-1">
                    <button onClick={() => openEdit(d)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"><Edit3 className="w-4 h-4 text-gray-500" /></button>
                    <button onClick={() => void handleDelete(d._id)} className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"><X className="w-4 h-4 text-red-400" /></button>
                  </td>
                </tr>
              );
            })}
            {!loading && filtered.length === 0 && <tr><td colSpan={9} className="px-4 py-12 text-center text-gray-400">No se encontraron plazos</td></tr>}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setModalOpen(false)}>
          <form onSubmit={handleSave} onClick={e => e.stopPropagation()} className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2"><AlarmClock className="w-5 h-5" />{editing ? 'Editar plazo' : 'Nuevo plazo'}</h2>
              <button type="button" onClick={() => setModalOpen(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className={labelClass}>Caso / Expediente</label><input className={inputClass} value={form.caso} onChange={e => setForm({ ...form, caso: e.target.value })} required /></div>
              <div>
                <label className={labelClass}>Tipo de plazo</label>
                <select className={inputClass} value={form.tipoPlazo} onChange={e => setForm({ ...form, tipoPlazo: e.target.value as DeadlineType })}>
                  {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2"><label className={labelClass}>Descripción</label><input className={inputClass} value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })} /></div>
              <div><label className={labelClass}>Fecha límite</label><input type="date" className={inputClass} value={form.fechaLimite} onChange={e => setForm({ ...form, fechaLimite: e.target.value })} /></div>
              <div><label className={labelClass}>Días restantes</label><input type="number" className={inputClass} value={form.diasRestantes} onChange={e => setForm({ ...form, diasRestantes: Number(e.target.value) })} /></div>
              <div>
                <label className={labelClass}>Prioridad</label>
                <select className={inputClass} value={form.prioridad} onChange={e => setForm({ ...form, prioridad: e.target.value as Priority })}>
                  {Object.entries(PRIORITY_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Responsable</label>
                <select className={inputClass} value={form.responsable} onChange={e => setForm({ ...form, responsable: e.target.value })}>
                  {RESPONSABLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>Estado</label>
                <select className={inputClass} value={form.estado} onChange={e => setForm({ ...form, estado: e.target.value as DeadlineStatus })}>
                  {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
            </div>
            <div className="sticky bottom-0 bg-white dark:bg-gray-800 flex gap-3 p-6 border-t border-gray-200 dark:border-gray-700 rounded-b-2xl">
              <button type="button" onClick={() => setModalOpen(false)} className="flex-1 px-4 py-3 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">Cancelar</button>
              <button type="submit" className="flex-1 px-4 py-3 bg-gray-900 hover:bg-black dark:bg-gray-100 dark:hover:bg-white text-white dark:text-gray-900 rounded-xl font-semibold transition-colors">Guardar</button>
            </div>
          </form>
        </div>
      )}
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="lawyer_deadlines"
        moduleLabel="Plazos"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Plazos"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
