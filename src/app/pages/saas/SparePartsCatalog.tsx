import { useState, useMemo, useCallback, useEffect } from 'react';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import { useModalClose } from '../../hooks/useModalClose';
import {
  Search, Plus, Edit3, Trash2, X, Save, Package,
  Tag, Layers, Euro, Image, Loader2,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { toast } from 'sonner';
import { bulkCreateVerticalEntries, entryStr, entryNum } from '../../lib/bulkVerticalImport';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

interface CatalogItem extends VerticalEntity {
  referencia: string;
  nombre: string;
  marca: string;
  categoria: string;
  precioPVP: number;
  precioCoste: number;
  referenciaOE: string;
  foto: string;
}

type CatalogForm = Omit<CatalogItem, keyof VerticalEntity>;

const MARCAS = ['Bosch', 'Valeo', 'Sachs', 'Mann', 'SKF', 'TRW', 'Continental', 'Febi'];
const CATEGORIAS = ['Motor', 'Frenos', 'Suspensión', 'Electricidad', 'Filtros', 'Correas', 'Embrague', 'Escape', 'Dirección'];

const CAT_COLORS: Record<string, string> = {
  Motor: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  Frenos: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  Suspensión: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  Electricidad: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  Filtros: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  Correas: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  Embrague: 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300',
  Escape: 'bg-slate-100 text-slate-700 dark:bg-slate-700/40 dark:text-slate-300',
  Dirección: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
};

const emptyForm = (): CatalogForm => ({
  referencia: '', nombre: '', marca: MARCAS[0], categoria: CATEGORIAS[0],
  precioPVP: 0, precioCoste: 0, referenciaOE: '', foto: '',
});

export function SparePartsCatalog() {
  const { user } = useAuth();
  const api = useMemo(() => createVerticalApi<CatalogItem>('spareparts', 'catalog'), []);
  const userId = user?.user_id || user?.id || '';

  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterMarca, setFilterMarca] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<CatalogItem | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'name', label: 'Nombre' },
    { key: 'sku', label: 'Referencia' },
    { key: 'brand', label: 'Marca' },
    { key: 'category', label: 'Categoría' },
    { key: 'price', label: 'Precio' },
    { key: 'stock', label: 'Stock' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'name', label: 'Nombre', required: true, example: '' },
    { key: 'sku', label: 'Referencia', example: '' },
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
      referencia: entryStr(e, 'referencia', 'reference', 'sku') || '',
      nombre,
      marca: entryStr(e, 'marca', 'brand'),
      categoria: entryStr(e, 'categoria', 'category'),
      precioPVP: entryNum(e, 'precioPVP'),
      precioCoste: entryNum(e, 'precioCoste'),
      referenciaOE: entryStr(e, 'referenciaOE') || '',
      foto: entryStr(e, 'foto') || '',
    };
    });
    if (created > 0) {
      await loadData();
      toast.success(`${created} recambio creado(s)`);
    } else {
      toast.error('No se pudo crear ningún registro');
    }
  };

  const handleAIEntries = persistEntries;
  const handleImportEntries = async (entries: Record<string, string>[]) => persistEntries(entries);

  useModalClose(showModal, () => setShowModal(false));

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

  const filtered = items.filter(i => {
    const s = search.toLowerCase();
    const matchSearch = !s || i.referencia.toLowerCase().includes(s) || i.nombre.toLowerCase().includes(s) || i.referenciaOE.toLowerCase().includes(s);
    const matchMarca = !filterMarca || i.marca === filterMarca;
    const matchCat = !filterCat || i.categoria === filterCat;
    return matchSearch && matchMarca && matchCat;
  });

  const uniqueMarcas = new Set(items.map(i => i.marca));
  const uniqueCats = new Set(items.map(i => i.categoria));
  const valorCatalogo = items.reduce((s, i) => s + i.precioPVP, 0);

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setShowModal(true); };
  const openEdit = (item: CatalogItem) => {
    setEditing(item);
    setForm({
      referencia: item.referencia,
      nombre: item.nombre,
      marca: item.marca,
      categoria: item.categoria,
      precioPVP: item.precioPVP,
      precioCoste: item.precioCoste,
      referenciaOE: item.referenciaOE,
      foto: item.foto,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!userId || !form.referencia || !form.nombre) return;
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
    { label: 'Total Referencias', value: items.length, icon: <Package className="w-5 h-5 text-blue-500" />, bg: 'bg-blue-50 dark:bg-blue-900/30' },
    { label: 'Marcas', value: uniqueMarcas.size, icon: <Tag className="w-5 h-5 text-emerald-500" />, bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
    { label: 'Categorías', value: uniqueCats.size, icon: <Layers className="w-5 h-5 text-amber-500" />, bg: 'bg-amber-50 dark:bg-amber-900/30' },
    { label: 'Valor Catálogo', value: `${valorCatalogo.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €`, icon: <Euro className="w-5 h-5 text-purple-500" />, bg: 'bg-purple-50 dark:bg-purple-900/30' },
  ];

  return (
    <Layout title="Catálogo de Recambios">
      <div className="space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar referencia, nombre, OE..." disabled={loading} className="pl-9 pr-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm w-64 focus:ring-2 focus:ring-blue-500 dark:text-gray-100" />
            </div>
            <select value={filterMarca} onChange={e => setFilterMarca(e.target.value)} disabled={loading} className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm dark:text-gray-100">
              <option value="">Todas las marcas</option>
              {MARCAS.map(m => <option key={m}>{m}</option>)}
            </select>
            <select value={filterCat} onChange={e => setFilterCat(e.target.value)} disabled={loading} className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm dark:text-gray-100">
              <option value="">Todas las categorías</option>
              {CATEGORIAS.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <AddButtonDropdown
                label="Nuevo recambio"
                onQuickAdd={openCreate}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de recambio"
              />
        </div>

        {/* Table */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Referencia</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Nombre</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Marca</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Categoría</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">PVP</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Coste</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Margen</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Ref. OE</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Foto</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">
                    <span className="inline-flex items-center justify-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Cargando…
                    </span>
                  </td>
                </tr>
              ) : filtered.map(item => {
                const margen = item.precioCoste > 0 ? ((item.precioPVP - item.precioCoste) / item.precioCoste * 100) : 0;
                return (
                  <tr key={item._id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-blue-600 dark:text-blue-400">{item.referencia}</td>
                    <td className="px-4 py-3 text-gray-900 dark:text-gray-100">{item.nombre}</td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{item.marca}</td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${CAT_COLORS[item.categoria] || ''}`}>{item.categoria}</span></td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-gray-100">{item.precioPVP.toFixed(2)} €</td>
                    <td className="px-4 py-3 text-right text-gray-500 dark:text-gray-400">{item.precioCoste.toFixed(2)} €</td>
                    <td className="px-4 py-3 text-right"><span className={`font-semibold ${margen >= 40 ? 'text-green-600' : margen >= 20 ? 'text-amber-600' : 'text-red-600'}`}>{margen.toFixed(1)}%</span></td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500 dark:text-gray-400">{item.referenciaOE}</td>
                    <td className="px-4 py-3 text-center">{item.foto ? <Image className="w-4 h-4 mx-auto text-gray-400" /> : <span className="text-gray-300 dark:text-gray-600 text-xs">—</span>}</td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => openEdit(item)} className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30 text-blue-600 dark:text-blue-400 transition-colors"><Edit3 className="w-4 h-4" /></button>
                        <button onClick={() => void handleDelete(item._id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-red-500 transition-colors"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={10} className="px-4 py-12 text-center text-gray-400">No se encontraron recambios</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Modal */}
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowModal(false)}>
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">{editing ? 'Editar Recambio' : 'Nuevo Recambio'}</h3>
                <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><X className="w-5 h-5 text-gray-500" /></button>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Referencia *</label>
                    <input value={form.referencia} onChange={e => setForm({ ...form, referencia: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Ref. OE</label>
                    <input value={form.referenciaOE} onChange={e => setForm({ ...form, referenciaOE: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Nombre *</label>
                  <input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Marca</label>
                    <select value={form.marca} onChange={e => setForm({ ...form, marca: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100">
                      {MARCAS.map(m => <option key={m}>{m}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Categoría</label>
                    <select value={form.categoria} onChange={e => setForm({ ...form, categoria: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100">
                      {CATEGORIAS.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Precio PVP (€)</label>
                    <input type="number" step="0.01" value={form.precioPVP} onChange={e => setForm({ ...form, precioPVP: parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Precio Coste (€)</label>
                    <input type="number" step="0.01" value={form.precioCoste} onChange={e => setForm({ ...form, precioCoste: parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">URL Foto</label>
                  <input value={form.foto} onChange={e => setForm({ ...form, foto: e.target.value })} placeholder="https://..." className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100" />
                </div>
              </div>
              <div className="sticky bottom-0 bg-white dark:bg-gray-800 flex justify-end gap-2 p-5 border-t border-gray-200 dark:border-gray-700 rounded-b-2xl">
                <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">Cancelar</button>
                <button type="button" onClick={() => void handleSave()} className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium"><Save className="w-4 h-4" /> Guardar</button>
              </div>
            </div>
          </div>
        )}
      </div>
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="spareparts_catalog"
        moduleLabel="Catálogo"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Catálogo"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
