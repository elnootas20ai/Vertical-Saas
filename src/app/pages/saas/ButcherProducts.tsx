import { useState, useMemo, useCallback, useEffect } from 'react';
import { Layout } from '../../components/saas/Layout';
import { useModalClose } from '../../hooks/useModalClose';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import {
  Search, Plus, X, Edit2, Trash2, Filter,
  Beef, Package, Tag, Thermometer,
  Loader2, CircleDollarSign,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { toast } from 'sonner';
import { bulkCreateVerticalEntries, entryStr, entryNum } from '../../lib/bulkVerticalImport';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

type CutCategory = 'vacuno' | 'cerdo' | 'pollo' | 'cordero' | 'elaborados' | 'otros';

interface Product extends VerticalEntity {
  ref: string;
  nombre: string;
  categoria: CutCategory;
  precioKg: number;
  stock: number;
  stockMinimo: number;
  conservacion: 'refrigerado' | 'congelado';
  origen: string;
  costePorKg?: number;
}

type ProductForm = Omit<Product, keyof VerticalEntity>;

const CAT_LABEL: Record<CutCategory, string> = {
  vacuno: 'Vacuno', cerdo: 'Cerdo', pollo: 'Pollo', cordero: 'Cordero', elaborados: 'Elaborados', otros: 'Otros',
};

const CONSERV_LABEL: Record<Product['conservacion'], string> = {
  refrigerado: 'Refrigerado', congelado: 'Congelado',
};

function getStockStatus(p: Product) {
  if (p.stock <= 0) return { label: 'Agotado', dot: 'bg-red-500' };
  if (p.stock <= p.stockMinimo) return { label: 'Bajo stock', dot: 'bg-amber-500' };
  return { label: 'Disponible', dot: 'bg-emerald-500' };
}

const EMPTY_FORM: ProductForm = {
  ref: '', nombre: '', categoria: 'vacuno', precioKg: 0, stock: 0, stockMinimo: 5, conservacion: 'refrigerado', origen: '',
};

export function ButcherProducts() {
  const { user } = useAuth();
  const { currentBusiness, updateBusiness } = useBusiness();
  const marginPct = Number(currentBusiness?.butcherTargetMarginPct ?? 30);
  const [marginDraft, setMarginDraft] = useState(String(marginPct));
  const [savingMargin, setSavingMargin] = useState(false);
  // Misma entidad que el TPV (`bt_catalog`) — un solo catálogo de venta
  const api = useMemo(() => createVerticalApi<Product>('butcher-ops', 'catalog'), []);
  const legacyProductsApi = useMemo(() => createVerticalApi<Product>('butcher-ops', 'products'), []);
  const userId = user?.user_id || user?.id || '';

  useEffect(() => {
    setMarginDraft(String(Number(currentBusiness?.butcherTargetMarginPct ?? 30)));
  }, [currentBusiness?.butcherTargetMarginPct]);

  const saveMargin = async () => {
    if (!currentBusiness?.business_id) return;
    const next = Math.max(0, Math.min(90, Number(marginDraft) || 30));
    setSavingMargin(true);
    try {
      await updateBusiness(currentBusiness.business_id, { butcherTargetMarginPct: next });
      toast.success(`Margen objetivo: ${next}%`);
    } catch {
      toast.error('No se pudo guardar el margen');
    } finally {
      setSavingMargin(false);
    }
  };

  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState<CutCategory | 'all'>('all');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const loadData = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      let list = await api.list(userId);
      // Migración suave: productos antiguos (bt_product) → catálogo TPV si faltan
      if (list.length === 0) {
        const legacy = await legacyProductsApi.list(userId).catch(() => [] as Product[]);
        for (const p of legacy) {
          try {
            await api.create(userId, {
              ref: p.ref || '',
              nombre: p.nombre,
              categoria: p.categoria || 'otros',
              precioKg: Number(p.precioKg || 0),
              precioUnidad: null,
              stock: Number(p.stock || 0),
              stockMinimo: Number(p.stockMinimo || 0),
              unidadVenta: 'peso',
              bloqueado: false,
              motivoBloqueo: null,
              fechaCaducidad: null,
              lote: null,
              precioActualizado: true,
              conservacion: p.conservacion || 'refrigerado',
              origen: p.origen || '',
            } as Partial<Product>);
          } catch { /* skip */ }
        }
        if (legacy.length > 0) list = await api.list(userId);
      }
      setItems(list);
    } finally {
      setLoading(false);
    }
  }, [userId, api, legacyProductsApi]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'name', label: 'Nombre' },
    { key: 'category', label: 'Categoría' },
    { key: 'price', label: 'Precio' },
    { key: 'unit', label: 'Unidad' },
    { key: 'stock', label: 'Stock' },
    { key: 'notes', label: 'Notas' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'name', label: 'Nombre', required: true, example: '' },
    { key: 'category', label: 'Categoría', example: '' },
    { key: 'price', label: 'Precio', example: '' },
    { key: 'unit', label: 'Unidad', example: '' },
    { key: 'stock', label: 'Stock', example: '' },
    { key: 'notes', label: 'Notas', example: '' },
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
      ref: entryStr(e, 'ref') || '', nombre: '', categoria: 'vacuno', precioKg: 0, stock: 0, stockMinimo: 5, conservacion: 'refrigerado', origen: '',
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
    if (search && !p.nombre.toLowerCase().includes(q) && !p.ref.toLowerCase().includes(q) && !p.origen.toLowerCase().includes(q)) return false;
    if (filterCat !== 'all' && p.categoria !== filterCat) return false;
    return true;
  }), [items, search, filterCat]);

  const stats = useMemo(() => {
    const total = items.length;
    const bajoStock = items.filter(p => p.stock > 0 && p.stock <= p.stockMinimo).length;
    const agotado = items.filter(p => p.stock <= 0).length;
    const categorias = new Set(items.map(p => p.categoria)).size;
    return { total, bajoStock, agotado, categorias };
  }, [items]);

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setShowModal(true); };
  const openEdit = (p: Product) => { setEditing(p); setForm({ ref: p.ref, nombre: p.nombre, categoria: p.categoria, precioKg: p.precioKg, stock: p.stock, stockMinimo: p.stockMinimo, conservacion: p.conservacion, origen: p.origen }); setShowModal(true); };

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
      /* fetch error */
    }
  };

  const handleDelete = async (docId: string) => {
    if (!userId) return;
    try {
      await api.remove(userId, docId);
      await loadData();
    } catch {
      /* fetch error */
    }
  };

  const suggestPrice = async (p: Product) => {
    if (!userId) return;
    const cost = Number(p.costePorKg || 0);
    if (!(cost > 0)) {
      toast.error('Sin coste €/kg — confirma una compra primero');
      return;
    }
    const suggested = Math.round((cost / (1 - Math.min(0.9, marginPct / 100))) * 100) / 100;
    try {
      await api.update(userId, p._id, { precioKg: suggested, precioActualizado: true } as Partial<Product>);
      toast.success(`Precio sugerido: ${suggested.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}/kg (margen ${marginPct}%)`);
      await loadData();
    } catch {
      toast.error('No se pudo actualizar el precio');
    }
  };

  const STAT_CARDS = [
    { label: 'Total productos', value: stats.total, icon: Beef, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/30' },
    { label: 'Bajo stock', value: stats.bajoStock, icon: Package, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/30' },
    { label: 'Agotados', value: stats.agotado, icon: Tag, color: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-50 dark:bg-rose-900/30' },
    { label: 'Categorías', value: stats.categorias, icon: Thermometer, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30' },
  ];

  return (
    <Layout title="Productos y Cortes">
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
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between mb-4">
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">Margen objetivo</p>
            <p className="text-xs text-gray-500">Se usa al sugerir precio €/kg desde el coste</p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={90}
              step={1}
              value={marginDraft}
              onChange={(e) => setMarginDraft(e.target.value)}
              className="w-20 px-2 py-1.5 rounded-lg border-2 border-gray-200 dark:border-gray-700 bg-transparent text-sm text-right"
            />
            <span className="text-sm text-gray-500">%</span>
            <button
              type="button"
              disabled={savingMargin}
              onClick={() => { void saveMargin(); }}
              className="px-3 py-1.5 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-xs font-bold disabled:opacity-50"
            >
              {savingMargin ? '…' : 'Guardar'}
            </button>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="relative flex-1 w-full sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input className="w-full pl-10 pr-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:border-gray-900 dark:focus:border-gray-500 outline-none text-sm" placeholder="Buscar producto, referencia, origen..." value={search} onChange={e => setSearch(e.target.value)} disabled={loading} />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <Filter className="w-4 h-4 text-gray-400" />
              <select className="text-sm border-2 border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 outline-none" value={filterCat} onChange={e => setFilterCat(e.target.value as CutCategory | 'all')} disabled={loading}>
                <option value="all">Todas las categorías</option>
                {(Object.keys(CAT_LABEL) as CutCategory[]).map(k => <option key={k} value={k}>{CAT_LABEL[k]}</option>)}
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
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Ref</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Producto</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Categoría</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Precio/kg</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Stock (kg)</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Conservación</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Origen</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Estado</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">
                    <span className="inline-flex items-center justify-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Cargando…
                    </span>
                  </td>
                </tr>
              ) : filtered.map(p => {
                const st = getStockStatus(p);
                return (
                  <tr key={p._id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition">
                    <td className="px-4 py-3 font-mono font-medium text-gray-900 dark:text-white">{p.ref}</td>
                    <td className="px-4 py-3 text-gray-900 dark:text-white font-semibold">{p.nombre}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{CAT_LABEL[p.categoria]}</td>
                    <td className="px-4 py-3 text-right text-gray-900 dark:text-white">{p.precioKg.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</td>
                    <td className="px-4 py-3 text-right text-gray-900 dark:text-white">{p.stock}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{CONSERV_LABEL[p.conservacion]}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{p.origen}</td>
                    <td className="px-4 py-3"><span className="inline-flex items-center gap-1.5 text-sm"><span className={`w-2 h-2 rounded-full ${st.dot}`} />{st.label}</span></td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          title={`Sugerir precio (margen ${marginPct}%)`}
                          onClick={() => { void suggestPrice(p); }}
                          className="p-1.5 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/30 text-gray-500 hover:text-emerald-600 transition"
                        >
                          <CircleDollarSign className="w-4 h-4" />
                        </button>
                        <button type="button" onClick={() => openEdit(p)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition"><Edit2 className="w-4 h-4" /></button>
                        <button type="button" onClick={() => handleDelete(p._id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-500 hover:text-red-600 transition"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-gray-400 dark:text-gray-500">No hay productos que coincidan con los filtros.</td></tr>
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
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Referencia</label>
                  <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.ref} onChange={e => setForm(f => ({ ...f, ref: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Categoría</label>
                  <select className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value as CutCategory }))}>
                    {(Object.keys(CAT_LABEL) as CutCategory[]).map(k => <option key={k} value={k}>{CAT_LABEL[k]}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Nombre del producto *</label>
                <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Ej. Chuletón de ternera" />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Precio/kg (€)</label>
                  <input type="number" step="0.01" className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.precioKg} onChange={e => setForm(f => ({ ...f, precioKg: Number(e.target.value) }))} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Stock (kg)</label>
                  <input type="number" step="0.1" className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.stock} onChange={e => setForm(f => ({ ...f, stock: Number(e.target.value) }))} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Stock mín.</label>
                  <input type="number" step="0.1" className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.stockMinimo} onChange={e => setForm(f => ({ ...f, stockMinimo: Number(e.target.value) }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Conservación</label>
                  <select className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.conservacion} onChange={e => setForm(f => ({ ...f, conservacion: e.target.value as Product['conservacion'] }))}>
                    {(Object.keys(CONSERV_LABEL) as Product['conservacion'][]).map(k => <option key={k} value={k}>{CONSERV_LABEL[k]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Origen</label>
                  <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.origen} onChange={e => setForm(f => ({ ...f, origen: e.target.value }))} placeholder="Ej. Galicia, España" />
                </div>
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
        module="butcher_products"
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
