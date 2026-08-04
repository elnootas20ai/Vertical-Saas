import { useState, useMemo, useCallback, useEffect } from 'react';
import { Layout } from '../../components/saas/Layout';
import { useModalClose } from '../../hooks/useModalClose';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import {
  Search, Plus, X, Edit2, Trash2, Filter,
  Thermometer, Package, AlertTriangle, Boxes,
  Loader2,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { toast } from 'sonner';
import { bulkCreateVerticalEntries, entryStr, entryNum } from '../../lib/bulkVerticalImport';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

type Zona = 'camara_frio' | 'congelador' | 'mostrador' | 'obrador';
type Estado = 'optimo' | 'proximo_caducidad' | 'caducado';

interface StockEntry extends VerticalEntity {
  producto: string;
  lote: string;
  zona: Zona;
  cantidad: number;
  unidad: 'kg' | 'unidades';
  fechaEntrada: string;
  fechaCaducidad: string;
  temperatura: number;
}

type StockEntryForm = Omit<StockEntry, keyof VerticalEntity>;

const ZONA_LABEL: Record<Zona, string> = {
  camara_frio: 'Cámara de frío', congelador: 'Congelador', mostrador: 'Mostrador', obrador: 'Obrador',
};

const ESTADO_CFG: Record<Estado, { label: string; dot: string }> = {
  optimo: { label: 'Óptimo', dot: 'bg-emerald-500' },
  proximo_caducidad: { label: 'Próx. caducidad', dot: 'bg-amber-500' },
  caducado: { label: 'Caducado', dot: 'bg-red-500' },
};

function getEstado(entry: StockEntry): Estado {
  const hoy = new Date();
  const cad = new Date(entry.fechaCaducidad);
  const diff = (cad.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24);
  if (diff < 0) return 'caducado';
  if (diff <= 3) return 'proximo_caducidad';
  return 'optimo';
}

const EMPTY_FORM: StockEntryForm = {
  producto: '', lote: '', zona: 'camara_frio', cantidad: 0, unidad: 'kg',
  fechaEntrada: new Date().toISOString().slice(0, 10), fechaCaducidad: '', temperatura: 2,
};

/** @deprecated Prefer Compras + Trazabilidad (bt_lote). Ruta redirige a compras-stock. */
export function ButcherInventory() {
  const { user } = useAuth();
  const api = useMemo(() => createVerticalApi<StockEntry>('butcher-ops', 'inventory'), []);
  const userId = user?.user_id || user?.id || '';

  const [items, setItems] = useState<StockEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterZona, setFilterZona] = useState<Zona | 'all'>('all');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<StockEntry | null>(null);
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
    { key: 'product', label: 'Producto' },
    { key: 'quantity', label: 'Cantidad' },
    { key: 'unit', label: 'Unidad' },
    { key: 'date', label: 'Fecha' },
    { key: 'supplier', label: 'Proveedor' },
    { key: 'notes', label: 'Notas' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'product', label: 'Producto', example: '' },
    { key: 'quantity', label: 'Cantidad', example: '' },
    { key: 'unit', label: 'Unidad', example: '' },
    { key: 'date', label: 'Fecha', example: '' },
    { key: 'supplier', label: 'Proveedor', example: '' },
    { key: 'notes', label: 'Notas', example: '' },
  ];

  const persistEntries = async (entries: Record<string, unknown>[]) => {
    if (!userId) {
      toast.error('Sesión no válida');
      return;
    }
    const created = await bulkCreateVerticalEntries(userId, api, entries, (e) => {
    const producto = entryStr(e, 'producto');
    if (!producto) return null;
    return {
      producto,
      fechaEntrada: entryStr(e, 'fechaEntrada') || new Date().toISOString().slice(0, 10),
    };
    });
    if (created > 0) {
      await loadData();
      toast.success(`${created} entrada de inventario creado(s)`);
    } else {
      toast.error('No se pudo crear ningún registro');
    }
  };

  const handleAIEntries = persistEntries;
  const handleImportEntries = async (entries: Record<string, string>[]) => persistEntries(entries);

  useModalClose(showModal, () => setShowModal(false));

  const filtered = useMemo(() => items.filter(e => {
    const q = search.toLowerCase();
    if (search && !e.producto.toLowerCase().includes(q) && !e.lote.toLowerCase().includes(q)) return false;
    if (filterZona !== 'all' && e.zona !== filterZona) return false;
    return true;
  }), [items, search, filterZona]);

  const stats = useMemo(() => {
    const total = items.length;
    const proxCad = items.filter(e => getEstado(e) === 'proximo_caducidad').length;
    const caducados = items.filter(e => getEstado(e) === 'caducado').length;
    const tempAlert = items.filter(e => {
      if (e.zona === 'congelador') return e.temperatura > -14;
      if (e.zona === 'camara_frio') return e.temperatura > 5;
      return false;
    }).length;
    return { total, proxCad, caducados, tempAlert };
  }, [items]);

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setShowModal(true); };
  const openEdit = (e: StockEntry) => {
    setEditing(e);
    setForm({ producto: e.producto, lote: e.lote, zona: e.zona, cantidad: e.cantidad, unidad: e.unidad, fechaEntrada: e.fechaEntrada, fechaCaducidad: e.fechaCaducidad, temperatura: e.temperatura });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.producto.trim() || !form.lote.trim() || !userId) return;
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

  const STAT_CARDS = [
    { label: 'Total entradas', value: stats.total, icon: Boxes, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30' },
    { label: 'Próx. caducidad', value: stats.proxCad, icon: AlertTriangle, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/30' },
    { label: 'Caducados', value: stats.caducados, icon: Package, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/30' },
    { label: 'Alertas temp.', value: stats.tempAlert, icon: Thermometer, color: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-50 dark:bg-rose-900/30' },
  ];

  return (
    <Layout title="Inventario y Stock">
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
            <input className="w-full pl-10 pr-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:border-gray-900 dark:focus:border-gray-500 outline-none text-sm" placeholder="Buscar producto o lote..." value={search} onChange={e => setSearch(e.target.value)} disabled={loading} />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <Filter className="w-4 h-4 text-gray-400" />
              <select className="text-sm border-2 border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 outline-none" value={filterZona} onChange={e => setFilterZona(e.target.value as Zona | 'all')} disabled={loading}>
                <option value="all">Todas las zonas</option>
                {(Object.keys(ZONA_LABEL) as Zona[]).map(k => <option key={k} value={k}>{ZONA_LABEL[k]}</option>)}
              </select>
            </div>
            <AddButtonDropdown
                label="Nueva entrada"
                onQuickAdd={openCreate}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de entrada de inventario"
              />
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Producto</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Lote</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Zona</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Cantidad</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Entrada</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Caducidad</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Temp. (°C)</th>
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
              ) : filtered.map(e => {
                const estado = getEstado(e);
                const cfg = ESTADO_CFG[estado];
                return (
                  <tr key={e._id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition">
                    <td className="px-4 py-3 text-gray-900 dark:text-white font-semibold">{e.producto}</td>
                    <td className="px-4 py-3 font-mono text-gray-600 dark:text-gray-400">{e.lote}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{ZONA_LABEL[e.zona]}</td>
                    <td className="px-4 py-3 text-right text-gray-900 dark:text-white">{e.cantidad} {e.unidad}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{e.fechaEntrada}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{e.fechaCaducidad}</td>
                    <td className="px-4 py-3 text-right text-gray-900 dark:text-white">{e.temperatura}°</td>
                    <td className="px-4 py-3"><span className="inline-flex items-center gap-1.5 text-sm"><span className={`w-2 h-2 rounded-full ${cfg.dot}`} />{cfg.label}</span></td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button type="button" onClick={() => openEdit(e)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition"><Edit2 className="w-4 h-4" /></button>
                        <button type="button" onClick={() => handleDelete(e._id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-500 hover:text-red-600 transition"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-gray-400 dark:text-gray-500">No hay entradas de inventario.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">{editing ? 'Editar entrada' : 'Nueva entrada de stock'}</h2>
              <button type="button" onClick={() => setShowModal(false)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Producto *</label>
                <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.producto} onChange={e => setForm(f => ({ ...f, producto: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Lote *</label>
                  <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.lote} onChange={e => setForm(f => ({ ...f, lote: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Zona</label>
                  <select className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.zona} onChange={e => setForm(f => ({ ...f, zona: e.target.value as Zona }))}>
                    {(Object.keys(ZONA_LABEL) as Zona[]).map(k => <option key={k} value={k}>{ZONA_LABEL[k]}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Cantidad</label>
                  <input type="number" step="0.1" className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.cantidad} onChange={e => setForm(f => ({ ...f, cantidad: Number(e.target.value) }))} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Unidad</label>
                  <select className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.unidad} onChange={e => setForm(f => ({ ...f, unidad: e.target.value as 'kg' | 'unidades' }))}>
                    <option value="kg">kg</option>
                    <option value="unidades">unidades</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Temp. (°C)</label>
                  <input type="number" step="0.1" className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.temperatura} onChange={e => setForm(f => ({ ...f, temperatura: Number(e.target.value) }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Fecha entrada</label>
                  <input type="date" className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.fechaEntrada} onChange={e => setForm(f => ({ ...f, fechaEntrada: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Fecha caducidad</label>
                  <input type="date" className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.fechaCaducidad} onChange={e => setForm(f => ({ ...f, fechaCaducidad: e.target.value }))} />
                </div>
              </div>
            </div>
            <div className="sticky bottom-0 bg-white dark:bg-gray-800 flex justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700 rounded-b-2xl">
              <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition">Cancelar</button>
              <button type="button" onClick={handleSave} className="px-6 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-semibold hover:opacity-90 transition">{editing ? 'Guardar cambios' : 'Registrar entrada'}</button>
            </div>
          </div>
        </div>
      )}
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="butcher_inventory"
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
