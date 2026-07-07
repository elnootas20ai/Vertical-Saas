import { useState, useMemo, useCallback, useEffect } from 'react';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import { useModalClose } from '../../hooks/useModalClose';
import {
  Search, Plus, X, Edit2, Trash2, Filter,
  Package, AlertTriangle, Boxes, TrendingDown, Loader2,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { toast } from 'sonner';
import { bulkCreateVerticalEntries, entryStr, entryNum } from '../../lib/bulkVerticalImport';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

type Categoria = 'tabaco' | 'loteria' | 'timbre' | 'prensa' | 'complementos';
type Estado = 'disponible' | 'bajo_stock' | 'agotado';

interface Product extends VerticalEntity {
  ref: string;
  nombre: string;
  categoria: Categoria;
  stock: number;
  stockMinimo: number;
  precioVenta: number;
  proveedor: string;
  ultimaEntrada: string;
}

type ProductForm = Omit<Product, keyof VerticalEntity>;

const CAT_LABEL: Record<Categoria, string> = {
  tabaco: 'Tabaco', loteria: 'Lotería', timbre: 'Timbre / Sellos', prensa: 'Prensa', complementos: 'Complementos',
};

const ESTADO_CFG: Record<Estado, { label: string; dot: string }> = {
  disponible: { label: 'Disponible', dot: 'bg-emerald-500' },
  bajo_stock: { label: 'Bajo stock', dot: 'bg-amber-500' },
  agotado:    { label: 'Agotado',    dot: 'bg-red-500' },
};

function getEstado(p: Product): Estado {
  if (p.stock <= 0) return 'agotado';
  if (p.stock <= p.stockMinimo) return 'bajo_stock';
  return 'disponible';
}

const emptyForm = (): ProductForm => ({
  ref: '', nombre: '', categoria: 'tabaco', stock: 0, stockMinimo: 5, precioVenta: 0, proveedor: '', ultimaEntrada: new Date().toISOString().slice(0, 10),
});

export function TobaccoInventory() {
  const { user } = useAuth();
  const api = useMemo(() => createVerticalApi<Product>('tobacco', 'inventory'), []);
  const userId = user?.user_id || user?.id || '';

  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState<Categoria | 'all'>('all');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm());
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
    { key: 'brand', label: 'Marca' },
    { key: 'category', label: 'Categoría' },
    { key: 'price', label: 'Precio' },
    { key: 'stock', label: 'Stock' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'name', label: 'Nombre', required: true, example: '' },
    { key: 'brand', label: 'Marca', example: '' },
    { key: 'category', label: 'Categoría', example: '' },
    { key: 'price', label: 'Precio', example: '' },
    { key: 'stock', label: 'Stock', example: '' },
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
      ref: entryStr(e, 'ref') || '',
      nombre,
      categoria: entryStr(e, 'categoria', 'category') || 'tabaco',
      stock: entryNum(e, 'stock'),
      stockMinimo: entryNum(e, 'stockMinimo'),
      precioVenta: entryNum(e, 'precioVenta'),
      proveedor: entryStr(e, 'proveedor', 'supplier') || '',
      ultimaEntrada: entryStr(e, 'ultimaEntrada') || new Date().toISOString().slice(0, 10),
    };
    });
    if (created > 0) {
      await loadData();
      toast.success(`${created} producto creado(s)`);
    } else {
      toast.error('No se pudo crear ningún registro');
    }
  };

  const handleAIEntries = persistEntries;
  const handleImportEntries = async (entries: Record<string, string>[]) => persistEntries(entries);

  useModalClose(showModal, () => setShowModal(false));

  const filtered = useMemo(() => items.filter(p => {
    const q = search.toLowerCase();
    if (search && !p.ref.toLowerCase().includes(q) && !p.nombre.toLowerCase().includes(q) && !p.proveedor.toLowerCase().includes(q)) return false;
    if (filterCat !== 'all' && p.categoria !== filterCat) return false;
    return true;
  }), [items, search, filterCat]);

  const stats = useMemo(() => {
    const totalRefs = items.length;
    const totalUnidades = items.reduce((a, p) => a + p.stock, 0);
    const bajoStock = items.filter(p => getEstado(p) === 'bajo_stock').length;
    const agotados = items.filter(p => getEstado(p) === 'agotado').length;
    return { totalRefs, totalUnidades, bajoStock, agotados };
  }, [items]);

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setShowModal(true); };
  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({
      ref: p.ref, nombre: p.nombre, categoria: p.categoria, stock: p.stock, stockMinimo: p.stockMinimo,
      precioVenta: p.precioVenta, proveedor: p.proveedor, ultimaEntrada: p.ultimaEntrada,
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
      /* error from fetch */
    }
  };

  const handleDelete = async (_id: string) => {
    if (!userId) return;
    try {
      await api.remove(userId, _id);
      await loadData();
    } catch {
      /* error from fetch */
    }
  };

  const STAT_CARDS = [
    { label: 'Referencias', value: stats.totalRefs, icon: Package, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30' },
    { label: 'Unidades totales', value: stats.totalUnidades, icon: Boxes, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
    { label: 'Bajo stock', value: stats.bajoStock, icon: TrendingDown, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/30' },
    { label: 'Agotados', value: stats.agotados, icon: AlertTriangle, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/30' },
  ];

  return (
    <Layout title="Inventario">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {STAT_CARDS.map(s => (
          <div key={s.label} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-4">
            <div className={`p-3 rounded-xl ${s.bg}`}><s.icon className={`w-5 h-5 ${s.color}`} /></div>
            <div className="min-w-0">
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
            <input className="w-full pl-10 pr-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:border-gray-900 dark:focus:border-gray-500 outline-none text-sm" placeholder="Buscar por referencia, nombre o proveedor..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <Filter className="w-4 h-4 text-gray-400" />
              <select className="text-sm border-2 border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 outline-none" value={filterCat} onChange={e => setFilterCat(e.target.value as Categoria | 'all')}>
                <option value="all">Todas las categorías</option>
                {(Object.keys(CAT_LABEL) as Categoria[]).map(k => <option key={k} value={k}>{CAT_LABEL[k]}</option>)}
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

      {loading ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 flex justify-center items-center gap-2 py-24 text-gray-500 dark:text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin" />
          Cargando…
        </div>
      ) : (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Ref.</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Producto</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Categoría</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Stock</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">PVP</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Proveedor</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Estado</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => {
                const est = getEstado(p);
                return (
                  <tr key={p._id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition">
                    <td className="px-4 py-3 font-mono font-medium text-gray-900 dark:text-white">{p.ref}</td>
                    <td className="px-4 py-3 text-gray-900 dark:text-white">{p.nombre}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{CAT_LABEL[p.categoria]}</td>
                    <td className="px-4 py-3 text-right text-gray-900 dark:text-white">{p.stock}</td>
                    <td className="px-4 py-3 text-right text-gray-900 dark:text-white">{p.precioVenta.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{p.proveedor}</td>
                    <td className="px-4 py-3"><span className="inline-flex items-center gap-1.5 text-sm"><span className={`w-2 h-2 rounded-full ${ESTADO_CFG[est].dot}`} />{ESTADO_CFG[est].label}</span></td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button type="button" onClick={() => openEdit(p)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition"><Edit2 className="w-4 h-4" /></button>
                        <button type="button" onClick={() => void handleDelete(p._id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-500 hover:text-red-600 transition"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-400 dark:text-gray-500">No hay productos que coincidan con los filtros.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">{editing ? 'Editar producto' : 'Nuevo producto'}</h2>
              <button type="button" onClick={() => setShowModal(false)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Referencia</label>
                  <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.ref} onChange={e => setForm(f => ({ ...f, ref: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Categoría</label>
                  <select className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value as Categoria }))}>
                    {(Object.keys(CAT_LABEL) as Categoria[]).map(k => <option key={k} value={k}>{CAT_LABEL[k]}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Nombre del producto *</label>
                <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Stock</label>
                  <input type="number" className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.stock} onChange={e => setForm(f => ({ ...f, stock: Number(e.target.value) }))} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Stock mín.</label>
                  <input type="number" className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.stockMinimo} onChange={e => setForm(f => ({ ...f, stockMinimo: Number(e.target.value) }))} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">PVP (€)</label>
                  <input type="number" step="0.01" className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.precioVenta} onChange={e => setForm(f => ({ ...f, precioVenta: Number(e.target.value) }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Proveedor</label>
                  <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.proveedor} onChange={e => setForm(f => ({ ...f, proveedor: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Última entrada</label>
                  <input type="date" className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.ultimaEntrada} onChange={e => setForm(f => ({ ...f, ultimaEntrada: e.target.value }))} />
                </div>
              </div>
            </div>
            <div className="sticky bottom-0 bg-white dark:bg-gray-800 flex justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700 rounded-b-2xl">
              <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition">Cancelar</button>
              <button type="button" onClick={handleSave} className="px-6 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-semibold hover:opacity-90 transition">{editing ? 'Guardar cambios' : 'Añadir producto'}</button>
            </div>
          </div>
        </div>
      )}
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="tobacco_inventory"
        moduleLabel="Inventario"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Inventario"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
