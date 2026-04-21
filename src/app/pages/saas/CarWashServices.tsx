import { useState, useMemo, useEffect, useCallback } from 'react';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import { useModalClose } from '../../hooks/useModalClose';
import {
  Search, Plus, X, Edit2, Trash2, Filter,
  Sparkles, CheckCircle2, Euro, TrendingUp,
  Loader2,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { toast } from 'sonner';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

type ServiceType = 'exterior' | 'interior' | 'completo' | 'premium' | 'express';

interface WashService extends VerticalEntity {
  nombre: string;
  tipo: ServiceType;
  duracionMin: number;
  precio: number;
  descripcion: string;
  activo: boolean;
  reservasMes: number;
}

type WashServiceForm = Omit<WashService, keyof VerticalEntity>;

const TYPE_CFG: Record<ServiceType, { label: string; dot: string }> = {
  exterior: { label: 'Exterior', dot: 'bg-sky-500' },
  interior: { label: 'Interior', dot: 'bg-amber-500' },
  completo: { label: 'Completo', dot: 'bg-emerald-500' },
  premium: { label: 'Premium', dot: 'bg-violet-500' },
  express: { label: 'Express', dot: 'bg-rose-500' },
};

const EMPTY_FORM: WashServiceForm = {
  nombre: '', tipo: 'exterior', duracionMin: 30, precio: 0, descripcion: '', activo: true, reservasMes: 0,
};

export function CarWashServices() {
  const { user } = useAuth();
  const api = useMemo(() => createVerticalApi<WashService>('carwash', 'services'), []);
  const userId = user?.user_id || user?.id || '';

  const [items, setItems] = useState<WashService[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterTipo, setFilterTipo] = useState<ServiceType | 'all'>('all');
  const [filterActivo, setFilterActivo] = useState<'all' | 'si' | 'no'>('all');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<WashService | null>(null);
  const [form, setForm] = useState<WashServiceForm>(EMPTY_FORM);
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
    { key: 'description', label: 'Descripción' },
    { key: 'category', label: 'Categoría' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'name', label: 'Nombre', required: true, example: '' },
    { key: 'price', label: 'Precio', example: '' },
    { key: 'duration', label: 'Duración', example: '' },
    { key: 'description', label: 'Descripción', example: '' },
    { key: 'category', label: 'Categoría', example: '' },
  ];

  const handleAIEntries = async (entries: Record<string, unknown>[]) => {
    toast.success(`${entries.length} servicio(s) parseado(s) con IA`);
  };

  const handleImportEntries = async (entries: Record<string, string>[]) => {
    toast.success(`${entries.length} servicio(s) importado(s)`);
  };

  useModalClose(showModal, () => setShowModal(false));

  const filtered = useMemo(() => items.filter(s => {
    const q = search.toLowerCase();
    if (search && !s.nombre.toLowerCase().includes(q) && !s.descripcion.toLowerCase().includes(q)) return false;
    if (filterTipo !== 'all' && s.tipo !== filterTipo) return false;
    if (filterActivo === 'si' && !s.activo) return false;
    if (filterActivo === 'no' && s.activo) return false;
    return true;
  }), [items, search, filterTipo, filterActivo]);

  const stats = useMemo(() => {
    const activos = items.filter(s => s.activo).length;
    const precioMedio = items.length
      ? Math.round((items.reduce((acc, s) => acc + s.precio, 0) / items.length) * 100) / 100
      : 0;
    const masPopular = items.reduce((best, s) => (s.reservasMes > (best?.reservasMes ?? -1) ? s : best), items[0]);
    return { total: items.length, activos, precioMedio, masPopularNombre: masPopular?.nombre ?? '—' };
  }, [items]);

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setShowModal(true); };
  const openEdit = (s: WashService) => {
    setEditing(s);
    setForm({
      nombre: s.nombre, tipo: s.tipo, duracionMin: s.duracionMin, precio: s.precio,
      descripcion: s.descripcion, activo: s.activo, reservasMes: s.reservasMes,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.nombre.trim() || !userId) return;
    try {
      if (editing) {
        await api.update(userId, editing._id, form);
      } else {
        await api.create(userId, form);
      }
      await loadData();
      setShowModal(false);
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

  const STAT_CARDS = [
    { label: 'Total servicios', value: stats.total, icon: Sparkles, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30' },
    { label: 'Servicios activos', value: stats.activos, icon: CheckCircle2, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
    { label: 'Precio medio', value: `${stats.precioMedio.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €`, icon: Euro, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/30' },
    { label: 'Servicio más popular', value: stats.masPopularNombre, icon: TrendingUp, color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-900/30' },
  ];

  return (
    <Layout title="Servicios de Lavado">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {STAT_CARDS.map(s => (
          <div key={s.label} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-4">
            <div className={`p-3 rounded-xl ${s.bg}`}><s.icon className={`w-5 h-5 ${s.color}`} /></div>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-gray-500 dark:text-gray-400">{s.label}</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white truncate">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="relative flex-1 w-full sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              className="w-full pl-10 pr-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:border-gray-900 dark:focus:border-gray-500 outline-none text-sm"
              placeholder="Buscar por nombre o descripción..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              disabled={loading}
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <Filter className="w-4 h-4 text-gray-400" />
              <select
                className="text-sm border-2 border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 outline-none"
                value={filterTipo}
                onChange={e => setFilterTipo(e.target.value as ServiceType | 'all')}
                disabled={loading}
              >
                <option value="all">Todos los tipos</option>
                {Object.entries(TYPE_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <select
                className="text-sm border-2 border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 outline-none"
                value={filterActivo}
                onChange={e => setFilterActivo(e.target.value as 'all' | 'si' | 'no')}
                disabled={loading}
              >
                <option value="all">Activo: todos</option>
                <option value="si">Solo activos</option>
                <option value="no">Solo inactivos</option>
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
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Nombre</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Tipo</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Duración (min)</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Precio</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Descripción</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Estado</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Reservas / mes</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Acciones</th>
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
              ) : filtered.map(s => (
                <tr key={s._id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition">
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{s.nombre}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 text-sm">
                      <span className={`w-2 h-2 rounded-full ${TYPE_CFG[s.tipo].dot}`} />
                      {TYPE_CFG[s.tipo].label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">{s.duracionMin}</td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-white">{s.precio.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400 max-w-xs truncate" title={s.descripcion}>{s.descripcion}</td>
                  <td className="px-4 py-3">
                    {s.activo
                      ? <span className="text-emerald-600 dark:text-emerald-400 font-medium">Activo</span>
                      : <span className="text-gray-400">Inactivo</span>}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">{s.reservasMes}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button type="button" onClick={() => openEdit(s)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition"><Edit2 className="w-4 h-4" /></button>
                      <button type="button" onClick={() => handleDelete(s._id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-500 hover:text-red-600 transition"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-400 dark:text-gray-500">No hay servicios que coincidan con los filtros.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">{editing ? 'Editar servicio' : 'Nuevo servicio'}</h2>
              <button type="button" onClick={() => setShowModal(false)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Nombre *</label>
                <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Tipo</label>
                  <select className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value as ServiceType }))}>
                    {Object.entries(TYPE_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Duración (min)</label>
                  <input type="number" min={5} className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.duracionMin} onChange={e => setForm(f => ({ ...f, duracionMin: Number(e.target.value) }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Precio (€)</label>
                  <input type="number" step="0.01" min={0} className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.precio} onChange={e => setForm(f => ({ ...f, precio: Number(e.target.value) }))} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Reservas este mes (ref.)</label>
                  <input type="number" min={0} className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.reservasMes} onChange={e => setForm(f => ({ ...f, reservasMes: Number(e.target.value) }))} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Descripción</label>
                <textarea rows={3} className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500 resize-y" value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="rounded border-gray-300 dark:border-gray-600" checked={form.activo} onChange={e => setForm(f => ({ ...f, activo: e.target.checked }))} />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Servicio activo</span>
              </label>
            </div>
            <div className="sticky bottom-0 bg-white dark:bg-gray-800 flex justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700 rounded-b-2xl">
              <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition">Cancelar</button>
              <button type="button" onClick={handleSave} className="px-6 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-semibold hover:opacity-90 transition">{editing ? 'Guardar cambios' : 'Crear servicio'}</button>
            </div>
          </div>
        </div>
      )}
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="carwash_services"
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
