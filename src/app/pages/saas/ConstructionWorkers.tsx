import { useState, useMemo, useEffect, useCallback } from 'react';
import { Layout } from '../../components/saas/Layout';
import { useModalClose } from '../../hooks/useModalClose';
import { useAuth } from '../../context/AuthContext';
import {
  Search, Plus, X, Edit3, Trash2, Filter, HardHat, MapPin,
  Phone, Mail, FileText, Building2, Upload, CheckCircle2, XCircle,
} from 'lucide-react';
import type { ConstructionWorker, ConstructionProject, WorkerDoc } from '../../lib/constructionApi';
import {
  listConstructionWorkers, createConstructionWorker, updateConstructionWorker,
  deleteConstructionWorker, listConstructionProjects,
} from '../../lib/constructionApi';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';
import { toast } from 'sonner';
import { bulkCreateVerticalEntries, entryStr, entryNum } from '../../lib/bulkVerticalImport';

const GREMIOS = ['carpintería', 'peletería', 'lampistería', 'pradurista', 'yesero', 'pintor', 'herrero', 'electricista', 'fontanero', 'albañil', 'otro'];

const emptyForm = { nombre: '', dni: '', telefono: '', email: '', gremio: 'otro', obraAsignada: '', obraNombre: '', ubicacionObra: '', activo: true, notas: '' };

