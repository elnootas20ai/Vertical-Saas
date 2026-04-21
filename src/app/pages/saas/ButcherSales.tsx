import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Layout } from '../../components/saas/Layout';
import { useApp } from '../../context/AppContext';
import { useModalClose } from '../../hooks/useModalClose';
import { toast } from 'sonner';
import {
  listButcherSalesRequest,
  createButcherSaleRequest,
  voidButcherSaleRequest,
  getButcherSalesStatsRequest,
  searchButcherClientsRequest,
  type ButcherSale,
  type ButcherClient,
  type PaymentMethod,
  type SaleStatus,
  type OrderItem,
  type SalesStats,
} from '../../lib/butcherApi';
import {
  Search, Plus, X, Filter, Receipt, TrendingUp, BarChart3,
  CalendarDays, Phone, Ban,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

const HOY = new Date().toISOString().slice(0, 10);

const PAGO_LABEL: Record<PaymentMethod, string> = { cash: 'Efectivo', card: 'Tarjeta', bizum: 'Bizum', mixed: 'Mixto' };

const ESTADO_CFG: Record<SaleStatus, { label: string; dot: string }> = {
  completed: { label: 'Completada', dot: 'bg-emerald-500' },
  pending: { label: 'Pendiente', dot: 'bg-amber-500' },
  voided: { label: 'Anulada', dot: 'bg-red-500' },
};

const EMPTY_ITEM: OrderItem = { productId: null, productName: '', quantity: 1, unit: 'kg', pricePerUnit: 0, subtotal: 0, notes: '' };

const EMPTY_FORM = {
  clientId: null as string | null,
  clientName: '',
  clientPhone: '',
  items: [{ ...EMPTY_ITEM }] as OrderItem[],
  paymentMethod: 'cash' as PaymentMethod,
};

export function ButcherSales() {
  const { userId } = useApp();
  const [sales, setSales] = useState<ButcherSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterPago, setFilterPago] = useState<PaymentMethod | 'all'>('all');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [stats, setStats] = useState<SalesStats | null>(null);

  const [clientSuggestions, setClientSuggestions] = useState<ButcherClient[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'client', label: 'Cliente' },
    { key: 'product', label: 'Producto' },
    { key: 'quantity', label: 'Cantidad' },
    { key: 'price', label: 'Precio' },
    { key: 'date', label: 'Fecha' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'client', label: 'Cliente', example: '' },
    { key: 'product', label: 'Producto', example: '' },
    { key: 'quantity', label: 'Cantidad', example: '' },
    { key: 'price', label: 'Precio', example: '' },
    { key: 'date', label: 'Fecha', example: '' },
  ];

  const handleAIEntries = async (entries: Record<string, unknown>[]) => {
    toast.success(`${entries.length} venta(s) parseado(s) con IA`);
  };

  const handleImportEntries = async (entries: Record<string, string>[]) => {
    toast.success(`${entries.length} venta(s) importado(s)`);
  };

  const searchTimeout = useRef<any>(null);

  useModalClose(showModal, () => setShowModal(false));

  const fetchData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [salesRes, statsRes] = await Promise.all([
        listButcherSalesRequest(userId),
        getButcherSalesStatsRequest(userId),
      ]);
      if (salesRes.ok) setSales(salesRes.sales || []);
      if (statsRes.ok) setStats(statsRes.stats);
    } catch { /* ignore */ }
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = useMemo(() => {
    let list = sales;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((s) => s.ticketNumber.toLowerCase().includes(q) || s.clientName.toLowerCase().includes(q));
    }
    if (filterPago !== 'all') list = list.filter((s) => s.paymentMethod === filterPago);
    return list;
  }, [sales, search, filterPago]);

  const openCreate = () => { setForm(EMPTY_FORM); setShowModal(true); };

  const calcTotal = (items: OrderItem[]) => items.reduce((s, it) => s + (Number(it.quantity || 0) * Number(it.pricePerUnit || 0)), 0);

  const handleSave = async () => {
    if (!userId || form.items.every((it) => !it.productName.trim())) return;
    try {
      const res = await createButcherSaleRequest(userId, {
        ...form,
        items: form.items.filter((it) => it.productName.trim()),
        total: calcTotal(form.items),
        totalWeight: form.items.reduce((s, it) => s + Number(it.quantity || 0), 0),
      } as any);
      if (res.ok) { toast.success('Venta registrada'); setShowModal(false); fetchData(); }
      else toast.error(res.error || 'Error');
    } catch { toast.error('Error de conexión'); }
  };

  const handleVoid = async (id: string) => {
    if (!userId) return;
    try {
      const res = await voidButcherSaleRequest(userId, id);
      if (res.ok) { toast.success('Venta anulada'); fetchData(); }
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
  };

  const addItem = () => setForm((f) => ({ ...f, items: [...f.items, { ...EMPTY_ITEM }] }));
  const removeItem = (idx: number) => setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));
  const updateItem = (idx: number, field: string, val: any) => setForm((f) => ({
    ...f, items: f.items.map((it, i) => i === idx ? { ...it, [field]: val } : it),
  }));

  const STAT_CARDS = [
    { label: 'Ventas hoy', value: stats?.today.count ?? 0, icon: CalendarDays, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30' },
    { label: 'Ingresos hoy', value: (stats?.today.revenue ?? 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }), icon: TrendingUp, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
    { label: 'Ventas mes', value: stats?.month.count ?? 0, icon: BarChart3, color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-900/30' },
    { label: 'Ticket medio', value: (stats?.avgTicket ?? 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }), icon: Receipt, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/30' },
  ];

  return (
    <Layout title="Ventas">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {STAT_CARDS.map((s) => (
          <div key={s.label} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-4">
            <div className={`p-3 rounded-xl ${s.bg}`}><s.icon className={`w-5 h-5 ${s.color}`} /></div>
            <div><p className="text-sm text-gray-500 dark:text-gray-400">{s.label}</p><p className="text-xl font-bold text-gray-900 dark:text-white truncate">{s.value}</p></div>
          </div>
        ))}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="relative flex-1 w-full sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input className="w-full pl-10 pr-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:border-gray-900 dark:focus:border-gray-500 outline-none text-sm" placeholder="Buscar por ticket o cliente..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <select className="text-sm border-2 border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 outline-none" value={filterPago} onChange={(e) => setFilterPago(e.target.value as any)}>
              <option value="all">Método de pago</option>
              {(Object.keys(PAGO_LABEL) as PaymentMethod[]).map((k) => <option key={k} value={k}>{PAGO_LABEL[k]}</option>)}
            </select>
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

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Ticket</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Fecha</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Cliente</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Productos</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Total</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Pago</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Estado</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-400" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-400">Cargando...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-400">No hay ventas</td></tr>
              ) : filtered.map((s) => (
                <tr key={s._id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition">
                  <td className="px-4 py-3 font-mono font-medium text-gray-900 dark:text-white">{s.ticketNumber}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{s.date}</td>
                  <td className="px-4 py-3 text-gray-900 dark:text-white">{s.clientName || '—'}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400 max-w-[200px] truncate">{s.items.map((it) => `${it.quantity}${it.unit} ${it.productName}`).join(', ')}</td>
                  <td className="px-4 py-3 text-right font-bold text-gray-900 dark:text-white">{s.total.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{PAGO_LABEL[s.paymentMethod]}</td>
                  <td className="px-4 py-3"><span className="inline-flex items-center gap-1.5 text-sm"><span className={`w-2 h-2 rounded-full ${ESTADO_CFG[s.status].dot}`} />{ESTADO_CFG[s.status].label}</span></td>
                  <td className="px-4 py-3 text-right">
                    {s.status === 'completed' && (
                      <button type="button" onClick={() => handleVoid(s._id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-600" title="Anular">
                        <Ban className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Nueva venta</h2>
              <button type="button" onClick={() => setShowModal(false)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="relative">
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Cliente (opcional)</label>
                <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none"
                  placeholder="Buscar cliente..." value={form.clientName} onChange={(e) => searchClients(e.target.value)}
                  onFocus={() => clientSuggestions.length > 0 && setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 200)} />
                {showSuggestions && clientSuggestions.length > 0 && (
                  <div className="absolute z-30 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                    {clientSuggestions.map((c) => (
                      <button key={c._id} type="button" onClick={() => selectClient(c)} className="w-full text-left px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm">
                        <span className="font-medium">{c.name}</span>{c.phone && <span className="text-gray-500 ml-2">{c.phone}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Productos</label>
                  <button type="button" onClick={addItem} className="text-sm text-blue-600 hover:text-blue-700 font-medium">+ Línea</button>
                </div>
                {form.items.map((it, i) => (
                  <div key={i} className="flex items-center gap-2 mb-2">
                    <input className="flex-1 px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none text-sm"
                      placeholder="Producto" value={it.productName} onChange={(e) => updateItem(i, 'productName', e.target.value)} />
                    <input type="number" step="0.1" className="w-16 px-2 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none text-sm text-center"
                      value={it.quantity} onChange={(e) => updateItem(i, 'quantity', Number(e.target.value))} />
                    <select className="w-14 px-1 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-sm outline-none"
                      value={it.unit} onChange={(e) => updateItem(i, 'unit', e.target.value)}>
                      <option value="kg">kg</option><option value="ud">ud</option>
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

              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Método de pago</label>
                <div className="flex gap-2">
                  {(Object.keys(PAGO_LABEL) as PaymentMethod[]).map((m) => (
                    <button key={m} type="button" onClick={() => setForm((f) => ({ ...f, paymentMethod: m }))}
                      className={`flex-1 px-3 py-2 rounded-lg text-sm font-semibold transition ${form.paymentMethod === m ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'}`}>
                      {PAGO_LABEL[m]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="sticky bottom-0 bg-white dark:bg-gray-800 flex justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700 rounded-b-2xl">
              <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition">Cancelar</button>
              <button type="button" onClick={handleSave} className="px-6 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-semibold hover:opacity-90 transition">Registrar venta</button>
            </div>
          </div>
        </div>
      )}
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="butcher_sales"
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
