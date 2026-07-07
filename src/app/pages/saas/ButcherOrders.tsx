import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Layout } from '../../components/saas/Layout';
import { useApp } from '../../context/AppContext';
import { useModalClose } from '../../hooks/useModalClose';
import { toast } from 'sonner';
import {
  listButcherOrdersRequest,
  createButcherOrderRequest,
  updateButcherOrderRequest,
  updateButcherOrderStatusRequest,
  deleteButcherOrderRequest,
  searchButcherClientsRequest,
  type ButcherOrder,
  type ButcherClient,
  type OrderType,
  type OrderStatus,
  type OrderItem,
} from '../../lib/butcherApi';
import {
  Search, Plus, X, Edit2, Trash2, Filter,
  ClipboardList, Clock, CheckCircle2, CalendarDays,
  ChevronDown, AlertTriangle, Phone, Package,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

const HOY = new Date().toISOString().slice(0, 10);

const ORDER_TYPE_CFG: Record<OrderType, { label: string; prefix: string; color: string }> = {
  simple: { label: 'Pedido', prefix: 'PED', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' },
  reservation: { label: 'Reserva', prefix: 'RES', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300' },
  special: { label: 'Encargo', prefix: 'ENC', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' },
};

const STATUS_CFG: Record<OrderStatus, { label: string; dot: string; action?: string; next?: OrderStatus }> = {
  pending:   { label: 'Pendiente',  dot: 'bg-amber-500',   action: 'Preparar',        next: 'preparing' },
  preparing: { label: 'Preparando', dot: 'bg-blue-500',    action: 'Marcar listo',     next: 'ready' },
  ready:     { label: 'Listo',      dot: 'bg-emerald-500', action: 'Marcar recogido',  next: 'picked_up' },
  picked_up: { label: 'Recogido',   dot: 'bg-gray-400' },
  cancelled: { label: 'Cancelado',  dot: 'bg-red-500' },
};

const EMPTY_ITEM: OrderItem = { productId: null, productName: '', quantity: 1, unit: 'kg', pricePerUnit: 0, subtotal: 0, notes: '' };

const EMPTY_FORM = {
  orderType: 'simple' as OrderType,
  clientId: null as string | null,
  clientName: '',
  clientPhone: '',
  items: [{ ...EMPTY_ITEM }] as OrderItem[],
  pickupDate: HOY,
  pickupTime: '',
  priority: 'normal',
  notes: '',
};

export function ButcherOrders() {
  const { userId } = useApp();
  const [orders, setOrders] = useState<ButcherOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<OrderStatus | 'all'>('all');
  const [filterType, setFilterType] = useState<OrderType | 'all'>('all');
  const [tab, setTab] = useState<'all' | 'today'>('today');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<ButcherOrder | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const [clientSuggestions, setClientSuggestions] = useState<ButcherClient[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
    const searchTimeout = useRef<any>(null);

  useModalClose(showModal, () => setShowModal(false));

  const fetchOrders = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const res = await listButcherOrdersRequest(userId);
      if (res.ok) setOrders(res.orders || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const filtered = useMemo(() => {
    let list = orders;
    if (tab === 'today') list = list.filter((o) => o.pickupDate === HOY && o.status !== 'cancelled');
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((o) => o.orderNumber.toLowerCase().includes(q) || o.clientName.toLowerCase().includes(q) || o.items.some((it) => it.productName.toLowerCase().includes(q)));
    }
    if (filterStatus !== 'all') list = list.filter((o) => o.status === filterStatus);
    if (filterType !== 'all') list = list.filter((o) => o.orderType === filterType);
    return tab === 'today'
      ? list.sort((a, b) => (a.pickupTime || '').localeCompare(b.pickupTime || ''))
      : list;
  }, [orders, search, filterStatus, filterType, tab]);

  const stats = useMemo(() => ({
    pending: orders.filter((o) => o.status === 'pending').length,
    preparing: orders.filter((o) => o.status === 'preparing').length,
    ready: orders.filter((o) => o.status === 'ready').length,
    urgent: orders.filter((o) => o.priority === 'urgent' && o.status !== 'picked_up' && o.status !== 'cancelled').length,
  }), [orders]);

  const openCreate = (type: OrderType = 'simple') => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, orderType: type });
    setShowModal(true);
  };

  const openEdit = (o: ButcherOrder) => {
    setEditing(o);
    setForm({
      orderType: o.orderType, clientId: o.clientId, clientName: o.clientName, clientPhone: o.clientPhone,
      items: o.items.length > 0 ? [...o.items] : [{ ...EMPTY_ITEM }],
      pickupDate: o.pickupDate, pickupTime: o.pickupTime, priority: o.priority, notes: o.notes,
    });
    setShowModal(true);
  };

  const calcTotal = (items: OrderItem[]) => items.reduce((s, it) => s + (Number(it.quantity || 0) * Number(it.pricePerUnit || 0)), 0);

  const handleSave = async () => {
    if (!userId || form.items.every((it) => !it.productName.trim())) return;
    const payload: any = {
      ...form,
      items: form.items.filter((it) => it.productName.trim()),
      total: calcTotal(form.items),
    };
    try {
      const res = editing
        ? await updateButcherOrderRequest(userId, editing._id, payload)
        : await createButcherOrderRequest(userId, payload);
      if (res.ok) {
        toast.success(editing ? 'Pedido actualizado' : 'Pedido creado');
        setShowModal(false);
        fetchOrders();
      } else toast.error(res.error || 'Error');
    } catch { toast.error('Error de conexión'); }
  };

  const handleStatusChange = async (o: ButcherOrder, newStatus: OrderStatus) => {
    if (!userId) return;
    try {
      const res = await updateButcherOrderStatusRequest(userId, o._id, newStatus);
      if (res.ok) { toast.success(`Estado: ${STATUS_CFG[newStatus].label}`); fetchOrders(); }
    } catch { toast.error('Error de conexión'); }
  };

  const handleDelete = async (id: string) => {
    if (!userId) return;
    try {
      const res = await deleteButcherOrderRequest(userId, id);
      if (res.ok) { toast.success('Pedido eliminado'); fetchOrders(); }
    } catch { toast.error('Error de conexión'); }
  };

  const searchClients = (q: string) => {
    setForm((f) => ({ ...f, clientName: q, clientId: null }));
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (q.length < 2 || !userId) { setClientSuggestions([]); setShowSuggestions(false); return; }
    searchTimeout.current = setTimeout(async () => {
      try {
        const res = await searchButcherClientsRequest(userId, q);
        if (res.ok) { setClientSuggestions(res.clients || []); setShowSuggestions(true); }
      } catch { /* ignore */ }
    }, 300);
  };

  const selectClient = (c: ButcherClient) => {
    setForm((f) => ({ ...f, clientId: c._id, clientName: c.name, clientPhone: c.phone }));
    setShowSuggestions(false);
    if (c.preferences.usualProducts.length > 0 && form.items.length === 1 && !form.items[0].productName) {
      setForm((f) => ({
        ...f,
        items: c.preferences.usualProducts.map((p) => ({
          productId: p.productId, productName: p.productName, quantity: p.quantity, unit: p.unit,
          pricePerUnit: 0, subtotal: 0, notes: '',
        })),
      }));
      toast.info('Se cargaron los productos habituales del cliente');
    }
  };

  const addItem = () => setForm((f) => ({ ...f, items: [...f.items, { ...EMPTY_ITEM }] }));
  const removeItem = (idx: number) => setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));
  const updateItem = (idx: number, field: string, val: any) => setForm((f) => ({
    ...f, items: f.items.map((it, i) => i === idx ? { ...it, [field]: val } : it),
  }));

  const STAT_CARDS = [
    { label: 'Pendientes', value: stats.pending, icon: Clock, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/30' },
    { label: 'Preparando', value: stats.preparing, icon: ClipboardList, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30' },
    { label: 'Listos', value: stats.ready, icon: CheckCircle2, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
    { label: 'Urgentes', value: stats.urgent, icon: AlertTriangle, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/30' },
  ];

  return (
    <Layout title="Pedidos y encargos">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {STAT_CARDS.map((s) => (
          <div key={s.label} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-4">
            <div className={`p-3 rounded-xl ${s.bg}`}><s.icon className={`w-5 h-5 ${s.color}`} /></div>
            <div><p className="text-sm text-gray-500 dark:text-gray-400">{s.label}</p><p className="text-xl font-bold text-gray-900 dark:text-white">{s.value}</p></div>
          </div>
        ))}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setTab('today')} className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${tab === 'today' ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
              Hoy
            </button>
            <button type="button" onClick={() => setTab('all')} className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${tab === 'all' ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
              Todos
            </button>
          </div>
          <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
            <div className="relative flex-1 sm:flex-initial sm:w-56">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input className="w-full pl-10 pr-4 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none text-sm" placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <select className="text-sm border-2 border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 outline-none" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as any)}>
              <option value="all">Estado</option>
              {(Object.keys(STATUS_CFG) as OrderStatus[]).map((k) => <option key={k} value={k}>{STATUS_CFG[k].label}</option>)}
            </select>
            <select className="text-sm border-2 border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 outline-none" value={filterType} onChange={(e) => setFilterType(e.target.value as any)}>
              <option value="all">Tipo</option>
              {(Object.keys(ORDER_TYPE_CFG) as OrderType[]).map((k) => <option key={k} value={k}>{ORDER_TYPE_CFG[k].label}</option>)}
            </select>
            <AddButtonDropdown
              label="Nuevo pedido"
              onQuickAdd={() => openCreate('simple')}
              quickAddLabel="Alta rápida"
              quickAddDesc="Formulario de pedido"
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 animate-pulse"><div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-3" /><div className="h-4 bg-gray-100 dark:bg-gray-700/50 rounded w-2/3" /></div>)}</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-12 text-center">
          <ClipboardList className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400 font-medium">{tab === 'today' ? 'No hay pedidos para hoy' : 'No hay pedidos'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((o) => {
            const typeCfg = ORDER_TYPE_CFG[o.orderType];
            const statusCfg = STATUS_CFG[o.status];
            return (
              <div key={o._id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${statusCfg.dot}`} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-gray-900 dark:text-white text-sm">{o.orderNumber}</span>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${typeCfg.color}`}>{typeCfg.label}</span>
                        {o.priority === 'urgent' && <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">URGENTE</span>}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-sm text-gray-600 dark:text-gray-400">
                        <span className="font-medium">{o.clientName || 'Anónimo'}</span>
                        {o.clientPhone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{o.clientPhone}</span>}
                      </div>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 truncate">
                        {o.items.map((it) => `${it.quantity}${it.unit} ${it.productName}`).join(', ')}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <div className="text-right">
                      {o.pickupTime && <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{o.pickupTime}</span>}
                      <span className="text-base font-bold text-gray-900 dark:text-white block">{o.total.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {statusCfg.next && (
                        <button type="button" onClick={() => handleStatusChange(o, statusCfg.next!)} className="px-3 py-1.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg text-xs font-semibold hover:opacity-90 transition">
                          {statusCfg.action}
                        </button>
                      )}
                      <button type="button" onClick={() => openEdit(o)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400"><Edit2 className="w-4 h-4" /></button>
                      <button type="button" onClick={() => handleDelete(o._id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                </div>
                {o.notes && <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 italic border-t border-gray-100 dark:border-gray-700/50 pt-2">{o.notes}</p>}
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">{editing ? 'Editar pedido' : `Nuevo ${ORDER_TYPE_CFG[form.orderType].label.toLowerCase()}`}</h2>
              <button type="button" onClick={() => setShowModal(false)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-5 space-y-4">
              {!editing && (
                <div className="flex gap-2">
                  {(Object.keys(ORDER_TYPE_CFG) as OrderType[]).map((t) => (
                    <button key={t} type="button" onClick={() => setForm((f) => ({ ...f, orderType: t }))}
                      className={`flex-1 px-3 py-2 rounded-lg text-sm font-semibold transition ${form.orderType === t ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'}`}>
                      {ORDER_TYPE_CFG[t].label}
                    </button>
                  ))}
                </div>
              )}

              <div className="relative">
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Cliente (opcional)</label>
                <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500"
                  placeholder="Buscar cliente por nombre o teléfono..."
                  value={form.clientName} onChange={(e) => searchClients(e.target.value)}
                  onFocus={() => clientSuggestions.length > 0 && setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 200)} />
                {showSuggestions && clientSuggestions.length > 0 && (
                  <div className="absolute z-30 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                    {clientSuggestions.map((c) => (
                      <button key={c._id} type="button" onClick={() => selectClient(c)} className="w-full text-left px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm">
                        <span className="font-medium text-gray-900 dark:text-white">{c.name}</span>
                        {c.phone && <span className="text-gray-500 ml-2">{c.phone}</span>}
                        {c.preferences.usualProducts.length > 0 && <span className="text-xs text-blue-500 ml-2">tiene habituales</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {form.clientPhone && (
                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <Phone className="w-4 h-4" />
                  <input className="flex-1 px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none text-sm"
                    value={form.clientPhone} onChange={(e) => setForm((f) => ({ ...f, clientPhone: e.target.value }))} placeholder="Teléfono" />
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Productos</label>
                  <button type="button" onClick={addItem} className="text-sm text-blue-600 hover:text-blue-700 font-medium">+ Añadir línea</button>
                </div>
                {form.items.map((it, i) => (
                  <div key={i} className="flex items-center gap-2 mb-2">
                    <input className="flex-1 px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none text-sm"
                      placeholder="Producto" value={it.productName} onChange={(e) => updateItem(i, 'productName', e.target.value)} />
                    <input type="number" step="0.1" className="w-16 px-2 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none text-sm text-center"
                      value={it.quantity} onChange={(e) => updateItem(i, 'quantity', Number(e.target.value))} />
                    <select className="w-14 px-1 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none text-xs"
                      value={it.unit} onChange={(e) => updateItem(i, 'unit', e.target.value)}>
                      <option value="kg">kg</option><option value="ud">ud</option><option value="piezas">pzas</option>
                    </select>
                    <input type="number" step="0.01" className="w-20 px-2 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none text-sm text-center"
                      placeholder="€/u" value={it.pricePerUnit || ''} onChange={(e) => updateItem(i, 'pricePerUnit', Number(e.target.value))} />
                    {form.items.length > 1 && <button type="button" onClick={() => removeItem(i)} className="p-1 text-gray-400 hover:text-red-500"><X className="w-4 h-4" /></button>}
                  </div>
                ))}
                <p className="text-right text-sm font-bold text-gray-900 dark:text-white mt-1">
                  Total: {calcTotal(form.items).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Fecha recogida</label>
                  <input type="date" className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none"
                    value={form.pickupDate} onChange={(e) => setForm((f) => ({ ...f, pickupDate: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Hora recogida</label>
                  <input type="time" className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none"
                    value={form.pickupTime} onChange={(e) => setForm((f) => ({ ...f, pickupTime: e.target.value }))} />
                </div>
              </div>

              {form.orderType === 'special' && (
                <div className="flex items-center gap-3">
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Prioridad:</label>
                  <button type="button" onClick={() => setForm((f) => ({ ...f, priority: f.priority === 'urgent' ? 'normal' : 'urgent' }))}
                    className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition ${form.priority === 'urgent' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'}`}>
                    {form.priority === 'urgent' ? 'Urgente' : 'Normal'}
                  </button>
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Notas</label>
                <textarea className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none resize-none" rows={2}
                  value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Instrucciones especiales..." />
              </div>
            </div>
            <div className="sticky bottom-0 bg-white dark:bg-gray-800 flex justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700 rounded-b-2xl">
              <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition">Cancelar</button>
              <button type="button" onClick={handleSave} className="px-6 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-semibold hover:opacity-90 transition">{editing ? 'Guardar' : 'Crear'}</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
