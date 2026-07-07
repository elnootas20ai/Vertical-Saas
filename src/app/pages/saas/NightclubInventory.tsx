import { useState, useMemo, useEffect, useCallback } from 'react';
import { Layout } from '../../components/saas/Layout';
import { useModalClose } from '../../hooks/useModalClose';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import { toast } from 'sonner';
import { bulkCreateVerticalEntries, entryStr, entryNum } from '../../lib/bulkVerticalImport';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';
import {
  Search,
  X,
  Edit3,
  Trash2,
  Filter,
  ChevronDown,
  AlertTriangle,
  TrendingUp,
  DollarSign,
  Wine,
} from 'lucide-react';

type ProductCategory = 'spirits' | 'cerveza' | 'vino' | 'refresco' | 'cocktail' | 'champagne';

interface BarProduct extends VerticalEntity {
  producto: string;
  categoria: ProductCategory;
  stock: number;
  precioCoste: number;
  precioVenta: number;
  stockMinimo: number;
}

const CAT_LABELS: Record<ProductCategory, string> = {
  spirits: 'Spirits', cerveza: 'Cerveza', vino: 'Vino', refresco: 'Refresco', cocktail: 'Cocktail', champagne: 'Champagne',
};

const CAT_COLORS: Record<ProductCategory, string> = {
  spirits: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300',
  cerveza: 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300',
  vino: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300',
  refresco: 'bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-300',
  cocktail: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300',
  champagne: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300',
};

const EMPTY: Omit<BarProduct, keyof VerticalEntity> = { producto: '', categoria: 'spirits', stock: 0, precioCoste: 0, precioVenta: 0, stockMinimo: 0 };

