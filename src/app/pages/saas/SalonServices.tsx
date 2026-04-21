import { useState, useMemo, useCallback, useEffect } from 'react';
import { Layout } from '../../components/saas/Layout';
import { useModalClose } from '../../hooks/useModalClose';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import {
  Scissors, Plus, Search, Edit3, Trash2, X, Clock,
  Star, DollarSign, Filter, Tag, TrendingUp, Loader2,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { toast } from 'sonner';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

type ServiceCategory = 'corte' | 'color' | 'mechas' | 'tratamiento_capilar' | 'peinado' | 'barba' | 'manicura' | 'pedicura';

interface SalonService extends VerticalEntity {
  nombre: string;
  categoria: ServiceCategory;
  duracion: number;
  precio: number;
  descripcion: string;
  popular: boolean;
}

type SalonServiceForm = Omit<SalonService, keyof VerticalEntity>;

const CATEGORY_CFG: Record<ServiceCategory, { label: string; color: string }> = {
  corte: { label: 'Corte', color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300' },
  color: { label: 'Color', color: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300' },
  mechas: { label: 'Mechas', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  tratamiento_capilar: { label: 'Tratamiento capilar', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
  peinado: { label: 'Peinado', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  barba: { label: 'Barba', color: 'bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-300' },
  manicura: { label: 'Manicura', color: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300' },
  pedicura: { label: 'Pedicura', color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300' },
};

const emptyForm = (): SalonServiceForm => ({
  nombre: '', categoria: 'corte', duracion: 30, precio: 0, descripcion: '', popular: false,
});

export function SalonServices() {
  const { user } = useAuth();
  const api = useMemo(() => createVerticalApi<SalonService>('salon', 'services'), []);
  const userId = user?.user_id || user?.id || '';

  const [items, setItems] = useState<SalonService[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState<ServiceCategory | ''>('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<SalonService | null>(null);
  const [form, setForm] = useState<SalonServiceForm>(emptyForm());
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
    { key: 'price', label: 'Precio' },
    { key: 'duration', label: 'Duración' },
    { key: 'category', label: 'Categoría' },
    { key: 'description', label: 'Descripción' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'name', label: 'Nombre', required: true, example: '' },
    { key: 'price', label: 'Precio', example: '' },
    { key: 'duration', label: 'Duración', example: '' },
    { key: 'category', label: 'Categoría', example: '' },
    { key: 'description', label: 'Descripción', example: '' },
  ];

  const handleAIEntries = async (entries: Record<string, unknown>[]) => {
    toast.success(`${entries.length} servicio(s) parseado(s) con IA`);
  };

  const handleImportEntries = async (entries: Record<string, string>[]) => {
    toast.success(`${entries.length} servicio(s) importado(s)`);
  };

  useModalClose(showModal, () => setShowModal(false));

  const filtered = items.filter(s => {
    const q = search.toLowerCase();
    const matchSearch = s.nombre.toLowerCase().includes(q) || s.descripcion.toLowerCase().includes(q);
    const matchCat = !filterCat || s.categoria === filterCat;
    return matchSearch && matchCat;
  });

  const activos = items.length;
  const masSolicitado = items.filter(s => s.popular).sort((a, b) => b.precio - a.precio)[0]?.nombre || '—';
  const precioMedio = items.length ? Math.round(items.reduce((s, i) => s + i.precio, 0) / items.length) : 0;

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setShowModal(true); };
  const openEdit = (s: SalonService) => {
    setEditing(s);
    setForm({
      nombre: s.nombre, categoria: s.categoria, duracion: s.duracion, precio: s.precio,
      descripcion: s.descripcion, popular: s.popular,
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

  const stats = [
    { label: 'Servicios activos', value: activos, icon: <Scissors className="w-5 h-5 text-violet-500" />, bg: 'bg-violet-50 dark:bg-violet-900/20' },
    { label: 'Más solicitado', value: masSolicitado, icon: <TrendingUp className="w-5 h-5 text-emerald-500" />, bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
    { label: 'Precio medio', value: `${precioMedio} €`, icon: <DollarSign className="w-5 h-5 text-blue-500" />, bg: 'bg-blue-50 dark:bg-blue-900/20' },
  ];

  return (
    <Layout title="Servicios / Tratamientos">
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {stats.map(s => (
            <div key={s.label} className={`${s.bg} rounded-xl p-4 flex items-center gap-3`}>
              <div className="p-2 bg-white dark:bg-gray-800 rounded-lg shadow-sm">{s.icon}</div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">{s.label}</p>
                <p className="text-lg font-bold text-gray-900 dark:text-white truncate max-w-[200px]">{s.value}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar servicio…" disabled={loading} className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-violet-500 outline-none" />
          </div>
          <div className="flex gap-2 flex-wrap">
            <div className="relative">
              <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <select value={filterCat} onChange={e => setFilterCat(e.target.value as any)} disabled={loading} className="pl-8 pr-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm">
                <option value="">Todas las categorías</option>
                {Object.entries(CATEGORY_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <AddButtonDropdown
                label="Nuevo servicio"
                onQuickAdd={openCreate}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de servicio"
              />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-700 text-left text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                <th className="px-4 py-3">Nombre</th><th className="px-4 py-3">Categoría</th><th className="px-4 py-3">Duración</th><th className="px-4 py-3 text-right">Precio</th><th className="px-4 py-3">Descripción</th><th className="px-4 py-3 text-center">Popular</th><th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-gray-500">
                    <span className="inline-flex items-center justify-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Cargando…
                    </span>
                  </td>
                </tr>
              ) : filtered.map(s => {
                const cat = CATEGORY_CFG[s.categoria];
                return (
                  <tr key={s._id} className="border-b border-gray-50 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{s.nombre}</td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cat.color}`}>{cat.label}</span></td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300"><Clock className="w-3.5 h-3.5 inline mr-1" />{s.duracion} min</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-white">{s.precio} €</td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 max-w-[200px] truncate">{s.descripcion}</td>
                    <td className="px-4 py-3 text-center">{s.popular ? <Star className="w-4 h-4 text-amber-400 fill-amber-400 inline" /> : <span className="text-gray-300 dark:text-gray-600">—</span>}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => openEdit(s)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"><Edit3 className="w-4 h-4 text-gray-500" /></button>
                        <button type="button" onClick={() => void handleDelete(s._id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"><Trash2 className="w-4 h-4 text-red-500" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!loading && !filtered.length && <tr><td colSpan={7} className="text-center py-10 text-gray-400">No se encontraron servicios</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6 space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">{editing ? 'Editar servicio' : 'Nuevo servicio'}</h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><X className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Nombre</label>
                <input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Categoría</label>
                <select value={form.categoria} onChange={e => setForm({ ...form, categoria: e.target.value as ServiceCategory })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm">
                  {Object.entries(CATEGORY_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Duración (min)</label>
                <input type="number" value={form.duracion} onChange={e => setForm({ ...form, duracion: +e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Precio (€)</label>
                <input type="number" value={form.precio} onChange={e => setForm({ ...form, precio: +e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm" />
              </div>
              <div className="flex items-center gap-2 pt-5">
                <input type="checkbox" checked={form.popular} onChange={e => setForm({ ...form, popular: e.target.checked })} className="rounded border-gray-300 text-violet-600 focus:ring-violet-500" />
                <label className="text-sm text-gray-700 dark:text-gray-300">Popular</label>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Descripción</label>
                <textarea rows={2} value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm" />
              </div>
            </div>
            <div className="sticky bottom-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 -mx-6 px-6 -mb-6 pb-6 pt-4 flex justify-end gap-2 rounded-b-2xl">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-600 text-sm hover:bg-gray-50 dark:hover:bg-gray-700">Cancelar</button>
              <button type="button" onClick={() => void handleSave()} className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition-colors">
                {editing ? 'Guardar cambios' : 'Crear servicio'}
              </button>
            </div>
          </div>
        </div>
      )}
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="salon_services"
        moduleLabel="Servicios"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Servicios"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
