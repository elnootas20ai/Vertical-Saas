import { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { bulkCreateVerticalEntries, entryStr, entryNum } from '../../lib/bulkVerticalImport';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { useModalClose } from '../../hooks/useModalClose';
import {
  listCleaningInvoices,
  createCleaningInvoice,
  updateCleaningInvoice,
  deleteCleaningInvoice,
  generateBillingCycle,
  sendInvoiceEmail as apiSendInvoiceEmail,
  type CleaningInvoice,
  type CleaningInvoiceLine,
  type InvoiceStatus,
  type BillingCycleResult,
} from '../../lib/cleaningBillingApi';
import {
  listCleaningContracts,
  createCleaningContract,
  updateCleaningContract,
  deleteCleaningContract,
  type CleaningContract,
  type ContractService,
  type ContractStatus,
  type PriceRevision,
} from '../../lib/cleaningContractsApi';
import { generateInvoicePdf } from '../../lib/invoicePdfGenerator';
import {
  Receipt, Plus, Calendar, Clock, Search, TrendingUp,
  AlertTriangle, FileText, DollarSign, Send, Download,
  CheckCircle, AlertCircle, Loader2, X, Trash2, Edit3,
  Eye, Mail, Zap, Filter, MoreHorizontal, Users,
  FileSpreadsheet, Pause, Play, RefreshCw, ChevronDown,
  ChevronRight, ClipboardList, Building2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';
// ─── Status config ────────────────────────────────────────────────────────────

const INVOICE_STATUS: Record<InvoiceStatus, { label: string; bg: string; text: string; dot: string }> = {
  draft:   { label: 'Borrador',  bg: 'bg-gray-100',    text: 'text-gray-600',    dot: 'bg-gray-400' },
  pending: { label: 'Pendiente', bg: 'bg-amber-50',    text: 'text-amber-700',   dot: 'bg-amber-400' },
  paid:    { label: 'Pagada',    bg: 'bg-emerald-50',  text: 'text-emerald-700', dot: 'bg-emerald-400' },
  overdue: { label: 'Vencida',   bg: 'bg-red-50',      text: 'text-red-700',     dot: 'bg-red-400' },
  partial: { label: 'Parcial',   bg: 'bg-blue-50',     text: 'text-blue-700',    dot: 'bg-blue-400' },
};

const ORIGIN_LABELS: Record<string, { label: string; color: string }> = {
  manual:        { label: 'Manual',    color: 'bg-gray-100 text-gray-600' },
  auto_service:  { label: 'Auto',      color: 'bg-indigo-50 text-indigo-600' },
  auto_contract: { label: 'Contrato',  color: 'bg-purple-50 text-purple-600' },
};

const CONTRACT_STATUS: Record<ContractStatus, { label: string; bg: string; text: string }> = {
  active:    { label: 'Activo',    bg: 'bg-emerald-50', text: 'text-emerald-700' },
  paused:    { label: 'Pausado',   bg: 'bg-amber-50',   text: 'text-amber-700' },
  cancelled: { label: 'Cancelado', bg: 'bg-gray-100',   text: 'text-gray-500' },
  expired:   { label: 'Expirado',  bg: 'bg-red-50',     text: 'text-red-600' },
};

const CLEANING_TYPES = [
  { value: 'general', label: 'Limpieza general' },
  { value: 'office', label: 'Oficinas' },
  { value: 'industrial', label: 'Industrial' },
  { value: 'post_construction', label: 'Post-obra' },
  { value: 'windows', label: 'Cristales' },
  { value: 'disinfection', label: 'Desinfección' },
  { value: 'deep', label: 'Limpieza profunda' },
];

const TAX_OPTS = [0, 4, 10, 21];
const PAY_METHODS = ['Transferencia', 'Efectivo', 'Tarjeta', 'Domiciliación', 'Bizum', 'Otros'];

type MainTab = 'invoices' | 'contracts';
type InvoiceFilter = 'all' | 'draft' | 'pending' | 'paid' | 'overdue';

const fmtCurrency = (v: number) => v.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

// ─── Component ────────────────────────────────────────────────────────────────

export function CleaningBilling() {
  const { user } = useAuth();
  const userId = user?.id || user?._id || '';

  const [mainTab, setMainTab] = useState<MainTab>('invoices');
  const [invoices, setInvoices] = useState<CleaningInvoice[]>([]);
  const [contracts, setContracts] = useState<CleaningContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<InvoiceFilter>('all');
  const [search, setSearch] = useState('');
  const [showNewInvoice, setShowNewInvoice] = useState(false);
  const [showNewContract, setShowNewContract] = useState(false);
  const [showGenerate, setShowGenerate] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<CleaningInvoice | null>(null);
  const [editingContract, setEditingContract] = useState<CleaningContract | null>(null);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  // ─── Data loading ──────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [inv, con] = await Promise.all([
        listCleaningInvoices(userId),
        listCleaningContracts(userId),
      ]);
      setInvoices(inv);
      setContracts(con);
    } catch (err: any) {
      toast.error(err.message || 'Error cargando datos');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { loadData(); }, [loadData]);

  // ─── KPIs ──────────────────────────────────────────────────────────────────

  const kpis = useMemo(() => {
    const totalInvoiced = invoices.reduce((s, i) => s + (i.total || 0), 0);
    const pendingAmount = invoices.filter((i) => i.status === 'pending' || i.status === 'overdue').reduce((s, i) => s + (i.total - i.paid), 0);
    const issuedCount = invoices.length;
    const overdueCount = invoices.filter((i) => i.status === 'overdue').length;
    return { totalInvoiced, pendingAmount, issuedCount, overdueCount };
  }, [invoices]);

  const contractKpis = useMemo(() => {
    const activeContracts = contracts.filter((c) => c.status === 'active').length;
    const monthlyRevenue = contracts.filter((c) => c.status === 'active').reduce((s, c) => s + (c.totalMonthly || 0), 0);
    const expiringSoon = contracts.filter((c) => {
      if (!c.endDate || c.status !== 'active') return false;
      const diff = new Date(c.endDate).getTime() - Date.now();
      return diff > 0 && diff < 30 * 86_400_000;
    }).length;
    return { activeContracts, monthlyRevenue, expiringSoon };
  }, [contracts]);

  // ─── Filtered invoices ─────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let list = invoices;
    if (filter !== 'all') list = list.filter((i) => i.status === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((i) =>
        i.clientName?.toLowerCase().includes(q) ||
        i.number?.toLowerCase().includes(q) ||
        String(i.total).includes(q),
      );
    }
    return list.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  }, [invoices, filter, search]);

  const filterCounts = useMemo(() => ({
    all: invoices.length,
    draft: invoices.filter((i) => i.status === 'draft').length,
    pending: invoices.filter((i) => i.status === 'pending').length,
    paid: invoices.filter((i) => i.status === 'paid').length,
    overdue: invoices.filter((i) => i.status === 'overdue').length,
  }), [invoices]);

  // ─── Actions ───────────────────────────────────────────────────────────────

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const result = await generateBillingCycle(userId);
      const total = (result.invoicesFromServices?.length || 0) + (result.invoicesFromContracts?.length || 0);
      if (total > 0) {
        toast.success(`${total} factura(s) generada(s), ${result.financeEntries} ingreso(s) creados, ${result.overdueMarked} vencida(s) marcadas`);
      } else {
        toast.info('No hay facturas pendientes de generar');
      }
      await loadData();
      setShowGenerate(false);
    } catch (err: any) {
      toast.error(err.message || 'Error en el ciclo de facturación');
    } finally {
      setGenerating(false);
    }
  };

  const handleMarkPaid = async (inv: CleaningInvoice) => {
    try {
      const now = new Date().toISOString();
      await updateCleaningInvoice(userId, { ...inv, status: 'paid', paidAt: now, paid: inv.total });
      toast.success(`Factura ${inv.number} marcada como pagada`);
      await loadData();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleSendEmail = async (inv: CleaningInvoice) => {
    if (!inv.clientEmail) {
      toast.error('El cliente no tiene email configurado');
      return;
    }
    try {
      const result = await apiSendInvoiceEmail(userId, inv.id);
      toast.success(`Factura enviada a ${result.sentTo}`);
      await loadData();
    } catch (err: any) {
      toast.error(err.message || 'Error enviando email');
    }
  };

  const handleDownloadPdf = (inv: CleaningInvoice) => {
    try {
      const pdf = generateInvoicePdf({
        number: inv.number,
        date: inv.date,
        dueDate: inv.dueDate,
        issuer: {
          companyName: inv.issuerName || 'Mi Empresa',
          nif: inv.issuerNif,
          address: inv.issuerAddress,
          phone: inv.issuerPhone,
          email: inv.issuerEmail,
        },
        recipient: {
          name: inv.clientName,
          nif: inv.clientNif,
          address: inv.clientAddress,
        },
        lines: (inv.lines || []).map((l) => ({
          description: l.description,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          taxRate: l.taxRate,
        })),
        notes: inv.notes,
        payMethod: inv.paymentMethod,
      });
      pdf.save(`${inv.number}.pdf`);
    } catch (err: any) {
      toast.error('Error generando PDF');
    }
  };

  const handleDelete = async (inv: CleaningInvoice) => {
    if (!confirm(`¿Eliminar factura ${inv.number}?`)) return;
    try {
      await deleteCleaningInvoice(userId, inv.id);
      toast.success('Factura eliminada');
      await loadData();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDeleteContract = async (contract: CleaningContract) => {
    if (!confirm(`¿Eliminar contrato ${contract.contractNumber}?`)) return;
    try {
      await deleteCleaningContract(userId, contract._id);
      toast.success('Contrato eliminado');
      await loadData();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleToggleContractStatus = async (contract: CleaningContract) => {
    const nextStatus = contract.status === 'active' ? 'paused' : 'active';
    try {
      await updateCleaningContract(userId, { ...contract, status: nextStatus });
      toast.success(`Contrato ${nextStatus === 'active' ? 'reactivado' : 'pausado'}`);
      await loadData();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // ─── Permission check ─────────────────────────────────────────────────────

  const hasAccess = user?.role === 'admin' || user?.role === 'gerente' || user?.role === 'owner' || (user as any)?.permissions?.includes?.('finance');
  if (!loading && !hasAccess) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center">
            <AlertTriangle className="w-8 h-8 text-red-400" />
          </div>
          <h2 className="text-xl font-semibold text-gray-800">Acceso restringido</h2>
          <p className="text-gray-500 text-center max-w-md">No tienes permisos para acceder a la facturación. Contacta con tu administrador.</p>
        </div>
      </Layout>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <Layout>
      <div className="space-y-6 pb-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Receipt className="w-7 h-7 text-emerald-600" />
              Facturación
            </h1>
            <p className="text-sm text-gray-500 mt-1">Gestiona facturas automáticas y manuales de tus servicios de limpieza</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowGenerate(true)} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-medium text-sm shadow-sm hover:shadow-md transition-all">
              <Zap className="w-4 h-4" /> Generar facturas
            </button>
            <button onClick={() => mainTab === 'contracts' ? setShowNewContract(true) : setShowNewInvoice(true)} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-gray-200 text-gray-700 font-medium text-sm hover:bg-gray-50 transition-all">
              <Plus className="w-4 h-4" /> {mainTab === 'contracts' ? 'Nuevo contrato' : 'Nueva factura'}
            </button>
          </div>
        </div>

        {/* Main tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
          {([['invoices', 'Facturas', Receipt], ['contracts', 'Contratos', ClipboardList]] as const).map(([key, label, Icon]) => (
            <button key={key} onClick={() => setMainTab(key)} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${mainTab === key ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>

        {mainTab === 'invoices' ? (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: 'Total facturado', value: fmtCurrency(kpis.totalInvoiced), icon: TrendingUp, color: 'emerald', bg: 'from-emerald-50 to-emerald-100/50' },
                { label: 'Pendiente cobro', value: fmtCurrency(kpis.pendingAmount), icon: Clock, color: 'amber', bg: 'from-amber-50 to-amber-100/50' },
                { label: 'Facturas emitidas', value: String(kpis.issuedCount), icon: FileText, color: 'blue', bg: 'from-blue-50 to-blue-100/50' },
                { label: 'Vencidas', value: String(kpis.overdueCount), icon: AlertTriangle, color: 'red', bg: 'from-red-50 to-red-100/50' },
              ].map((kpi) => (
                <motion.div key={kpi.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className={`bg-gradient-to-br ${kpi.bg} rounded-2xl p-5 border border-${kpi.color}-100`}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">{kpi.label}</span>
                    <div className={`w-9 h-9 rounded-xl bg-${kpi.color}-100 flex items-center justify-center`}>
                      <kpi.icon className={`w-4.5 h-4.5 text-${kpi.color}-600`} />
                    </div>
                  </div>
                  <p className="text-2xl font-bold text-gray-900">{kpi.value}</p>
                </motion.div>
              ))}
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
              <div className="flex gap-1 flex-wrap">
                {(['all', 'draft', 'pending', 'paid', 'overdue'] as InvoiceFilter[]).map((f) => (
                  <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${filter === f ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                    {f === 'all' ? 'Todas' : INVOICE_STATUS[f].label}
                    <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] ${filter === f ? 'bg-white/20' : 'bg-gray-200'}`}>{filterCounts[f]}</span>
                  </button>
                ))}
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar factura..." className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 outline-none" />
              </div>
            </div>

            {/* Table */}
            {loading ? (
              <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 text-emerald-500 animate-spin" /></div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-gray-100">
                <div className="w-16 h-16 rounded-full bg-gray-50 flex items-center justify-center mb-4">
                  <Receipt className="w-8 h-8 text-gray-300" />
                </div>
                <h3 className="text-lg font-semibold text-gray-700 mb-1">Sin facturas</h3>
                <p className="text-sm text-gray-400 mb-4">Crea tu primera factura o genera automáticamente desde servicios</p>
                <AddButtonDropdown
                label="Nueva factura"
                onQuickAdd={() => setShowNewInvoice(true)}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de factura"
              />
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-100">
                        {['Nº Factura', 'Cliente', 'Periodo', 'Importe', 'Emisión', 'Vencimiento', 'Estado', 'Acciones'].map((h) => (
                          <th key={h} className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((inv) => {
                        const st = INVOICE_STATUS[inv.status] || INVOICE_STATUS.draft;
                        const origin = ORIGIN_LABELS[inv.origin] || ORIGIN_LABELS.manual;
                        const isExpanded = expandedRow === inv.id;
                        return (
                          <motion.tr key={inv.id} layout className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors cursor-pointer" onClick={() => setExpandedRow(isExpanded ? null : inv.id)}>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-sm font-medium text-gray-900">{inv.number || '—'}</span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${origin.color}`}>{origin.label}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center text-xs font-bold text-emerald-700">
                                  {(inv.clientName || '?')[0]?.toUpperCase()}
                                </div>
                                <span className="text-sm text-gray-800 font-medium">{inv.clientName || '—'}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-500">{inv.periodStart && inv.periodEnd ? `${fmtDate(inv.periodStart)} — ${fmtDate(inv.periodEnd)}` : '—'}</td>
                            <td className="px-4 py-3 text-sm font-semibold text-gray-900">{fmtCurrency(inv.total)}</td>
                            <td className="px-4 py-3 text-xs text-gray-500">{fmtDate(inv.date)}</td>
                            <td className="px-4 py-3 text-xs text-gray-500">{fmtDate(inv.dueDate)}</td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${st.bg} ${st.text}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                                {st.label}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                <button onClick={() => handleDownloadPdf(inv)} title="Descargar PDF" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"><Download className="w-3.5 h-3.5" /></button>
                                <button onClick={() => handleSendEmail(inv)} title="Enviar email" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"><Mail className="w-3.5 h-3.5" /></button>
                                {inv.status !== 'paid' && (
                                  <button onClick={() => handleMarkPaid(inv)} title="Marcar pagada" className="p-1.5 rounded-lg hover:bg-emerald-50 text-gray-400 hover:text-emerald-600"><CheckCircle className="w-3.5 h-3.5" /></button>
                                )}
                                <button onClick={() => handleDelete(inv)} title="Eliminar" className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                              </div>
                            </td>
                          </motion.tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        ) : (
          /* ─── Contracts tab ─────────────────────────────────────────────── */
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { label: 'Contratos activos', value: String(contractKpis.activeContracts), icon: CheckCircle, color: 'emerald' },
                { label: 'Facturación mensual', value: fmtCurrency(contractKpis.monthlyRevenue), icon: DollarSign, color: 'blue' },
                { label: 'Renovaciones próximas', value: String(contractKpis.expiringSoon), icon: Calendar, color: 'amber' },
              ].map((kpi) => (
                <motion.div key={kpi.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">{kpi.label}</span>
                    <kpi.icon className={`w-5 h-5 text-${kpi.color}-500`} />
                  </div>
                  <p className="text-2xl font-bold text-gray-900">{kpi.value}</p>
                </motion.div>
              ))}
            </div>

            {loading ? (
              <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 text-emerald-500 animate-spin" /></div>
            ) : contracts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-gray-100">
                <div className="w-16 h-16 rounded-full bg-gray-50 flex items-center justify-center mb-4">
                  <ClipboardList className="w-8 h-8 text-gray-300" />
                </div>
                <h3 className="text-lg font-semibold text-gray-700 mb-1">Sin contratos</h3>
                <p className="text-sm text-gray-400 mb-4">Crea un contrato para facturar automáticamente servicios recurrentes</p>
                <button onClick={() => setShowNewContract(true)} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600">
                  <Plus className="w-4 h-4" /> Nuevo contrato
                </button>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-100">
                        {['Nº Contrato', 'Cliente', 'Servicios', 'Frecuencia', 'Total mensual', 'Próxima factura', 'Estado', 'Acciones'].map((h) => (
                          <th key={h} className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {contracts.map((c) => {
                        const st = CONTRACT_STATUS[c.status] || CONTRACT_STATUS.active;
                        return (
                          <tr key={c._id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                            <td className="px-4 py-3 font-mono text-sm font-medium text-gray-900">{c.contractNumber}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-full bg-purple-100 flex items-center justify-center text-xs font-bold text-purple-700">
                                  {(c.clientName || '?')[0]?.toUpperCase()}
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-gray-800">{c.clientName}</p>
                                  {c.clientPhone && <p className="text-xs text-gray-400">{c.clientPhone}</p>}
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-sm text-gray-600">{c.services?.length || 0} servicio(s)</span>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600 capitalize">{c.billingFrequency === 'weekly' ? 'Semanal' : 'Mensual'}</td>
                            <td className="px-4 py-3 text-sm font-semibold text-gray-900">{fmtCurrency(c.totalMonthly)}</td>
                            <td className="px-4 py-3 text-xs text-gray-500">{fmtDate(c.nextInvoiceDate)}</td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${st.bg} ${st.text}`}>{st.label}</span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1">
                                <button onClick={() => setEditingContract(c)} title="Editar" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"><Edit3 className="w-3.5 h-3.5" /></button>
                                <button onClick={() => handleToggleContractStatus(c)} title={c.status === 'active' ? 'Pausar' : 'Reactivar'} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600">
                                  {c.status === 'active' ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                                </button>
                                <button onClick={() => handleDeleteContract(c)} title="Eliminar" className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ─── Generate modal ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showGenerate && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
              <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 px-6 py-5 text-white">
                <h2 className="text-lg font-bold flex items-center gap-2"><Zap className="w-5 h-5" /> Generar facturas automáticas</h2>
                <p className="text-sm text-emerald-100 mt-1">Se generarán facturas desde servicios completados y contratos activos</p>
              </div>
              <div className="p-6 space-y-4">
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
                  <p className="font-medium mb-1">El ciclo automático:</p>
                  <ul className="list-disc list-inside space-y-1 text-amber-700">
                    <li>Genera facturas de servicios completados sin facturar</li>
                    <li>Genera facturas de contratos activos pendientes</li>
                    <li>Crea ingresos pendientes en Finanzas</li>
                    <li>Marca facturas vencidas</li>
                  </ul>
                </div>
                <div className="flex justify-end gap-3">
                  <button onClick={() => setShowGenerate(false)} className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">Cancelar</button>
                  <button onClick={handleGenerate} disabled={generating} className="px-6 py-2 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2">
                    {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                    {generating ? 'Generando...' : 'Generar'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── New Invoice modal ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {showNewInvoice && (
          <NewInvoiceModal userId={userId} onClose={() => setShowNewInvoice(false)} onSaved={() => { setShowNewInvoice(false); loadData(); }} />
        )}
      </AnimatePresence>

      {/* ─── New Contract modal ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {showNewContract && (
          <NewContractModal userId={userId} onClose={() => setShowNewContract(false)} onSaved={() => { setShowNewContract(false); loadData(); }} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editingContract && (
          <NewContractModal userId={userId} existing={editingContract} onClose={() => setEditingContract(null)} onSaved={() => { setEditingContract(null); loadData(); }} />
        )}
      </AnimatePresence>
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="cleaning_billing"
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

// ─── New Invoice Modal ────────────────────────────────────────────────────────

function NewInvoiceModal({ userId, onClose, onSaved }: { userId: string; onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientNif, setClientNif] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  });
  const [payMethod, setPayMethod] = useState('');
  const [taxRate, setTaxRate] = useState(21);
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<{ description: string; quantity: number; unitPrice: number }[]>([
    { description: '', quantity: 1, unitPrice: 0 },
  ]);
  const ref = useModalClose(onClose);

  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;

  const addLine = () => setLines([...lines, { description: '', quantity: 1, unitPrice: 0 }]);
  const removeLine = (i: number) => setLines(lines.filter((_, idx) => idx !== i));
  const updateLine = (i: number, field: string, value: any) => {
    const next = [...lines];
    (next[i] as any)[field] = value;
    setLines(next);
  };

  const handleSave = async () => {
    if (!clientName.trim()) { toast.error('Nombre de cliente obligatorio'); return; }
    if (lines.every((l) => !l.description.trim())) { toast.error('Añade al menos una línea'); return; }
    setSaving(true);
    try {
      await createCleaningInvoice(userId, {
        clientName, clientEmail, clientNif, clientAddress,
        dueDate, paymentMethod: payMethod, notes,
        lines: lines.filter((l) => l.description.trim()).map((l, i) => ({
          id: `line-${i}`, description: l.description, quantity: l.quantity, unitPrice: l.unitPrice,
          taxRate, lineTotal: l.quantity * l.unitPrice, serviceId: '',
        })),
        status: 'pending',
        origin: 'manual',
        vertical: 'cleaning',
      } as any);
      toast.success('Factura creada');
      onSaved();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 overflow-y-auto">
      <motion.div ref={ref} initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-8">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2"><Receipt className="w-5 h-5 text-emerald-600" /> Nueva factura</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100"><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
            <div><label className="text-xs font-medium text-gray-500">Cliente *</label><input value={clientName} onChange={(e) => setClientName(e.target.value)} className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 outline-none" /></div>
            <div><label className="text-xs font-medium text-gray-500">Email</label><input value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 outline-none" /></div>
            <div><label className="text-xs font-medium text-gray-500">NIF/CIF</label><input value={clientNif} onChange={(e) => setClientNif(e.target.value)} className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 outline-none" /></div>
            <div><label className="text-xs font-medium text-gray-500">Dirección</label><input value={clientAddress} onChange={(e) => setClientAddress(e.target.value)} className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 outline-none" /></div>
            <div><label className="text-xs font-medium text-gray-500">Vencimiento</label><input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 outline-none" /></div>
            <div><label className="text-xs font-medium text-gray-500">Método de pago</label><select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 outline-none bg-white"><option value="">—</option>{PAY_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}</select></div>
            <div><label className="text-xs font-medium text-gray-500">IVA (%)</label><select value={taxRate} onChange={(e) => setTaxRate(Number(e.target.value))} className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 outline-none bg-white">{TAX_OPTS.map((t) => <option key={t} value={t}>{t}%</option>)}</select></div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-500 uppercase">Líneas de detalle</label>
              <button onClick={addLine} className="text-xs text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1"><Plus className="w-3 h-3" /> Añadir</button>
            </div>
            <div className="space-y-2">
              {lines.map((l, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input value={l.description} onChange={(e) => updateLine(i, 'description', e.target.value)} placeholder="Descripción" className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 outline-none" />
                  <input type="number" value={l.quantity} onChange={(e) => updateLine(i, 'quantity', Number(e.target.value))} className="w-16 px-2 py-2 border border-gray-200 rounded-xl text-sm text-center focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 outline-none" />
                  <input type="number" value={l.unitPrice} onChange={(e) => updateLine(i, 'unitPrice', Number(e.target.value))} placeholder="€" className="w-24 px-2 py-2 border border-gray-200 rounded-xl text-sm text-right focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 outline-none" />
                  {lines.length > 1 && <button onClick={() => removeLine(i)} className="p-1 text-gray-300 hover:text-red-400"><X className="w-4 h-4" /></button>}
                </div>
              ))}
            </div>
          </div>

          <div><label className="text-xs font-medium text-gray-500">Notas</label><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 outline-none resize-none" /></div>

          <div className="bg-gray-50 rounded-xl p-4 flex justify-between items-center">
            <div className="space-y-1 text-sm text-gray-500">
              <p>Subtotal: <span className="font-medium text-gray-700">{fmtCurrency(subtotal)}</span></p>
              <p>IVA ({taxRate}%): <span className="font-medium text-gray-700">{fmtCurrency(taxAmount)}</span></p>
            </div>
            <p className="text-2xl font-bold text-emerald-600">{fmtCurrency(total)}</p>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">Cancelar</button>
          <button onClick={handleSave} disabled={saving} className="px-6 py-2 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            {saving ? 'Guardando...' : 'Crear factura'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── New Contract Modal ───────────────────────────────────────────────────────

function NewContractModal({ userId, existing, onClose, onSaved }: { userId: string; existing?: CleaningContract; onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  const [clientName, setClientName] = useState(existing?.clientName || '');
  const [clientEmail, setClientEmail] = useState(existing?.clientEmail || '');
  const [clientPhone, setClientPhone] = useState(existing?.clientPhone || '');
  const [clientNif, setClientNif] = useState(existing?.clientNif || '');
  const [clientAddress, setClientAddress] = useState(existing?.clientAddress || '');
  const [billingFrequency, setBillingFrequency] = useState(existing?.billingFrequency || 'monthly');
  const [billingDay, setBillingDay] = useState(existing?.billingDay || 1);
  const [startDate, setStartDate] = useState(existing?.startDate || new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(existing?.endDate || '');
  const [indefinite, setIndefinite] = useState(!existing?.endDate);
  const [autoRenew, setAutoRenew] = useState(existing?.autoRenew ?? true);
  const [taxRate, setTaxRate] = useState(existing?.taxRate ?? 21);
  const [paymentMethod, setPaymentMethod] = useState(existing?.paymentMethod || '');
  const [autoSend, setAutoSend] = useState(existing?.autoSendInvoice ?? false);
  const [notes, setNotes] = useState(existing?.notes || '');
  const [services, setServices] = useState<Array<{ description: string; cleaningType: string; frequency: string; unitPrice: number; quantity: number }>>(
    existing?.services?.map((s) => ({ description: s.description, cleaningType: s.cleaningType, frequency: s.frequency, unitPrice: s.unitPrice, quantity: s.quantity })) ||
    [{ description: '', cleaningType: 'general', frequency: 'weekly', unitPrice: 0, quantity: 1 }],
  );
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

  const persistEntries = async (entries: Record<string, unknown>[]) => {
    if (!user?.id) {
      toast.error('Sesión no válida');
      return;
    }
    const created = await bulkCreateVerticalEntries(user?.id, {
      create: (uid, data) => createCleaningInvoice(uid, data),
    }, entries, (entry) => ({
      clientName: entryStr(entry, 'name', 'client', 'clientName', 'cliente'),
      amount: entryNum(entry, 'amount', 'total', 'importe'),
      date: entryStr(entry, 'date', 'fecha') || new Date().toISOString().slice(0, 10),
      status: 'pending',
    }));
    if (created > 0) {
      toast.success(`${created} factura(s) creado(s)`);
      void loadData();
    } else {
      toast.error('No se pudo crear ningún registro');
    }
  };

  const handleAIEntries = persistEntries;
  const handleImportEntries = async (entries: Record<string, string>[]) => persistEntries(entries);
  const ref = useModalClose(onClose);

  const totalMonthly = useMemo(() => {
    return services.reduce((s, svc) => {
      const base = svc.unitPrice * svc.quantity;
      const mult = svc.frequency === 'weekly' ? 4.33 : svc.frequency === 'biweekly' ? 2.17 : 1;
      return s + base * mult;
    }, 0);
  }, [services]);

  const addService = () => setServices([...services, { description: '', cleaningType: 'general', frequency: 'weekly', unitPrice: 0, quantity: 1 }]);
  const removeService = (i: number) => setServices(services.filter((_, idx) => idx !== i));
  const updateService = (i: number, field: string, value: any) => {
    const next = [...services];
    (next[i] as any)[field] = value;
    setServices(next);
  };

  const handleSave = async () => {
    if (!clientName.trim()) { toast.error('Nombre de cliente obligatorio'); return; }
    if (services.every((s) => !s.description.trim())) { toast.error('Añade al menos un servicio'); return; }
    setSaving(true);
    try {
      const data = {
        clientName, clientEmail, clientPhone, clientNif, clientAddress,
        billingFrequency, billingDay, startDate,
        endDate: indefinite ? '' : endDate,
        autoRenew, taxRate, paymentMethod,
        autoSendInvoice: autoSend, notes,
        services: services.filter((s) => s.description.trim()).map((s) => ({
          ...s, id: '', serviceTemplateId: '', daysOfWeek: [],
        })),
      };
      if (existing) {
        await updateCleaningContract(userId, { ...existing, ...data } as any);
        toast.success('Contrato actualizado');
      } else {
        await createCleaningContract(userId, data as any);
        toast.success('Contrato creado');
      }
      onSaved();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 overflow-y-auto">
      <motion.div ref={ref} initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-8">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2"><ClipboardList className="w-5 h-5 text-purple-600" /> {existing ? 'Editar contrato' : 'Nuevo contrato'}</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100"><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Datos del cliente</p>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="text-xs text-gray-500">Nombre *</label><input value={clientName} onChange={(e) => setClientName(e.target.value)} className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400" /></div>
            <div><label className="text-xs text-gray-500">Email</label><input value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400" /></div>
            <div><label className="text-xs text-gray-500">Teléfono</label><input value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400" /></div>
            <div><label className="text-xs text-gray-500">NIF/CIF</label><input value={clientNif} onChange={(e) => setClientNif(e.target.value)} className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400" /></div>
            <div className="col-span-2"><label className="text-xs text-gray-500">Dirección</label><input value={clientAddress} onChange={(e) => setClientAddress(e.target.value)} className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400" /></div>
          </div>

          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider pt-2">Servicios incluidos</p>
          <div className="space-y-3">
            {services.map((svc, i) => (
              <div key={i} className="bg-gray-50 rounded-xl p-3 space-y-2">
                <div className="flex gap-2">
                  <input value={svc.description} onChange={(e) => updateService(i, 'description', e.target.value)} placeholder="Descripción del servicio" className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-purple-500/20" />
                  {services.length > 1 && <button onClick={() => removeService(i)} className="p-1 text-gray-300 hover:text-red-400"><X className="w-4 h-4" /></button>}
                </div>
                <div className="grid grid-cols-4 gap-2">
                  <select value={svc.cleaningType} onChange={(e) => updateService(i, 'cleaningType', e.target.value)} className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-white outline-none">
                    {CLEANING_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  <select value={svc.frequency} onChange={(e) => updateService(i, 'frequency', e.target.value)} className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-white outline-none">
                    <option value="weekly">Semanal</option>
                    <option value="biweekly">Quincenal</option>
                    <option value="monthly">Mensual</option>
                  </select>
                  <input type="number" value={svc.quantity} onChange={(e) => updateService(i, 'quantity', Number(e.target.value))} placeholder="Cant" className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-center bg-white outline-none" />
                  <input type="number" value={svc.unitPrice} onChange={(e) => updateService(i, 'unitPrice', Number(e.target.value))} placeholder="Precio €" className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-right bg-white outline-none" />
                </div>
              </div>
            ))}
            <button onClick={addService} className="text-xs text-purple-600 hover:text-purple-700 font-medium flex items-center gap-1"><Plus className="w-3 h-3" /> Añadir servicio</button>
          </div>

          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider pt-2">Facturación</p>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="text-xs text-gray-500">Frecuencia</label><select value={billingFrequency} onChange={(e) => setBillingFrequency(e.target.value as any)} className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white outline-none"><option value="monthly">Mensual</option><option value="weekly">Semanal</option></select></div>
            <div><label className="text-xs text-gray-500">Día facturación</label><input type="number" min={1} max={28} value={billingDay} onChange={(e) => setBillingDay(Number(e.target.value))} className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none" /></div>
            <div><label className="text-xs text-gray-500">Fecha inicio</label><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none" /></div>
            <div>
              <label className="text-xs text-gray-500 flex items-center gap-2">Fecha fin <label className="flex items-center gap-1 text-[10px]"><input type="checkbox" checked={indefinite} onChange={(e) => setIndefinite(e.target.checked)} className="rounded" /> Indefinido</label></label>
              {!indefinite && <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none" />}
            </div>
            <div><label className="text-xs text-gray-500">IVA</label><select value={taxRate} onChange={(e) => setTaxRate(Number(e.target.value))} className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white outline-none">{TAX_OPTS.map((t) => <option key={t} value={t}>{t}%</option>)}</select></div>
            <div><label className="text-xs text-gray-500">Método de pago</label><select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white outline-none"><option value="">—</option>{PAY_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}</select></div>
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-600"><input type="checkbox" checked={autoRenew} onChange={(e) => setAutoRenew(e.target.checked)} className="rounded" /> Auto-renovación</label>
            <label className="flex items-center gap-2 text-sm text-gray-600"><input type="checkbox" checked={autoSend} onChange={(e) => setAutoSend(e.target.checked)} className="rounded" /> Enviar factura automáticamente</label>
          </div>

          <div><label className="text-xs text-gray-500">Notas</label><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none resize-none" /></div>

          <div className="bg-purple-50 rounded-xl p-4 flex justify-between items-center">
            <span className="text-sm text-purple-700">Total mensual estimado</span>
            <span className="text-2xl font-bold text-purple-700">{fmtCurrency(totalMonthly)}</span>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">Cancelar</button>
          <button onClick={handleSave} disabled={saving} className="px-6 py-2 rounded-xl bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            {saving ? 'Guardando...' : existing ? 'Actualizar' : 'Crear contrato'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