export function NightclubInventory() {
  const { user } = useAuth();
  const api = useMemo(() => createVerticalApi<BarProduct>('nightclub', 'inventory'), []);
  const userId = user?.user_id || user?.id || '';

  const [data, setData] = useState<BarProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState<ProductCategory | ''>('');
  const [modalOpen, setModalOpen] = useState(false);
  useModalClose(modalOpen, () => setModalOpen(false));
  const [editing, setEditing] = useState<BarProduct | null>(null);
  const [form, setForm] = useState<Omit<BarProduct, keyof VerticalEntity>>(EMPTY);
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'name', label: 'Nombre' },
    { key: 'category', label: 'Categoría' },
    { key: 'stock', label: 'Stock' },
    { key: 'price', label: 'Precio' },
    { key: 'supplier', label: 'Proveedor' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'name', label: 'Nombre', required: true, example: '' },
    { key: 'category', label: 'Categoría', example: '' },
    { key: 'stock', label: 'Stock', example: '' },
    { key: 'price', label: 'Precio', example: '' },
    { key: 'supplier', label: 'Proveedor', example: '' },
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
      producto: entryStr(e, 'producto') || '',
      categoria: entryStr(e, 'categoria', 'category') || 'spirits',
      stock: entryNum(e, 'stock'),
      precioCoste: entryNum(e, 'precioCoste'),
      precioVenta: entryNum(e, 'precioVenta'),
      stockMinimo: entryNum(e, 'stockMinimo'),
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

  const loadData = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const items = await api.list(userId);
      setData(items);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [userId, api]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filtered = data.filter(p => {
    const matchSearch = p.producto.toLowerCase().includes(search.toLowerCase());
    const matchCat = !filterCat || p.categoria === filterCat;
    return matchSearch && matchCat;
  });

  const inventoryValue = data.reduce((s, p) => s + p.stock * p.precioCoste, 0);
  const lowStockCount = data.filter(p => p.stock < p.stockMinimo).length;
  const avgMargin = data.length ? (data.reduce((s, p) => s + (p.precioVenta > 0 && p.precioCoste > 0 ? ((p.precioVenta - p.precioCoste) / p.precioVenta) * 100 : 0), 0) / data.length).toFixed(1) : '0';

  const openCreate = () => { setEditing(null); setForm(EMPTY); setModalOpen(true); };
  const openEdit = (p: BarProduct) => { setEditing(p); setForm({ producto: p.producto, categoria: p.categoria, stock: p.stock, precioCoste: p.precioCoste, precioVenta: p.precioVenta, stockMinimo: p.stockMinimo }); setModalOpen(true); };

  const save = async () => {
    if (!form.producto || !userId) return;
    try {
      if (editing) {
        await api.update(userId, editing._id, form);
      } else {
        await api.create(userId, form);
      }
      await loadData();
      setModalOpen(false);
    } catch (e) {
      console.error(e);
    }
  };

  const remove = async (docId: string) => {
    if (!userId) return;
    try {
      await api.remove(userId, docId);
      await loadData();
    } catch (e) {
      console.error(e);
    }
  };

  const margin = (p: BarProduct) => p.precioVenta > 0 && p.precioCoste > 0 ? (((p.precioVenta - p.precioCoste) / p.precioVenta) * 100).toFixed(0) : '—';

  const stats = [
    { label: 'Valor Inventario', value: `${inventoryValue.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €`, icon: <DollarSign className="w-5 h-5 text-emerald-500" />, bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
    { label: 'Bajo Mínimo', value: lowStockCount, icon: <AlertTriangle className="w-5 h-5 text-red-500" />, bg: 'bg-red-50 dark:bg-red-900/30' },
    { label: 'Margen Medio', value: `${avgMargin}%`, icon: <TrendingUp className="w-5 h-5 text-blue-500" />, bg: 'bg-blue-50 dark:bg-blue-900/30' },
  ];

  return (
    <Layout title="Barra / Inventario">
      <div className="relative">
        {loading && (
          <div className="absolute inset-0 z-20 flex items-center justify-center rounded-xl bg-white/70 dark:bg-gray-950/70">
            <div className="flex flex-col items-center gap-3 text-gray-700 dark:text-gray-200">
              <span className="inline-block h-10 w-10 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900 dark:border-gray-600 dark:border-t-white" aria-hidden />
              <span className="text-sm font-medium">Cargando inventario…</span>
            </div>
          </div>
        )}
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {stats.map(s => (
            <div key={s.label} className={`${s.bg} rounded-xl p-4 flex items-center gap-3`}>
              {s.icon}
              <div><p className="text-xs text-gray-500 dark:text-gray-400">{s.label}</p><p className="text-lg font-bold text-gray-900 dark:text-white">{s.value}</p></div>
            </div>
          ))}
        </div>

        {lowStockCount > 0 && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              <h4 className="font-semibold text-red-700 dark:text-red-300">Alertas de Stock Bajo</h4>
            </div>
            <div className="flex flex-wrap gap-2">
              {data.filter(p => p.stock < p.stockMinimo).map(p => (
                <span key={p._id} className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 text-xs font-medium">
                  <Wine className="w-3 h-3" /> {p.producto} ({p.stock}/{p.stockMinimo})
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="relative flex-1 w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar producto…" className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 outline-none" />
          </div>
          <div className="flex gap-2 items-center">
            <div className="relative">
              <select value={filterCat} onChange={e => setFilterCat(e.target.value as ProductCategory | '')} className="appearance-none pl-8 pr-8 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-300 outline-none">
                <option value="">Todas</option>
                {Object.entries(CAT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <Filter className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            </div>
            <AddButtonDropdown
                label="Nuevo Producto"
                onQuickAdd={openCreate}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de producto"
              />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
                <th className="px-4 py-3 font-medium">Producto</th>
                <th className="px-4 py-3 font-medium">Categoría</th>
                <th className="px-4 py-3 font-medium text-right">Stock</th>
                <th className="px-4 py-3 font-medium text-right">P. Coste</th>
                <th className="px-4 py-3 font-medium text-right">P. Venta</th>
                <th className="px-4 py-3 font-medium text-right">Margen</th>
                <th className="px-4 py-3 font-medium text-right">Stock Mín.</th>
                <th className="px-4 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => {
                const isLow = p.stock < p.stockMinimo;
                return (
                  <tr key={p._id} className={`border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors ${isLow ? 'bg-red-50/50 dark:bg-red-900/10' : ''}`}>
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white flex items-center gap-2">
                      {isLow && <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />}
                      {p.producto}
                    </td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${CAT_COLORS[p.categoria]}`}>{CAT_LABELS[p.categoria]}</span></td>
                    <td className={`px-4 py-3 text-right font-medium ${isLow ? 'text-red-600 dark:text-red-400' : 'text-gray-600 dark:text-gray-300'}`}>{p.stock}</td>
                    <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{p.precioCoste.toFixed(2)} €</td>
                    <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{p.precioVenta.toFixed(2)} €</td>
                    <td className="px-4 py-3 text-right font-medium text-emerald-600 dark:text-emerald-400">{margin(p)}%</td>
                    <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{p.stockMinimo}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => openEdit(p)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"><Edit3 className="w-4 h-4" /></button>
                      <button onClick={() => remove(p._id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-red-500"><Trash2 className="w-4 h-4" /></button>
                    </td>
                  </tr>
                );
              })}
              {!filtered.length && !loading && <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">No se encontraron productos</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setModalOpen(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{editing ? 'Editar Producto' : 'Nuevo Producto'}</h3>
              <button onClick={() => setModalOpen(false)} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Producto</label><input value={form.producto} onChange={e => setForm({ ...form, producto: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-purple-500" /></div>
              <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Categoría</label>
                <select value={form.categoria} onChange={e => setForm({ ...form, categoria: e.target.value as ProductCategory })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-purple-500">
                  {Object.entries(CAT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Stock</label><input type="number" value={form.stock} onChange={e => setForm({ ...form, stock: +e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-purple-500" /></div>
                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Stock Mínimo</label><input type="number" value={form.stockMinimo} onChange={e => setForm({ ...form, stockMinimo: +e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-purple-500" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Precio Coste €</label><input type="number" step="0.01" value={form.precioCoste} onChange={e => setForm({ ...form, precioCoste: +e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-purple-500" /></div>
                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Precio Venta €</label><input type="number" step="0.01" value={form.precioVenta} onChange={e => setForm({ ...form, precioVenta: +e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-purple-500" /></div>
              </div>
            </div>
            <div className="sticky bottom-0 bg-white dark:bg-gray-800 flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 rounded-b-2xl">
              <button onClick={() => setModalOpen(false)} className="px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">Cancelar</button>
              <button onClick={save} className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium transition-colors">Guardar</button>
            </div>
          </div>
        </div>
      )}
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="nightclub_inventory"
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
