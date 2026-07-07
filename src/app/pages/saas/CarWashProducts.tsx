import { useState, useMemo, useEffect, useCallback } from 'react';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import { useModalClose } from '../../hooks/useModalClose';
import {
  Search, Plus, X, Edit2, Trash2, Filter,
  FlaskConical, AlertTriangle, Receipt, Package,
  Loader2,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { toast } from 'sonner';
import { bulkCreateVerticalEntries, entryStr, entryNum } from '../../lib/bulkVerticalImport';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

type ProductType = 'champú' | 'cera' | 'desengrasante' | 'abrillantador' | 'ambientador';

interface ChemicalProduct extends VerticalEntity {
  nombre: string;
  tipo: ProductType;
  stockLitros: number;
  stockMinimo: number;
  precioPorLitro: number;
  proveedor: string;
  gastoMensualRef: number;
}

type ChemicalProductForm = Omit<ChemicalProduct, keyof VerticalEntity>;

const TYPE_CFG: Record<ProductType, { label: string; dot: string }> = {
  champú: { label: 'Champú', dot: 'bg-sky-500' },
  cera: { label: 'Cera', dot: 'bg-amber-500' },
  desengrasante: { label: 'Desengrasante', dot: 'bg-orange-600' },
  abrillantador: { label: 'Abrillantador', dot: 'bg-violet-500' },
  ambientador: { label: 'Ambientador', dot: 'bg-pink-500' },
};

const EMPTY_FORM: ChemicalProductForm = {
  nombre: '', tipo: 'champú', stockLitros: 0, stockMinimo: 10, precioPorLitro: 0, proveedor: '', gastoMensualRef: 0,
};

export function CarWashProducts() {
  const { user } = useAuth();
  const api = useMemo(() => createVerticalApi<ChemicalProduct>('carwash', 'products'), []);
  const userId = user?.user_id || user?.id || '';

  const [items, setItems] = useState<ChemicalProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterTipo, setFilterTipo] = useState<ProductType | 'all'>('all');
  const [filterStock, setFilterStock] = useState<'all' | 'bajo'>('all');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<ChemicalProduct | null>(null);
  const [form, setForm] = useState<ChemicalProductForm>(EMPTY_FORM);
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
    { key: 'category', label: 'Categoría' },
    { key: 'price', label: 'Precio' },
    { key: 'stock', label: 'Stock' },
    { key: 'description', label: 'Descripción' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'name', label: 'Nombre', required: true, example: '' },
    { key: 'category', label: 'Categoría', example: '' },
    { key: 'price', label: 'Precio', example: '' },
    { key: 'stock', label: 'Stock', example: '' },
    { key: 'description', label: 'Descripción', example: '' },
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
      tipo: entryStr(e, 'tipo', 'type') || 'champú',
      stockLitros: entryNum(e, 'stockLitros'),
      stockMinimo: entryNum(e, 'stockMinimo'),
      precioPorLitro: entryNum(e, 'precioPorLitro'),
      proveedor: entryStr(e, 'proveedor', 'supplier') || '',
      gastoMensualRef: entryNum(e, 'gastoMensualRef'),
    };
    });
    if (created > 0) {
      await loadData();
      toast.success(`${created} producto creado creado(s)`);
    } else {
      toast.error('No se pudo crear ningún registro');
    }
  };

  const handleAIEntries = persistEntries;
  const handleImportEntries = async (entries: Record<string, string>[]) => persistEntries(entries);

  useModalClose(showModal, () => setShowModal(false));

  const filtered = useMemo(() => items.filter(p => {
    const q = search.toLowerCase();
    if (search && !p.nombre.toLowerCase().includes(q) && !p.proveedor.toLowerCase().includes(q)) return false;
    if (filterTipo !== 'all' && p.tipo !== filterTipo) return false;
    if (filterStock === 'bajo' && p.stockLitros >= p.stockMinimo) return false;
    return true;
  }), [items, search, filterTipo, filterStock]);

  const stats = useMemo(() => {
    const bajoStock = items.filter(p => p.stockLitros < p.stockMinimo).length;
    const gastoMensual = items.reduce((s, p) => s + p.gastoMensualRef, 0);
    const activos = items.filter(p => p.stockLitros > 0).length;
    return { total: items.length, bajoStock, gastoMensual, activos };
  }, [items]);

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setShowModal(true); };
  const openEdit = (p: ChemicalProduct) => {
    setEditing(p);
    setForm({
      nombre: p.nombre, tipo: p.tipo, stockLitros: p.stockLitros, stockMinimo: p.stockMinimo,
      precioPorLitro: p.precioPorLitro, proveedor: p.proveedor, gastoMensualRef: p.gastoMensualRef,
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
    { label: 'Total productos', value: stats.total, icon: FlaskConical, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30' },
    { label: 'Bajo stock', value: stats.bajoStock, icon: AlertTriangle, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/30' },
    { label: 'Gasto mensual (ref.)', value: `${stats.gastoMensual.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €`, icon: Receipt, color: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-50 dark:bg-rose-900/30' },
    { label: 'Productos activos', value: stats.activos, icon: Package, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
  ];

  return (
    <Layout title="Productos Químicos">
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
              placeholder="Buscar por nombre o proveedor..."
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
                onChange={e => setFilterTipo(e.target.value as ProductType | 'all')}
                disabled={loading}
              >
                <option value="all">Todos los tipos</option>
                {Object.entries(TYPE_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <select
                className="text-sm border-2 border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 outline-none"
                value={filterStock}
                onChange={e => setFilterStock(e.target.value as 'all' | 'bajo')}
                disabled={loading}
              >
                <option value="all">Stock: todos</option>
                <option value="bajo">Solo bajo mínimo</option>
              </select>
            </div>
            <AddButtonDropdown
                label="Nuevo producto"
                onQuickAdd={openCreate}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de producto"
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
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Stock (L)</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Mínimo (L)</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">€ / L</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Proveedor</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Alerta</th>
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
              ) : filtered.map(p => {
                const bajo = p.stockLitros < p.stockMinimo;
                return (
                  <tr key={p._id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition">
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{p.nombre}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 text-sm">
                        <span className={`w-2 h-2 rounded-full ${TYPE_CFG[p.tipo].dot}`} />
                        {TYPE_CFG[p.tipo].label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-900 dark:text-white">{p.stockLitros.toLocaleString('es-ES', { minimumFractionDigits: 1 })}</td>
                    <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">{p.stockMinimo}</td>
                    <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">{p.precioPorLitro.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{p.proveedor}</td>
                    <td className="px-4 py-3">
                      {bajo
                        ? <span className="text-amber-600 dark:text-amber-400 font-medium text-xs">Bajo mínimo</span>
                        : <span className="text-emerald-600 dark:text-emerald-400 text-xs">OK</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button type="button" onClick={() => openEdit(p)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition"><Edit2 className="w-4 h-4" /></button>
                        <button type="button" onClick={() => handleDelete(p._id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-500 hover:text-red-600 transition"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-400 dark:text-gray-500">No hay productos con los filtros seleccionados.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">{editing ? 'Editar producto' : 'Nuevo producto'}</h2>
              <button type="button" onClick={() => setShowModal(false)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Nombre *</label>
                <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Tipo</label>
                <select className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value as ProductType }))}>
                  {Object.entries(TYPE_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Stock (litros)</label>
                  <input type="number" step="0.1" min={0} className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.stockLitros} onChange={e => setForm(f => ({ ...f, stockLitros: Number(e.target.value) }))} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Stock mínimo (L)</label>
                  <input type="number" step="0.1" min={0} className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.stockMinimo} onChange={e => setForm(f => ({ ...f, stockMinimo: Number(e.target.value) }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Precio por litro (€)</label>
                  <input type="number" step="0.01" min={0} className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.precioPorLitro} onChange={e => setForm(f => ({ ...f, precioPorLitro: Number(e.target.value) }))} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Gasto mensual ref. (€)</label>
                  <input type="number" step="0.01" min={0} className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.gastoMensualRef} onChange={e => setForm(f => ({ ...f, gastoMensualRef: Number(e.target.value) }))} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Proveedor</label>
                <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.proveedor} onChange={e => setForm(f => ({ ...f, proveedor: e.target.value }))} />
              </div>
            </div>
            <div className="sticky bottom-0 bg-white dark:bg-gray-800 flex justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700 rounded-b-2xl">
              <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition">Cancelar</button>
              <button type="button" onClick={handleSave} className="px-6 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-semibold hover:opacity-90 transition">{editing ? 'Guardar cambios' : 'Crear producto'}</button>
            </div>
          </div>
        </div>
      )}
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="carwash_products"
        moduleLabel="Productos"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Productos"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
