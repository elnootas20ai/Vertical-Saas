import { useState, useMemo, useCallback, useEffect } from 'react';
import { useModalClose } from '../../hooks/useModalClose';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import {
  Package, Plus, Search, Edit3, Trash2, X, AlertTriangle,
  DollarSign, Filter, TrendingDown, BarChart3, ShoppingBag, Loader2,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { toast } from 'sonner';
import { bulkCreateVerticalEntries, entryStr, entryNum } from '../../lib/bulkVerticalImport';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

type ProductCategory = 'champu' | 'acondicionador' | 'tinte' | 'styling' | 'tratamiento' | 'herramientas';

interface SalonProduct extends VerticalEntity {
  nombre: string;
  marca: string;
  categoria: ProductCategory;
  stock: number;
  stockMinimo: number;
  precioCompra: number;
  precioVenta: number;
}

type SalonProductForm = Omit<SalonProduct, keyof VerticalEntity>;

const CATEGORY_CFG: Record<ProductCategory, { label: string; color: string }> = {
  champu: { label: 'Champú', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  acondicionador: { label: 'Acondicionador', color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300' },
  tinte: { label: 'Tinte', color: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300' },
  styling: { label: 'Styling', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  tratamiento: { label: 'Tratamiento', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
  herramientas: { label: 'Herramientas', color: 'bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-300' },
};

const MARCAS = ['L\'Oréal Professionnel', 'Schwarzkopf', 'Wella', 'Redken', 'Olaplex', 'GHD', 'Moroccanoil', 'Kérastase'];

const emptyForm = (): SalonProductForm => ({
  nombre: '', marca: MARCAS[0], categoria: 'champu', stock: 0, stockMinimo: 5, precioCompra: 0, precioVenta: 0,
});

export function SalonProducts() {
  const { user } = useAuth();
  const api = useMemo(() => createVerticalApi<SalonProduct>('salon', 'products'), []);
  const userId = user?.user_id || user?.id || '';

  const [items, setItems] = useState<SalonProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState<ProductCategory | ''>('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<SalonProduct | null>(null);
  const [form, setForm] = useState<SalonProductForm>(emptyForm());
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
      nombre,
      marca: entryStr(e, 'marca', 'brand'),
      categoria: entryStr(e, 'categoria', 'category') || 'champu',
      stock: entryNum(e, 'stock'),
      stockMinimo: entryNum(e, 'stockMinimo'),
      precioCompra: entryNum(e, 'precioCompra'),
      precioVenta: entryNum(e, 'precioVenta'),
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

  const filtered = items.filter(p => {
    const q = search.toLowerCase();
    const matchSearch = p.nombre.toLowerCase().includes(q) || p.marca.toLowerCase().includes(q);
    const matchCat = !filterCat || p.categoria === filterCat;
    return matchSearch && matchCat;
  });

  const totalStock = items.reduce((s, p) => s + p.stock, 0);
  const valorInventario = items.reduce((s, p) => s + p.stock * p.precioCompra, 0).toFixed(2);
  const bajoMinimo = items.filter(p => p.stock < p.stockMinimo).length;
  useModalClose(showModal, () => setShowModal(false));

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setShowModal(true); };
  const openEdit = (p: SalonProduct) => {
    setEditing(p);
    setForm({
      nombre: p.nombre, marca: p.marca, categoria: p.categoria, stock: p.stock, stockMinimo: p.stockMinimo,
      precioCompra: p.precioCompra, precioVenta: p.precioVenta,
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

  const margen = (p: SalonProduct) => p.precioVenta > 0 ? ((p.precioVenta - p.precioCompra) / p.precioVenta * 100).toFixed(0) : '0';

  const stats = [
    { label: 'Productos en stock', value: totalStock, icon: <Package className="w-5 h-5 text-violet-500" />, bg: 'bg-violet-50 dark:bg-violet-900/20' },
    { label: 'Valor inventario', value: `${valorInventario} €`, icon: <DollarSign className="w-5 h-5 text-emerald-500" />, bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
    { label: 'Bajo mínimo', value: bajoMinimo, icon: <AlertTriangle className="w-5 h-5 text-red-500" />, bg: 'bg-red-50 dark:bg-red-900/20' },
  ];

  return (
    <Layout title="Productos">
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

        {bajoMinimo > 0 && (
          <div className="flex items-center gap-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-red-700 dark:text-red-300">Alerta de stock bajo</p>
              <p className="text-xs text-red-600 dark:text-red-400">
                {items.filter(p => p.stock < p.stockMinimo).map(p => p.nombre).join(', ')} — por debajo del mínimo
              </p>
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar producto o marca…" disabled={loading} className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-violet-500 outline-none" />
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
                label="Nuevo producto"
                onQuickAdd={openCreate}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de producto"
              />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-700 text-left text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                <th className="px-4 py-3">Nombre</th><th className="px-4 py-3">Marca</th><th className="px-4 py-3">Categoría</th><th className="px-4 py-3 text-center">Stock</th><th className="px-4 py-3 text-right">P. Compra</th><th className="px-4 py-3 text-right">P. Venta</th><th className="px-4 py-3 text-right">Margen</th><th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-gray-500">
                    <span className="inline-flex items-center justify-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Cargando…
                    </span>
                  </td>
                </tr>
              ) : filtered.map(p => {
                const cat = CATEGORY_CFG[p.categoria];
                const lowStock = p.stock < p.stockMinimo;
                return (
                  <tr key={p._id} className={`border-b border-gray-50 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors ${lowStock ? 'bg-red-50/50 dark:bg-red-900/10' : ''}`}>
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                      <div className="flex items-center gap-2">
                        {p.nombre}
                        {lowStock && <AlertTriangle className="w-3.5 h-3.5 text-red-500" />}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{p.marca}</td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cat.color}`}>{cat.label}</span></td>
                    <td className={`px-4 py-3 text-center font-semibold ${lowStock ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>{p.stock}</td>
                    <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{p.precioCompra.toFixed(2)} €</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-white">{p.precioVenta.toFixed(2)} €</td>
                    <td className="px-4 py-3 text-right">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                        <BarChart3 className="w-3 h-3" />{margen(p)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => openEdit(p)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"><Edit3 className="w-4 h-4 text-gray-500" /></button>
                        <button type="button" onClick={() => void handleDelete(p._id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"><Trash2 className="w-4 h-4 text-red-500" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!loading && !filtered.length && <tr><td colSpan={8} className="text-center py-10 text-gray-400">No se encontraron productos</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6 space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">{editing ? 'Editar producto' : 'Nuevo producto'}</h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><X className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Nombre</label>
                <input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Marca</label>
                <select value={form.marca} onChange={e => setForm({ ...form, marca: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm">
                  {MARCAS.map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Categoría</label>
                <select value={form.categoria} onChange={e => setForm({ ...form, categoria: e.target.value as ProductCategory })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm">
                  {Object.entries(CATEGORY_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Stock</label>
                <input type="number" value={form.stock} onChange={e => setForm({ ...form, stock: +e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Stock mínimo</label>
                <input type="number" value={form.stockMinimo} onChange={e => setForm({ ...form, stockMinimo: +e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Precio compra (€)</label>
                <input type="number" step="0.01" value={form.precioCompra} onChange={e => setForm({ ...form, precioCompra: +e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Precio venta (€)</label>
                <input type="number" step="0.01" value={form.precioVenta} onChange={e => setForm({ ...form, precioVenta: +e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm" />
              </div>
            </div>
            <div className="sticky bottom-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 -mx-6 px-6 -mb-6 pb-6 pt-4 flex justify-end gap-2 rounded-b-2xl">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-600 text-sm hover:bg-gray-50 dark:hover:bg-gray-700">Cancelar</button>
              <button type="button" onClick={() => void handleSave()} className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition-colors">
                {editing ? 'Guardar cambios' : 'Crear producto'}
              </button>
            </div>
          </div>
        </div>
      )}
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="salon_products"
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
