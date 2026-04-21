import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../../components/saas/Layout';
import { useModalClose } from '../../hooks/useModalClose';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import {
  ShoppingCart, Plus, Search, Edit3, Trash2, X, Save,
  DollarSign, TrendingUp, Receipt, CreditCard, ArrowRight,
  Clock, Truck,
  Boxes, Loader2,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { toast } from 'sonner';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

interface SalePieza {
  referencia: string;
  nombre: string;
  precio: number;
}

interface Sale extends VerticalEntity {
  numVenta: string;
  cliente: string;
  clienteTelefono: string;
  piezas: SalePieza[];
  fecha: string;
  importe: number;
  formaPago: string;
  estado: 'pendiente' | 'cobrada' | 'enviada' | 'entregada' | 'cancelada';
  garantia: string;
  notas: string;
  fechaEntrega: string | null;
}

const FORMAS_PAGO = ['Efectivo', 'Tarjeta', 'Transferencia', 'Bizum'];

const ESTADO_CONFIG: Record<Sale['estado'], { label: string; color: string }> = {
  pendiente: { label: 'Pendiente', color: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  cobrada:   { label: 'Cobrada',   color: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  enviada:   { label: 'Enviada',   color: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300' },
  entregada: { label: 'Entregada', color: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
  cancelada: { label: 'Cancelada', color: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
};

type SaleForm = Omit<Sale, keyof VerticalEntity>;

const emptyForm = (): SaleForm => ({
  numVenta: '', cliente: '', clienteTelefono: '',
  piezas: [], fecha: new Date().toISOString().slice(0, 10),
  importe: 0, formaPago: 'Efectivo', estado: 'pendiente',
  garantia: '3 meses', notas: '', fechaEntrega: null,
});

const emptyPieza = (): SalePieza => ({ referencia: '', nombre: '', precio: 0 });

export function ScrapyardSales() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const api = useMemo(() => createVerticalApi<Sale>('scrapyard-ops', 'sales'), []);
  const userId = user?.user_id || user?.id || '';

  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState('');
  const [filterPago, setFilterPago] = useState('');
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
      setSales(list.map(s => ({ ...s, piezas: Array.isArray(s.piezas) ? s.piezas : [] })));
    } finally {
      setLoading(false);
    }
  }, [userId, api]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'part', label: 'Pieza' },
    { key: 'client', label: 'Cliente' },
    { key: 'price', label: 'Precio' },
    { key: 'date', label: 'Fecha' },
    { key: 'notes', label: 'Notas' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'part', label: 'Pieza', example: '' },
    { key: 'client', label: 'Cliente', example: '' },
    { key: 'price', label: 'Precio', example: '' },
    { key: 'date', label: 'Fecha', example: '' },
    { key: 'notes', label: 'Notas', example: '' },
  ];

  const handleAIEntries = async (entries: Record<string, unknown>[]) => {
    toast.success(`${entries.length} venta(s) parseado(s) con IA`);
  };

  const handleImportEntries = async (entries: Record<string, string>[]) => {
    toast.success(`${entries.length} venta(s) importado(s)`);
  };

  useModalClose(showModal, () => setShowModal(false));

  const filtered = useMemo(() => sales.filter(s => {
    const q = search.toLowerCase();
    const matchSearch = !q || s.numVenta.toLowerCase().includes(q) || s.cliente.toLowerCase().includes(q) || s.piezas.some(p => p.nombre.toLowerCase().includes(q));
    const matchEstado = !filterEstado || s.estado === filterEstado;
    const matchPago = !filterPago || s.formaPago === filterPago;
    return matchSearch && matchEstado && matchPago;
  }), [sales, search, filterEstado, filterPago]);

  const stats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const month = today.slice(0, 7);
    const ventasHoy = sales.filter(s => s.fecha === today).length;
    const ventasMes = sales.filter(s => s.fecha.startsWith(month)).length;
    const ingresosMes = sales.filter(s => s.fecha.startsWith(month) && s.estado !== 'cancelada').reduce((sum, s) => sum + s.importe, 0);
    const ticketMedio = ventasMes > 0 ? Math.round(ingresosMes / ventasMes) : 0;
    const pendientes = sales.filter(s => s.estado === 'pendiente').length;
    return { ventasHoy, ventasMes, ingresosMes, ticketMedio, pendientes };
  }, [sales]);

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setShowModal(true); };
  const openEdit = (s: Sale) => {
    setEditing(s);
    const { _id: _docId, _rev: _r, type: _t, user_id: _u, createdAt: _c, updatedAt: _up, ...rest } = s;
    setForm(rest as SaleForm);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.numVenta || !form.cliente || !userId) return;
    const totalPiezas = form.piezas.reduce((sum, p) => sum + p.precio, 0);
    const finalForm: Partial<Sale> = { ...form, importe: totalPiezas > 0 ? totalPiezas : form.importe };
    try {
      if (editing) {
        await api.update(userId, editing._id, finalForm);
      } else {
        await api.create(userId, finalForm);
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

  const handleMarcarEntregada = async (s: Sale) => {
    if (!userId) return;
    try {
      await api.update(userId, s._id, { estado: 'entregada' as const, fechaEntrega: new Date().toISOString().slice(0, 10) });
      await loadData();
    } catch {
      /* fetch error */
    }
  };

  const addPieza = () => setForm(f => ({ ...f, piezas: [...f.piezas, emptyPieza()] }));
  const updatePieza = (idx: number, field: keyof SalePieza, value: string | number) => setForm(f => ({ ...f, piezas: f.piezas.map((p, i) => i === idx ? { ...p, [field]: value } : p) }));
  const removePieza = (idx: number) => setForm(f => ({ ...f, piezas: f.piezas.filter((_, i) => i !== idx) }));

  const kpis = [
    { label: 'Ventas hoy', value: stats.ventasHoy, icon: <ShoppingCart className="w-5 h-5 text-blue-500" />, bg: 'bg-blue-50 dark:bg-blue-900/20' },
    { label: 'Ventas mes', value: stats.ventasMes, icon: <Receipt className="w-5 h-5 text-emerald-500" />, bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
    { label: 'Ingresos mes', value: `${stats.ingresosMes.toLocaleString('es-ES')} \u20AC`, icon: <TrendingUp className="w-5 h-5 text-violet-500" />, bg: 'bg-violet-50 dark:bg-violet-900/20' },
    { label: 'Ticket medio', value: `${stats.ticketMedio.toLocaleString('es-ES')} \u20AC`, icon: <DollarSign className="w-5 h-5 text-amber-500" />, bg: 'bg-amber-50 dark:bg-amber-900/20' },
    { label: 'Pendientes', value: stats.pendientes, icon: <Clock className="w-5 h-5 text-red-500" />, bg: 'bg-red-50 dark:bg-red-900/20' },
  ];

  return (
    <Layout title="Ventas de Piezas">
      <div className="space-y-6">
        {/* Connection banner */}
        <div className="flex items-center justify-between bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-4 border border-emerald-100 dark:border-emerald-900/40">
          <div className="flex items-center gap-3">
            <Boxes className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <div>
              <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">Conectado con Stock de Piezas</p>
              <p className="text-xs text-emerald-600 dark:text-emerald-400">Al crear una venta, las piezas se reservan automaticamente. Al entregar, se descuentan del stock.</p>
            </div>
          </div>
          <button onClick={() => navigate('/saas/scrapyard-inventory')} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium transition-colors">
            Ver stock <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
          {kpis.map(k => (
            <div key={k.label} className={`${k.bg} rounded-xl p-4`}>
              <div className="flex items-center gap-2 mb-2">
                <div className="p-1.5 bg-white dark:bg-gray-800 rounded-lg shadow-sm">{k.icon}</div>
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{k.value}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{k.label}</p>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="flex flex-wrap gap-2 items-center flex-1">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar venta, cliente, pieza..." className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-blue-500 dark:text-gray-100 outline-none" />
            </div>
            <select value={filterEstado} onChange={e => setFilterEstado(e.target.value)} className="px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm dark:text-gray-100">
              <option value="">Todos estados</option>
              {Object.entries(ESTADO_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select value={filterPago} onChange={e => setFilterPago(e.target.value)} className="px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm dark:text-gray-100">
              <option value="">Forma pago</option>
              {FORMAS_PAGO.map(p => <option key={p} value={p}>{p}</option>)}
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

        {/* Table */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/80">
                <th className="text-left px-4 py-3 font-semibold text-gray-500 dark:text-gray-400">N\u00BA Venta</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-500 dark:text-gray-400">Cliente</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 hidden md:table-cell">Piezas</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 hidden lg:table-cell">Fecha</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-500 dark:text-gray-400">Importe</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 hidden lg:table-cell">Pago</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-500 dark:text-gray-400">Estado</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 hidden xl:table-cell">Garantia</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-500 dark:text-gray-400">Acciones</th>
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
              ) : filtered.map(s => (
                <tr key={s._id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50/80 dark:hover:bg-gray-700/20 transition-colors">
                  <td className="px-4 py-3"><span className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400">{s.numVenta}</span></td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900 dark:text-gray-100">{s.cliente}</p>
                    {s.clienteTelefono && <p className="text-[10px] text-gray-400">{s.clienteTelefono}</p>}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    {s.piezas.length > 0 ? (
                      <div>
                        <p className="text-xs text-gray-700 dark:text-gray-300 truncate max-w-[200px]">{s.piezas.map(p => p.nombre).join(', ')}</p>
                        <p className="text-[10px] text-gray-400">{s.piezas.length} pieza{s.piezas.length !== 1 ? 's' : ''}</p>
                      </div>
                    ) : <span className="text-xs text-gray-400">\u2014</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300 hidden lg:table-cell text-xs">{s.fecha}</td>
                  <td className="px-4 py-3 text-right font-bold text-gray-900 dark:text-gray-100">{s.importe.toLocaleString('es-ES')} \u20AC</td>
                  <td className="px-4 py-3 hidden lg:table-cell"><span className="inline-flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300"><CreditCard className="w-3 h-3" />{s.formaPago}</span></td>
                  <td className="px-4 py-3 text-center"><span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${ESTADO_CONFIG[s.estado].color}`}>{ESTADO_CONFIG[s.estado].label}</span></td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300 hidden xl:table-cell text-xs">{s.garantia}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      {(s.estado === 'cobrada' || s.estado === 'enviada') && (
                        <button onClick={() => handleMarcarEntregada(s)} title="Marcar entregada (descuenta stock)" className="p-1.5 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/20 text-emerald-500 transition-colors"><Truck className="w-4 h-4" /></button>
                      )}
                      <button onClick={() => openEdit(s)} className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-500 transition-colors"><Edit3 className="w-4 h-4" /></button>
                      <button onClick={() => handleDelete(s._id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-400 hover:text-red-600 transition-colors"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-16 text-center">
                  <ShoppingCart className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                  <p className="text-gray-500 dark:text-gray-400 font-medium">No se encontraron ventas</p>
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">{editing ? 'Editar Venta' : 'Nueva Venta'}</h3>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">N\u00BA Venta *</label>
                  <input value={form.numVenta} onChange={e => setForm(f => ({ ...f, numVenta: e.target.value }))} placeholder="V-001" className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100 font-mono" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Fecha</label>
                  <input type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Cliente *</label>
                  <input value={form.cliente} onChange={e => setForm(f => ({ ...f, cliente: e.target.value }))} placeholder="Nombre del cliente" className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Telefono</label>
                  <input value={form.clienteTelefono} onChange={e => setForm(f => ({ ...f, clienteTelefono: e.target.value }))} placeholder="600 000 000" className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100" />
                </div>
              </div>

              {/* Piezas vendidas */}
              <div className="pt-2 border-t border-gray-100 dark:border-gray-700">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Piezas vendidas</h4>
                  <button onClick={addPieza} className="flex items-center gap-1 px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium transition-colors"><Plus className="w-3 h-3" /> Pieza</button>
                </div>
                {form.piezas.length > 0 ? (
                  <div className="space-y-2">
                    {form.piezas.map((p, i) => (
                      <div key={i} className="grid grid-cols-[1fr_2fr_auto_auto] gap-2 items-end">
                        <div>
                          <label className="block text-[10px] text-gray-400 mb-0.5">Ref.</label>
                          <input value={p.referencia} onChange={e => updatePieza(i, 'referencia', e.target.value)} placeholder="REF" className="w-full px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs dark:text-gray-100 font-mono" />
                        </div>
                        <div>
                          <label className="block text-[10px] text-gray-400 mb-0.5">Nombre</label>
                          <input value={p.nombre} onChange={e => updatePieza(i, 'nombre', e.target.value)} placeholder="Motor, puerta..." className="w-full px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs dark:text-gray-100" />
                        </div>
                        <div>
                          <label className="block text-[10px] text-gray-400 mb-0.5">Precio</label>
                          <input type="number" value={p.precio} onChange={e => updatePieza(i, 'precio', Number(e.target.value))} className="w-20 px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs dark:text-gray-100" />
                        </div>
                        <button onClick={() => removePieza(i)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-400"><X className="w-3.5 h-3.5" /></button>
                      </div>
                    ))}
                    <div className="text-right text-xs text-gray-500 pt-1">
                      Total piezas: <span className="font-bold text-gray-900 dark:text-gray-100">{form.piezas.reduce((s, p) => s + p.precio, 0).toLocaleString('es-ES')} \u20AC</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 py-4 text-center border border-dashed border-gray-200 dark:border-gray-700 rounded-lg">Sin piezas. Agrega piezas del stock.</p>
                )}
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Importe total</label>
                  <input type="number" value={form.importe} onChange={e => setForm(f => ({ ...f, importe: Number(e.target.value) }))} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Forma de pago</label>
                  <select value={form.formaPago} onChange={e => setForm(f => ({ ...f, formaPago: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100">
                    {FORMAS_PAGO.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Estado</label>
                  <select value={form.estado} onChange={e => setForm(f => ({ ...f, estado: e.target.value as Sale['estado'] }))} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100">
                    {Object.entries(ESTADO_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Garantia</label>
                <input value={form.garantia} onChange={e => setForm(f => ({ ...f, garantia: e.target.value }))} placeholder="3 meses" className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Notas</label>
                <textarea value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} rows={2} placeholder="Notas de la venta..." className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100 resize-none" />
              </div>

              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-900/40">
                <p className="text-xs text-blue-700 dark:text-blue-300">
                  <strong>Automatizacion:</strong> Al crear la venta, las piezas referenciadas se reservan en el stock. Al marcar como "Entregada", se descuentan definitivamente.
                </p>
              </div>
            </div>
            <div className="sticky bottom-0 flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-b-2xl">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">Cancelar</button>
              <button onClick={handleSave} className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"><Save className="w-4 h-4" /> Guardar</button>
            </div>
          </div>
        </div>
      )}
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="scrapyard_sales"
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
