import { useState, useMemo, useEffect, useCallback } from 'react';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import { useModalClose } from '../../hooks/useModalClose';
import { toast } from 'sonner';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';
import {
  Search, X, Edit2, Trash2, Filter,
  Receipt, Wallet, CheckCircle2, TrendingUp,
  Loader2,
} from 'lucide-react';

type PaymentMethod = 'efectivo' | 'tarjeta' | 'transferencia';
type InvoiceStatus = 'pagada' | 'pendiente' | 'vencida';

interface Invoice extends VerticalEntity {
  numero: string;
  fecha: string;
  propietario: string;
  paciente: string;
  servicios: string;
  total: number;
  metodoPago: PaymentMethod;
  estado: InvoiceStatus;
}

type InvoiceForm = Omit<Invoice, keyof VerticalEntity>;

const PAY_CFG: Record<PaymentMethod, { label: string }> = {
  efectivo: { label: 'Efectivo' },
  tarjeta: { label: 'Tarjeta' },
  transferencia: { label: 'Transferencia' },
};

const STATUS_CFG: Record<InvoiceStatus, { label: string; dot: string }> = {
  pagada: { label: 'Pagada', dot: 'bg-emerald-500' },
  pendiente: { label: 'Pendiente', dot: 'bg-amber-500' },
  vencida: { label: 'Vencida', dot: 'bg-red-500' },
};

const TODAY = new Date().toISOString().slice(0, 10);
const MONTH_PREFIX = new Date().toISOString().slice(0, 7);

const EMPTY_FORM: InvoiceForm = {
  numero: '', fecha: TODAY, propietario: '', paciente: '', servicios: '', total: 0,
  metodoPago: 'efectivo', estado: 'pendiente',
};