export function ConstructionWorkers() {
  const { user } = useAuth();
  const userId = user?.user_id || user?.id || '';

  const [workers, setWorkers] = useState<ConstructionWorker[]>([]);
  const [projects, setProjects] = useState<ConstructionProject[]>([]);
  const [search, setSearch] = useState('');
  const [filterGremio, setFilterGremio] = useState('todos');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ConstructionWorker | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [docs, setDocs] = useState<WorkerDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'name', label: 'Nombre' },
    { key: 'dni', label: 'DNI' },
    { key: 'phone', label: 'Teléfono' },
    { key: 'role', label: 'Puesto' },
    { key: 'specialty', label: 'Especialidad' },
    { key: 'notes', label: 'Notas' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'name', label: 'Nombre', required: true, example: '' },
    { key: 'dni', label: 'DNI', example: '' },
    { key: 'phone', label: 'Teléfono', example: '' },
    { key: 'role', label: 'Puesto', example: '' },
    { key: 'specialty', label: 'Especialidad', example: '' },
    { key: 'notes', label: 'Notas', example: '' },
  ];

  const persistEntries = async (entries: Record<string, unknown>[]) => {
    if (!userId) {
      toast.error('Sesión no válida');
      return;
    }
    const created = await bulkCreateVerticalEntries(userId, {
      create: (uid, data) => createConstructionWorker(uid, data as Partial<ConstructionWorker>),
    }, entries, (entry) => ({
      nombre: entryStr(entry, 'name', 'nombre'),
      telefono: entryStr(entry, 'phone', 'telefono'),
      email: entryStr(entry, 'email'),
      rol: entryStr(entry, 'role', 'rol') || 'operario',
    }));
    if (created > 0) {
      toast.success(`${created} trabajador(es) creado(s)`);
      void load();
    } else {
      toast.error('No se pudo crear ningún registro');
    }
  };

  const handleAIEntries = persistEntries;
  const handleImportEntries = async (entries: Record<string, string>[]) => persistEntries(entries);

  useModalClose(modalOpen, () => setModalOpen(false));

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const [w, p] = await Promise.all([listConstructionWorkers(userId), listConstructionProjects(userId)]);
      setWorkers(w); setProjects(p);
    } catch { /* silently fail */ }
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => workers.filter(w => {
    const matchSearch = `${w.nombre} ${w.dni} ${w.gremio} ${w.obraNombre}`.toLowerCase().includes(search.toLowerCase());
    const matchGremio = filterGremio === 'todos' || w.gremio === filterGremio;
    return matchSearch && matchGremio;
  }), [workers, search, filterGremio]);

  const stats = useMemo(() => ({
    total: workers.length,
    activos: workers.filter(w => w.activo).length,
  }), [workers]);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setDocs([]); setModalOpen(true); };
  const openEdit = (w: ConstructionWorker) => {
    setEditing(w);
    setForm({ nombre: w.nombre, dni: w.dni, telefono: w.telefono, email: w.email, gremio: w.gremio, obraAsignada: w.obraAsignada, obraNombre: w.obraNombre, ubicacionObra: w.ubicacionObra, activo: w.activo, notas: w.notas });
    setDocs(w.documentos || []);
    setModalOpen(true);
  };

  const onProjectChange = (projectId: string) => {
    const p = projects.find(pr => pr._id === projectId);
    setForm(prev => ({ ...prev, obraAsignada: projectId, obraNombre: p?.nombre || '', ubicacionObra: p?.ubicacion || '' }));
  };

  const addDoc = () => setDocs(prev => [...prev, { nombre: '', url: '', tipo: 'contrato', fecha: new Date().toISOString().slice(0, 10) }]);
  const removeDoc = (i: number) => setDocs(prev => prev.filter((_, idx) => idx !== i));
  const updateDoc = (i: number, field: string, value: string) => setDocs(prev => prev.map((d, idx) => idx === i ? { ...d, [field]: value } : d));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombre.trim() || !userId) return;
    try {
      const payload = { ...form, documentos: docs };
      if (editing) {
        const updated = await updateConstructionWorker(userId, { ...editing, ...payload } as ConstructionWorker);
        setWorkers(prev => prev.map(w => w._id === updated._id ? updated : w));
      } else {
        const created = await createConstructionWorker(userId, payload);
        setWorkers(prev => [created, ...prev]);
      }
      setModalOpen(false);
    } catch { /* silently fail */ }
  };

  const handleDelete = async (id: string) => {
    if (!userId) return;
    try { await deleteConstructionWorker(userId, id); setWorkers(prev => prev.filter(w => w._id !== id)); } catch { /* silently fail */ }
  };

  const inputClass = 'w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 dark:focus:border-gray-400 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100';
  const labelClass = 'block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5';

  if (loading) return <Layout title="Trabajadores — Constructora"><div className="flex items-center justify-center py-20 text-gray-400">Cargando...</div></Layout>;

  return (
    <Layout title="Trabajadores — Constructora">
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3 mb-2"><HardHat className="w-5 h-5 text-blue-600" /><span className="text-sm text-gray-500 dark:text-gray-400">Total trabajadores</span></div>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.total}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3 mb-2"><CheckCircle2 className="w-5 h-5 text-green-600" /><span className="text-sm text-gray-500 dark:text-gray-400">Activos</span></div>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.activos}</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input type="text" placeholder="Buscar trabajadores..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none focus:border-gray-900 dark:focus:border-gray-400" />
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <select value={filterGremio} onChange={e => setFilterGremio(e.target.value)} className="pl-9 pr-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none appearance-none cursor-pointer">
              <option value="todos">Todos los gremios</option>
              {GREMIOS.map(g => <option key={g} value={g}>{g.charAt(0).toUpperCase() + g.slice(1)}</option>)}
            </select>
          </div>
          <AddButtonDropdown
                label="Nuevo"
                onQuickAdd={openCreate}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de trabajador"
              />
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 text-left">
              {['Nombre', 'DNI', 'Gremio', 'Obra asignada', 'Ubicación', 'Docs', 'Estado', ''].map(h => (
                <th key={h} className="px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(w => (
              <tr key={w._id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2"><HardHat className="w-4 h-4 text-gray-400 shrink-0" />{w.nombre}</td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-300 font-mono text-xs">{w.dni}</td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-300 capitalize">{w.gremio}</td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-300"><span className="flex items-center gap-1"><Building2 className="w-3.5 h-3.5" />{w.obraNombre || '—'}</span></td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-300"><span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{w.ubicacionObra || '—'}</span></td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-300"><span className="flex items-center gap-1"><FileText className="w-3.5 h-3.5" />{w.documentos?.length || 0}</span></td>
                <td className="px-4 py-3">
                  {w.activo
                    ? <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"><CheckCircle2 className="w-3.5 h-3.5" />Activo</span>
                    : <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"><XCircle className="w-3.5 h-3.5" />Inactivo</span>
                  }
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(w)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"><Edit3 className="w-4 h-4 text-gray-500" /></button>
                    <button onClick={() => handleDelete(w._id)} className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"><Trash2 className="w-4 h-4 text-red-500" /></button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-400">No se encontraron trabajadores</td></tr>}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setModalOpen(false)}>
          <form onSubmit={handleSave} className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{editing ? 'Editar trabajador' : 'Nuevo trabajador'}</h2>
              <button type="button" onClick={() => setModalOpen(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className={labelClass}>Nombre completo</label><input className={inputClass} value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} required /></div>
                <div><label className={labelClass}>DNI / NIE</label><input className={inputClass} value={form.dni} onChange={e => setForm({ ...form, dni: e.target.value })} /></div>
                <div><label className={labelClass}>Teléfono</label><input className={inputClass} value={form.telefono} onChange={e => setForm({ ...form, telefono: e.target.value })} /></div>
                <div><label className={labelClass}>Email</label><input type="email" className={inputClass} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
                <div>
                  <label className={labelClass}>Gremio</label>
                  <select className={inputClass} value={form.gremio} onChange={e => setForm({ ...form, gremio: e.target.value })}>
                    {GREMIOS.map(g => <option key={g} value={g}>{g.charAt(0).toUpperCase() + g.slice(1)}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Obra asignada</label>
                  <select className={inputClass} value={form.obraAsignada} onChange={e => onProjectChange(e.target.value)}>
                    <option value="">— Sin asignar —</option>
                    {projects.map(p => <option key={p._id} value={p._id}>{p.nombre} — {p.ubicacion}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <label className={labelClass}>Activo</label>
                <button type="button" onClick={() => setForm(prev => ({ ...prev, activo: !prev.activo }))} className={`relative w-11 h-6 rounded-full transition-colors ${form.activo ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}>
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${form.activo ? 'translate-x-5' : ''}`} />
                </button>
              </div>

              {/* Documentos para gerencia */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Documentos para gerencia</label>
                  <button type="button" onClick={addDoc} className="text-sm font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 flex items-center gap-1"><Plus className="w-4 h-4" />Añadir</button>
                </div>
                <div className="space-y-2">
                  {docs.map((d, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <input className="flex-1 px-2 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm" placeholder="Nombre del documento" value={d.nombre} onChange={e => updateDoc(i, 'nombre', e.target.value)} />
                      <select className="px-2 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm" value={d.tipo} onChange={e => updateDoc(i, 'tipo', e.target.value)}>
                        <option value="contrato">Contrato</option>
                        <option value="seguro">Seguro</option>
                        <option value="formacion">Formación PRL</option>
                        <option value="certificado">Certificado</option>
                        <option value="otro">Otro</option>
                      </select>
                      <input className="w-32 px-2 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm" placeholder="URL" value={d.url} onChange={e => updateDoc(i, 'url', e.target.value)} />
                      <button type="button" onClick={() => removeDoc(i)} className="p-1 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"><Trash2 className="w-4 h-4 text-red-500" /></button>
                    </div>
                  ))}
                </div>
              </div>

              <div><label className={labelClass}>Notas</label><textarea className={inputClass} rows={2} value={form.notas} onChange={e => setForm({ ...form, notas: e.target.value })} /></div>
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
        module="construction_workers"
        moduleLabel="Trabajadores"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Trabajadores"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
