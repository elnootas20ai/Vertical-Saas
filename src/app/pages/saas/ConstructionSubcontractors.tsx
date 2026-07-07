import { useState, useMemo, useEffect, useCallback } from 'react';
import { Layout } from '../../components/saas/Layout';
import { useModalClose } from '../../hooks/useModalClose';
import { useAuth } from '../../context/AuthContext';
import {
  Search, Plus, X, Edit3, Filter, Trash2, Wrench,
  Phone, Mail, Wallet,
} from 'lucide-react';
import type { ConstructionGuild, ConstructionConfig } from '../../lib/constructionApi';
import {
  listConstructionGuilds, createConstructionGuild, updateConstructionGuild, deleteConstructionGuild,
  getConstructionConfig,
} from '../../lib/constructionApi';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';
import { toast } from 'sonner';
import { bulkCreateVerticalEntries, entryStr, entryNum } from '../../lib/bulkVerticalImport';

const GREMIO_COLORS = [
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  'bg-lime-100 text-lime-700 dark:bg-lime-900/30 dark:text-lime-400',
  'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
  'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
  'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
  'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
  'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
  'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
  'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/30 dark:text-fuchsia-400',
  'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
  'bg-stone-100 text-stone-700 dark:bg-stone-900/30 dark:text-stone-400',
  'bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-400',
];

function getGremioColor(tipo: string, guildList: string[]): string {
  const idx = guildList.indexOf(tipo);
  return GREMIO_COLORS[idx >= 0 ? idx % GREMIO_COLORS.length : GREMIO_COLORS.length - 1];
}

const emptyForm = { nombre: '', tipo: 'albanileria', contacto: '', telefono: '', email: '', precioMateriales: 0, precioManoObra: 0, precioEstructural: 0, notas: '' };

const fmt = (n: number) => n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });

