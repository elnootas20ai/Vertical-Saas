import { useState, useMemo, useCallback, useEffect } from 'react';
import { useModalClose } from '../../hooks/useModalClose';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import {
  Pill, Plus, Search, Edit3, Trash2, X, TrendingUp,
  DollarSign, Activity, Heart, Eye, Bone, Stethoscope, Smile,
  Loader2,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { toast } from 'sonner';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

type TreatmentCategory = 'dermatologia' | 'cardiologia' | 'traumatologia' | 'general' | 'dental' | 'oftalmologia';

interface Treatment extends VerticalEntity {
  nombre: string;
  categoria: TreatmentCategory;
  duracion: string;
  precio: number;
  descripcion: string;
  activo: boolean;
}

type TreatmentForm = Omit<Treatment, keyof VerticalEntity>;

const CATEGORY_CONFIG: Record<TreatmentCategory, { label: string; bg: string; text: string; icon: React.ReactNode }> = {
  dermatologia: { label: 'Dermatología', bg: 'bg-pink-50 dark:bg-pink-900/30', text: 'text-pink-700 dark:text-pink-300', icon: <Activity className="w-3.5 h-3.5" /> },
  cardiologia: { label: 'Cardiología', bg: 'bg-red-50 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300', icon: <Heart className="w-3.5 h-3.5" /> },
  traumatologia: { label: 'Traumatología', bg: 'bg-amber-50 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-300', icon: <Bone className="w-3.5 h-3.5" /> },
  general: { label: 'General', bg: 'bg-blue-50 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300', icon: <Stethoscope className="w-3.5 h-3.5" /> },
  dental: { label: 'Dental', bg: 'bg-emerald-50 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-300', icon: <Smile className="w-3.5 h-3.5" /> },
  oftalmologia: { label: 'Oftalmología', bg: 'bg-indigo-50 dark:bg-indigo-900/30', text: 'text-indigo-700 dark:text-indigo-300', icon: <Eye className="w-3.5 h-3.5" /> },
};

const emptyForm = (): TreatmentForm => ({
  nombre: '', categoria: 'general', duracion: '', precio: 0, descripcion: '', activo: true,
});

export function ClinicTreatments() {
  const { user } = useAuth();
  const api = useMemo(() => createVerticalApi<Treatment>('clinic', 'treatments'), []);
  const userId = user?.user_id || user?.id || '';

  const [treatments, setTreatments] = useState<Treatment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState<TreatmentCategory | ''>('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Treatment | null>(null);
  const [form, setForm] = useState<TreatmentForm>(emptyForm());
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
      setTreatments(list.map(t => ({
        ...t,
        precio: typeof t.precio === 'number' ? t.precio : Number(t.precio) || 0,
        activo: typeof t.activo === 'boolean' ? t.activo : String(t.activo) === 'true' || t.activo === true,
      })));
    } finally {
      setLoading(false);
    }
  }, [userId, api]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'name', label: 'Nombre' },
    { key: 'category', label: 'Categoría' },
    { key: 'price', label: 'Precio' },
    { key: 'duration', label: 'Duración' },
    { key: 'description', label: 'Descripción' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'name', label: 'Nombre', required: true, example: '' },
    { key: 'category', label: 'Categoría', example: '' },
    { key: 'price', label: 'Precio', example: '' },
    { key: 'duration', label: 'Duración', example: '' },
    { key: 'description', label: 'Descripción', example: '' },
  ];

  const handleAIEntries = async (entries: Record<string, unknown>[]) => {
    toast.success(`${entries.length} tratamiento(s) parseado(s) con IA`);
  };

  const handleImportEntries = async (entries: Record<string, string>[]) => {
    toast.success(`${entries.length} tratamiento(s) importado(s)`);
  };

  const filtered = treatments.filter(t => {
    const matchSearch = t.nombre.toLowerCase().includes(search.toLowerCase()) || t.descripcion.toLowerCase().includes(search.toLowerCase());
    const matchCat = !filterCat || t.categoria === filterCat;
    return matchSearch && matchCat;
  });

  const activos = treatments.filter(t => t.activo).length;
  const totalIngresos = treatments.filter(t => t.activo).reduce((s, t) => s + t.precio, 0);
  const masSolicitado = treatments.length > 0
    ? treatments.reduce((a, b) => (a.precio > b.precio ? a : b))
    : null;
  useModalClose(showModal, () => setShowModal(false));

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setShowModal(true); };
  const openEdit = (t: Treatment) => {
    setEditing(t);
    setForm({
      nombre: t.nombre, categoria: t.categoria, duracion: t.duracion, precio: t.precio, descripcion: t.descripcion, activo: t.activo,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.nombre || !userId) return;
    try {
      const payload = { ...form, precio: Number(form.precio), activo: Boolean(form.activo) };
      if (editing) {
        await api.update(userId, editing._id, payload);
      } else {
        await api.create(userId, payload);
      }
      await loadData();
      setShowModal(false);
    } catch {
      /* error from fetch */
    }
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

  const stats = [
    { label: 'Tratamientos activos', value: activos, icon: <Pill className="w-5 h-5 text-blue-500" />, bg: 'bg-blue-50 dark:bg-blue-900/30' },
    { label: 'Más solicitado', value: masSolicitado?.nombre?.split(' ').slice(0, 2).join(' ') || '-', icon: <TrendingUp className="w-5 h-5 text-emerald-500" />, bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
    { label: 'Valor catálogo', value: `${totalIngresos.toLocaleString('es-ES')} €`, icon: <DollarSign className="w-5 h-5 text-amber-500" />, bg: 'bg-amber-50 dark:bg-amber-900/30' },
  ];

  return (
    <Layout title="Tratamientos">
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {stats.map(s => (
            <div key={s.label} className={`${s.bg} rounded-xl p-4 flex items-center gap-4`}>
              <div className="p-2 bg-white dark:bg-gray-800 rounded-lg shadow-sm">{s.icon}</div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{s.value}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="relative flex-1 max-w-md w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar tratamiento..." className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div className="flex gap-2 items-center">
            <select value={filterCat} onChange={e => setFilterCat(e.target.value as any)} className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-300">
              <option value="">Todas las categorías</option>
              {(Object.entries(CATEGORY_CONFIG) as [TreatmentCategory, typeof CATEGORY_CONFIG[TreatmentCategory]][]).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            <AddButtonDropdown
                label="Nuevo tratamiento"
                onQuickAdd={openCreate}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de tratamiento"
              />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Tratamiento</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Categoría</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400 hidden md:table-cell">Duración</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Precio</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400 hidden lg:table-cell">Descripción</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Estado</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">
                    <span className="inline-flex items-center justify-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Cargando…
                    </span>
                  </td>
                </tr>
              ) : filtered.map(t => {
                const cc = CATEGORY_CONFIG[t.categoria];
                return (
                  <tr key={t._id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{t.nombre}</td>
                    <td className="px-4 py-3"><span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cc.bg} ${cc.text}`}>{cc.icon}{cc.label}</span></td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 hidden md:table-cell">{t.duracion}</td>
                    <td className="px-4 py-3 font-semibold text-gray-900 dark:text-gray-100">{t.precio.toLocaleString('es-ES')} €</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 hidden lg:table-cell max-w-[250px] truncate">{t.descripcion}</td>
                    <td className="px-4 py-3">{t.activo ? <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300">Activo</span> : <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">Inactivo</span>}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => openEdit(t)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"><Edit3 className="w-4 h-4" /></button>
                        <button onClick={() => void handleDelete(t._id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-500 hover:text-red-600 transition-colors"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400 dark:text-gray-500">No se encontraron tratamientos</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{editing ? 'Editar Tratamiento' : 'Nuevo Tratamiento'}</h3>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre del tratamiento</label>
                <input value={form.nombre} onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Categoría</label>
                  <select value={form.categoria} onChange={e => setForm(p => ({ ...p, categoria: e.target.value as TreatmentCategory }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                    {(Object.entries(CATEGORY_CONFIG) as [TreatmentCategory, typeof CATEGORY_CONFIG[TreatmentCategory]][]).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Duración</label>
                  <input value={form.duracion} onChange={e => setForm(p => ({ ...p, duracion: e.target.value }))} placeholder="ej. 45 min" className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Precio (€)</label>
                  <input type="number" value={form.precio} onChange={e => setForm(p => ({ ...p, precio: Number(e.target.value) }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.activo} onChange={e => setForm(p => ({ ...p, activo: e.target.checked }))} className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500" />
                    <span className="text-sm text-gray-700 dark:text-gray-300">Activo</span>
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Descripción</label>
                <textarea rows={3} value={form.descripcion} onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none" />
              </div>
            </div>
            <div className="sticky bottom-0 bg-white dark:bg-gray-800 flex justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700 rounded-b-2xl">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">Cancelar</button>
              <button onClick={() => void handleSave()} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">Guardar</button>
            </div>
          </div>
        </div>
      )}
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="clinic_treatments"
        moduleLabel="Tratamientos"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Tratamientos"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
