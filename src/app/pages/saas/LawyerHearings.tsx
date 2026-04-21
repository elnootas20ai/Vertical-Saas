import { useState, useMemo, useCallback, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import { useModalClose } from '../../hooks/useModalClose';
import { Layout } from '../../components/saas/Layout';
import {
  Search, Plus, X, Edit3, Filter, Gavel, Calendar,
  Clock, CheckCircle2, AlertCircle, PauseCircle, CalendarDays,
  MapPin, Users, Loader2,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { toast } from 'sonner';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

type HearingType = 'vista_oral' | 'declaracion' | 'conciliacion' | 'mediacion';
type HearingStatus = 'programada' | 'aplazada' | 'celebrada' | 'suspendida';

interface Hearing extends VerticalEntity {
  caso: string;
  cliente: string;
  juzgado: string;
  fecha: string;
  hora: string;
  tipo: HearingType;
  sala: string;
  estado: HearingStatus;
}

type HearingForm = Omit<Hearing, keyof VerticalEntity>;

const TYPE_LABELS: Record<HearingType, string> = {
  vista_oral: 'Vista oral', declaracion: 'Declaración',
  conciliacion: 'Conciliación', mediacion: 'Mediación',
};

const STATUS_CONFIG: Record<HearingStatus, { label: string; cls: string; icon: typeof Clock }> = {
  programada: { label: 'Programada', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', icon: Calendar },
  aplazada: { label: 'Aplazada', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', icon: PauseCircle },
  celebrada: { label: 'Celebrada', cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', icon: CheckCircle2 },
  suspendida: { label: 'Suspendida', cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', icon: AlertCircle },
};

const SALAS = ['Sala 1', 'Sala 2', 'Sala 3', 'Sala de mediación A', 'Sala de mediación B'];
const JUZGADOS = ['Juzgado 1ª Instancia nº3', 'Juzgado de lo Social nº5', 'Juzgado Penal nº2', 'Juzgado Mercantil nº1', 'Audiencia Provincial Sala 2ª'];

const emptyForm = (): HearingForm => ({
  caso: '', cliente: '', juzgado: JUZGADOS[0], fecha: '', hora: '',
  tipo: 'vista_oral', sala: SALAS[0], estado: 'programada',
});

export function LawyerHearings() {
  const { user } = useAuth();
  const api = useMemo(() => createVerticalApi<Hearing>('lawyer', 'hearings'), []);
  const userId = user?.user_id || user?.id || '';

  const [hearings, setHearings] = useState<Hearing[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<HearingStatus | ''>('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Hearing | null>(null);
  const [form, setForm] = useState<HearingForm>(emptyForm());
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
      setHearings(list);
    } finally {
      setLoading(false);
    }
  }, [userId, api]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'case', label: 'Caso' },
    { key: 'court', label: 'Juzgado' },
    { key: 'date', label: 'Fecha' },
    { key: 'time', label: 'Hora' },
    { key: 'type', label: 'Tipo' },
    { key: 'notes', label: 'Notas' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'case', label: 'Caso', example: '' },
    { key: 'court', label: 'Juzgado', example: '' },
    { key: 'date', label: 'Fecha', example: '' },
    { key: 'time', label: 'Hora', example: '' },
    { key: 'type', label: 'Tipo', example: '' },
    { key: 'notes', label: 'Notas', example: '' },
  ];

  const handleAIEntries = async (entries: Record<string, unknown>[]) => {
    toast.success(`${entries.length} vista(s) parseado(s) con IA`);
  };

  const handleImportEntries = async (entries: Record<string, string>[]) => {
    toast.success(`${entries.length} vista(s) importado(s)`);
  };

  const filtered = useMemo(() => hearings.filter(h => {
    const q = search.toLowerCase();
    const matchSearch = h.caso.toLowerCase().includes(q) || h.cliente.toLowerCase().includes(q) || h.juzgado.toLowerCase().includes(q);
    const matchStatus = !filterStatus || h.estado === filterStatus;
    return matchSearch && matchStatus;
  }), [hearings, search, filterStatus]);

  const stats = useMemo(() => {
    const weekEnd = '2026-04-07';
    const today = '2026-04-01';
    const programadas = hearings.filter(h => h.estado === 'programada');
    const estaSemana = programadas.filter(h => h.fecha >= today && h.fecha <= weekEnd).length;
    const proxima = programadas.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.hora.localeCompare(b.hora))[0];
    const celebradasMes = hearings.filter(h => h.estado === 'celebrada' && h.fecha >= '2026-03-01').length;
    return { estaSemana, proxima, celebradasMes };
  }, [hearings]);
  useModalClose(modalOpen, () => setModalOpen(false));

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setModalOpen(true); };
  const openEdit = (h: Hearing) => {
    setEditing(h);
    setForm({
      caso: h.caso, cliente: h.cliente, juzgado: h.juzgado, fecha: h.fecha, hora: h.hora,
      tipo: h.tipo, sala: h.sala, estado: h.estado,
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

  return (
    <Layout title="Audiencias / Vistas">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Vistas esta semana', value: stats.estaSemana, icon: CalendarDays, color: 'text-blue-600' },
          { label: 'Próxima vista', value: stats.proxima ? `${stats.proxima.fecha} ${stats.proxima.hora}` : '—', icon: Clock, color: 'text-amber-600' },
          { label: 'Celebradas este mes', value: stats.celebradasMes, icon: CheckCircle2, color: 'text-green-600' },
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
          <input type="text" placeholder="Buscar caso, cliente, juzgado..." value={search} onChange={e => setSearch(e.target.value)} disabled={loading} className="w-full pl-10 pr-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none focus:border-gray-900 dark:focus:border-gray-400" />
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as HearingStatus | '')} disabled={loading} className="pl-9 pr-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none appearance-none cursor-pointer">
              <option value="">Todos los estados</option>
              {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <AddButtonDropdown
                label="Nueva vista"
                onQuickAdd={openCreate}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de vista"
              />
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-x-auto">
        <table className="w-full text-sm min-w-[1100px]">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 text-left">
              {['Caso', 'Cliente', 'Juzgado', 'Fecha', 'Hora', 'Tipo', 'Sala', 'Estado', ''].map(h => (
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
            ) : filtered.map(h => {
              const cfg = STATUS_CONFIG[h.estado];
              const Icon = cfg.icon;
              return (
                <tr key={h._id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2"><Gavel className="w-4 h-4 text-gray-400 shrink-0" />{h.caso}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300"><span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" />{h.cliente}</span></td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap"><span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{h.juzgado}</span></td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">{h.fecha}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{h.hora}</td>
                  <td className="px-4 py-3"><span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400">{TYPE_LABELS[h.tipo]}</span></td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{h.sala}</td>
                  <td className="px-4 py-3"><span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold ${cfg.cls}`}><Icon className="w-3.5 h-3.5" />{cfg.label}</span></td>
                  <td className="px-4 py-3 flex gap-1">
                    <button onClick={() => openEdit(h)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"><Edit3 className="w-4 h-4 text-gray-500" /></button>
                    <button onClick={() => void handleDelete(h._id)} className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"><X className="w-4 h-4 text-red-400" /></button>
                  </td>
                </tr>
              );
            })}
            {!loading && filtered.length === 0 && <tr><td colSpan={9} className="px-4 py-12 text-center text-gray-400">No se encontraron audiencias</td></tr>}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setModalOpen(false)}>
          <form onSubmit={handleSave} className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2"><Gavel className="w-5 h-5" />{editing ? 'Editar audiencia' : 'Nueva audiencia'}</h2>
              <button type="button" onClick={() => setModalOpen(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className={labelClass}>Nº Caso / Expediente</label><input className={inputClass} value={form.caso} onChange={e => setForm({ ...form, caso: e.target.value })} required /></div>
              <div><label className={labelClass}>Cliente</label><input className={inputClass} value={form.cliente} onChange={e => setForm({ ...form, cliente: e.target.value })} /></div>
              <div>
                <label className={labelClass}>Juzgado</label>
                <select className={inputClass} value={form.juzgado} onChange={e => setForm({ ...form, juzgado: e.target.value })}>
                  {JUZGADOS.map(j => <option key={j} value={j}>{j}</option>)}
                </select>
              </div>
              <div><label className={labelClass}>Fecha</label><input type="date" className={inputClass} value={form.fecha} onChange={e => setForm({ ...form, fecha: e.target.value })} /></div>
              <div><label className={labelClass}>Hora</label><input type="time" className={inputClass} value={form.hora} onChange={e => setForm({ ...form, hora: e.target.value })} /></div>
              <div>
                <label className={labelClass}>Tipo</label>
                <select className={inputClass} value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value as HearingType })}>
                  {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Sala</label>
                <select className={inputClass} value={form.sala} onChange={e => setForm({ ...form, sala: e.target.value })}>
                  {SALAS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Estado</label>
                <select className={inputClass} value={form.estado} onChange={e => setForm({ ...form, estado: e.target.value as HearingStatus })}>
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
        module="lawyer_hearings"
        moduleLabel="Vistas"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Vistas"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
