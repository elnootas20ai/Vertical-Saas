import { useState, useMemo, useCallback, useEffect } from 'react';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import { useModalClose } from '../../hooks/useModalClose';
import {
  Search, Plus, Edit3, Trash2, X, Save,   ShoppingCart,
  Clock, Euro, Receipt, Zap, Package, Truck, CheckCircle2,
  XCircle, Loader2,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { toast } from 'sonner';
import { bulkCreateVerticalEntries, entryStr, entryNum } from '../../lib/bulkVerticalImport';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

type OrderEstado = 'pendiente' | 'preparando' | 'listo' | 'enviado' | 'entregado' | 'cancelado';
type Urgencia = 'normal' | 'urgente' | 'express';
type TipoCliente = 'taller' | 'particular' | 'empresa';

interface OrderLine {
  referencia: string;
  nombre: string;
  cantidad: number;
  precioUnitario: number;
}

interface SparePartsOrder extends VerticalEntity {
  numPedido: string;
  cliente: string;
  tipoCliente: TipoCliente;
  fecha: string;
  articulos: OrderLine[];
  importeTotal: number;
  estado: OrderEstado;
  urgencia: Urgencia;
}

const ESTADO_CONFIG: Record<OrderEstado, { label: string; color: string; icon: typeof Clock }> = {
  pendiente: { label: 'Pendiente', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300', icon: Clock },
  preparando: { label: 'Preparando', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300', icon: Package },
  listo: { label: 'Listo', color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300', icon: CheckCircle2 },
  enviado: { label: 'Enviado', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300', icon: Truck },
  entregado: { label: 'Entregado', color: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300', icon: CheckCircle2 },
  cancelado: { label: 'Cancelado', color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300', icon: XCircle },
};

const URGENCIA_CONFIG: Record<Urgencia, { label: string; color: string }> = {
  normal: { label: 'Normal', color: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' },
  urgente: { label: 'Urgente', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300' },
  express: { label: 'Express', color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
};

const TIPO_CLIENTE_LABEL: Record<TipoCliente, string> = { taller: 'Taller', particular: 'Particular', empresa: 'Empresa' };

const emptyLine = (): OrderLine => ({ referencia: '', nombre: '', cantidad: 1, precioUnitario: 0 });

type OrderForm = Omit<SparePartsOrder, keyof VerticalEntity | 'articulos' | 'importeTotal'> & {
  articulos: OrderLine[];
  importeTotal: number;
};

const emptyForm = (): OrderForm => ({
  numPedido: '', cliente: '', tipoCliente: 'taller' as TipoCliente, fecha: new Date().toISOString().slice(0, 10),
  articulos: [emptyLine()], importeTotal: 0, estado: 'pendiente' as OrderEstado, urgencia: 'normal' as Urgencia,
});

export function SparePartsOrders() {
  const { user } = useAuth();
  const api = useMemo(() => createVerticalApi<SparePartsOrder>('spareparts', 'orders'), []);
  const userId = user?.user_id || user?.id || '';

  const [orders, setOrders] = useState<SparePartsOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<SparePartsOrder | null>(null);
  const [form, setForm] = useState<OrderForm>(emptyForm());
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'supplier', label: 'Proveedor' },
    { key: 'items', label: 'Artículos' },
    { key: 'total', label: 'Total' },
    { key: 'date', label: 'Fecha' },
    { key: 'status', label: 'Estado' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'supplier', label: 'Proveedor', example: '' },
    { key: 'items', label: 'Artículos', example: '' },
    { key: 'total', label: 'Total', example: '' },
    { key: 'date', label: 'Fecha', example: '' },
    { key: 'status', label: 'Estado', example: '' },
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
      cantidad: entryNum(e, 'cantidad', 'quantity', 'qty'),
      precioUnitario: entryNum(e, 'precioUnitario'),
    };
    });
    if (created > 0) {
      await loadData();
      toast.success(`${created} pedido creado(s)`);
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
      setOrders(list);
    } finally {
      setLoading(false);
    }
  }, [userId, api]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filtered = orders.filter(o => {
    const s = search.toLowerCase();
    const matchSearch = !s || o.numPedido.toLowerCase().includes(s) || o.cliente.toLowerCase().includes(s);
    const matchEstado = !filterEstado || o.estado === filterEstado;
    return matchSearch && matchEstado;
  });

  const today = new Date().toISOString().slice(0, 10);
  const pedidosHoy = orders.filter(o => o.fecha === today).length;
  const pendientes = orders.filter(o => o.estado === 'pendiente' || o.estado === 'preparando').length;
  const month = new Date().toISOString().slice(0, 7);
  const ingresosMes = orders.filter(o => o.fecha.startsWith(month) && o.estado !== 'cancelado').reduce((s, o) => s + o.importeTotal, 0);
  const delivered = orders.filter(o => o.estado !== 'cancelado');
  const ticketMedio = delivered.length > 0 ? delivered.reduce((s, o) => s + o.importeTotal, 0) / delivered.length : 0;

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setShowModal(true); };
  const openEdit = (order: SparePartsOrder) => {
    setEditing(order);
    setForm({
      numPedido: order.numPedido,
      cliente: order.cliente,
      tipoCliente: order.tipoCliente,
      fecha: order.fecha,
      articulos: [...order.articulos],
      importeTotal: order.importeTotal,
      estado: order.estado,
      urgencia: order.urgencia,
    });
    setShowModal(true);
  };

  const recalcTotal = (lines: OrderLine[]) => lines.reduce((s, l) => s + l.cantidad * l.precioUnitario, 0);

  const updateLine = (idx: number, field: keyof OrderLine, value: string | number) => {
    const newLines = form.articulos.map((l, i) => i === idx ? { ...l, [field]: value } : l);
    setForm({ ...form, articulos: newLines, importeTotal: recalcTotal(newLines) });
  };

  const addLine = () => setForm({ ...form, articulos: [...form.articulos, emptyLine()] });
  const removeLine = (idx: number) => {
    const newLines = form.articulos.filter((_, i) => i !== idx);
    setForm({ ...form, articulos: newLines, importeTotal: recalcTotal(newLines) });
  };

  const handleSave = async () => {
    if (!userId || !form.numPedido || !form.cliente) return;
    const payload = {
      numPedido: form.numPedido,
      cliente: form.cliente,
      tipoCliente: form.tipoCliente,
      fecha: form.fecha,
      articulos: form.articulos,
      importeTotal: form.importeTotal,
      estado: form.estado,
      urgencia: form.urgencia,
    };
    try {
      if (editing) {
        await api.update(userId, editing._id, payload);
      } else {
        await api.create(userId, payload);
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
    { label: 'Pedidos Hoy', value: pedidosHoy, icon: <ShoppingCart className="w-5 h-5 text-blue-500" />, bg: 'bg-blue-50 dark:bg-blue-900/30' },
    { label: 'Pendientes', value: pendientes, icon: <Clock className="w-5 h-5 text-amber-500" />, bg: 'bg-amber-50 dark:bg-amber-900/30' },
    { label: 'Ingresos Mes', value: `${ingresosMes.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €`, icon: <Euro className="w-5 h-5 text-green-500" />, bg: 'bg-green-50 dark:bg-green-900/30' },
    { label: 'Ticket Medio', value: `${ticketMedio.toFixed(2)} €`, icon: <Receipt className="w-5 h-5 text-purple-500" />, bg: 'bg-purple-50 dark:bg-purple-900/30' },
  ];

  return (
    <Layout title="Pedidos de Clientes">
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
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar pedido, cliente..." disabled={loading} className="pl-9 pr-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm w-56 focus:ring-2 focus:ring-blue-500 dark:text-gray-100" />
            </div>
            <select value={filterEstado} onChange={e => setFilterEstado(e.target.value)} disabled={loading} className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm dark:text-gray-100">
              <option value="">Todos los estados</option>
              {Object.entries(ESTADO_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <AddButtonDropdown
                label="Nuevo Pedido"
                onQuickAdd={openCreate}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de pedido"
              />
        </div>

        {/* Table */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Nº Pedido</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Cliente</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Tipo</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Fecha</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Artículos</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Importe</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Estado</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Urgencia</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Acciones</th>
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
              ) : filtered.map(order => (
                <tr key={order._id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-blue-600 dark:text-blue-400">{order.numPedido}</td>
                  <td className="px-4 py-3 text-gray-900 dark:text-gray-100">{order.cliente}</td>
                  <td className="px-4 py-3 text-center"><span className="text-xs text-gray-500 dark:text-gray-400">{TIPO_CLIENTE_LABEL[order.tipoCliente]}</span></td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400 text-xs">{order.fecha}</td>
                  <td className="px-4 py-3 text-center text-gray-700 dark:text-gray-300">{order.articulos.reduce((s, a) => s + a.cantidad, 0)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-gray-100">{order.importeTotal.toFixed(2)} €</td>
                  <td className="px-4 py-3 text-center"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_CONFIG[order.estado].color}`}>{ESTADO_CONFIG[order.estado].label}</span></td>
                  <td className="px-4 py-3 text-center"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${URGENCIA_CONFIG[order.urgencia].color}`}>{order.urgencia === 'express' ? <Zap className="w-3 h-3 inline mr-1" /> : null}{URGENCIA_CONFIG[order.urgencia].label}</span></td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => openEdit(order)} className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30 text-blue-600 dark:text-blue-400 transition-colors"><Edit3 className="w-4 h-4" /></button>
                      <button onClick={() => void handleDelete(order._id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-red-500 transition-colors"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-gray-400">No se encontraron pedidos</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Modal */}
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowModal(false)}>
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">{editing ? 'Editar Pedido' : 'Nuevo Pedido'}</h3>
                <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><X className="w-5 h-5 text-gray-500" /></button>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Nº Pedido *</label>
                    <input value={form.numPedido} onChange={e => setForm({ ...form, numPedido: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Fecha</label>
                    <input type="date" value={form.fecha} onChange={e => setForm({ ...form, fecha: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Cliente *</label>
                    <input value={form.cliente} onChange={e => setForm({ ...form, cliente: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Tipo Cliente</label>
                    <select value={form.tipoCliente} onChange={e => setForm({ ...form, tipoCliente: e.target.value as TipoCliente })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100">
                      {Object.entries(TIPO_CLIENTE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Urgencia</label>
                    <select value={form.urgencia} onChange={e => setForm({ ...form, urgencia: e.target.value as Urgencia })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100">
                      {Object.entries(URGENCIA_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Estado</label>
                  <select value={form.estado} onChange={e => setForm({ ...form, estado: e.target.value as OrderEstado })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100">
                    {Object.entries(ESTADO_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>

                {/* Line items */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Artículos</label>
                    <button onClick={addLine} className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"><Plus className="w-3 h-3" /> Añadir línea</button>
                  </div>
                  <div className="space-y-2">
                    {form.articulos.map((line, idx) => (
                      <div key={idx} className="flex gap-2 items-end">
                        <input placeholder="Ref." value={line.referencia} onChange={e => updateLine(idx, 'referencia', e.target.value)} className="w-24 px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs dark:text-gray-100" />
                        <input placeholder="Nombre" value={line.nombre} onChange={e => updateLine(idx, 'nombre', e.target.value)} className="flex-1 px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs dark:text-gray-100" />
                        <input type="number" placeholder="Uds." value={line.cantidad} onChange={e => updateLine(idx, 'cantidad', parseInt(e.target.value) || 0)} className="w-16 px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs dark:text-gray-100" />
                        <input type="number" step="0.01" placeholder="€/ud" value={line.precioUnitario} onChange={e => updateLine(idx, 'precioUnitario', parseFloat(e.target.value) || 0)} className="w-20 px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs dark:text-gray-100" />
                        <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 w-16 text-right">{(line.cantidad * line.precioUnitario).toFixed(2)} €</span>
                        {form.articulos.length > 1 && <button onClick={() => removeLine(idx)} className="p-1 text-red-400 hover:text-red-600"><X className="w-3.5 h-3.5" /></button>}
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-end mt-2 text-sm font-bold text-gray-900 dark:text-white">Total: {form.importeTotal.toFixed(2)} €</div>
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
        module="spareparts_orders"
        moduleLabel="Pedidos"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Pedidos"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
