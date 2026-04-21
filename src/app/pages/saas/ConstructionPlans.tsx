import { useState, useMemo } from 'react';
import { useModalClose } from '../../hooks/useModalClose';
import { Layout } from '../../components/saas/Layout';
import {
  Search, Plus, X, Edit3, Filter, FileText, FolderOpen,
  CheckCircle2, Clock, Eye, Upload, File, Shield, BookOpen,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { toast } from 'sonner';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

type TipoDoc = 'plano' | 'memoria' | 'certificado' | 'licencia' | 'estudio';
type EstadoDoc = 'borrador' | 'revisión' | 'aprobado';

interface PlanDoc {
  id: number;
  nombre: string;
  proyecto: string;
  tipo: TipoDoc;
  version: string;
  fecha: string;
  responsable: string;
  estado: EstadoDoc;
}

const mockPlans: PlanDoc[] = [];

const tipoConfig: Record<TipoDoc, { color: string; icon: typeof FileText }> = {
  plano: { color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', icon: File },
  memoria: { color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400', icon: BookOpen },
  certificado: { color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', icon: Shield },
  licencia: { color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', icon: CheckCircle2 },
  estudio: { color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400', icon: Eye },
};

const estadoConfig: Record<EstadoDoc, { color: string; icon: typeof Clock }> = {
  borrador: { color: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300', icon: Clock },
  'revisión': { color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400', icon: Eye },
  aprobado: { color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', icon: CheckCircle2 },
};

const tipos: TipoDoc[] = ['plano', 'memoria', 'certificado', 'licencia', 'estudio'];

const emptyForm = { nombre: '', proyecto: '', tipo: 'plano' as TipoDoc, version: 'v1.0', fecha: '', responsable: '', estado: 'borrador' as EstadoDoc };

export function ConstructionPlans() {
  const [docs, setDocs] = useState<PlanDoc[]>([]);
  const [search, setSearch] = useState('');
  const [filterTipo, setFilterTipo] = useState('todos');
  const [filterEstado, setFilterEstado] = useState('todos');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PlanDoc | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'name', label: 'Nombre' },
    { key: 'project', label: 'Proyecto' },
    { key: 'type', label: 'Tipo' },
    { key: 'version', label: 'Versión' },
    { key: 'date', label: 'Fecha' },
    { key: 'notes', label: 'Notas' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'name', label: 'Nombre', required: true, example: '' },
    { key: 'project', label: 'Proyecto', example: '' },
    { key: 'type', label: 'Tipo', example: '' },
    { key: 'version', label: 'Versión', example: '' },
    { key: 'date', label: 'Fecha', example: '' },
    { key: 'notes', label: 'Notas', example: '' },
  ];

  const handleAIEntries = async (entries: Record<string, unknown>[]) => {
    toast.success(`${entries.length} documento(s) parseado(s) con IA`);
  };

  const handleImportEntries = async (entries: Record<string, string>[]) => {
    toast.success(`${entries.length} documento(s) importado(s)`);
  };

  const filtered = useMemo(() => docs.filter(d => {
    const matchSearch = `${d.nombre} ${d.proyecto} ${d.responsable}`.toLowerCase().includes(search.toLowerCase());
    const matchTipo = filterTipo === 'todos' || d.tipo === filterTipo;
    const matchEstado = filterEstado === 'todos' || d.estado === filterEstado;
    return matchSearch && matchTipo && matchEstado;
  }), [docs, search, filterTipo, filterEstado]);

  const stats = useMemo(() => ({
    total: docs.length,
    pendientes: docs.filter(d => d.estado !== 'aprobado').length,
    aprobados: docs.filter(d => d.estado === 'aprobado').length,
  }), [docs]);
  useModalClose(modalOpen, () => setModalOpen(false));

  const openCreate = () => { setEditing(null); setForm(emptyForm); setModalOpen(true); };
  const openEdit = (d: PlanDoc) => { setEditing(d); setForm({ nombre: d.nombre, proyecto: d.proyecto, tipo: d.tipo, version: d.version, fecha: d.fecha, responsable: d.responsable, estado: d.estado }); setModalOpen(true); };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombre.trim()) return;
    if (editing) {
      setDocs(prev => prev.map(d => d.id === editing.id ? { ...d, ...form } : d));
    } else {
      setDocs(prev => [...prev, { ...form, id: Math.max(...prev.map(d => d.id)) + 1 }]);
    }
    setModalOpen(false);
  };

  const inputClass = 'w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 dark:focus:border-gray-400 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100';
  const labelClass = 'block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5';

  return (
    <Layout title="Planos y Documentación">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Documentos totales', value: stats.total, icon: FolderOpen, color: 'text-blue-600' },
          { label: 'Pendientes de aprobación', value: stats.pendientes, icon: Clock, color: 'text-amber-600' },
          { label: 'Aprobados', value: stats.aprobados, icon: CheckCircle2, color: 'text-green-600' },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3 mb-2"><s.icon className={`w-5 h-5 ${s.color}`} /><span className="text-sm text-gray-500 dark:text-gray-400">{s.label}</span></div>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input type="text" placeholder="Buscar documentos..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none focus:border-gray-900 dark:focus:border-gray-400" />
        </div>
        <div className="flex gap-2 flex-wrap">
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <select value={filterTipo} onChange={e => setFilterTipo(e.target.value)} className="pl-9 pr-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none appearance-none cursor-pointer">
              <option value="todos">Todos los tipos</option>
              {tipos.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
            </select>
          </div>
          <select value={filterEstado} onChange={e => setFilterEstado(e.target.value)} className="px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none appearance-none cursor-pointer">
            <option value="todos">Todos los estados</option>
            <option value="borrador">Borrador</option>
            <option value="revisión">Revisión</option>
            <option value="aprobado">Aprobado</option>
          </select>
          <AddButtonDropdown
                label="Nuevo documento"
                onQuickAdd={openCreate}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de documento"
              />
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 text-left">
              {['Documento', 'Proyecto', 'Tipo', 'Versión', 'Fecha', 'Responsable', 'Estado', ''].map(h => (
                <th key={h} className="px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(d => {
              const tc = tipoConfig[d.tipo]; const TIcon = tc.icon;
              const ec = estadoConfig[d.estado]; const EIcon = ec.icon;
              return (
                <tr key={d.id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2"><FileText className="w-4 h-4 text-gray-400 shrink-0" />{d.nombre}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{d.proyecto}</td>
                  <td className="px-4 py-3"><span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold capitalize ${tc.color}`}><TIcon className="w-3.5 h-3.5" />{d.tipo}</span></td>
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-gray-700 dark:text-gray-200">{d.version}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">{d.fecha}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{d.responsable}</td>
                  <td className="px-4 py-3"><span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold ${ec.color}`}><EIcon className="w-3.5 h-3.5" />{d.estado}</span></td>
                  <td className="px-4 py-3"><button onClick={() => openEdit(d)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"><Edit3 className="w-4 h-4 text-gray-500" /></button></td>
                </tr>
              );
            })}
            {filtered.length === 0 && <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-400">No se encontraron documentos</td></tr>}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setModalOpen(false)}>
          <form onSubmit={handleSave} className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{editing ? 'Editar documento' : 'Nuevo documento'}</h2>
              <button type="button" onClick={() => setModalOpen(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2"><label className={labelClass}>Nombre del documento</label><input className={inputClass} value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} required /></div>
              <div><label className={labelClass}>Proyecto</label><input className={inputClass} value={form.proyecto} onChange={e => setForm({ ...form, proyecto: e.target.value })} /></div>
              <div>
                <label className={labelClass}>Tipo</label>
                <select className={inputClass} value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value as TipoDoc })}>
                  {tipos.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                </select>
              </div>
              <div><label className={labelClass}>Versión</label><input className={inputClass} value={form.version} onChange={e => setForm({ ...form, version: e.target.value })} /></div>
              <div><label className={labelClass}>Fecha</label><input type="date" className={inputClass} value={form.fecha} onChange={e => setForm({ ...form, fecha: e.target.value })} /></div>
              <div><label className={labelClass}>Responsable</label><input className={inputClass} value={form.responsable} onChange={e => setForm({ ...form, responsable: e.target.value })} /></div>
              <div>
                <label className={labelClass}>Estado</label>
                <select className={inputClass} value={form.estado} onChange={e => setForm({ ...form, estado: e.target.value as EstadoDoc })}>
                  <option value="borrador">Borrador</option>
                  <option value="revisión">Revisión</option>
                  <option value="aprobado">Aprobado</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>Archivo</label>
                <div className="flex items-center gap-3 p-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl cursor-pointer hover:border-gray-400 dark:hover:border-gray-500 transition-colors">
                  <Upload className="w-5 h-5 text-gray-400" />
                  <span className="text-sm text-gray-500 dark:text-gray-400">Arrastra un archivo o haz clic para seleccionar</span>
                </div>
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
        module="construction_plans"
        moduleLabel="Planos"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Planos"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
