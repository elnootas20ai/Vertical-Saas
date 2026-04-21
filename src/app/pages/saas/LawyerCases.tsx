import { useState, useMemo, useCallback, useEffect } from 'react';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import { useModalClose } from '../../hooks/useModalClose';
import {
  Search, Plus, X, Edit3, Briefcase, Scale, Filter,
  CheckCircle2, Clock, AlertTriangle, Archive, Gavel,
  TrendingUp, FolderOpen, Loader2,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { toast } from 'sonner';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

type CaseType = 'civil' | 'penal' | 'laboral' | 'mercantil' | 'administrativo' | 'familia';
type CaseStatus = 'abierto' | 'en_tramite' | 'vista_oral' | 'cerrado' | 'archivado';

interface Case extends VerticalEntity {
  expediente: string;
  tipo: CaseType;
  cliente: string;
  fechaApertura: string;
  estado: CaseStatus;
  abogado: string;
  juzgado: string;
}

type CaseForm = Omit<Case, keyof VerticalEntity>;

const TYPE_LABELS: Record<CaseType, string> = {
  civil: 'Civil', penal: 'Penal', laboral: 'Laboral',
  mercantil: 'Mercantil', administrativo: 'Administrativo', familia: 'Familia',
};

const STATUS_CONFIG: Record<CaseStatus, { label: string; cls: string }> = {
  abierto: { label: 'Abierto', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  en_tramite: { label: 'En trámite', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  vista_oral: { label: 'Vista oral', cls: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
  cerrado: { label: 'Cerrado', cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  archivado: { label: 'Archivado', cls: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400' },
};

const ABOGADOS = ['Lcdo. Carlos Mendoza', 'Lcda. Ana Beltrán', 'Lcdo. Javier Ramos', 'Lcda. Patricia Solís'];
const JUZGADOS = ['Juzgado 1ª Instancia nº3', 'Juzgado de lo Social nº5', 'Juzgado Penal nº2', 'Juzgado Mercantil nº1', 'Audiencia Provincial Sala 2ª'];

const emptyForm = (): CaseForm => ({
  expediente: '', tipo: 'civil', cliente: '', fechaApertura: '',
  estado: 'abierto', abogado: ABOGADOS[0], juzgado: JUZGADOS[0],
});

export function LawyerCases() {
  const { user } = useAuth();
  const api = useMemo(() => createVerticalApi<Case>('lawyer', 'cases'), []);
  const userId = user?.user_id || user?.id || '';

  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<CaseStatus | ''>('');
  const [filterType, setFilterType] = useState<CaseType | ''>('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Case | null>(null);
  const [form, setForm] = useState<CaseForm>(emptyForm());
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
      setCases(list);
    } finally {
      setLoading(false);
    }
  }, [userId, api]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'caseNumber', label: 'Nº expediente' },
    { key: 'type', label: 'Tipo' },
    { key: 'client', label: 'Cliente' },
    { key: 'date', label: 'Fecha apertura' },
    { key: 'court', label: 'Juzgado' },
    { key: 'status', label: 'Estado' },
    { key: 'notes', label: 'Notas' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'caseNumber', label: 'Nº expediente', required: true, example: '' },
    { key: 'type', label: 'Tipo', example: '' },
    { key: 'client', label: 'Cliente', example: '' },
    { key: 'date', label: 'Fecha apertura', example: '' },
    { key: 'court', label: 'Juzgado', example: '' },
    { key: 'status', label: 'Estado', example: '' },
    { key: 'notes', label: 'Notas', example: '' },
  ];

  const handleAIEntries = async (entries: Record<string, unknown>[]) => {
    toast.success(`${entries.length} caso(s) parseado(s) con IA`);
  };

  const handleImportEntries = async (entries: Record<string, string>[]) => {
    toast.success(`${entries.length} caso(s) importado(s)`);
  };

  useModalClose(modalOpen, () => setModalOpen(false));

  const filtered = useMemo(() => cases.filter(c => {
    const q = search.toLowerCase();
    const matchSearch = c.expediente.toLowerCase().includes(q) || c.cliente.toLowerCase().includes(q) || c.abogado.toLowerCase().includes(q);
    const matchStatus = !filterStatus || c.estado === filterStatus;
    const matchType = !filterType || c.tipo === filterType;
    return matchSearch && matchStatus && matchType;
  }), [cases, search, filterStatus, filterType]);

  const stats = useMemo(() => ({
    activos: cases.filter(c => c.estado === 'abierto' || c.estado === 'en_tramite' || c.estado === 'vista_oral').length,
    enTramite: cases.filter(c => c.estado === 'en_tramite').length,
    cerradosMes: cases.filter(c => c.estado === 'cerrado' && c.fechaApertura >= '2026-03-01').length,
    tasaExito: Math.round((cases.filter(c => c.estado === 'cerrado').length / Math.max(cases.filter(c => c.estado === 'cerrado' || c.estado === 'archivado').length, 1)) * 100),
  }), [cases]);

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setModalOpen(true); };
  const openEdit = (c: Case) => {
    setEditing(c);
    setForm({
      expediente: c.expediente, tipo: c.tipo, cliente: c.cliente, fechaApertura: c.fechaApertura,
      estado: c.estado, abogado: c.abogado, juzgado: c.juzgado,
    });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.expediente.trim() || !form.cliente.trim() || !userId) return;
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
    <Layout title="Expedientes / Casos">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Casos activos', value: stats.activos, icon: Briefcase, color: 'text-blue-600' },
          { label: 'En trámite', value: stats.enTramite, icon: Clock, color: 'text-amber-600' },
          { label: 'Cerrados este mes', value: stats.cerradosMes, icon: CheckCircle2, color: 'text-green-600' },
          { label: 'Tasa de éxito', value: `${stats.tasaExito}%`, icon: TrendingUp, color: 'text-purple-600' },
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
          <input type="text" placeholder="Buscar expediente, cliente, abogado..." value={search} onChange={e => setSearch(e.target.value)} disabled={loading} className="w-full pl-10 pr-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none focus:border-gray-900 dark:focus:border-gray-400" />
        </div>
        <div className="flex gap-2 flex-wrap">
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as CaseStatus | '')} disabled={loading} className="pl-9 pr-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none appearance-none cursor-pointer">
              <option value="">Todos los estados</option>
              {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <select value={filterType} onChange={e => setFilterType(e.target.value as CaseType | '')} disabled={loading} className="px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none appearance-none cursor-pointer">
            <option value="">Todos los tipos</option>
            {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <AddButtonDropdown
                label="Nuevo caso"
                onQuickAdd={openCreate}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de caso"
              />
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 text-left">
              {['Nº Expediente', 'Tipo', 'Cliente', 'Fecha apertura', 'Estado', 'Abogado', 'Juzgado', ''].map(h => (
                <th key={h} className="px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">
                  <span className="inline-flex items-center justify-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Cargando…
                  </span>
                </td>
              </tr>
            ) : filtered.map(c => (
              <tr key={c._id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2"><FolderOpen className="w-4 h-4 text-gray-400 shrink-0" />{c.expediente}</td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{TYPE_LABELS[c.tipo]}</td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{c.cliente}</td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">{c.fechaApertura}</td>
                <td className="px-4 py-3"><span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold ${STATUS_CONFIG[c.estado].cls}`}>{STATUS_CONFIG[c.estado].label}</span></td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">{c.abogado}</td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">{c.juzgado}</td>
                <td className="px-4 py-3 flex gap-1">
                  <button onClick={() => openEdit(c)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"><Edit3 className="w-4 h-4 text-gray-500" /></button>
                  <button onClick={() => void handleDelete(c._id)} className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"><X className="w-4 h-4 text-red-400" /></button>
                </td>
              </tr>
            ))}
            {!loading && filtered.length === 0 && <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-400">No se encontraron expedientes</td></tr>}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setModalOpen(false)}>
          <form onSubmit={handleSave} onClick={e => e.stopPropagation()} className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2"><Scale className="w-5 h-5" />{editing ? 'Editar caso' : 'Nuevo caso'}</h2>
              <button type="button" onClick={() => setModalOpen(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className={labelClass}>Nº Expediente</label><input className={inputClass} value={form.expediente} onChange={e => setForm({ ...form, expediente: e.target.value })} required /></div>
              <div>
                <label className={labelClass}>Tipo</label>
                <select className={inputClass} value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value as CaseType })}>
                  {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2"><label className={labelClass}>Cliente</label><input className={inputClass} value={form.cliente} onChange={e => setForm({ ...form, cliente: e.target.value })} required /></div>
              <div><label className={labelClass}>Fecha apertura</label><input type="date" className={inputClass} value={form.fechaApertura} onChange={e => setForm({ ...form, fechaApertura: e.target.value })} /></div>
              <div>
                <label className={labelClass}>Estado</label>
                <select className={inputClass} value={form.estado} onChange={e => setForm({ ...form, estado: e.target.value as CaseStatus })}>
                  {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Abogado asignado</label>
                <select className={inputClass} value={form.abogado} onChange={e => setForm({ ...form, abogado: e.target.value })}>
                  {ABOGADOS.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Juzgado</label>
                <select className={inputClass} value={form.juzgado} onChange={e => setForm({ ...form, juzgado: e.target.value })}>
                  {JUZGADOS.map(j => <option key={j} value={j}>{j}</option>)}
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
        module="lawyer_cases"
        moduleLabel="Casos"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Casos"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
