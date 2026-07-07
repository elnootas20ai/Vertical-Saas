import { useState, useMemo, useCallback, useEffect } from 'react';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import { useModalClose } from '../../hooks/useModalClose';
import {
  Search, Plus, Edit3, Trash2, X, Save, Package,
  AlertTriangle, Warehouse, TrendingDown, BarChart3,
  ArrowDown, Loader2,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { toast } from 'sonner';
import { bulkCreateVerticalEntries, entryStr, entryNum } from '../../lib/bulkVerticalImport';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

type StockEstado = 'en_stock' | 'bajo_minimo' | 'agotado' | 'pedido';

interface StockItem extends VerticalEntity {
  referencia: string;
  nombre: string;
  ubicacion: string;
  stockActual: number;
  stockMinimo: number;
  stockMaximo: number;
  ultimoMovimiento: string;
  proveedorPrincipal: string;
  estado: StockEstado;
}

type StockForm = Omit<StockItem, keyof VerticalEntity>;

const ESTADO_CONFIG: Record<StockEstado, { label: string; color: string }> = {
  en_stock: { label: 'En Stock', color: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
  bajo_minimo: { label: 'Bajo Mínimo', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  agotado: { label: 'Agotado', color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
  pedido: { label: 'Pedido', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
};

const UBICACIONES = ['A1-01', 'A1-02', 'A2-01', 'A2-02', 'B1-01', 'B1-02', 'B2-01', 'C1-01'];
const PROVEEDORES = ['Recambios Sur', 'Auto Distribución', 'Dipart', 'Cecauto', 'CGA', 'Serca'];

const emptyForm = (): StockForm => ({
  referencia: '', nombre: '', ubicacion: UBICACIONES[0], stockActual: 0,
  stockMinimo: 0, stockMaximo: 0, ultimoMovimiento: new Date().toISOString().slice(0, 10),
  proveedorPrincipal: PROVEEDORES[0], estado: 'en_stock',
});

export function SparePartsStock() {
  const { user } = useAuth();
  const api = useMemo(() => createVerticalApi<StockItem>('spareparts', 'stock'), []);
  const userId = user?.user_id || user?.id || '';

  const [items, setItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<StockItem | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'part', label: 'Recambio' },
    { key: 'type', label: 'Tipo' },
    { key: 'quantity', label: 'Cantidad' },
    { key: 'date', label: 'Fecha' },
    { key: 'notes', label: 'Notas' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'part', label: 'Recambio', example: '' },
    { key: 'type', label: 'Tipo', example: '' },
    { key: 'quantity', label: 'Cantidad', example: '' },
    { key: 'date', label: 'Fecha', example: '' },
    { key: 'notes', label: 'Notas', example: '' },
  ];

  const persistEntries = async (entries: Record<string, unknown>[]) => {
    if (!userId) {
      toast.error('Sesión no válida');
      return;
    }
    const created = await bulkCreateVerticalEntries(userId, api, entries, (e) => {
    const referencia = entryStr(e, 'referencia', 'reference', 'sku');
    if (!referencia) return null;
    return {
      referencia,
      nombre: entryStr(e, 'nombre', 'name') || '',
      ubicacion: entryStr(e, 'ubicacion'),
      stockActual: entryNum(e, 'stockActual'),
      stockMinimo: entryNum(e, 'stockMinimo'),
      stockMaximo: entryNum(e, 'stockMaximo'),
      ultimoMovimiento: entryStr(e, 'ultimoMovimiento') || new Date().toISOString().slice(0, 10),
      proveedorPrincipal: entryStr(e, 'proveedorPrincipal'),
      estado: entryStr(e, 'estado', 'status') || 'en_stock',
    };
    });
    if (created > 0) {
      await loadData();
      toast.success(`${created} movimiento creado(s)`);
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
    const matchSearch = !s || i.referencia.toLowerCase().includes(s) || i.nombre.toLowerCase().includes(s);
    const matchEstado = !filterEstado || i.estado === filterEstado;
    return matchSearch && matchEstado;
  });

  const enStock = items.filter(i => i.estado === 'en_stock').length;
  const bajoMinimo = items.filter(i => i.estado === 'bajo_minimo' || i.estado === 'agotado').length;
  const valorInventario = items.reduce((s, i) => s + i.stockActual * 25, 0);

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setShowModal(true); };
  const openEdit = (item: StockItem) => {
    setEditing(item);
    setForm({
      referencia: item.referencia,
      nombre: item.nombre,
      ubicacion: item.ubicacion,
      stockActual: item.stockActual,
      stockMinimo: item.stockMinimo,
      stockMaximo: item.stockMaximo,
      ultimoMovimiento: item.ultimoMovimiento,
      proveedorPrincipal: item.proveedorPrincipal,
      estado: item.estado,
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
    { label: 'Refs. en Stock', value: enStock, icon: <Package className="w-5 h-5 text-green-500" />, bg: 'bg-green-50 dark:bg-green-900/30' },
    { label: 'Bajo Mínimo / Agotado', value: bajoMinimo, icon: <AlertTriangle className="w-5 h-5 text-red-500" />, bg: 'bg-red-50 dark:bg-red-900/30' },
    { label: 'Valor Inventario', value: `${valorInventario.toLocaleString('es-ES')} €`, icon: <Warehouse className="w-5 h-5 text-blue-500" />, bg: 'bg-blue-50 dark:bg-blue-900/30' },
    { label: 'Rotación Media', value: '4.2x', icon: <BarChart3 className="w-5 h-5 text-purple-500" />, bg: 'bg-purple-50 dark:bg-purple-900/30' },
  ];

  const lowStockAlerts = items.filter(i => i.estado === 'agotado' || i.estado === 'bajo_minimo');

  return (
    <Layout title="Inventario / Stock">
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

        {/* Low stock alerts */}
        {lowStockAlerts.length > 0 && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              <h3 className="font-semibold text-amber-800 dark:text-amber-300">Alertas de Stock Bajo</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {lowStockAlerts.map(a => (
                <span key={a._id} className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${a.estado === 'agotado' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'}`}>
                  {a.estado === 'agotado' ? <ArrowDown className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {a.referencia} — {a.nombre} ({a.stockActual}/{a.stockMinimo})
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar referencia, nombre..." disabled={loading} className="pl-9 pr-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm w-56 focus:ring-2 focus:ring-blue-500 dark:text-gray-100" />
            </div>
            <select value={filterEstado} onChange={e => setFilterEstado(e.target.value)} disabled={loading} className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm dark:text-gray-100">
              <option value="">Todos los estados</option>
              {Object.entries(ESTADO_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <AddButtonDropdown
                label="Nuevo movimiento"
                onQuickAdd={openCreate}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de movimiento"
              />
        </div>

        {/* Table */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Referencia</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Nombre</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Ubicación</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Actual</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Mín.</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Máx.</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Últ. Movimiento</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Proveedor</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Estado</th>
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
              ) : filtered.map(item => (
                <tr key={item._id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-blue-600 dark:text-blue-400">{item.referencia}</td>
                  <td className="px-4 py-3 text-gray-900 dark:text-gray-100">{item.nombre}</td>
                  <td className="px-4 py-3"><span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs font-mono">{item.ubicacion}</span></td>
                  <td className="px-4 py-3 text-center font-bold text-gray-900 dark:text-gray-100">
                    <span className={item.stockActual === 0 ? 'text-red-600' : item.stockActual <= item.stockMinimo ? 'text-amber-600' : ''}>{item.stockActual}</span>
                  </td>
                  <td className="px-4 py-3 text-center text-gray-500 dark:text-gray-400">{item.stockMinimo}</td>
                  <td className="px-4 py-3 text-center text-gray-500 dark:text-gray-400">{item.stockMaximo}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400 text-xs">{item.ultimoMovimiento}</td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300 text-xs">{item.proveedorPrincipal}</td>
                  <td className="px-4 py-3 text-center"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_CONFIG[item.estado].color}`}>{ESTADO_CONFIG[item.estado].label}</span></td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => openEdit(item)} className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30 text-blue-600 dark:text-blue-400 transition-colors"><Edit3 className="w-4 h-4" /></button>
                      <button onClick={() => void handleDelete(item._id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-red-500 transition-colors"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={10} className="px-4 py-12 text-center text-gray-400">No se encontraron referencias</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Modal */}
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowModal(false)}>
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">{editing ? 'Editar Referencia' : 'Nueva Referencia'}</h3>
                <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><X className="w-5 h-5 text-gray-500" /></button>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Referencia *</label>
                    <input value={form.referencia} onChange={e => setForm({ ...form, referencia: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Ubicación</label>
                    <select value={form.ubicacion} onChange={e => setForm({ ...form, ubicacion: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100">
                      {UBICACIONES.map(u => <option key={u}>{u}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Nombre *</label>
                  <input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100" />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Stock Actual</label>
                    <input type="number" value={form.stockActual} onChange={e => setForm({ ...form, stockActual: parseInt(e.target.value) || 0 })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Stock Mínimo</label>
                    <input type="number" value={form.stockMinimo} onChange={e => setForm({ ...form, stockMinimo: parseInt(e.target.value) || 0 })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Stock Máximo</label>
                    <input type="number" value={form.stockMaximo} onChange={e => setForm({ ...form, stockMaximo: parseInt(e.target.value) || 0 })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Proveedor Principal</label>
                    <select value={form.proveedorPrincipal} onChange={e => setForm({ ...form, proveedorPrincipal: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100">
                      {PROVEEDORES.map(p => <option key={p}>{p}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Estado</label>
                    <select value={form.estado} onChange={e => setForm({ ...form, estado: e.target.value as StockEstado })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100">
                      {Object.entries(ESTADO_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
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
        module="spareparts_stock"
        moduleLabel="Stock"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Stock"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
