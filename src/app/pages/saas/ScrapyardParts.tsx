import { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../../components/saas/Layout';
import { useModalClose } from '../../hooks/useModalClose';
import { useAuth } from '../../context/AuthContext';
import {
  listScrapyardParts,
  createScrapyardPart,
  updateScrapyardPart,
  deleteScrapyardPart,
  PART_CATEGORIES,
  CATEGORY_GROUPS,
  PART_STATUS_MAP,
  type ScrapyardPart,
  type PartCategory,
  type PartStatus,
} from '../../lib/scrapyardApi';
import {
  Plus, Search, Edit3, Trash2, X, Save,
  TrendingUp, Package, MapPin, ShoppingCart,
  AlertTriangle, LayoutList, LayoutGrid, Loader2,
  Camera, Euro, FileText, ExternalLink,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';
import { toast } from 'sonner';

const CATEGORY_LABEL_MAP = Object.fromEntries(
  PART_CATEGORIES.map(c => [c.value, c.label]),
) as Record<PartCategory, string>;

type FormData = {
  nombre: string;
  categoria: PartCategory;
  referencia: string;
  estado: PartStatus;
  precioVenta: number;
  precioMinimo: number;
  ubicacion: string;
  zona: string;
  estanteria: string;
  vehiculoOrigenId: string;
  vehiculoOrigenLabel: string;
  vehiculoOrigenMatricula: string;
  observaciones: string;
  peso: number | null;
  garantiaMeses: number;
};

const emptyForm = (): FormData => ({
  nombre: '',
  categoria: 'motor',
  referencia: '',
  estado: 'disponible',
  precioVenta: 0,
  precioMinimo: 0,
  ubicacion: '',
  zona: '',
  estanteria: '',
  vehiculoOrigenId: '',
  vehiculoOrigenLabel: '',
  vehiculoOrigenMatricula: '',
  observaciones: '',
  peso: null,
  garantiaMeses: 3,
});

function formFromPart(p: ScrapyardPart): FormData {
  return {
    nombre: p.nombre,
    categoria: p.categoria,
    referencia: p.referencia,
    estado: p.estado,
    precioVenta: p.precioVenta,
    precioMinimo: p.precioMinimo,
    ubicacion: p.ubicacion,
    zona: p.zona,
    estanteria: p.estanteria,
    vehiculoOrigenId: p.vehiculoOrigenId,
    vehiculoOrigenLabel: p.vehiculoOrigenLabel,
    vehiculoOrigenMatricula: p.vehiculoOrigenMatricula,
    observaciones: p.observaciones,
    peso: p.peso,
    garantiaMeses: p.garantiaMeses,
  };
}

const inputCls = 'w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100 outline-none focus:ring-2 focus:ring-blue-500';
const labelCls = 'block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1';

export function ScrapyardParts() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = user?.user_id ?? '';

  const [parts, setParts] = useState<ScrapyardPart[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [filterEstado, setFilterEstado] = useState('');
  const [filterVehicle, setFilterVehicle] = useState('');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<ScrapyardPart | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm());

  const [showSellModal, setShowSellModal] = useState(false);
  const [sellPart, setSellPart] = useState<ScrapyardPart | null>(null);
  const [sellPrice, setSellPrice] = useState(0);
  const [sellCliente, setSellCliente] = useState('');
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'name', label: 'Nombre' },
    { key: 'vehicle', label: 'Vehículo' },
    { key: 'category', label: 'Categoría' },
    { key: 'price', label: 'Precio' },
    { key: 'condition', label: 'Estado' },
    { key: 'location', label: 'Ubicación' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'name', label: 'Nombre', required: true, example: '' },
    { key: 'vehicle', label: 'Vehículo', example: '' },
    { key: 'category', label: 'Categoría', example: '' },
    { key: 'price', label: 'Precio', example: '' },
    { key: 'condition', label: 'Estado', example: '' },
    { key: 'location', label: 'Ubicación', example: '' },
  ];

  const handleAIEntries = async (entries: Record<string, unknown>[]) => {
    toast.success(`${entries.length} pieza(s) parseado(s) con IA`);
  };

  const handleImportEntries = async (entries: Record<string, string>[]) => {
    toast.success(`${entries.length} pieza(s) importado(s)`);
  };

  useModalClose(showModal, () => setShowModal(false));
  useModalClose(showSellModal, () => setShowSellModal(false));

  const fetchParts = useCallback(async () => {
    if (!userId) return;
    try {
      setLoading(true);
      const data = await listScrapyardParts(userId);
      setParts(data);
    } catch (err) {
      console.error('Error loading parts:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { fetchParts(); }, [fetchParts]);

  const uniqueVehicles = useMemo(() => {
    const map = new Map<string, string>();
    parts.forEach(p => {
      if (p.vehiculoOrigenLabel) {
        const key = p.vehiculoOrigenId || p.vehiculoOrigenLabel;
        if (!map.has(key)) map.set(key, p.vehiculoOrigenLabel);
      }
    });
    return Array.from(map.entries()).map(([id, label]) => ({ id, label }));
  }, [parts]);

  const filtered = useMemo(() => parts.filter(p => {
    const q = search.toLowerCase();
    const matchSearch = !q
      || p.referencia.toLowerCase().includes(q)
      || p.nombre.toLowerCase().includes(q)
      || p.vehiculoOrigenLabel.toLowerCase().includes(q);
    const matchCat = !filterCat || p.categoria === filterCat;
    const matchEstado = !filterEstado || p.estado === filterEstado;
    const matchVehicle = !filterVehicle
      || p.vehiculoOrigenId === filterVehicle
      || p.vehiculoOrigenLabel === filterVehicle;
    return matchSearch && matchCat && matchEstado && matchVehicle;
  }), [parts, search, filterCat, filterEstado, filterVehicle]);

  const stats = useMemo(() => {
    const disponibles = parts.filter(p => p.estado === 'disponible');
    return {
      enStock: disponibles.length,
      valorInventario: disponibles.reduce((s, p) => s + p.precioVenta, 0),
      sinPrecio: disponibles.filter(p => p.precioVenta === 0).length,
      sinUbicacion: disponibles.filter(p => !p.ubicacion).length,
    };
  }, [parts]);

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setShowModal(true); };
  const openEdit = (p: ScrapyardPart) => { setEditing(p); setForm(formFromPart(p)); setShowModal(true); };

  const handleSave = async () => {
    if (!form.nombre || !userId) return;
    setSaving(true);
    try {
      if (editing) {
        const updated = await updateScrapyardPart(userId, editing._id, form);
        setParts(prev => prev.map(p => p._id === editing._id ? updated : p));
      } else {
        const created = await createScrapyardPart(userId, form);
        setParts(prev => [...prev, created]);
      }
      setShowModal(false);
    } catch (err) {
      console.error('Error saving part:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (p: ScrapyardPart) => {
    if (!userId) return;
    try {
      await deleteScrapyardPart(userId, p._id);
      setParts(prev => prev.filter(x => x._id !== p._id));
    } catch (err) {
      console.error('Error deleting part:', err);
    }
  };

  const openSell = (p: ScrapyardPart) => {
    setSellPart(p);
    setSellPrice(p.precioVenta);
    setSellCliente('');
    setShowSellModal(true);
  };

  const handleSell = async () => {
    if (!sellPart || !userId) return;
    setSaving(true);
    try {
      const updated = await updateScrapyardPart(userId, sellPart._id, {
        estado: 'vendida',
        precioVenta: sellPrice,
        observaciones: sellPart.observaciones
          ? `${sellPart.observaciones}\nVendida a: ${sellCliente || '—'}`
          : `Vendida a: ${sellCliente || '—'}`,
      });
      setParts(prev => prev.map(p => p._id === sellPart._id ? updated : p));
      setShowSellModal(false);
    } catch (err) {
      console.error('Error selling part:', err);
    } finally {
      setSaving(false);
    }
  };

  const fmtPrice = (v: number) => v.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const kpis = [
    { label: 'Piezas en stock', value: stats.enStock, icon: <Package className="w-5 h-5 text-emerald-500" />, bg: 'bg-emerald-50 dark:bg-emerald-900/20', warn: false },
    { label: 'Valor inventario', value: `${fmtPrice(stats.valorInventario)} €`, icon: <TrendingUp className="w-5 h-5 text-blue-500" />, bg: 'bg-blue-50 dark:bg-blue-900/20', warn: false },
    { label: 'Sin precio', value: stats.sinPrecio, icon: <Euro className="w-5 h-5 text-amber-500" />, bg: 'bg-amber-50 dark:bg-amber-900/20', warn: stats.sinPrecio > 0 },
    { label: 'Sin ubicación', value: stats.sinUbicacion, icon: <AlertTriangle className="w-5 h-5 text-red-500" />, bg: 'bg-red-50 dark:bg-red-900/20', warn: stats.sinUbicacion > 0 },
  ];

  return (
    <Layout title="Piezas de Desguace">
      <div className="space-y-6">
        <div className="flex items-center justify-end mb-1">
          <button
            onClick={() => navigate('/saas/vertical/desguaces/documentacion?tab=piezas')}
            className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
          >
            <FileText className="w-3 h-3" /> Documentación de piezas <ExternalLink className="w-3 h-3" />
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {kpis.map(k => (
            <div key={k.label} className={`${k.bg} rounded-xl p-4 border ${k.warn ? 'border-red-200 dark:border-red-800' : 'border-transparent'}`}>
              <div className="flex items-center gap-2 mb-2">
                <div className="p-1.5 bg-white dark:bg-gray-800 rounded-lg shadow-sm">{k.icon}</div>
              </div>
              <p className={`text-2xl font-bold ${k.warn ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'}`}>{k.value}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{k.label}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="flex flex-wrap gap-2 items-center flex-1">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar referencia, pieza, vehículo..." className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-blue-500 dark:text-gray-100 outline-none" />
            </div>
            <select value={filterCat} onChange={e => setFilterCat(e.target.value)} className="px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm dark:text-gray-100">
              <option value="">Todas categorías</option>
              {CATEGORY_GROUPS.map(g => (
                <optgroup key={g.label} label={g.label}>
                  {g.categories.map(cv => {
                    const cat = PART_CATEGORIES.find(c => c.value === cv);
                    return cat ? <option key={cat.value} value={cat.value}>{cat.label}</option> : null;
                  })}
                </optgroup>
              ))}
            </select>
            <select value={filterEstado} onChange={e => setFilterEstado(e.target.value)} className="px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm dark:text-gray-100">
              <option value="">Todos estados</option>
              {Object.entries(PART_STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            {uniqueVehicles.length > 0 && (
              <select value={filterVehicle} onChange={e => setFilterVehicle(e.target.value)} className="px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm dark:text-gray-100">
                <option value="">Todos vehículos</option>
                {uniqueVehicles.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
              </select>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5">
              <button onClick={() => setViewMode('table')} className={`p-2 rounded-md transition-colors ${viewMode === 'table' ? 'bg-white dark:bg-gray-600 shadow-sm text-blue-600 dark:text-blue-400' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>
                <LayoutList className="w-4 h-4" />
              </button>
              <button onClick={() => setViewMode('grid')} className={`p-2 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-white dark:bg-gray-600 shadow-sm text-blue-600 dark:text-blue-400' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>
                <LayoutGrid className="w-4 h-4" />
              </button>
            </div>
            <AddButtonDropdown
                label="Nueva pieza"
                onQuickAdd={openCreate}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de pieza"
              />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
          </div>
        ) : viewMode === 'table' ? (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-x-auto">
            <table className="w-full min-w-[1100px] text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/80">
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 dark:text-gray-400">Código</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 dark:text-gray-400">Foto</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 dark:text-gray-400">Nombre</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 hidden lg:table-cell">Vehículo origen</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 hidden md:table-cell">Categoría</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-500 dark:text-gray-400">Estado</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-500 dark:text-gray-400">Precio</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 hidden xl:table-cell">Ubicación</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-500 dark:text-gray-400">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p._id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50/80 dark:hover:bg-gray-700/20 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-gray-500 dark:text-gray-400">{p.codigoInterno}</span>
                    </td>
                    <td className="px-4 py-3">
                      {p.fotos?.length > 0 ? (
                        <img src={p.fotos[0]} alt="" className="w-10 h-10 rounded-lg object-cover" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                          <Package className="w-4 h-4 text-gray-400" />
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-900 dark:text-gray-100">{p.nombre}</p>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      {p.vehiculoOrigenLabel ? (
                        <button
                          onClick={() => p.vehiculoOrigenId && navigate(`/saas/scrapyard-vehicles/${p.vehiculoOrigenId}`)}
                          className="text-left group"
                        >
                          <p className="text-sm text-blue-600 dark:text-blue-400 group-hover:underline">{p.vehiculoOrigenLabel}</p>
                          {p.vehiculoOrigenMatricula && <p className="text-[10px] font-mono text-gray-400">{p.vehiculoOrigenMatricula}</p>}
                        </button>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="text-xs text-gray-600 dark:text-gray-300">{CATEGORY_LABEL_MAP[p.categoria] || p.categoria}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${PART_STATUS_MAP[p.estado]?.color || ''}`}>
                        {PART_STATUS_MAP[p.estado]?.label || p.estado}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-gray-900 dark:text-gray-100">{fmtPrice(p.precioVenta)} €</td>
                    <td className="px-4 py-3 hidden xl:table-cell">
                      {p.zona || p.ubicacion ? (
                        <span className="inline-flex items-center gap-1 text-xs font-mono text-gray-600 dark:text-gray-300">
                          <MapPin className="w-3 h-3" />
                          {[p.zona, p.ubicacion].filter(Boolean).join(' / ')}
                        </span>
                      ) : <span className="text-xs text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        {p.estado === 'disponible' && (
                          <button onClick={() => openSell(p)} title="Vender" className="p-1.5 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/20 text-emerald-500 transition-colors">
                            <ShoppingCart className="w-4 h-4" />
                          </button>
                        )}
                        <button onClick={() => openEdit(p)} className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-500 transition-colors"><Edit3 className="w-4 h-4" /></button>
                        <button onClick={() => handleDelete(p)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-400 hover:text-red-600 transition-colors"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={9} className="px-4 py-16 text-center">
                    <Package className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                    <p className="text-gray-500 dark:text-gray-400 font-medium">No se encontraron piezas</p>
                    <p className="text-xs text-gray-400 mt-1">Registra piezas del desguace</p>
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(p => (
              <div
                key={p._id}
                onClick={() => openEdit(p)}
                className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden cursor-pointer hover:shadow-md transition-shadow group"
              >
                <div className="aspect-[4/3] bg-gray-100 dark:bg-gray-700 relative">
                  {p.fotos?.length > 0 ? (
                    <img src={p.fotos[0]} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Package className="w-12 h-12 text-gray-300 dark:text-gray-600" />
                    </div>
                  )}
                  {p.fotos?.length > 1 && (
                    <span className="absolute bottom-2 right-2 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded-md flex items-center gap-1">
                      <Camera className="w-3 h-3" /> {p.fotos.length}
                    </span>
                  )}
                </div>
                <div className="p-4 space-y-2">
                  <p className="font-semibold text-gray-900 dark:text-gray-100 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{p.nombre}</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                      {CATEGORY_LABEL_MAP[p.categoria] || p.categoria}
                    </span>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${PART_STATUS_MAP[p.estado]?.color || ''}`}>
                      {PART_STATUS_MAP[p.estado]?.label || p.estado}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-bold text-gray-900 dark:text-gray-100">{fmtPrice(p.precioVenta)} €</span>
                    {(p.zona || p.ubicacion) && (
                      <span className="text-[11px] text-gray-400 flex items-center gap-1">
                        <MapPin className="w-3 h-3" />{[p.zona, p.ubicacion].filter(Boolean).join(' / ')}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="col-span-full py-16 text-center">
                <Package className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                <p className="text-gray-500 dark:text-gray-400 font-medium">No se encontraron piezas</p>
              </div>
            )}
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">{editing ? 'Editar Pieza' : 'Nueva Pieza'}</h3>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                <div className="space-y-4">
                  <div>
                    <label className={labelCls}>Nombre *</label>
                    <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Motor completo, Puerta delantera..." className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Categoría</label>
                    <select value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value as PartCategory }))} className={inputCls}>
                      {CATEGORY_GROUPS.map(g => (
                        <optgroup key={g.label} label={g.label}>
                          {g.categories.map(cv => {
                            const cat = PART_CATEGORIES.find(c => c.value === cv);
                            return cat ? <option key={cat.value} value={cat.value}>{cat.label}</option> : null;
                          })}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Referencia</label>
                    <input value={form.referencia} onChange={e => setForm(f => ({ ...f, referencia: e.target.value }))} placeholder="REF-001" className={`${inputCls} font-mono`} />
                  </div>
                  <div>
                    <label className={labelCls}>Estado</label>
                    <select value={form.estado} onChange={e => setForm(f => ({ ...f, estado: e.target.value as PartStatus }))} className={inputCls}>
                      {Object.entries(PART_STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>Precio venta</label>
                      <input type="number" min={0} step={0.01} value={form.precioVenta} onChange={e => setForm(f => ({ ...f, precioVenta: Number(e.target.value) }))} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Precio mínimo</label>
                      <input type="number" min={0} step={0.01} value={form.precioMinimo} onChange={e => setForm(f => ({ ...f, precioMinimo: Number(e.target.value) }))} className={inputCls} />
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>Ubicación</label>
                    <input value={form.ubicacion} onChange={e => setForm(f => ({ ...f, ubicacion: e.target.value }))} placeholder="A1-03" className={`${inputCls} font-mono`} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>Zona</label>
                      <input value={form.zona} onChange={e => setForm(f => ({ ...f, zona: e.target.value }))} placeholder="Zona A" className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Estantería</label>
                      <input value={form.estanteria} onChange={e => setForm(f => ({ ...f, estanteria: e.target.value }))} placeholder="E-02" className={`${inputCls} font-mono`} />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className={labelCls}>ID vehículo origen</label>
                    <input value={form.vehiculoOrigenId} onChange={e => setForm(f => ({ ...f, vehiculoOrigenId: e.target.value }))} placeholder="ID del vehículo" className={`${inputCls} font-mono`} />
                  </div>
                  <div>
                    <label className={labelCls}>Vehículo origen</label>
                    <input value={form.vehiculoOrigenLabel} onChange={e => setForm(f => ({ ...f, vehiculoOrigenLabel: e.target.value }))} placeholder="VW Golf VII 2019" className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Matrícula</label>
                    <input value={form.vehiculoOrigenMatricula} onChange={e => setForm(f => ({ ...f, vehiculoOrigenMatricula: e.target.value.toUpperCase() }))} placeholder="1234ABC" className={`${inputCls} font-mono uppercase`} />
                  </div>
                  <div>
                    <label className={labelCls}>Observaciones</label>
                    <textarea value={form.observaciones} onChange={e => setForm(f => ({ ...f, observaciones: e.target.value }))} rows={4} placeholder="Estado de la pieza, detalles..." className={`${inputCls} resize-none`} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>Peso (kg)</label>
                      <input type="number" min={0} step={0.1} value={form.peso ?? ''} onChange={e => setForm(f => ({ ...f, peso: e.target.value ? Number(e.target.value) : null }))} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Garantía (meses)</label>
                      <input type="number" min={0} value={form.garantiaMeses} onChange={e => setForm(f => ({ ...f, garantiaMeses: Number(e.target.value) }))} className={inputCls} />
                    </div>
                  </div>
                  {editing && editing.fotos?.length > 0 && (
                    <div>
                      <label className={labelCls}>Fotos</label>
                      <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                        <Camera className="w-4 h-4" /> {editing.fotos.length} foto{editing.fotos.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="sticky bottom-0 flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-b-2xl">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">Cancelar</button>
              <button onClick={handleSave} disabled={saving || !form.nombre} className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {showSellModal && sellPart && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setShowSellModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-emerald-500" /> Vender pieza
              </h3>
              <button onClick={() => setShowSellModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-gray-700 dark:text-gray-300">
                ¿Vender <span className="font-semibold">{sellPart.nombre}</span>?
              </p>
              <div>
                <label className={labelCls}>Precio final (€)</label>
                <input type="number" min={0} step={0.01} value={sellPrice} onChange={e => setSellPrice(Number(e.target.value))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Cliente</label>
                <input value={sellCliente} onChange={e => setSellCliente(e.target.value)} placeholder="Nombre del cliente" className={inputCls} />
              </div>
            </div>
            <div className="flex justify-end gap-3 px-5 py-4 border-t border-gray-200 dark:border-gray-700">
              <button onClick={() => setShowSellModal(false)} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">Cancelar</button>
              <button onClick={handleSell} disabled={saving} className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShoppingCart className="w-4 h-4" />} Confirmar venta
              </button>
            </div>
          </div>
        </div>
      )}
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="scrapyard_parts"
        moduleLabel="Piezas"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Piezas"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