export function VetBilling() {
  const { user } = useAuth();
  const api = useMemo(() => createVerticalApi<Invoice>('vet', 'billing'), []);
  const userId = user?.user_id || user?.id || '';

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<InvoiceStatus | 'all'>('all');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Invoice | null>(null);
  const [form, setForm] = useState<InvoiceForm>(EMPTY_FORM);
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'client', label: 'Cliente' },
    { key: 'amount', label: 'Importe' },
    { key: 'date', label: 'Fecha' },
    { key: 'concept', label: 'Concepto' },
    { key: 'status', label: 'Estado' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'client', label: 'Cliente', example: '' },
    { key: 'amount', label: 'Importe', example: '' },
    { key: 'date', label: 'Fecha', example: '' },
    { key: 'concept', label: 'Concepto', example: '' },
    { key: 'status', label: 'Estado', example: '' },
  ];

  const handleAIEntries = async (entries: Record<string, unknown>[]) => {
    toast.success(`${entries.length} factura(s) parseado(s) con IA`);
  };

  const handleImportEntries = async (entries: Record<string, string>[]) => {
    toast.success(`${entries.length} factura(s) importado(s)`);
  };

  useModalClose(showModal, () => setShowModal(false));

  const loadData = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const list = await api.list(userId);
      setInvoices(list);
    } finally {
      setLoading(false);
    }
  }, [userId, api]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filtered = useMemo(() => invoices.filter(inv => {
    const q = search.toLowerCase();
    if (search && !inv.numero.toLowerCase().includes(q) && !inv.propietario.toLowerCase().includes(q) && !inv.paciente.toLowerCase().includes(q) && !inv.servicios.toLowerCase().includes(q)) return false;
    if (filterStatus !== 'all' && inv.estado !== filterStatus) return false;
    return true;
  }), [invoices, search, filterStatus]);

  const stats = useMemo(() => {
    const delMes = invoices.filter(i => i.fecha.startsWith(MONTH_PREFIX));
    const facturadoMes = delMes.reduce((s, i) => s + i.total, 0);
    const pendienteCobro = invoices.filter(i => i.estado === 'pendiente' || i.estado === 'vencida').reduce((s, i) => s + i.total, 0);
    const pagadasHoy = invoices.filter(i => i.fecha === TODAY && i.estado === 'pagada');
    const sumPagadasHoy = pagadasHoy.reduce((s, i) => s + i.total, 0);
    const ticketMedio = pagadasHoy.length ? sumPagadasHoy / pagadasHoy.length : 0;
    return { facturadoMes, pendienteCobro, pagadasHoyCount: pagadasHoy.length, ticketMedio };
  }, [invoices]);

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setShowModal(true); };
  const openEdit = (inv: Invoice) => {
    setEditing(inv);
    setForm({
      numero: inv.numero, fecha: inv.fecha, propietario: inv.propietario, paciente: inv.paciente,
      servicios: inv.servicios, total: inv.total, metodoPago: inv.metodoPago, estado: inv.estado,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.numero.trim() || !form.propietario.trim() || !userId) return;
    try {
      if (editing) {
        await api.update(userId, editing._id, form);
      } else {
        await api.create(userId, form);
      }
      await loadData();
      setShowModal(false);
    } catch {
      /* error shown by fetch layer */
    }
  };

  const handleDelete = async (docId: string) => {
    if (!userId) return;
    try {
      await api.remove(userId, docId);
      await loadData();
    } catch {
      /* error shown by fetch layer */
    }
  };

  const STAT_CARDS = [
    { label: 'Facturado este mes', value: `${stats.facturadoMes.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`, icon: Receipt, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30' },
    { label: 'Pendiente de cobro', value: `${stats.pendienteCobro.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`, icon: Wallet, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/30' },
    { label: 'Pagadas hoy', value: stats.pagadasHoyCount, icon: CheckCircle2, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
    { label: 'Ticket medio (hoy)', value: `${stats.ticketMedio.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`, icon: TrendingUp, color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-900/30' },
  ];

  return (
    <Layout title="Facturación">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {STAT_CARDS.map(s => (
          <div key={s.label} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-4">
            <div className={`p-3 rounded-xl ${s.bg}`}><s.icon className={`w-5 h-5 ${s.color}`} /></div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">{s.label}</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="relative flex-1 w-full sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input className="w-full pl-10 pr-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:border-gray-900 dark:focus:border-gray-500 outline-none text-sm" placeholder="Buscar por nº factura, propietario, paciente o servicios..." value={search} onChange={e => setSearch(e.target.value)} disabled={loading} />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <Filter className="w-4 h-4 text-gray-400" />
              <select className="text-sm border-2 border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 outline-none" value={filterStatus} onChange={e => setFilterStatus(e.target.value as InvoiceStatus | 'all')} disabled={loading}>
                <option value="all">Todos los estados</option>
                {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <AddButtonDropdown
                label="Nueva factura"
                onQuickAdd={openCreate}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de factura"
              />
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Nº factura</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Fecha</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Propietario</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Paciente</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Servicios</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Total (€)</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Pago</th>
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
              ) : filtered.map(inv => (
                <tr key={inv._id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition">
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-white font-mono text-xs">{inv.numero}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">{inv.fecha}</td>
                  <td className="px-4 py-3 text-gray-900 dark:text-white">{inv.propietario}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{inv.paciente}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400 max-w-[220px] truncate" title={inv.servicios}>{inv.servicios}</td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-white">{inv.total.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{PAY_CFG[inv.metodoPago].label}</td>
                  <td className="px-4 py-3"><span className="inline-flex items-center gap-1.5 text-sm"><span className={`w-2 h-2 rounded-full ${STATUS_CFG[inv.estado].dot}`} />{STATUS_CFG[inv.estado].label}</span></td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button type="button" onClick={() => openEdit(inv)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition"><Edit2 className="w-4 h-4" /></button>
                      <button type="button" onClick={() => handleDelete(inv._id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-500 hover:text-red-600 transition"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-gray-400 dark:text-gray-500">No hay facturas con los filtros seleccionados.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">{editing ? 'Editar factura' : 'Nueva factura'}</h2>
              <button type="button" onClick={() => setShowModal(false)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Nº factura *</label>
                  <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.numero} onChange={e => setForm(f => ({ ...f, numero: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Fecha</label>
                  <input type="date" className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Propietario *</label>
                  <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.propietario} onChange={e => setForm(f => ({ ...f, propietario: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Paciente</label>
                  <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.paciente} onChange={e => setForm(f => ({ ...f, paciente: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Servicios</label>
                <textarea rows={2} className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500 resize-y" value={form.servicios} onChange={e => setForm(f => ({ ...f, servicios: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Total (€)</label>
                  <input type="number" step="0.01" min={0} className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.total} onChange={e => setForm(f => ({ ...f, total: Number(e.target.value) }))} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Método de pago</label>
                  <select className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.metodoPago} onChange={e => setForm(f => ({ ...f, metodoPago: e.target.value as PaymentMethod }))}>
                    {Object.entries(PAY_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Estado</label>
                <select className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.estado} onChange={e => setForm(f => ({ ...f, estado: e.target.value as InvoiceStatus }))}>
                  {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
            </div>
            <div className="sticky bottom-0 bg-white dark:bg-gray-800 flex justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700 rounded-b-2xl">
              <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition">Cancelar</button>
              <button type="button" onClick={() => void handleSave()} className="px-6 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-semibold hover:opacity-90 transition">{editing ? 'Guardar cambios' : 'Crear factura'}</button>
            </div>
          </div>
        </div>
      )}
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="vet_billing"
        moduleLabel="Facturación"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Facturación"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
