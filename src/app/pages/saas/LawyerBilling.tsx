import { useState, useMemo, useCallback, useEffect } from 'react';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import { useModalClose } from '../../hooks/useModalClose';
import {
  Search, Plus, X, Edit3, Filter, Receipt, DollarSign,
  Clock, CheckCircle2, AlertCircle, Send, TrendingUp,
  CreditCard, Timer, Loader2,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { toast } from 'sonner';
import { bulkCreateVerticalEntries, entryStr, entryNum } from '../../lib/bulkVerticalImport';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

type InvoiceStatus = 'borrador' | 'enviada' | 'cobrada' | 'impagada';

interface Invoice extends VerticalEntity {
  numero: string;
  cliente: string;
  caso: string;
  concepto: string;
  horas: number;
  tarifaHora: number;
  importe: number;
  estado: InvoiceStatus;
}

type InvoiceForm = Omit<Invoice, keyof VerticalEntity>;

const STATUS_CONFIG: Record<InvoiceStatus, { label: string; cls: string; icon: typeof Clock }> = {
  borrador: { label: 'Borrador', cls: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400', icon: Clock },
  enviada: { label: 'Enviada', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', icon: Send },
  cobrada: { label: 'Cobrada', cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', icon: CheckCircle2 },
  impagada: { label: 'Impagada', cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', icon: AlertCircle },
};

const emptyForm = (): InvoiceForm => ({
  numero: '', cliente: '', caso: '', concepto: '', horas: 0,
  tarifaHora: 120, importe: 0, estado: 'borrador',
});

export function LawyerBilling() {
  const { user } = useAuth();
  const api = useMemo(() => createVerticalApi<Invoice>('lawyer', 'billing'), []);
  const userId = user?.user_id || user?.id || '';

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<InvoiceStatus | ''>('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Invoice | null>(null);
  const [form, setForm] = useState<InvoiceForm>(emptyForm());
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
      setInvoices(list);
    } finally {
      setLoading(false);
    }
  }, [userId, api]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'client', label: 'Cliente' },
    { key: 'case', label: 'Caso' },
    { key: 'amount', label: 'Importe' },
    { key: 'date', label: 'Fecha' },
    { key: 'concept', label: 'Concepto' },
    { key: 'status', label: 'Estado' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'client', label: 'Cliente', example: '' },
    { key: 'case', label: 'Caso', example: '' },
    { key: 'amount', label: 'Importe', example: '' },
    { key: 'date', label: 'Fecha', example: '' },
    { key: 'concept', label: 'Concepto', example: '' },
    { key: 'status', label: 'Estado', example: '' },
  ];

  const persistEntries = async (entries: Record<string, unknown>[]) => {
    if (!userId) {
      toast.error('Sesión no válida');
      return;
    }
    const created = await bulkCreateVerticalEntries(userId, api, entries, (e) => {
    const numero = entryStr(e, 'numero');
    if (!numero) return null;
    return {
      numero,
      cliente: entryStr(e, 'cliente', 'client') || '',
      caso: entryStr(e, 'caso') || '',
      concepto: entryStr(e, 'concepto') || '',
      horas: entryNum(e, 'horas'),
      tarifaHora: entryNum(e, 'tarifaHora'),
      importe: entryNum(e, 'importe'),
      estado: entryStr(e, 'estado', 'status') || 'borrador',
    };
    });
    if (created > 0) {
      await loadData();
      toast.success(`${created} factura creado(s)`);
    } else {
      toast.error('No se pudo crear ningún registro');
    }
  };

  const handleAIEntries = persistEntries;
  const handleImportEntries = async (entries: Record<string, string>[]) => persistEntries(entries);

  useModalClose(modalOpen, () => setModalOpen(false));

  const filtered = useMemo(() => invoices.filter(i => {
    const q = search.toLowerCase();
    const matchSearch = i.numero.toLowerCase().includes(q) || i.cliente.toLowerCase().includes(q) || i.caso.toLowerCase().includes(q) || i.concepto.toLowerCase().includes(q);
    const matchStatus = !filterStatus || i.estado === filterStatus;
    return matchSearch && matchStatus;
  }), [invoices, search, filterStatus]);

  const stats = useMemo(() => ({
    facturadoMes: invoices.filter(i => i.estado === 'cobrada').reduce((s, i) => s + i.importe, 0),
    pendienteCobro: invoices.filter(i => i.estado === 'enviada' || i.estado === 'impagada').reduce((s, i) => s + i.importe, 0),
    horasFacturables: invoices.reduce((s, i) => s + i.horas, 0),
    totalFacturado: invoices.reduce((s, i) => s + i.importe, 0),
  }), [invoices]);

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setModalOpen(true); };
  const openEdit = (i: Invoice) => {
    setEditing(i);
    setForm({
      numero: i.numero, cliente: i.cliente, caso: i.caso, concepto: i.concepto,
      horas: i.horas, tarifaHora: i.tarifaHora, importe: i.importe, estado: i.estado,
    });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.numero.trim() || !userId) return;
    const computed = { ...form, importe: form.horas * form.tarifaHora };
    try {
      if (editing) {
        await api.update(userId, editing._id, computed);
      } else {
        await api.create(userId, computed);
      }
      await loadData();
      setModalOpen(false);
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
  const fmt = (n: number) => n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const inputClass = 'w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 dark:focus:border-gray-400 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100';
  const labelClass = 'block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5';

  return (
    <Layout title="Minutas / Honorarios">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Facturado cobrado', value: fmt(stats.facturadoMes), icon: DollarSign, color: 'text-green-600' },
          { label: 'Pendiente de cobro', value: fmt(stats.pendienteCobro), icon: CreditCard, color: 'text-red-600' },
          { label: 'Horas facturables', value: `${stats.horasFacturables}h`, icon: Timer, color: 'text-blue-600' },
          { label: 'Total facturado', value: fmt(stats.totalFacturado), icon: TrendingUp, color: 'text-purple-600' },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3 mb-2">
              <s.icon className={`w-5 h-5 ${s.color}`} />
              <span className="text-sm text-gray-500 dark:text-gray-400">{s.label}</span>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input type="text" placeholder="Buscar minuta, cliente, caso..." value={search} onChange={e => setSearch(e.target.value)} disabled={loading} className="w-full pl-10 pr-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none focus:border-gray-900 dark:focus:border-gray-400" />
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as InvoiceStatus | '')} disabled={loading} className="pl-9 pr-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none appearance-none cursor-pointer">
              <option value="">Todos los estados</option>
              {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
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

      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-x-auto">
        <table className="w-full text-sm min-w-[1100px]">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 text-left">
              {['Nº Minuta', 'Cliente', 'Caso', 'Concepto', 'Horas', 'Tarifa/h', 'Importe', 'Estado', ''].map(h => (
                <th key={h} className="px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap">{h}</th>
              ))}
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
            ) : filtered.map(i => {
              const cfg = STATUS_CONFIG[i.estado];
              const Icon = cfg.icon;
              return (
                <tr key={i._id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2"><Receipt className="w-4 h-4 text-gray-400 shrink-0" />{i.numero}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{i.cliente}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300 font-mono text-xs">{i.caso}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300 max-w-[200px] truncate">{i.concepto}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300 text-center">{i.horas}h</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">{fmt(i.tarifaHora)}</td>
                  <td className="px-4 py-3 font-bold text-gray-900 dark:text-gray-100 whitespace-nowrap">{fmt(i.importe)}</td>
                  <td className="px-4 py-3"><span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold ${cfg.cls}`}><Icon className="w-3.5 h-3.5" />{cfg.label}</span></td>
                  <td className="px-4 py-3 flex gap-1">
                    <button onClick={() => openEdit(i)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"><Edit3 className="w-4 h-4 text-gray-500" /></button>
                    <button onClick={() => void handleDelete(i._id)} className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"><X className="w-4 h-4 text-red-400" /></button>
                  </td>
                </tr>
              );
            })}
            {!loading && filtered.length === 0 && <tr><td colSpan={9} className="px-4 py-12 text-center text-gray-400">No se encontraron minutas</td></tr>}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setModalOpen(false)}>
          <form onSubmit={handleSave} className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2"><Receipt className="w-5 h-5" />{editing ? 'Editar minuta' : 'Nueva minuta'}</h2>
              <button type="button" onClick={() => setModalOpen(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className={labelClass}>Nº Minuta</label><input className={inputClass} value={form.numero} onChange={e => setForm({ ...form, numero: e.target.value })} required /></div>
              <div><label className={labelClass}>Cliente</label><input className={inputClass} value={form.cliente} onChange={e => setForm({ ...form, cliente: e.target.value })} required /></div>
              <div><label className={labelClass}>Caso / Expediente</label><input className={inputClass} value={form.caso} onChange={e => setForm({ ...form, caso: e.target.value })} /></div>
              <div className="sm:col-span-2"><label className={labelClass}>Concepto</label><input className={inputClass} value={form.concepto} onChange={e => setForm({ ...form, concepto: e.target.value })} /></div>
              <div><label className={labelClass}>Horas</label><input type="number" min={0} step={0.5} className={inputClass} value={form.horas} onChange={e => setForm({ ...form, horas: Number(e.target.value) })} /></div>
              <div><label className={labelClass}>Tarifa/hora (€)</label><input type="number" min={0} className={inputClass} value={form.tarifaHora} onChange={e => setForm({ ...form, tarifaHora: Number(e.target.value) })} /></div>
              <div><label className={labelClass}>Importe calculado</label><p className="px-3 py-2.5 text-lg font-bold text-gray-900 dark:text-gray-100">{fmt(form.horas * form.tarifaHora)}</p></div>
              <div>
                <label className={labelClass}>Estado</label>
                <select className={inputClass} value={form.estado} onChange={e => setForm({ ...form, estado: e.target.value as InvoiceStatus })}>
                  {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
            </div>
            <div className="sticky bottom-0 bg-white dark:bg-gray-800 flex gap-3 p-6 border-t border-gray-200 dark:border-gray-700 rounded-b-2xl">
              <button type="button" onClick={() => setModalOpen(false)} className="flex-1 px-4 py-3 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">Cancelar</button>
              <button type="submit" className="flex-1 px-4 py-3 bg-gray-900 hover:bg-black dark:bg-gray-100 dark:hover:bg-white text-white dark:text-gray-900 rounded-xl font-semibold transition-colors">Guardar</button>
            </div>
          </form>
        </div>
      )}
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="lawyer_billing"
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