export function ConstructionSubcontractors() {
  const { user } = useAuth();
  const userId = user?.user_id || user?.id || '';

  const [guilds, setGuilds] = useState<ConstructionGuild[]>([]);
  const [config, setConfig] = useState<ConstructionConfig | null>(null);
  const [search, setSearch] = useState('');
  const [filterTipo, setFilterTipo] = useState('todos');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ConstructionGuild | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'name', label: 'Nombre' },
    { key: 'cif', label: 'CIF/NIF' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Teléfono' },
    { key: 'specialty', label: 'Especialidad' },
    { key: 'notes', label: 'Notas' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'name', label: 'Nombre', required: true, example: '' },
    { key: 'cif', label: 'CIF/NIF', example: '' },
    { key: 'email', label: 'Email', example: '' },
    { key: 'phone', label: 'Teléfono', example: '' },
    { key: 'specialty', label: 'Especialidad', example: '' },
    { key: 'notes', label: 'Notas', example: '' },
  ];

  const persistEntries = async (entries: Record<string, unknown>[]) => {
    if (!userId) {
      toast.error('Sesión no válida');
      return;
    }
    const created = await bulkCreateVerticalEntries(userId, {
      create: (uid, data) => createConstructionGuild(uid, data as Partial<ConstructionGuild>),
    }, entries, (entry) => ({
      nombre: entryStr(entry, 'name', 'nombre'),
      telefono: entryStr(entry, 'phone', 'telefono'),
      email: entryStr(entry, 'email'),
      tipo: 'subcontratista',
    }));
    if (created > 0) {
      toast.success(`${created} subcontratista(s) creado(s)`);
      void load();
    } else {
      toast.error('No se pudo crear ningún registro');
    }
  };

  const handleAIEntries = persistEntries;
  const handleImportEntries = async (entries: Record<string, string>[]) => persistEntries(entries);

  const guildLabels = config?.guildLabels || {};
  const guildTypes = config?.guilds || [];

  useModalClose(modalOpen, () => setModalOpen(false));

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const [g, cfg] = await Promise.all([listConstructionGuilds(userId), getConstructionConfig()]);
      setGuilds(g); setConfig(cfg);
    } catch { /* silently fail */ }
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => guilds.filter(g => {
    const matchSearch = `${g.nombre} ${g.tipo} ${g.contacto}`.toLowerCase().includes(search.toLowerCase());
    const matchTipo = filterTipo === 'todos' || g.tipo === filterTipo;
    return matchSearch && matchTipo;
  }), [guilds, search, filterTipo]);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setModalOpen(true); };
  const openEdit = (g: ConstructionGuild) => {
    setEditing(g);
    setForm({ nombre: g.nombre, tipo: g.tipo, contacto: g.contacto, telefono: g.telefono, email: g.email, precioMateriales: g.precioMateriales, precioManoObra: g.precioManoObra, precioEstructural: g.precioEstructural, notas: g.notas });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombre.trim() || !userId) return;
    try {
      if (editing) {
        const updated = await updateConstructionGuild(userId, { ...editing, ...form } as ConstructionGuild);
        setGuilds(prev => prev.map(g => g._id === updated._id ? updated : g));
      } else {
        const created = await createConstructionGuild(userId, form);
        setGuilds(prev => [created, ...prev]);
      }
      setModalOpen(false);
    } catch { /* silently fail */ }
  };

  const handleDelete = async (id: string) => {
    if (!userId) return;
    try { await deleteConstructionGuild(userId, id); setGuilds(prev => prev.filter(g => g._id !== id)); } catch { /* silently fail */ }
  };

  const precioTotal = Number(form.precioMateriales) + Number(form.precioManoObra) + Number(form.precioEstructural);

  const inputClass = 'w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 dark:focus:border-gray-400 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100';
  const labelClass = 'block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5';

  if (loading) return <Layout title="Gremios — Constructora"><div className="flex items-center justify-center py-20 text-gray-400">Cargando...</div></Layout>;

  return (
    <Layout title="Gremios — Constructora">
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input type="text" placeholder="Buscar gremios..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none focus:border-gray-900 dark:focus:border-gray-400" />
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <select value={filterTipo} onChange={e => setFilterTipo(e.target.value)} className="pl-9 pr-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none appearance-none cursor-pointer">
              <option value="todos">Todos los gremios</option>
              {guildTypes.map(g => <option key={g} value={g}>{guildLabels[g] || g}</option>)}
            </select>
          </div>
          <AddButtonDropdown
                label="Nuevo subcontratista"
                onQuickAdd={openCreate}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de subcontratista"
              />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map(g => (
          <div key={g._id} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center"><Wrench className="w-5 h-5 text-blue-600 dark:text-blue-400" /></div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">{g.nombre}</h3>
                  <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-semibold mt-0.5 ${getGremioColor(g.tipo, guildTypes)}`}>{guildLabels[g.tipo] || g.tipo}</span>
                </div>
              </div>
              <div className="flex gap-1">
                <button onClick={() => openEdit(g)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"><Edit3 className="w-4 h-4 text-gray-500" /></button>
                <button onClick={() => handleDelete(g._id)} className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"><Trash2 className="w-4 h-4 text-red-500" /></button>
              </div>
            </div>
            {g.contacto && <p className="text-sm text-gray-600 dark:text-gray-300 mb-1">{g.contacto}</p>}
            <div className="space-y-1 text-sm text-gray-500 dark:text-gray-400">
              {g.telefono && <p className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" />{g.telefono}</p>}
              {g.email && <p className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" />{g.email}</p>}
            </div>
            <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700/50 space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Materiales</span><span className="font-semibold text-gray-900 dark:text-gray-100">{fmt(g.precioMateriales)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Mano de obra</span><span className="font-semibold text-gray-900 dark:text-gray-100">{fmt(g.precioManoObra)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Gastos estructurales</span><span className="font-semibold text-gray-900 dark:text-gray-100">{fmt(g.precioEstructural)}</span></div>
              <div className="flex justify-between pt-1 border-t border-gray-100 dark:border-gray-700/50"><span className="text-gray-700 dark:text-gray-200 font-semibold flex items-center gap-1"><Wallet className="w-3.5 h-3.5" />Total</span><span className="font-bold text-purple-600 dark:text-purple-400">{fmt(g.precioTotal)}</span></div>
            </div>
            <a href={`/saas/construction-payments?guildId=${g._id}`}
              className="mt-3 block text-center text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 hover:underline">
              Ver pagos de este gremio →
            </a>
          </div>
        ))}
        {filtered.length === 0 && <div className="col-span-full text-center py-12 text-gray-400">No se encontraron gremios</div>}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setModalOpen(false)}>
          <form onSubmit={handleSave} className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{editing ? 'Editar gremio' : 'Nuevo gremio'}</h2>
              <button type="button" onClick={() => setModalOpen(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><label className={labelClass}>Nombre / Empresa</label><input className={inputClass} value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} required /></div>
                <div>
                  <label className={labelClass}>Tipo de gremio</label>
                  <select className={inputClass} value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })}>
                    {guildTypes.map(g => <option key={g} value={g}>{guildLabels[g] || g}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div><label className={labelClass}>Contacto</label><input className={inputClass} value={form.contacto} onChange={e => setForm({ ...form, contacto: e.target.value })} /></div>
                <div><label className={labelClass}>Teléfono</label><input className={inputClass} value={form.telefono} onChange={e => setForm({ ...form, telefono: e.target.value })} /></div>
                <div><label className={labelClass}>Email</label><input type="email" className={inputClass} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
              </div>

              <div className="bg-gray-50 dark:bg-gray-900/50 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Precios (todo incluido)</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div><label className={labelClass}>Materiales</label><input type="number" className={inputClass} value={form.precioMateriales} onChange={e => setForm({ ...form, precioMateriales: Number(e.target.value) })} /></div>
                  <div><label className={labelClass}>Mano de obra</label><input type="number" className={inputClass} value={form.precioManoObra} onChange={e => setForm({ ...form, precioManoObra: Number(e.target.value) })} /></div>
                  <div><label className={labelClass}>G. estructurales</label><input type="number" className={inputClass} value={form.precioEstructural} onChange={e => setForm({ ...form, precioEstructural: Number(e.target.value) })} /></div>
                </div>
                <div className="mt-3 text-right text-lg font-bold text-purple-600 dark:text-purple-400">Total: {fmt(precioTotal)}</div>
              </div>

              <div><label className={labelClass}>Notas</label><textarea className={inputClass} rows={2} value={form.notas} onChange={e => setForm({ ...form, notas: e.target.value })} /></div>
            </div>
            <div className="flex gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
              <button type="button" onClick={() => setModalOpen(false)} className="flex-1 px-4 py-3 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">Cancelar</button>
              <button type="submit" className="flex-1 px-4 py-3 bg-gray-900 hover:bg-black dark:bg-gray-100 dark:hover:bg-white text-white dark:text-gray-900 rounded-xl font-semibold transition-colors">Guardar</button>
            </div>
          </form>
        </div>
      )}
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="construction_subcontractors"
        moduleLabel="Subcontratistas"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Subcontratistas"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
