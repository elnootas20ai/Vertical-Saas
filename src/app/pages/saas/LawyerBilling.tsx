import { useState, useMemo, useCallback, useEffect } from 'react';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import { useModalClose } from '../../hooks/useModalClose';
import {
  Search, X, Edit3, Filter, Receipt, DollarSign,
  Clock, CheckCircle2, AlertCircle, Send, TrendingUp,
  CreditCard, Timer, Loader2, Scale, Briefcase, Banknote,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { toast } from 'sonner';
import { bulkCreateVerticalEntries, entryStr, entryNum } from '../../lib/bulkVerticalImport';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';
import {
  buildLawyerDemoBundle,
  isLawyerDemoId,
  isLawyerDemoViewer,
  type LawyerDemoTimeEntry,
} from '../../lib/lawyerOpsDemo';
import { VERTIAL_BTN_PRIMARY, VERTIAL_BTN_SECONDARY } from '../../lib/vertialUiTokens';

type InvoiceStatus = 'borrador' | 'enviada' | 'cobrada' | 'impagada';
type Modalidad = 'horas' | 'iguala' | 'exito' | '';

interface Invoice extends VerticalEntity {
  numero: string;
  cliente: string;
  caso: string;
  concepto: string;
  horas: number;
  tarifaHora: number;
  importe: number;
  estado: InvoiceStatus;
  modalidad?: string;
  fecha?: string;
}

type InvoiceForm = Omit<Invoice, keyof VerticalEntity>;

const STATUS_CONFIG: Record<InvoiceStatus, { label: string; cls: string; icon: typeof Clock }> = {
  borrador: { label: 'Borrador', cls: 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300', icon: Clock },
  enviada: { label: 'Enviada', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', icon: Send },
  cobrada: { label: 'Cobrada', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', icon: CheckCircle2 },
  impagada: { label: 'Impagada', cls: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400', icon: AlertCircle },
};

const MODALIDAD_LABEL: Record<string, string> = {
  horas: 'Por horas',
  iguala: 'Iguala',
  exito: 'Por éxito',
};

const emptyForm = (): InvoiceForm => ({
  numero: '', cliente: '', caso: '', concepto: '', horas: 0,
  tarifaHora: 120, importe: 0, estado: 'borrador', modalidad: 'horas', fecha: '',
});

function fmt(n: number) {
  return n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
}

function fmtHours(h: number) {
  return `${h.toLocaleString('es-ES', { maximumFractionDigits: 1 })}h`;
}

export function LawyerBilling() {
  const { user } = useAuth();
  const api = useMemo(() => createVerticalApi<Invoice>('lawyer', 'billing'), []);
  const userId = user?.user_id || user?.id || '';
  const demoMode = isLawyerDemoViewer(user?.email);

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [timeEntries, setTimeEntries] = useState<LawyerDemoTimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<InvoiceStatus | ''>('');
  const [filterModalidad, setFilterModalidad] = useState<Modalidad>('');
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
      if (demoMode) {
        const demo = buildLawyerDemoBundle(userId);
        const byId = new Map<string, Invoice>();
        for (const inv of demo.invoices as Invoice[]) byId.set(inv._id, inv);
        for (const inv of list) {
          if (!isLawyerDemoId(inv._id)) byId.set(inv._id, inv);
        }
        setInvoices([...byId.values()]);
        setTimeEntries(demo.timeEntries);
      } else {
        setInvoices(list);
        setTimeEntries([]);
      }
    } finally {
      setLoading(false);
    }
  }, [userId, demoMode, api]);

  useEffect(() => {
    void loadData();
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
      toast.success(`${created} factura(s) creada(s)`);
    } else {
      toast.error('No se pudo crear ningún registro');
    }
  };

  const handleAIEntries = persistEntries;
  const handleImportEntries = async (entries: Record<string, string>[]) => persistEntries(entries);

  useModalClose(modalOpen, () => setModalOpen(false));

  const filtered = useMemo(() => invoices.filter((i) => {
    const q = search.toLowerCase();
    const matchSearch =
      i.numero.toLowerCase().includes(q) ||
      i.cliente.toLowerCase().includes(q) ||
      i.caso.toLowerCase().includes(q) ||
      i.concepto.toLowerCase().includes(q);
    const matchStatus = !filterStatus || i.estado === filterStatus;
    const matchMod = !filterModalidad || (i.modalidad || 'horas') === filterModalidad;
    return matchSearch && matchStatus && matchMod;
  }), [invoices, search, filterStatus, filterModalidad]);

  const stats = useMemo(() => {
    const cobrado = invoices.filter((i) => i.estado === 'cobrada').reduce((s, i) => s + (i.importe || 0), 0);
    const pendiente = invoices.filter((i) => i.estado === 'enviada' || i.estado === 'impagada').reduce((s, i) => s + (i.importe || 0), 0);
    const horas = invoices.reduce((s, i) => s + (i.horas || 0), 0);
    const total = invoices.reduce((s, i) => s + (i.importe || 0), 0);
    const igualas = invoices.filter((i) => i.modalidad === 'iguala').reduce((s, i) => s + (i.importe || 0), 0);
    const exito = invoices.filter((i) => i.modalidad === 'exito').reduce((s, i) => s + (i.importe || 0), 0);
    const impagadas = invoices.filter((i) => i.estado === 'impagada').length;
    const borradores = invoices.filter((i) => i.estado === 'borrador').length;
    return { cobrado, pendiente, horas, total, igualas, exito, impagadas, borradores };
  }, [invoices]);

  const byExpediente = useMemo(() => {
    const map = new Map<string, { caso: string; cliente: string; total: number; horas: number; n: number }>();
    for (const i of invoices) {
      const key = i.caso || i.cliente || i._id;
      const prev = map.get(key) || { caso: i.caso, cliente: i.cliente, total: 0, horas: 0, n: 0 };
      prev.total += i.importe || 0;
      prev.horas += i.horas || 0;
      prev.n += 1;
      map.set(key, prev);
    }
    return [...map.values()].sort((a, b) => b.total - a.total).slice(0, 6);
  }, [invoices]);

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setModalOpen(true); };
  const openEdit = (i: Invoice) => {
    setEditing(i);
    setForm({
      numero: i.numero, cliente: i.cliente, caso: i.caso, concepto: i.concepto,
      horas: i.horas, tarifaHora: i.tarifaHora, importe: i.importe, estado: i.estado,
      modalidad: i.modalidad || 'horas', fecha: i.fecha || '',
    });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.numero.trim() || !userId) return;
    const computed = { ...form, importe: form.horas * form.tarifaHora };
    try {
      if (editing && isLawyerDemoId(editing._id)) {
        setInvoices((prev) =>
          prev.map((inv) =>
            inv._id === editing._id
              ? { ...inv, ...computed, updatedAt: new Date().toISOString() }
              : inv,
          ),
        );
        setModalOpen(false);
        return;
      }
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
    if (isLawyerDemoId(docId)) {
      setInvoices((prev) => prev.filter((inv) => inv._id !== docId));
      return;
    }
    try {
      await api.remove(userId, docId);
      await loadData();
    } catch {
      /* error shown by fetch layer */
    }
  };

  const inputClass = 'w-full px-3 py-2.5 border border-stone-200 dark:border-stone-700 rounded-xl focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100';
  const labelClass = 'block text-sm font-semibold text-stone-700 dark:text-stone-300 mb-1.5';

  return (
    <Layout title="Facturación" subtitle="Honorarios por expediente · horas, igualas y éxito">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        {[
          { label: 'Facturado cobrado', value: fmt(stats.cobrado), icon: DollarSign, color: 'text-emerald-600' },
          { label: 'Pendiente de cobro', value: fmt(stats.pendiente), icon: CreditCard, color: 'text-rose-600' },
          { label: 'Horas facturables', value: fmtHours(stats.horas), icon: Timer, color: 'text-blue-600' },
          { label: 'Total facturado', value: fmt(stats.total), icon: TrendingUp, color: 'text-cyan-600' },
        ].map((s) => (
          <div key={s.label} className="bg-white dark:bg-stone-900 rounded-2xl p-5 border border-stone-200 dark:border-stone-800">
            <div className="flex items-center gap-3 mb-2">
              <s.icon className={`w-5 h-5 ${s.color}`} />
              <span className="text-sm text-stone-500 dark:text-stone-400">{s.label}</span>
            </div>
            <p className="text-2xl font-bold text-stone-900 dark:text-stone-100">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Igualas (cuota fija)', value: fmt(stats.igualas), icon: Banknote, color: 'text-violet-600' },
          { label: 'Por éxito', value: fmt(stats.exito), icon: Scale, color: 'text-amber-600' },
          { label: 'Impagadas', value: String(stats.impagadas), icon: AlertCircle, color: 'text-rose-600' },
          { label: 'Borradores', value: String(stats.borradores), icon: Clock, color: 'text-stone-500' },
        ].map((s) => (
          <div key={s.label} className="bg-white dark:bg-stone-900 rounded-2xl p-4 border border-stone-200 dark:border-stone-800">
            <div className="flex items-center gap-2 mb-1">
              <s.icon className={`w-4 h-4 ${s.color}`} />
              <span className="text-xs text-stone-500">{s.label}</span>
            </div>
            <p className="text-xl font-bold text-stone-900 dark:text-stone-100">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
          <input
            type="text"
            placeholder="Buscar minuta, cliente, caso..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            disabled={loading}
            className="w-full pl-10 pr-4 py-2.5 border border-stone-200 dark:border-stone-700 rounded-xl bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as InvoiceStatus | '')}
              disabled={loading}
              className="pl-9 pr-4 py-2.5 border border-stone-200 dark:border-stone-700 rounded-xl bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 outline-none appearance-none cursor-pointer"
            >
              <option value="">Todos los estados</option>
              {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <select
            value={filterModalidad}
            onChange={(e) => setFilterModalidad(e.target.value as Modalidad)}
            disabled={loading}
            className="px-4 py-2.5 border border-stone-200 dark:border-stone-700 rounded-xl bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 outline-none appearance-none cursor-pointer"
          >
            <option value="">Todas las modalidades</option>
            <option value="horas">Por horas</option>
            <option value="iguala">Iguala</option>
            <option value="exito">Por éxito</option>
          </select>
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

      <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 overflow-x-auto mb-6">
        <table className="w-full text-sm min-w-[1100px]">
          <thead>
            <tr className="border-b border-stone-200 dark:border-stone-800 text-left">
              {['Nº Minuta', 'Cliente', 'Caso', 'Concepto', 'Modalidad', 'Horas', 'Tarifa/h', 'Importe', 'Estado', ''].map((h) => (
                <th key={h || 'a'} className="px-4 py-3 font-semibold text-stone-500 dark:text-stone-400 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={10} className="px-4 py-12 text-center text-stone-500">
                  <span className="inline-flex items-center justify-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Cargando…
                  </span>
                </td>
              </tr>
            ) : filtered.map((i) => {
              const cfg = STATUS_CONFIG[i.estado] || STATUS_CONFIG.borrador;
              const Icon = cfg.icon;
              const mod = i.modalidad || 'horas';
              return (
                <tr key={i._id} className="border-b border-stone-100 dark:border-stone-800/60 hover:bg-stone-50 dark:hover:bg-stone-800/40 transition-colors">
                  <td className="px-4 py-3 font-medium text-stone-900 dark:text-stone-100">
                    <span className="inline-flex items-center gap-2">
                      <Receipt className="w-4 h-4 text-stone-400 shrink-0" />
                      {i.numero}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-stone-600 dark:text-stone-300">{i.cliente}</td>
                  <td className="px-4 py-3 text-stone-600 dark:text-stone-300 font-mono text-xs">{i.caso}</td>
                  <td className="px-4 py-3 text-stone-600 dark:text-stone-300 max-w-[200px] truncate">{i.concepto}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-semibold px-2 py-1 rounded-lg bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300">
                      {MODALIDAD_LABEL[mod] || mod}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-stone-600 dark:text-stone-300 text-center">{i.horas ? fmtHours(i.horas) : '—'}</td>
                  <td className="px-4 py-3 text-stone-600 dark:text-stone-300 whitespace-nowrap">{i.tarifaHora ? fmt(i.tarifaHora) : '—'}</td>
                  <td className="px-4 py-3 font-bold text-stone-900 dark:text-stone-100 whitespace-nowrap">{fmt(i.importe)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold ${cfg.cls}`}>
                      <Icon className="w-3.5 h-3.5" />
                      {cfg.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 flex gap-1">
                    <button type="button" onClick={() => openEdit(i)} className="p-1.5 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-lg transition-colors">
                      <Edit3 className="w-4 h-4 text-stone-500" />
                    </button>
                    <button type="button" onClick={() => void handleDelete(i._id)} className="p-1.5 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition-colors">
                      <X className="w-4 h-4 text-rose-400" />
                    </button>
                  </td>
                </tr>
              );
            })}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={10} className="px-4 py-12 text-center text-stone-400">No se encontraron minutas</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-5">
          <p className="font-semibold text-stone-900 dark:text-stone-100 flex items-center gap-2 mb-3">
            <Briefcase className="w-5 h-5 text-blue-600" />
            Resumen por expediente
          </p>
          {byExpediente.length === 0 ? (
            <p className="text-sm text-stone-400">Sin datos.</p>
          ) : (
            <ul className="space-y-2">
              {byExpediente.map((row) => (
                <li key={row.caso + row.cliente} className="flex items-center justify-between gap-3 text-sm border border-stone-100 dark:border-stone-800 rounded-xl px-3 py-2">
                  <div className="min-w-0">
                    <p className="font-medium text-stone-900 dark:text-stone-100 truncate">{row.caso || 'Sin expediente'}</p>
                    <p className="text-xs text-stone-500 truncate">{row.cliente} · {row.n} minuta(s)</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-stone-900 dark:text-stone-100">{fmt(row.total)}</p>
                    {row.horas > 0 ? <p className="text-xs text-stone-500">{fmtHours(row.horas)}</p> : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-5">
          <p className="font-semibold text-stone-900 dark:text-stone-100 flex items-center gap-2 mb-3">
            <Timer className="w-5 h-5 text-blue-600" />
            Parte de horas
          </p>
          {timeEntries.length === 0 ? (
            <p className="text-sm text-stone-400">
              Los partes de horas aparecerán cuando registres tiempo por expediente.
            </p>
          ) : (
            <ul className="space-y-2 max-h-[320px] overflow-y-auto">
              {timeEntries.map((te) => (
                <li key={te.id} className="text-sm border border-stone-100 dark:border-stone-800 rounded-xl px-3 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-stone-900 dark:text-stone-100 truncate">{te.descripcion}</p>
                      <p className="text-xs text-stone-500 mt-0.5">
                        {te.abogado} · {te.caso} · {te.fecha}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-semibold text-stone-900 dark:text-stone-100">
                        {(te.minutos / 60).toLocaleString('es-ES', { maximumFractionDigits: 1 })}h
                      </p>
                      <p className={`text-[10px] font-semibold ${te.facturable ? 'text-emerald-600' : 'text-stone-400'}`}>
                        {te.facturable ? 'Facturable' : 'Interno'}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setModalOpen(false)}>
          <form onSubmit={(e) => void handleSave(e)} className="bg-white dark:bg-stone-900 rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-stone-200 dark:border-stone-800" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-stone-200 dark:border-stone-800">
              <h2 className="text-xl font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                <Receipt className="w-5 h-5 text-blue-600" />
                {editing ? 'Editar minuta' : 'Nueva minuta'}
              </h2>
              <button type="button" onClick={() => setModalOpen(false)} className="p-2 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-xl">
                <X className="w-5 h-5 text-stone-500" />
              </button>
            </div>
            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className={labelClass}>Nº Minuta</label><input className={inputClass} value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} required /></div>
              <div><label className={labelClass}>Cliente</label><input className={inputClass} value={form.cliente} onChange={(e) => setForm({ ...form, cliente: e.target.value })} required /></div>
              <div><label className={labelClass}>Caso / Expediente</label><input className={inputClass} value={form.caso} onChange={(e) => setForm({ ...form, caso: e.target.value })} /></div>
              <div>
                <label className={labelClass}>Modalidad</label>
                <select className={inputClass} value={form.modalidad || 'horas'} onChange={(e) => setForm({ ...form, modalidad: e.target.value })}>
                  <option value="horas">Por horas</option>
                  <option value="iguala">Iguala</option>
                  <option value="exito">Por éxito</option>
                </select>
              </div>
              <div className="sm:col-span-2"><label className={labelClass}>Concepto</label><input className={inputClass} value={form.concepto} onChange={(e) => setForm({ ...form, concepto: e.target.value })} /></div>
              <div><label className={labelClass}>Horas</label><input type="number" min={0} step={0.5} className={inputClass} value={form.horas} onChange={(e) => setForm({ ...form, horas: Number(e.target.value) })} /></div>
              <div><label className={labelClass}>Tarifa/hora (€)</label><input type="number" min={0} className={inputClass} value={form.tarifaHora} onChange={(e) => setForm({ ...form, tarifaHora: Number(e.target.value) })} /></div>
              <div><label className={labelClass}>Importe calculado</label><p className="px-3 py-2.5 text-lg font-bold text-stone-900 dark:text-stone-100">{fmt(form.horas * form.tarifaHora)}</p></div>
              <div>
                <label className={labelClass}>Estado</label>
                <select className={inputClass} value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value as InvoiceStatus })}>
                  {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
            </div>
            <div className="sticky bottom-0 bg-white dark:bg-stone-900 flex gap-3 p-6 border-t border-stone-200 dark:border-stone-800 rounded-b-2xl">
              <button type="button" onClick={() => setModalOpen(false)} className={`${VERTIAL_BTN_SECONDARY} flex-1`}>Cancelar</button>
              <button type="submit" className={`${VERTIAL_BTN_PRIMARY} flex-1`}>Guardar</button>
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
