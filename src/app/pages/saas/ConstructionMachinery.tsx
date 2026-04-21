import { useState, useMemo } from 'react';
import { useModalClose } from '../../hooks/useModalClose';
import { Layout } from '../../components/saas/Layout';
import {
  Search, Plus, X, Edit3, Filter, Truck, Wrench,
  CheckCircle2, AlertTriangle, Settings, Activity,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { toast } from 'sonner';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

interface Machine {
  id: number;
  nombre: string;
  tipo: 'excavadora' | 'grúa' | 'hormigonera' | 'dumper' | 'compactadora';
  matricula: string;
  proyectoAsignado: string;
  estado: 'disponible' | 'en uso' | 'mantenimiento' | 'avería';
  ultimaRevision: string;
}

const mockMachinery: Machine[] = [];

const estadoConfig: Record<Machine['estado'], { color: string; icon: typeof CheckCircle2 }> = {
  'disponible': { color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', icon: CheckCircle2 },
  'en uso': { color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', icon: Activity },
  'mantenimiento': { color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400', icon: Wrench },
  'avería': { color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', icon: AlertTriangle },
};

const tipos: Machine['tipo'][] = ['excavadora', 'grúa', 'hormigonera', 'dumper', 'compactadora'];

const emptyMachine: Omit<Machine, 'id'> = { nombre: '', tipo: 'excavadora', matricula: '', proyectoAsignado: '', estado: 'disponible', ultimaRevision: '' };

export function ConstructionMachinery() {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [search, setSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState('todos');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Machine | null>(null);
  const [form, setForm] = useState(emptyMachine);
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'name', label: 'Nombre' },
    { key: 'type', label: 'Tipo' },
    { key: 'brand', label: 'Marca' },
    { key: 'model', label: 'Modelo' },
    { key: 'plate', label: 'Matrícula' },
    { key: 'status', label: 'Estado' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'name', label: 'Nombre', required: true, example: '' },
    { key: 'type', label: 'Tipo', example: '' },
    { key: 'brand', label: 'Marca', example: '' },
    { key: 'model', label: 'Modelo', example: '' },
    { key: 'plate', label: 'Matrícula', required: true, example: '' },
    { key: 'status', label: 'Estado', example: '' },
  ];

  const handleAIEntries = async (entries: Record<string, unknown>[]) => {
    toast.success(`${entries.length} máquina(s) parseado(s) con IA`);
  };

  const handleImportEntries = async (entries: Record<string, string>[]) => {
    toast.success(`${entries.length} máquina(s) importado(s)`);
  };

  const filtered = useMemo(() => machines.filter(m => {
    const matchSearch = `${m.nombre} ${m.matricula} ${m.proyectoAsignado}`.toLowerCase().includes(search.toLowerCase());
    const matchEstado = filterEstado === 'todos' || m.estado === filterEstado;
    return matchSearch && matchEstado;
  }), [machines, search, filterEstado]);

  const stats = useMemo(() => ({
    total: machines.length,
    enUso: machines.filter(m => m.estado === 'en uso').length,
    disponible: machines.filter(m => m.estado === 'disponible').length,
    mantenimiento: machines.filter(m => m.estado === 'mantenimiento' || m.estado === 'avería').length,
  }), [machines]);
  useModalClose(modalOpen, () => setModalOpen(false));

  const openCreate = () => { setEditing(null); setForm(emptyMachine); setModalOpen(true); };
  const openEdit = (m: Machine) => { setEditing(m); setForm({ nombre: m.nombre, tipo: m.tipo, matricula: m.matricula, proyectoAsignado: m.proyectoAsignado, estado: m.estado, ultimaRevision: m.ultimaRevision }); setModalOpen(true); };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombre.trim()) return;
    if (editing) {
      setMachines(prev => prev.map(m => m.id === editing.id ? { ...m, ...form } : m));
    } else {
      setMachines(prev => [...prev, { ...form, id: Math.max(...prev.map(m => m.id)) + 1 }]);
    }
    setModalOpen(false);
  };

  const inputClass = 'w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 dark:focus:border-gray-400 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100';
  const labelClass = 'block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5';

  return (
    <Layout title="Maquinaria">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total maquinaria', value: stats.total, icon: Truck, color: 'text-gray-600' },
          { label: 'En uso', value: stats.enUso, icon: Activity, color: 'text-blue-600' },
          { label: 'Disponible', value: stats.disponible, icon: CheckCircle2, color: 'text-green-600' },
          { label: 'Mantenimiento / Avería', value: stats.mantenimiento, icon: Settings, color: 'text-amber-600' },
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
          <input type="text" placeholder="Buscar maquinaria..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none focus:border-gray-900 dark:focus:border-gray-400" />
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <select value={filterEstado} onChange={e => setFilterEstado(e.target.value)} className="pl-9 pr-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none appearance-none cursor-pointer">
              <option value="todos">Todos</option>
              <option value="disponible">Disponible</option>
              <option value="en uso">En uso</option>
              <option value="mantenimiento">Mantenimiento</option>
              <option value="avería">Avería</option>
            </select>
          </div>
          <AddButtonDropdown
                label="Nueva máquina"
                onQuickAdd={openCreate}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de máquina"
              />
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 text-left">
              {['Nombre', 'Tipo', 'Matrícula', 'Proyecto asignado', 'Estado', 'Última revisión', ''].map(h => (
                <th key={h} className="px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(m => {
              const cfg = estadoConfig[m.estado]; const Icon = cfg.icon;
              return (
                <tr key={m.id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2"><Truck className="w-4 h-4 text-gray-400 shrink-0" />{m.nombre}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300 capitalize">{m.tipo}</td>
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-gray-700 dark:text-gray-200">{m.matricula}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{m.proyectoAsignado || <span className="text-gray-400 italic">Sin asignar</span>}</td>
                  <td className="px-4 py-3"><span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold ${cfg.color}`}><Icon className="w-3.5 h-3.5" />{m.estado}</span></td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">{m.ultimaRevision}</td>
                  <td className="px-4 py-3"><button onClick={() => openEdit(m)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"><Edit3 className="w-4 h-4 text-gray-500" /></button></td>
                </tr>
              );
            })}
            {filtered.length === 0 && <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400">No se encontró maquinaria</td></tr>}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setModalOpen(false)}>
          <form onSubmit={handleSave} className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{editing ? 'Editar máquina' : 'Nueva máquina'}</h2>
              <button type="button" onClick={() => setModalOpen(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2"><label className={labelClass}>Nombre</label><input className={inputClass} value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} required /></div>
              <div>
                <label className={labelClass}>Tipo</label>
                <select className={inputClass} value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value as Machine['tipo'] })}>
                  {tipos.map(t => <option key={t} value={t} className="capitalize">{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                </select>
              </div>
              <div><label className={labelClass}>Matrícula</label><input className={inputClass} value={form.matricula} onChange={e => setForm({ ...form, matricula: e.target.value })} /></div>
              <div><label className={labelClass}>Proyecto asignado</label><input className={inputClass} value={form.proyectoAsignado} onChange={e => setForm({ ...form, proyectoAsignado: e.target.value })} /></div>
              <div>
                <label className={labelClass}>Estado</label>
                <select className={inputClass} value={form.estado} onChange={e => setForm({ ...form, estado: e.target.value as Machine['estado'] })}>
                  <option value="disponible">Disponible</option><option value="en uso">En uso</option><option value="mantenimiento">Mantenimiento</option><option value="avería">Avería</option>
                </select>
              </div>
              <div className="sm:col-span-2"><label className={labelClass}>Última revisión</label><input type="date" className={inputClass} value={form.ultimaRevision} onChange={e => setForm({ ...form, ultimaRevision: e.target.value })} /></div>
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
        module="construction_machinery"
        moduleLabel="Maquinaria"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Maquinaria"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
