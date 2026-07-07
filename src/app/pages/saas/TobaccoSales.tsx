import { useState, useMemo, useCallback, useEffect } from 'react';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import { useModalClose } from '../../hooks/useModalClose';
import {
  Search, Plus, X, Edit2, Trash2, Filter,
  Receipt, TrendingUp, BarChart3, CalendarDays, Loader2,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { toast } from 'sonner';
import { bulkCreateVerticalEntries, entryStr, entryNum } from '../../lib/bulkVerticalImport';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

type PaymentMethod = 'efectivo' | 'tarjeta';
type SaleStatus = 'completada' | 'pendiente' | 'anulada';

interface Sale extends VerticalEntity {
  ticket: string;
  fecha: string;
  cliente: string;
  articulos: string;
  categoria: 'tabaco' | 'loteria' | 'timbre' | 'prensa' | 'otros';
  total: number;
  pago: PaymentMethod;
  estado: SaleStatus;
}

type SaleForm = Omit<Sale, keyof VerticalEntity>;

const PAGO_LABEL: Record<PaymentMethod, string> = { efectivo: 'Efectivo', tarjeta: 'Tarjeta' };

const ESTADO_CFG: Record<SaleStatus, { label: string; dot: string }> = {
  completada: { label: 'Completada', dot: 'bg-emerald-500' },
  pendiente:  { label: 'Pendiente',  dot: 'bg-amber-500' },
  anulada:    { label: 'Anulada',    dot: 'bg-red-500' },
};

const CAT_LABEL: Record<Sale['categoria'], string> = {
  tabaco: 'Tabaco', loteria: 'Lotería', timbre: 'Timbre / Sellos', prensa: 'Prensa', otros: 'Otros',
};

const HOY = new Date().toISOString().slice(0, 10);
const MES = HOY.slice(0, 7);

const emptyForm = (): SaleForm => ({
  ticket: '', fecha: HOY, cliente: '', articulos: '', categoria: 'tabaco', total: 0, pago: 'efectivo', estado: 'completada',
});

export function TobaccoSales() {
  const { user } = useAuth();
  const api = useMemo(() => createVerticalApi<Sale>('tobacco', 'sales'), []);
  const userId = user?.user_id || user?.id || '';

  const [items, setItems] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState<Sale['categoria'] | 'all'>('all');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Sale | null>(null);
  const [form, setForm] = useState<SaleForm>(emptyForm());
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
    { key: 'price', label: 'Precio' },
    { key: 'date', label: 'Fecha' },
    { key: 'payment', label: 'Forma pago' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'product', label: 'Producto', example: '' },
    { key: 'quantity', label: 'Cantidad', example: '' },
    { key: 'price', label: 'Precio', example: '' },
    { key: 'date', label: 'Fecha', example: '' },
    { key: 'payment', label: 'Forma pago', example: '' },
  ];

  const persistEntries = async (entries: Record<string, unknown>[]) => {
    if (!userId) {
      toast.error('Sesión no válida');
      return;
    }
    const created = await bulkCreateVerticalEntries(userId, api, entries, (e) => {
    const ticket = entryStr(e, 'ticket');
    if (!ticket) return null;
    return {
      ticket,
      fecha: entryStr(e, 'fecha', 'date'),
      cliente: entryStr(e, 'cliente', 'client') || '',
      articulos: entryStr(e, 'articulos') || '',
      categoria: entryStr(e, 'categoria', 'category') || 'tabaco',
      total: entryNum(e, 'total'),
      pago: entryStr(e, 'pago') || 'efectivo',
      estado: entryStr(e, 'estado', 'status') || 'completada',
    };
    });
    if (created > 0) {
      await loadData();
      toast.success(`${created} venta creado(s)`);
    } else {
      toast.error('No se pudo crear ningún registro');
    }
  };

  const handleAIEntries = persistEntries;
  const handleImportEntries = async (entries: Record<string, string>[]) => persistEntries(entries);

  useModalClose(showModal, () => setShowModal(false));

  const filtered = useMemo(() => items.filter(s => {
    const q = search.toLowerCase();
    if (search && !s.ticket.toLowerCase().includes(q) && !s.cliente.toLowerCase().includes(q) && !s.articulos.toLowerCase().includes(q)) return false;
    if (filterCat !== 'all' && s.categoria !== filterCat) return false;
    return true;
  }), [items, search, filterCat]);

  const stats = useMemo(() => {
    const completadas = items.filter(s => s.estado === 'completada');
    const ventasHoy = completadas.filter(s => s.fecha === HOY).length;
    const ingresosHoy = completadas.filter(s => s.fecha === HOY).reduce((a, s) => a + s.total, 0);
    const hoyList = completadas.filter(s => s.fecha === HOY);
    const ticketMedio = hoyList.length ? ingresosHoy / hoyList.length : 0;
    const ventasMes = completadas.filter(s => s.fecha.startsWith(MES)).length;
    return { ventasHoy, ingresosHoy, ticketMedio, ventasMes };
  }, [items]);

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setShowModal(true); };
  const openEdit = (s: Sale) => {
    setEditing(s);
    setForm({
      ticket: s.ticket, fecha: s.fecha, cliente: s.cliente, articulos: s.articulos, categoria: s.categoria,
      total: s.total, pago: s.pago, estado: s.estado,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.ticket.trim() || !userId) return;
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
    { label: 'Ventas hoy', value: stats.ventasHoy, icon: Receipt, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30' },
    { label: 'Ingresos hoy', value: stats.ingresosHoy.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }), icon: TrendingUp, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
    { label: 'Ticket medio', value: stats.ticketMedio.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }), icon: BarChart3, color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-900/30' },
    { label: 'Ventas del mes', value: stats.ventasMes, icon: CalendarDays, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/30' },
  ];

  return (
    <Layout title="Ventas">
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
            <input className="w-full pl-10 pr-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:border-gray-900 dark:focus:border-gray-500 outline-none text-sm" placeholder="Buscar por ticket, cliente o artículos..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <Filter className="w-4 h-4 text-gray-400" />
              <select className="text-sm border-2 border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 outline-none" value={filterCat} onChange={e => setFilterCat(e.target.value as Sale['categoria'] | 'all')}>
                <option value="all">Todas las categorías</option>
                {(Object.keys(CAT_LABEL) as Sale['categoria'][]).map(k => <option key={k} value={k}>{CAT_LABEL[k]}</option>)}
              </select>
            </div>
            <AddButtonDropdown
                label="Nueva venta"
                onQuickAdd={openCreate}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de venta"
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
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Ticket</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Fecha</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Cliente</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Categoría</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Artículos</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Total</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Pago</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Estado</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => (
                <tr key={s._id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition">
                  <td className="px-4 py-3 font-mono font-medium text-gray-900 dark:text-white">{s.ticket}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{s.fecha}</td>
                  <td className="px-4 py-3 text-gray-900 dark:text-white">{s.cliente}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{CAT_LABEL[s.categoria]}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400 max-w-[180px] truncate" title={s.articulos}>{s.articulos}</td>
                  <td className="px-4 py-3 text-right text-gray-900 dark:text-white">{s.total.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{PAGO_LABEL[s.pago]}</td>
                  <td className="px-4 py-3"><span className="inline-flex items-center gap-1.5 text-sm"><span className={`w-2 h-2 rounded-full ${ESTADO_CFG[s.estado].dot}`} />{ESTADO_CFG[s.estado].label}</span></td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button type="button" onClick={() => openEdit(s)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition"><Edit2 className="w-4 h-4" /></button>
                      <button type="button" onClick={() => void handleDelete(s._id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-500 hover:text-red-600 transition"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-gray-400 dark:text-gray-500">No hay ventas que coincidan con los filtros.</td></tr>
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
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">{editing ? 'Editar venta' : 'Nueva venta'}</h2>
              <button type="button" onClick={() => setShowModal(false)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Nº ticket *</label>
                  <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.ticket} onChange={e => setForm(f => ({ ...f, ticket: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Fecha</label>
                  <input type="date" className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Cliente</label>
                <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.cliente} onChange={e => setForm(f => ({ ...f, cliente: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Categoría</label>
                <select className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value as Sale['categoria'] }))}>
                  {(Object.keys(CAT_LABEL) as Sale['categoria'][]).map(k => <option key={k} value={k}>{CAT_LABEL[k]}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Artículos</label>
                <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.articulos} onChange={e => setForm(f => ({ ...f, articulos: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Total (€)</label>
                  <input type="number" step="0.01" className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.total} onChange={e => setForm(f => ({ ...f, total: Number(e.target.value) }))} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Forma de pago</label>
                  <select className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.pago} onChange={e => setForm(f => ({ ...f, pago: e.target.value as PaymentMethod }))}>
                    {(Object.keys(PAGO_LABEL) as PaymentMethod[]).map(k => <option key={k} value={k}>{PAGO_LABEL[k]}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Estado</label>
                <select className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.estado} onChange={e => setForm(f => ({ ...f, estado: e.target.value as SaleStatus }))}>
                  {Object.entries(ESTADO_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
            </div>
            <div className="sticky bottom-0 bg-white dark:bg-gray-800 flex justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700 rounded-b-2xl">
              <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition">Cancelar</button>
              <button type="button" onClick={handleSave} className="px-6 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-semibold hover:opacity-90 transition">{editing ? 'Guardar cambios' : 'Registrar venta'}</button>
            </div>
          </div>
        </div>
      )}
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="tobacco_sales"
        moduleLabel="Ventas"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Ventas"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
