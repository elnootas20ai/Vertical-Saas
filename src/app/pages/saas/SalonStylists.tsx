import { useState, useMemo, useCallback, useEffect } from 'react';
import { Layout } from '../../components/saas/Layout';
import { useModalClose } from '../../hooks/useModalClose';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import {
  Users, Plus, Search, Edit3, Trash2, X, Star,
  Phone, Mail, CalendarDays, Percent, Filter, UserCheck, Loader2,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { toast } from 'sonner';
import { bulkCreateVerticalEntries, entryStr, entryNum } from '../../lib/bulkVerticalImport';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

interface Stylist extends VerticalEntity {
  nombre: string;
  especialidad: string;
  telefono: string;
  email: string;
  citasHoy: number;
  valoracion: number;
  comision: number;
  clientesFijos: number;
}

type StylistForm = Omit<Stylist, keyof VerticalEntity>;

const ESPECIALIDADES = ['Colorista', 'Corte señora', 'Corte caballero', 'Estilista integral', 'Barbero', 'Tratamientos capilares', 'Manicura/Pedicura'];

const emptyForm = (): StylistForm => ({
  nombre: '', especialidad: ESPECIALIDADES[0], telefono: '', email: '',
  citasHoy: 0, valoracion: 5.0, comision: 30, clientesFijos: 0,
});

export function SalonStylists() {
  const { user } = useAuth();
  const api = useMemo(() => createVerticalApi<Stylist>('salon', 'stylists'), []);
  const userId = user?.user_id || user?.id || '';

  const [items, setItems] = useState<Stylist[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterEsp, setFilterEsp] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Stylist | null>(null);
  const [form, setForm] = useState<StylistForm>(emptyForm());
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
      setItems(list);
    } finally {
      setLoading(false);
    }
  }, [userId, api]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'name', label: 'Nombre' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Teléfono' },
    { key: 'specialty', label: 'Especialidad' },
    { key: 'schedule', label: 'Horario' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'name', label: 'Nombre', required: true, example: '' },
    { key: 'email', label: 'Email', example: '' },
    { key: 'phone', label: 'Teléfono', example: '' },
    { key: 'specialty', label: 'Especialidad', example: '' },
    { key: 'schedule', label: 'Horario', example: '' },
  ];

  const persistEntries = async (entries: Record<string, unknown>[]) => {
    if (!userId) {
      toast.error('Sesión no válida');
      return;
    }
    const created = await bulkCreateVerticalEntries(userId, api, entries, (e) => {
    const nombre = entryStr(e, 'nombre', 'name');
    if (!nombre) return null;
    return {
      nombre,
      especialidad: entryStr(e, 'especialidad'),
      telefono: entryStr(e, 'telefono', 'phone', 'tel') || '',
      email: entryStr(e, 'email') || '',
      citasHoy: entryNum(e, 'citasHoy'),
      valoracion: entryNum(e, 'valoracion'),
      comision: entryNum(e, 'comision'),
      clientesFijos: entryNum(e, 'clientesFijos'),
    };
    });
    if (created > 0) {
      await loadData();
      toast.success(`${created} estilista creado(s)`);
    } else {
      toast.error('No se pudo crear ningún registro');
    }
  };

  const handleAIEntries = persistEntries;
  const handleImportEntries = async (entries: Record<string, string>[]) => persistEntries(entries);

  useModalClose(showModal, () => setShowModal(false));

  const filtered = items.filter(s => {
    const q = search.toLowerCase();
    const matchSearch = s.nombre.toLowerCase().includes(q) || s.email.toLowerCase().includes(q);
    const matchEsp = !filterEsp || s.especialidad === filterEsp;
    return matchSearch && matchEsp;
  });

  const totalEstilistas = items.length;
  const citasEquipo = items.reduce((s, i) => s + i.citasHoy, 0);
  const valorMedia = items.length ? (items.reduce((s, i) => s + i.valoracion, 0) / items.length).toFixed(1) : '0';

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setShowModal(true); };
  const openEdit = (s: Stylist) => {
    setEditing(s);
    setForm({
      nombre: s.nombre, especialidad: s.especialidad, telefono: s.telefono, email: s.email,
      citasHoy: s.citasHoy, valoracion: s.valoracion, comision: s.comision, clientesFijos: s.clientesFijos,
    });
    setShowModal(true);
  };
  const handleDelete = async (docId: string) => {
    if (!userId) return;
    try {
      await api.remove(userId, docId);
      await loadData();
    } catch {
      /* fetch layer */
    }
  };
  const handleSave = async () => {
    if (!form.nombre || !userId) return;
    try {
      if (editing) {
        await api.update(userId, editing._id, form);
      } else {
        await api.create(userId, form);
      }
      await loadData();
      setShowModal(false);
    } catch {
      /* fetch layer */
    }
  };

  const renderStars = (val: number) => {
    const full = Math.floor(val);
    return (
      <div className="flex items-center gap-0.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star key={i} className={`w-3.5 h-3.5 ${i < full ? 'text-amber-400 fill-amber-400' : 'text-gray-300 dark:text-gray-600'}`} />
        ))}
        <span className="ml-1 text-xs text-gray-500">{val}</span>
      </div>
    );
  };

  const stats = [
    { label: 'Total estilistas', value: totalEstilistas, icon: <Users className="w-5 h-5 text-violet-500" />, bg: 'bg-violet-50 dark:bg-violet-900/20' },
    { label: 'Citas hoy equipo', value: citasEquipo, icon: <CalendarDays className="w-5 h-5 text-emerald-500" />, bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
    { label: 'Valoración media', value: `${valorMedia} / 5`, icon: <Star className="w-5 h-5 text-amber-500" />, bg: 'bg-amber-50 dark:bg-amber-900/20' },
  ];

  return (
    <Layout title="Estilistas">
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {stats.map(s => (
            <div key={s.label} className={`${s.bg} rounded-xl p-4 flex items-center gap-3`}>
              <div className="p-2 bg-white dark:bg-gray-800 rounded-lg shadow-sm">{s.icon}</div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">{s.label}</p>
                <p className="text-lg font-bold text-gray-900 dark:text-white">{s.value}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar estilista…" disabled={loading} className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-violet-500 outline-none" />
          </div>
          <div className="flex gap-2 flex-wrap">
            <div className="relative">
              <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <select value={filterEsp} onChange={e => setFilterEsp(e.target.value)} disabled={loading} className="pl-8 pr-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm">
                <option value="">Todas las especialidades</option>
                {ESPECIALIDADES.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
            <AddButtonDropdown
                label="Nuevo estilista"
                onQuickAdd={openCreate}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de estilista"
              />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-700 text-left text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                <th className="px-4 py-3">Nombre</th><th className="px-4 py-3">Especialidad</th><th className="px-4 py-3">Teléfono</th><th className="px-4 py-3">Email</th><th className="px-4 py-3 text-center">Citas hoy</th><th className="px-4 py-3">Valoración</th><th className="px-4 py-3 text-center">Comisión</th><th className="px-4 py-3 text-center">Clientes fijos</th><th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-gray-500">
                    <span className="inline-flex items-center justify-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Cargando…
                    </span>
                  </td>
                </tr>
              ) : filtered.map(s => (
                <tr key={s._id} className="border-b border-gray-50 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{s.nombre}</td>
                  <td className="px-4 py-3"><span className="px-2 py-0.5 rounded-full text-xs font-medium bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">{s.especialidad}</span></td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300"><Phone className="w-3.5 h-3.5 inline mr-1" />{s.telefono}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300"><Mail className="w-3.5 h-3.5 inline mr-1" />{s.email}</td>
                  <td className="px-4 py-3 text-center font-semibold text-gray-900 dark:text-white">{s.citasHoy}</td>
                  <td className="px-4 py-3">{renderStars(s.valoracion)}</td>
                  <td className="px-4 py-3 text-center text-gray-700 dark:text-gray-300"><Percent className="w-3.5 h-3.5 inline mr-0.5" />{s.comision}</td>
                  <td className="px-4 py-3 text-center text-gray-700 dark:text-gray-300"><UserCheck className="w-3.5 h-3.5 inline mr-1" />{s.clientesFijos}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => openEdit(s)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"><Edit3 className="w-4 h-4 text-gray-500" /></button>
                      <button type="button" onClick={() => void handleDelete(s._id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"><Trash2 className="w-4 h-4 text-red-500" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && !filtered.length && <tr><td colSpan={9} className="text-center py-10 text-gray-400">No se encontraron estilistas</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6 space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">{editing ? 'Editar estilista' : 'Nuevo estilista'}</h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><X className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Nombre</label>
                <input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Especialidad</label>
                <select value={form.especialidad} onChange={e => setForm({ ...form, especialidad: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm">
                  {ESPECIALIDADES.map(e => <option key={e}>{e}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Teléfono</label>
                <input value={form.telefono} onChange={e => setForm({ ...form, telefono: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Email</label>
                <input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Comisión (%)</label>
                <input type="number" value={form.comision} onChange={e => setForm({ ...form, comision: +e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Valoración</label>
                <input type="number" step="0.1" min="0" max="5" value={form.valoracion} onChange={e => setForm({ ...form, valoracion: +e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Clientes fijos</label>
                <input type="number" value={form.clientesFijos} onChange={e => setForm({ ...form, clientesFijos: +e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm" />
              </div>
            </div>
            <div className="sticky bottom-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 -mx-6 px-6 -mb-6 pb-6 pt-4 flex justify-end gap-2 rounded-b-2xl">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-600 text-sm hover:bg-gray-50 dark:hover:bg-gray-700">Cancelar</button>
              <button type="button" onClick={() => void handleSave()} className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition-colors">
                {editing ? 'Guardar cambios' : 'Crear estilista'}
              </button>
            </div>
          </div>
        </div>
      )}
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="salon_stylists"
        moduleLabel="Estilistas"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Estilistas"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
