import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { useNotificationOpen } from '../../hooks/useNotificationOpen';
import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Clock,
  Download,
  Eye,
  FileSignature,
  FileText,
  FilePlus,
  Hash,
  Lock,
  Mail,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  PenLine,
  Phone,
  Plus,
  Printer,
  Search,
  Send,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  TrendingUp,
  UserPlus,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
import { Layout } from '../../components/saas/Layout';
import { NuevoClienteModal } from '../../components/saas/NuevoClienteModal';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { useBusiness } from '../../context/BusinessContext';
import { getSectorTerms } from '../../lib/sectorTerminology';
import {
  approveQuote,
  buildInvoicePayloadFromQuote,
  buildQuoteNumber,
  buildSalePayloadFromQuote,
  calcQuoteLine,
  calcQuoteTotals,
  convertQuote,
  createQuote,
  deleteQuote,
  expireOverdueQuotes,
  listQuotes,
  rejectQuote,
  sendQuote,
  updateQuote,
  type ConversionTarget,
  type CreateQuotePayload,
  type QuoteLine,
  type QuoteRecord,
  type QuoteStatus,
} from '../../lib/quotesApi';
import { createSaleInCouch } from '../../lib/salesApi';
import { createClientInvoiceRequest } from '../../lib/clientInvoicesApi';
import { generateInvoicePdf } from '../../lib/invoicePdfGenerator';
import { Pagination } from '../../components/saas/Pagination';
import { usePagination } from '../../hooks/usePagination';
import { useModalClose } from '../../hooks/useModalClose';
import {
  listSalesPoints,
  createSalesPoint,
  type SalesPoint,
} from '../../lib/salesPointsApi';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';
import { CrmNav } from '../../components/saas/CrmNav';

// ── Types ─────────────────────────────────────────────────────────────────────

type QuoteTab = 'list' | 'create' | 'detail';

const STATUS_CONFIG: Record<QuoteStatus, { label: string; bg: string; text: string; dot: string }> = {
  draft:     { label: 'Borrador',   bg: 'bg-slate-100 dark:bg-slate-800',       text: 'text-slate-600 dark:text-slate-300',     dot: 'bg-slate-400' },
  sent:      { label: 'Enviado',    bg: 'bg-blue-50 dark:bg-blue-900/30',       text: 'text-blue-700 dark:text-blue-300',       dot: 'bg-blue-500' },
  approved:  { label: 'Aprobado',   bg: 'bg-emerald-50 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500' },
  rejected:  { label: 'Rechazado',  bg: 'bg-red-50 dark:bg-red-900/30',         text: 'text-red-700 dark:text-red-300',         dot: 'bg-red-500' },
  expired:   { label: 'Vencido',    bg: 'bg-amber-50 dark:bg-amber-900/30',     text: 'text-amber-700 dark:text-amber-300',     dot: 'bg-amber-500' },
  converted: { label: 'Convertido', bg: 'bg-purple-50 dark:bg-purple-900/30',   text: 'text-purple-700 dark:text-purple-300',   dot: 'bg-purple-500' },
};

const PAY_METHODS = ['Transferencia', 'Efectivo', 'Tarjeta', 'Domiciliación', 'Bizum', 'Otros'];
const TAX_OPTS = [0, 4, 10, 21];
const VALIDITY_PRESETS = [15, 30, 45, 60, 90];

// ── Shared class strings ──────────────────────────────────────────────────────

const inputCls = 'w-full text-sm border border-slate-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-slate-900 dark:text-gray-100 placeholder:text-slate-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400';
const labelCls = 'block text-xs font-medium text-slate-600 dark:text-gray-400 mb-1';
const selectCls = 'w-full text-sm border border-slate-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-slate-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400';
const cardCls = 'bg-white dark:bg-gray-800 rounded-xl border border-slate-200 dark:border-gray-700 p-6';
const stepBadgeCls = 'w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-xs flex items-center justify-center font-bold';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCurrency(v: number) {
  return `${v.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function daysUntil(iso: string) {
  const diff = new Date(iso).getTime() - Date.now();
  return Math.ceil(diff / 86400000);
}

function defaultValidUntil() {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
}

function calcValidUntil(quoteDate: string, days: number) {
  const d = new Date(quoteDate);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function buildQuoteQrUrl(id: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(id)}&size=220x220&margin=8&color=111111&bgcolor=FFFFFF`;
}

// ── StatusBadge ───────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: QuoteStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

// ── KPI card ──────────────────────────────────────────────────────────────────

function KPICard({ label, value, sub, icon: Icon, color }: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-slate-200 dark:border-gray-700 p-5 flex items-start gap-4">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-slate-500 dark:text-gray-400 mb-0.5">{label}</p>
        <p className="text-xl font-bold text-slate-900 dark:text-gray-100">{value}</p>
        {sub && <p className="text-xs text-slate-400 dark:text-gray-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ── EmptyState ────────────────────────────────────────────────────────────────

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-2xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center mb-4">
        <FileText className="w-8 h-8 text-blue-400" />
      </div>
      <h3 className="text-lg font-semibold text-slate-900 dark:text-gray-100 mb-1">Sin presupuestos</h3>
      <p className="text-sm text-slate-500 dark:text-gray-400 mb-5 max-w-xs">
        Crea tu primer presupuesto formal y envíaselo al cliente para su aprobación online.
      </p>
      <button
        onClick={onNew}
        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
      >
        <Plus className="w-4 h-4" />
        Nuevo presupuesto
      </button>
    </div>
  );
}

// ── Line editor ───────────────────────────────────────────────────────────────

function LineRow({
  line,
  onChange,
  onRemove,
}: {
  line: QuoteLine;
  onChange: (updated: QuoteLine) => void;
  onRemove: () => void;
}) {
  const update = (patch: Partial<QuoteLine>) => {
    const next = { ...line, ...patch };
    const recalc = calcQuoteLine(next.description, next.quantity, next.unitPrice, next.discountPercent, next.taxRate);
    onChange({ ...recalc, id: line.id });
  };

  const linputCls = 'w-full text-sm border border-slate-200 dark:border-gray-600 rounded-lg px-2.5 py-1.5 bg-white dark:bg-gray-700 text-slate-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400';

  return (
    <tr className="border-b border-slate-100 dark:border-gray-700 last:border-0">
      <td className="py-2 pr-2">
        <input
          className={linputCls}
          value={line.description}
          onChange={(e) => update({ description: e.target.value })}
          placeholder="Concepto"
        />
      </td>
      <td className="py-2 px-1 w-16">
        <input
          type="number"
          min={1}
          className={`${linputCls} text-center`}
          value={line.quantity}
          onChange={(e) => update({ quantity: Math.max(1, Number(e.target.value)) })}
        />
      </td>
      <td className="py-2 px-1 w-28">
        <input
          type="number"
          min={0}
          step={0.01}
          className={`${linputCls} text-right`}
          value={line.unitPrice}
          onChange={(e) => update({ unitPrice: Math.max(0, Number(e.target.value)) })}
        />
      </td>
      <td className="py-2 px-1 w-20">
        <input
          type="number"
          min={0}
          max={100}
          className={`${linputCls} text-center`}
          value={line.discountPercent}
          onChange={(e) => update({ discountPercent: Math.min(100, Math.max(0, Number(e.target.value))) })}
        />
      </td>
      <td className="py-2 px-1 w-20">
        <select
          className={linputCls.replace('px-2.5', 'px-2')}
          value={line.taxRate}
          onChange={(e) => update({ taxRate: Number(e.target.value) })}
        >
          {TAX_OPTS.map((r) => (
            <option key={r} value={r}>{r}%</option>
          ))}
        </select>
      </td>
      <td className="py-2 pl-1 w-28 text-right text-sm font-medium text-slate-900 dark:text-gray-100">
        {formatCurrency(line.lineTotal)}
      </td>
      <td className="py-2 pl-2 w-8">
        <button
          onClick={onRemove}
          className="text-slate-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </td>
    </tr>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function Quotes() {
  const { user } = useAuth();
  const { business, clients, isLoadingClients } = useApp();
  const { currentBusiness } = useBusiness();
  const navigate = useNavigate();

  const terms = getSectorTerms(currentBusiness?.businessType);

  const userId = user?.id ?? '';

  const [quotes, setQuotes] = useState<QuoteRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<QuoteTab>('list');
  const [selectedQuote, setSelectedQuote] = useState<QuoteRecord | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<QuoteStatus | 'all'>('all');
  const [salesPointFilter, setSalesPointFilter] = useState<string>('all');
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'warning' } | null>(null);
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [converting, setConverting] = useState(false);
  const [clientSearchQuery, setClientSearchQuery] = useState('');
  const [showClientResults, setShowClientResults] = useState(false);
  const [editingQuoteId, setEditingQuoteId] = useState<string | null>(null);
  const [salesPoints, setSalesPoints] = useState<SalesPoint[]>([]);
  const [showNewSalesPoint, setShowNewSalesPoint] = useState(false);
  const [newSalesPointName, setNewSalesPointName] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);
  const [clientMode, setClientMode] = useState<'search' | 'new'>('search');
  const [showNuevoClienteModal, setShowNuevoClienteModal] = useState(false);
  const [showExtraOptions, setShowExtraOptions] = useState(false);
  const [actionMenuPos, setActionMenuPos] = useState<{ top: number; right: number } | null>(null);

  useModalClose(showConvertModal, () => setShowConvertModal(false));

  const QUOTE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'clientName', label: 'Cliente', required: true, example: 'Empresa SL' },
    { key: 'concept', label: 'Concepto', required: true, example: 'Servicio de consultoría' },
    { key: 'quantity', label: 'Cantidad', example: '1' },
    { key: 'unitPrice', label: 'Precio unitario', required: true, example: '500.00' },
    { key: 'taxRate', label: '% IVA', example: '21' },
    { key: 'validUntil', label: 'Válido hasta', example: '2024-06-30' },
    { key: 'notes', label: 'Notas', example: '' },
  ];

  // ── Form state ──────────────────────────────────────────────────────────────
  const [form, setForm] = useState<{
    clientName: string;
    clientEmail: string;
    clientPhone: string;
    vehicleName: string;
    vehiclePlate: string;
    quoteDate: string;
    validityDays: number;
    validUntil: string;
    reference: string;
    paymentMethod: string;
    notes: string;
    internalNotes: string;
    lines: QuoteLine[];
    salesPointId: string;
    salesPointName: string;
  }>({
    clientName: '',
    clientEmail: '',
    clientPhone: '',
    vehicleName: '',
    vehiclePlate: '',
    quoteDate: new Date().toISOString().slice(0, 10),
    validityDays: 30,
    validUntil: defaultValidUntil(),
    reference: '',
    paymentMethod: 'Transferencia',
    notes: '',
    internalNotes: '',
    lines: [calcQuoteLine(terms.MARTE, 1, 0, 0, 21)],
    salesPointId: '',
    salesPointName: '',
  });

  useNotificationOpen(
    useCallback((entityId: string) => {
      const q = quotes.find((x) => x.id === entityId);
      if (q) { setSelectedQuote(q); setActiveTab('detail'); }
    }, [quotes]),
    !loading,
  );

  const totals = useMemo(() => calcQuoteTotals(form.lines), [form.lines]);
  const filteredClients = useMemo(() => {
    const query = clientSearchQuery.trim().toLowerCase();
    const ordered = [...clients].sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));

    if (!query) {
      return ordered.slice(0, 8);
    }

    return ordered
      .filter((client) => [client.name, client.email, client.phone, client.dni || ''].join(' ').toLowerCase().includes(query))
      .slice(0, 8);
  }, [clients, clientSearchQuery]);

  // ── Load data ───────────────────────────────────────────────────────────────
  const loadQuotes = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [data, sps] = await Promise.all([
        listQuotes(userId),
        listSalesPoints(userId),
      ]);
      await expireOverdueQuotes(userId);
      setQuotes(data);
      setSalesPoints(sps);
    } catch {
      showToast('Error cargando presupuestos', 'error');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { loadQuotes(); }, [loadQuotes]);

  function showToast(msg: string, type: 'success' | 'error' | 'warning' = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  // ── Filtering ───────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return quotes.filter((q) => {
      const matchStatus = statusFilter === 'all' || q.status === statusFilter;
      const matchSalesPoint = salesPointFilter === 'all' || q.salesPointId === salesPointFilter;
      const query = searchQuery.trim().toLowerCase();
      const matchSearch = !query || [q.number, q.clientName, q.clientEmail, q.vehicleName || '', q.vehiclePlate || '', q.salesPointName || '']
        .join(' ')
        .toLowerCase()
        .includes(query);
      return matchStatus && matchSalesPoint && matchSearch;
    });
  }, [quotes, statusFilter, salesPointFilter, searchQuery]);

  const { paginated: paginatedItems, pagination } = usePagination(filtered, 12);

  // ── KPIs ────────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const total = quotes.length;
    const approved = quotes.filter((q) => q.status === 'approved' || q.status === 'converted').length;
    const pending = quotes.filter((q) => q.status === 'sent').length;
    const totalValue = quotes.filter((q) => q.status !== 'rejected' && q.status !== 'expired').reduce((s, q) => s + q.total, 0);
    const conversionRate = total > 0 ? Math.round((approved / total) * 100) : 0;
    return { total, approved, pending, totalValue, conversionRate };
  }, [quotes]);

  // ── Actions ─────────────────────────────────────────────────────────────────
  function addLine() {
    setForm((f) => ({ ...f, lines: [...f.lines, calcQuoteLine('', 1, 0, 0, 21)] }));
  }

  function updateLine(idx: number, updated: QuoteLine) {
    setForm((f) => {
      const lines = [...f.lines];
      lines[idx] = updated;
      return { ...f, lines };
    });
  }

  function removeLine(idx: number) {
    setForm((f) => ({ ...f, lines: f.lines.filter((_, i) => i !== idx) }));
  }

  function updateQuoteDate(date: string) {
    setForm((f) => ({ ...f, quoteDate: date, validUntil: calcValidUntil(date, f.validityDays) }));
  }

  function updateValidityDays(days: number) {
    setForm((f) => ({ ...f, validityDays: days, validUntil: calcValidUntil(f.quoteDate, days) }));
  }

  function resetForm() {
    setForm({
      clientName: '',
      clientEmail: '',
      clientPhone: '',
      vehicleName: '',
      vehiclePlate: '',
      quoteDate: new Date().toISOString().slice(0, 10),
      validityDays: 30,
      validUntil: defaultValidUntil(),
      reference: '',
      paymentMethod: 'Transferencia',
      notes: '',
      internalNotes: '',
      lines: [calcQuoteLine(terms.MARTE, 1, 0, 0, 21)],
      salesPointId: '',
      salesPointName: '',
    });
    setClientSearchQuery('');
    setShowClientResults(false);
    setEditingQuoteId(null);
    setClientMode('search');
    setShowExtraOptions(false);
  }

  function handleStartEdit(quote: QuoteRecord) {
    const quoteDateVal = (quote.quoteDate || quote.createdAt).slice(0, 10);
    const daysVal = Math.max(1, Math.ceil((new Date(quote.validUntil).getTime() - new Date(quoteDateVal).getTime()) / 86400000));
    setForm({
      clientName: quote.clientName,
      clientEmail: quote.clientEmail,
      clientPhone: quote.clientPhone || '',
      vehicleName: quote.vehicleName || '',
      vehiclePlate: quote.vehiclePlate || '',
      quoteDate: quoteDateVal,
      validityDays: daysVal,
      validUntil: quote.validUntil.slice(0, 10),
      reference: quote.reference || '',
      paymentMethod: quote.paymentMethod || 'Transferencia',
      notes: quote.notes || '',
      internalNotes: quote.internalNotes || '',
      lines: quote.lines.length > 0 ? quote.lines : [calcQuoteLine(terms.MARTE, 1, 0, 0, 21)],
      salesPointId: quote.salesPointId || '',
      salesPointName: quote.salesPointName || '',
    });
    setClientSearchQuery(`${quote.clientName} · ${quote.clientEmail}`);
    setEditingQuoteId(quote.id);
    setClientMode('search');
    setActiveTab('create');
  }

  async function handleSaveEdit() {
    if (!editingQuoteId) return;
    const original = quotes.find((q) => q.id === editingQuoteId);
    if (!original) return;
    if (!form.clientName.trim() || !form.clientEmail.trim()) {
      showToast('Nombre y email del cliente son obligatorios', 'error');
      return;
    }
    if (form.lines.length === 0) {
      showToast('Añade al menos una línea', 'error');
      return;
    }
    setSaving(true);
    try {
      const updated: QuoteRecord = {
        ...original,
        clientName: form.clientName,
        clientEmail: form.clientEmail,
        clientPhone: form.clientPhone || undefined,
        vehicleName: form.vehicleName || undefined,
        vehiclePlate: form.vehiclePlate || undefined,
        entityLabel: terms.MARTE,
        entityPlateLabel: terms.plateLabel,
        quoteDate: form.quoteDate,
        validUntil: form.validUntil,
        reference: form.reference || undefined,
        notes: form.notes || undefined,
        internalNotes: form.internalNotes || undefined,
        paymentMethod: form.paymentMethod,
        lines: form.lines,
        salesPointId: form.salesPointId || undefined,
        salesPointName: form.salesPointName || undefined,
        ...totals,
      };
      const saved = await updateQuote(updated);
      setQuotes((prev) => prev.map((q) => (q.id === saved.id ? saved : q)));
      setSelectedQuote(saved);
      showToast('Presupuesto actualizado correctamente');
      resetForm();
      setActiveTab('detail');
    } catch {
      showToast('Error al actualizar el presupuesto', 'error');
    } finally {
      setSaving(false);
    }
  }

  function handleSelectExistingClient(client: (typeof clients)[number]) {
    setClientSearchQuery(`${client.name} · ${client.email}`);
    setShowClientResults(false);
    setForm((prev) => ({
      ...prev,
      clientName: client.name,
      clientEmail: client.email,
      clientPhone: client.phone || '',
    }));
  }

  async function handleCreate(asDraft: boolean) {
    if (!form.clientName.trim() || !form.clientEmail.trim()) {
      showToast('Nombre y email del cliente son obligatorios', 'error');
      return;
    }
    if (form.lines.length === 0) {
      showToast('Añade al menos una línea', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload: CreateQuotePayload = {
        user_id: userId,
        status: asDraft ? 'draft' : 'sent',
        clientName: form.clientName,
        clientEmail: form.clientEmail,
        clientPhone: form.clientPhone || undefined,
        vehicleName: form.vehicleName || undefined,
        vehiclePlate: form.vehiclePlate || undefined,
        entityLabel: terms.MARTE,
        entityPlateLabel: terms.plateLabel,
        quoteDate: form.quoteDate,
        validUntil: form.validUntil,
        reference: form.reference || undefined,
        notes: form.notes || undefined,
        internalNotes: form.internalNotes || undefined,
        paymentMethod: form.paymentMethod,
        responsible: user ? `${user.firstName} ${user.lastName}` : undefined,
        companyName: business?.name,
        companyCif: business?.taxId,
        companyAddress: business?.address,
        lines: form.lines,
        salesPointId: form.salesPointId || undefined,
        salesPointName: form.salesPointName || undefined,
        ...totals,
        sentAt: asDraft ? undefined : new Date().toISOString(),
      };
      const created = await createQuote(userId, payload, quotes.length + 1);
      setQuotes((prev) => [created, ...prev]);
      showToast(asDraft ? 'Presupuesto guardado como borrador' : 'Presupuesto enviado');
      resetForm();
      setActiveTab('list');
    } catch {
      showToast('Error al guardar el presupuesto', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleSend(quote: QuoteRecord) {
    if (!quote.clientEmail) {
      showToast('El presupuesto no tiene email del cliente', 'error');
      return;
    }
    try {
      const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};
      const host = window.location.hostname;
      const protocol = window.location.protocol.replace(':', '');
      const apiBase = env.VITE_API_URL || `${protocol}://${host}:${env.VITE_API_PORT || '3001'}`;
      const token = localStorage.getItem('vertial_access_token');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      if (env.VITE_COUCHDB_URL) headers['x-couch-url'] = env.VITE_COUCHDB_URL;
      if (env.VITE_COUCHDB_USER) headers['x-couch-user'] = env.VITE_COUCHDB_USER;
      if (env.VITE_COUCHDB_PASSWORD) headers['x-couch-password'] = env.VITE_COUCHDB_PASSWORD;

      const res = await fetch(`${apiBase}/api/quotes/send/${encodeURIComponent(quote._id)}`, {
        method: 'POST',
        headers,
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al enviar');

      setQuotes((prev) => prev.map((q) => (q.id === quote.id ? { ...quote, ...data.quote } : q)));
      if (selectedQuote?.id === quote.id) setSelectedQuote({ ...quote, ...data.quote });
      showToast('Presupuesto enviado por email al cliente');
    } catch {
      const updated = await sendQuote(quote);
      setQuotes((prev) => prev.map((q) => (q.id === updated.id ? updated : q)));
      showToast('Presupuesto marcado como enviado (email no enviado)', 'warning');
    }
  }

  async function handleApprove(quote: QuoteRecord) {
    try {
      const updated = await approveQuote(quote, user ? `${user.firstName} ${user.lastName}` : 'Admin');
      setQuotes((prev) => prev.map((q) => (q.id === updated.id ? updated : q)));
      showToast('Presupuesto aprobado');
      if (selectedQuote?.id === updated.id) setSelectedQuote(updated);
    } catch {
      showToast('Error al aprobar', 'error');
    }
  }

  async function handleReject(quote: QuoteRecord) {
    try {
      const updated = await rejectQuote(quote, 'Rechazado manualmente');
      setQuotes((prev) => prev.map((q) => (q.id === updated.id ? updated : q)));
      showToast('Presupuesto rechazado');
      if (selectedQuote?.id === updated.id) setSelectedQuote(updated);
    } catch {
      showToast('Error al rechazar', 'error');
    }
  }

  async function handleDelete(quote: QuoteRecord) {
    if (!confirm(`¿Eliminar el presupuesto ${quote.number}?`)) return;
    try {
      await deleteQuote(quote._id);
      setQuotes((prev) => prev.filter((q) => q.id !== quote.id));
      showToast('Presupuesto eliminado');
      if (selectedQuote?.id === quote.id) { setSelectedQuote(null); setActiveTab('list'); }
    } catch {
      showToast('Error al eliminar', 'error');
    }
  }

  async function handleConvert(quote: QuoteRecord, target: ConversionTarget) {
    if (!userId) return;
    setConverting(true);
    try {
      let targetId = '';

      if (target === 'sale') {
        const salePayload = buildSalePayloadFromQuote(quote);
        const sale = await createSaleInCouch(userId, salePayload as Parameters<typeof createSaleInCouch>[1]);
        targetId = sale.id;
        await convertQuote(quote, 'sale', targetId);
        showToast(`Presupuesto convertido a venta (${sale.id.slice(-6)})`);
        navigate('/saas/sales');
      } else if (target === 'invoice') {
        const count = quotes.filter((q) => q.convertedToInvoiceId).length + 1;
        const year = new Date().getFullYear();
        const invNumber = `FAC-${year}-${String(count).padStart(4, '0')}`;
        const invPayload = buildInvoicePayloadFromQuote(quote, invNumber);
        const inv = await createClientInvoiceRequest(userId, invPayload);
        if (inv) {
          targetId = inv.id;
          await convertQuote(quote, 'invoice', targetId);
          showToast(`Presupuesto convertido a factura ${invNumber}`);
        }
      } else if (target === 'reservation') {
        const salePayload = { ...buildSalePayloadFromQuote(quote), stage: 'reserved' };
        const sale = await createSaleInCouch(userId, salePayload as Parameters<typeof createSaleInCouch>[1]);
        targetId = sale.id;
        await convertQuote(quote, 'sale', targetId);
        showToast('Presupuesto convertido a reserva');
        navigate('/saas/sales');
      }

      const updatedQuotes = await listQuotes(userId);
      setQuotes(updatedQuotes);
      setSelectedQuote(updatedQuotes.find((q) => q.id === quote.id) ?? null);
      setShowConvertModal(false);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Error en la conversión', 'error');
    } finally {
      setConverting(false);
    }
  }

  function handleDownloadPdf(quote: QuoteRecord) {
    generateInvoicePdf({
      number: quote.number,
      date: (quote.quoteDate || quote.createdAt).slice(0, 10),
      dueDate: quote.validUntil.slice(0, 10),
      issuer: {
        companyName: quote.companyName || '',
        nif: quote.companyCif,
        address: quote.companyAddress,
      },
      recipient: { name: quote.clientName },
      lines: quote.lines.map((l) => ({
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        taxRate: l.taxRate,
      })),
      notes: quote.notes,
      payMethod: quote.paymentMethod,
    });
  }

  function handlePrint(quote: QuoteRecord) {
    handleDownloadPdf(quote);
  }

  function handleSendWhatsApp(quote: QuoteRecord) {
    const phone = (quote.clientPhone || '').replace(/\D/g, '');
    if (!phone) {
      showToast('El presupuesto no tiene teléfono del cliente', 'error');
      return;
    }
    const msg = encodeURIComponent(
      `Hola ${quote.clientName}, le enviamos el presupuesto ${quote.number} por un total de ${formatCurrency(quote.total)}. ¿Tiene alguna consulta?`
    );
    window.open(`https://wa.me/${phone}?text=${msg}`, '_blank');
  }

  async function handleCreateSalesPoint() {
    if (!newSalesPointName.trim()) return;
    try {
      const sp = await createSalesPoint(userId, { name: newSalesPointName.trim(), active: true });
      setSalesPoints((prev) => [...prev, sp].sort((a, b) => a.name.localeCompare(b.name, 'es')));
      setForm((f) => ({ ...f, salesPointId: sp.id, salesPointName: sp.name }));
      setShowNewSalesPoint(false);
      setNewSalesPointName('');
      showToast(`Centro de trabajo "${sp.name}" creado`);
    } catch {
      showToast('Error al crear el centro de trabajo', 'error');
    }
  }

  function handleSelectSalesPoint(spId: string) {
    if (!spId) {
      setForm((f) => ({ ...f, salesPointId: '', salesPointName: '' }));
      return;
    }
    const sp = salesPoints.find((s) => s.id === spId);
    setForm((f) => ({ ...f, salesPointId: spId, salesPointName: sp?.name || '' }));
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <Layout title="Presupuestos" subtitle="Creación, seguimiento y conversión de presupuestos" noPadding>
      <div className="p-6 space-y-6">
        {/* CRM Navigation */}
        <CrmNav active="quotes" />

        {/* Tabs */}
        <div className="flex bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-x-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
          {([['list', 'Lista'], ['create', editingQuoteId ? 'Editar' : 'Nuevo']] as const).map(([tab, label], i) => {
            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                onClick={() => { if (tab === 'create' && !editingQuoteId) resetForm(); setActiveTab(tab as QuoteTab); if (tab === 'list') { loadQuotes(); setEditingQuoteId(null); } }}
                className={`relative flex-shrink-0 flex items-center gap-2 px-5 py-3.5 text-sm font-semibold transition-colors whitespace-nowrap ${
                  isActive ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
                } ${i !== 0 ? 'border-l border-gray-100 dark:border-gray-700' : ''}`}
              >
                {label}
                {isActive && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-500 rounded-t-full" />}
              </button>
            );
          })}
          {selectedQuote && (() => {
            const isActive = activeTab === 'detail';
            return (
              <button
                onClick={() => setActiveTab('detail')}
                className={`relative flex-shrink-0 flex items-center gap-2 px-5 py-3.5 text-sm font-semibold transition-colors whitespace-nowrap border-l border-gray-100 dark:border-gray-700 ${
                  isActive ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
                }`}
              >
                Detalle
                {isActive && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-500 rounded-t-full" />}
              </button>
            );
          })()}
        </div>

        {/* ── LIST TAB ── */}
        {activeTab === 'list' && (
          <>
            {/* Search & Actions */}
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500 pointer-events-none" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={`Buscar por cliente, número, ${terms.MARTE.toLowerCase()}...`}
                  className="w-full pl-9 pr-4 py-2.5 border-2 border-gray-200 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-gray-900 dark:focus:border-gray-400 outline-none"
                />
              </div>
              <AddButtonDropdown
                label="Nuevo presupuesto"
                onQuickAdd={() => { resetForm(); setActiveTab('create'); }}
                onAIAdd={() => { showToast('Próximamente: creación de presupuestos con IA'); }}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de nuevo presupuesto"
              />
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3">
              {salesPoints.length > 0 && (
                <div className="relative">
                  <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 dark:text-gray-500 pointer-events-none" />
                  <select
                    value={salesPointFilter}
                    onChange={(e) => setSalesPointFilter(e.target.value)}
                    className="pl-8 pr-3 py-2 text-sm border-2 border-gray-200 dark:border-gray-600 rounded-xl outline-none bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200"
                  >
                    <option value="all">Todos los centros</option>
                    {salesPoints.map((sp) => (
                      <option key={sp.id} value={sp.id}>{sp.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex gap-2 flex-wrap">
                {(['all', 'draft', 'sent', 'approved', 'rejected', 'expired', 'converted'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                      statusFilter === s
                        ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 border-gray-900 dark:border-gray-100'
                        : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    {s === 'all' ? 'Todos' : STATUS_CONFIG[s].label}
                  </button>
                ))}
              </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <KPICard label="Total presupuestos" value={String(kpis.total)} icon={FileText} color="bg-blue-500" />
              <KPICard label="Pendientes de respuesta" value={String(kpis.pending)} icon={Clock} color="bg-amber-500" />
              <KPICard label="Aprobados" value={String(kpis.approved)} icon={CheckCircle2} color="bg-emerald-500" />
              <KPICard label="Tasa de conversión" value={`${kpis.conversionRate}%`} sub={formatCurrency(kpis.totalValue) + ' en cartera'} icon={TrendingUp} color="bg-purple-500" />
            </div>

            {/* Table */}
            {loading ? (
              <div className="flex items-center justify-center py-16 text-slate-400 dark:text-gray-500 text-sm">Cargando...</div>
            ) : filtered.length === 0 ? (
              <EmptyState onNew={() => { resetForm(); setActiveTab('create'); }} />
            ) : (
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-slate-200 dark:border-gray-700 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[900px]">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-gray-700 bg-slate-50 dark:bg-gray-800/80">
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wide">Nº</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wide">Cliente</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wide">{terms.MARTE}</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wide">Centro de trabajo</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wide">Total</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wide">Estado</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wide">Válido hasta</th>
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedItems.map((quote) => {
                        const days = daysUntil(quote.validUntil);
                        return (
                          <tr
                            key={quote.id}
                            className="border-b border-slate-50 dark:border-gray-700/50 hover:bg-slate-50/50 dark:hover:bg-gray-700/30 transition-colors cursor-pointer"
                            onClick={() => { setSelectedQuote(quote); setActiveTab('detail'); }}
                          >
                            <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-700 dark:text-gray-300">{quote.number}</td>
                            <td className="px-4 py-3">
                              <p className="font-medium text-slate-900 dark:text-gray-100">{quote.clientName}</p>
                              <p className="text-xs text-slate-400 dark:text-gray-500">{quote.clientEmail}</p>
                            </td>
                            <td className="px-4 py-3 text-slate-600 dark:text-gray-400 text-xs">{quote.vehicleName || '—'}</td>
                            <td className="px-4 py-3">
                              {quote.salesPointName ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-800">
                                  <MapPin className="w-3 h-3" />{quote.salesPointName}
                                </span>
                              ) : <span className="text-slate-400 dark:text-gray-500 text-xs">—</span>}
                            </td>
                            <td className="px-4 py-3 text-right font-semibold text-slate-900 dark:text-gray-100">{formatCurrency(quote.total)}</td>
                            <td className="px-4 py-3"><StatusBadge status={quote.status} /></td>
                            <td className="px-4 py-3">
                              <p className="text-xs text-slate-600 dark:text-gray-400">{formatDate(quote.validUntil)}</p>
                              {quote.status === 'sent' && (
                                <p className={`text-xs ${days < 0 ? 'text-red-500' : days <= 5 ? 'text-amber-500' : 'text-slate-400 dark:text-gray-500'}`}>
                                  {days < 0 ? 'Vencido' : `${days} días restantes`}
                                </p>
                              )}
                            </td>
                            <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={(e) => {
                                  if (actionMenuId === quote.id) {
                                    setActionMenuId(null);
                                    setActionMenuPos(null);
                                  } else {
                                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                    setActionMenuId(quote.id);
                                    setActionMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
                                  }
                                }}
                                className="p-1.5 rounded-lg text-slate-400 dark:text-gray-500 hover:bg-slate-100 dark:hover:bg-gray-700 transition-colors"
                              >
                                <MoreHorizontal className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <Pagination pagination={pagination} />
              </div>
            )}
          </>
        )}

        {/* ── CREATE TAB ── */}
        {activeTab === 'create' && (
          <div className="max-w-4xl mx-auto space-y-6">

            {/* ─── Section 1: Client ─── */}
            <div className={cardCls}>
              <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                <h2 className="text-base font-semibold text-slate-900 dark:text-gray-100 flex items-center gap-2">
                  <span className={stepBadgeCls}>1</span>
                  Datos del cliente
                </h2>
                <div className="flex bg-slate-100 dark:bg-gray-700 rounded-lg p-0.5">
                  <button
                    type="button"
                    onClick={() => setClientMode('search')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      clientMode === 'search'
                        ? 'bg-white dark:bg-gray-600 text-slate-900 dark:text-gray-100 shadow-sm'
                        : 'text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200'
                    }`}
                  >
                    <Search className="w-3 h-3" />
                    Existente
                  </button>
                  <button
                    type="button"
                    onClick={() => setClientMode('new')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      clientMode === 'new'
                        ? 'bg-white dark:bg-gray-600 text-slate-900 dark:text-gray-100 shadow-sm'
                        : 'text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200'
                    }`}
                  >
                    <UserPlus className="w-3 h-3" />
                    Nuevo rápido
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowNuevoClienteModal(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors"
                  >
                    <UserPlus className="w-3 h-3" />
                    + Nuevo completo
                  </button>
                </div>
              </div>

              {clientMode === 'search' && (
                <div className="mb-4">
                  <label className={labelCls}>Buscar cliente existente</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-gray-500 pointer-events-none" />
                    <input
                      value={clientSearchQuery}
                      onChange={(e) => {
                        setClientSearchQuery(e.target.value);
                        setShowClientResults(true);
                      }}
                      onFocus={() => setShowClientResults(true)}
                      onBlur={() => setTimeout(() => setShowClientResults(false), 120)}
                      placeholder="Busca por nombre, email, teléfono o DNI"
                      className={`${inputCls} pl-9`}
                    />
                    {showClientResults && (
                      <div className="absolute z-20 mt-1 w-full bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-600 rounded-lg shadow-lg overflow-hidden">
                        {isLoadingClients ? (
                          <p className="px-3 py-2 text-sm text-slate-500 dark:text-gray-400">Cargando clientes...</p>
                        ) : filteredClients.length === 0 ? (
                          <p className="px-3 py-2 text-sm text-slate-500 dark:text-gray-400">No hay resultados para esta búsqueda</p>
                        ) : (
                          <div className="max-h-56 overflow-y-auto">
                            {filteredClients.map((client) => (
                              <button
                                key={client.id}
                                type="button"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  handleSelectExistingClient(client);
                                }}
                                className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-gray-700 border-b border-slate-100 dark:border-gray-700 last:border-0 transition-colors"
                              >
                                <p className="text-sm font-medium text-slate-900 dark:text-gray-100">{client.name}</p>
                                <p className="text-xs text-slate-500 dark:text-gray-400">{client.email}{client.phone ? ` · ${client.phone}` : ''}</p>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">Al seleccionar un cliente se completan sus datos automáticamente.</p>
                </div>
              )}

              {clientMode === 'new' && (
                <div className="mb-4 p-3 rounded-lg bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800/40">
                  <p className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                    <UserPlus className="w-3.5 h-3.5" />
                    Introduce los datos del nuevo cliente directamente.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className={labelCls}>Nombre completo *</label>
                  <input
                    value={form.clientName}
                    onChange={(e) => setForm((f) => ({ ...f, clientName: e.target.value }))}
                    className={inputCls}
                    placeholder="Ej: Juan García López"
                  />
                </div>
                <div>
                  <label className={labelCls}>Email *</label>
                  <input
                    type="email"
                    value={form.clientEmail}
                    onChange={(e) => setForm((f) => ({ ...f, clientEmail: e.target.value }))}
                    className={inputCls}
                    placeholder="cliente@ejemplo.com"
                  />
                </div>
                <div>
                  <label className={labelCls}>Teléfono</label>
                  <input
                    value={form.clientPhone}
                    onChange={(e) => setForm((f) => ({ ...f, clientPhone: e.target.value }))}
                    className={inputCls}
                    placeholder="+34 600 000 000"
                  />
                </div>
              </div>
            </div>

            {/* ─── Section 2: Quote metadata ─── */}
            <div className={cardCls}>
              <h2 className="text-base font-semibold text-slate-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                <span className={stepBadgeCls}>2</span>
                Datos del presupuesto
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className={labelCls}>
                    <Calendar className="w-3 h-3 inline mr-1" />Fecha del presupuesto
                  </label>
                  <input
                    type="date"
                    value={form.quoteDate}
                    onChange={(e) => updateQuoteDate(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Validez (días)</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min={1}
                      value={form.validityDays}
                      onChange={(e) => updateValidityDays(Math.max(1, Number(e.target.value)))}
                      className={`${inputCls} flex-1`}
                    />
                  </div>
                  <div className="flex gap-1.5 mt-1.5 flex-wrap">
                    {VALIDITY_PRESETS.map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => updateValidityDays(d)}
                        className={`px-2 py-0.5 text-[10px] rounded-md font-medium transition-colors ${
                          form.validityDays === d
                            ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                            : 'bg-slate-100 dark:bg-gray-700 text-slate-500 dark:text-gray-400 hover:bg-slate-200 dark:hover:bg-gray-600'
                        }`}
                      >
                        {d}d
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-slate-400 dark:text-gray-500 mt-1">
                    Hasta: {formatDate(form.validUntil)}
                  </p>
                </div>
                <div>
                  <label className={labelCls}>
                    <Hash className="w-3 h-3 inline mr-1" />Referencia interna
                  </label>
                  <input
                    value={form.reference}
                    onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))}
                    className={inputCls}
                    placeholder="Ej: OBR-2026-015"
                  />
                  <p className="text-[10px] text-slate-400 dark:text-gray-500 mt-1">Código o referencia libre</p>
                </div>
                <div>
                  <label className={labelCls}>Forma de pago</label>
                  <select
                    value={form.paymentMethod}
                    onChange={(e) => setForm((f) => ({ ...f, paymentMethod: e.target.value }))}
                    className={selectCls}
                  >
                    {PAY_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* ─── Section 3: Lines ─── */}
            <div className={cardCls}>
              <h2 className="text-base font-semibold text-slate-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                <span className={stepBadgeCls}>3</span>
                Líneas del presupuesto
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px]">
                  <thead>
                    <tr className="text-xs text-slate-500 dark:text-gray-400 border-b border-slate-100 dark:border-gray-700">
                      <th className="text-left py-2 pr-2 font-medium">Concepto</th>
                      <th className="text-center py-2 px-1 font-medium w-16">Cant.</th>
                      <th className="text-right py-2 px-1 font-medium w-28">Precio (€)</th>
                      <th className="text-center py-2 px-1 font-medium w-20">Dto. %</th>
                      <th className="text-center py-2 px-1 font-medium w-20">IVA %</th>
                      <th className="text-right py-2 pl-1 font-medium w-28">Total</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {form.lines.map((line, idx) => (
                      <LineRow
                        key={line.id}
                        line={line}
                        onChange={(updated) => updateLine(idx, updated)}
                        onRemove={() => removeLine(idx)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                onClick={addLine}
                className="mt-3 flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium transition-colors"
              >
                <Plus className="w-4 h-4" />
                Añadir línea
              </button>

              {/* Totals */}
              <div className="mt-4 border-t border-slate-100 dark:border-gray-700 pt-4 flex justify-end">
                <div className="space-y-1.5 text-sm w-72">
                  <div className="flex justify-between text-slate-600 dark:text-gray-400">
                    <span>Base imponible</span>
                    <span className="font-medium">{formatCurrency(totals.subtotal)}</span>
                  </div>
                  {totals.discountAmount > 0 && (
                    <div className="flex justify-between text-red-600 dark:text-red-400">
                      <span>Descuento</span>
                      <span className="font-medium">-{formatCurrency(totals.discountAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-slate-600 dark:text-gray-400">
                    <span>Impuestos</span>
                    <span className="font-medium">{formatCurrency(totals.taxAmount)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-slate-900 dark:text-gray-100 text-lg border-t border-slate-200 dark:border-gray-600 pt-2 mt-2">
                    <span>Total presupuesto</span>
                    <span>{formatCurrency(totals.total)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* ─── Section 4: Notes ─── */}
            <div className={cardCls}>
              <h2 className="text-base font-semibold text-slate-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                <span className={stepBadgeCls}>4</span>
                Notas
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Notas para el cliente</label>
                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    rows={3}
                    className={`${inputCls} resize-none`}
                    placeholder="Condiciones especiales, garantía incluida, etc."
                  />
                  <p className="text-[10px] text-slate-400 dark:text-gray-500 mt-1">Se mostrarán en el presupuesto enviado al cliente</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-amber-700 dark:text-amber-400 mb-1 flex items-center gap-1.5">
                    <Lock className="w-3 h-3" />
                    Notas internas
                  </label>
                  <textarea
                    value={form.internalNotes}
                    onChange={(e) => setForm((f) => ({ ...f, internalNotes: e.target.value }))}
                    rows={3}
                    className="w-full text-sm border border-amber-200 dark:border-amber-700/50 rounded-lg px-3 py-2 bg-amber-50/30 dark:bg-amber-900/10 text-slate-900 dark:text-gray-100 placeholder:text-slate-400 dark:placeholder:text-gray-500 resize-none focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400"
                    placeholder="Anotaciones internas, recordatorios..."
                  />
                  <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">Solo visible para empleados y gerente del negocio</p>
                </div>
              </div>
            </div>

            {/* ─── Section 5: Extra options (collapsible) ─── */}
            <div className={cardCls}>
              <button
                type="button"
                onClick={() => setShowExtraOptions(!showExtraOptions)}
                className="w-full flex items-center justify-between text-sm font-medium text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-gray-200 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <ChevronDown className={`w-4 h-4 transition-transform ${showExtraOptions ? 'rotate-180' : ''}`} />
                  Opciones adicionales
                </span>
                <span className="text-xs text-slate-400 dark:text-gray-500">
                  {terms.MARTE}, centro de trabajo
                </span>
              </button>
              {showExtraOptions && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 pt-4 border-t border-slate-100 dark:border-gray-700">
                  <div>
                    <label className={labelCls}>Nombre / Descripción ({terms.MARTE})</label>
                    <input
                      value={form.vehicleName}
                      onChange={(e) => setForm((f) => ({ ...f, vehicleName: e.target.value }))}
                      className={inputCls}
                      placeholder={terms.namePlaceholder}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>{terms.plateLabel}</label>
                    <input
                      value={form.vehiclePlate}
                      onChange={(e) => setForm((f) => ({ ...f, vehiclePlate: e.target.value }))}
                      className={inputCls}
                      placeholder="1234 ABC"
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Centro de trabajo</label>
                    {showNewSalesPoint ? (
                      <div className="flex gap-2">
                        <input
                          autoFocus
                          value={newSalesPointName}
                          onChange={(e) => setNewSalesPointName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleCreateSalesPoint(); if (e.key === 'Escape') setShowNewSalesPoint(false); }}
                          placeholder="Nombre del centro de trabajo"
                          className={`${inputCls} flex-1`}
                        />
                        <button type="button" onClick={handleCreateSalesPoint} className="px-3 py-2 bg-indigo-600 text-white text-xs rounded-lg hover:bg-indigo-700 transition-colors">Crear</button>
                        <button type="button" onClick={() => setShowNewSalesPoint(false)} className="px-3 py-2 border border-slate-200 dark:border-gray-600 text-slate-600 dark:text-gray-400 text-xs rounded-lg hover:bg-slate-50 dark:hover:bg-gray-700 transition-colors">Cancelar</button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <select
                          value={form.salesPointId}
                          onChange={(e) => handleSelectSalesPoint(e.target.value)}
                          className={`${selectCls} flex-1`}
                        >
                          <option value="">Sin centro de trabajo</option>
                          {salesPoints.filter((sp) => sp.active).map((sp) => (
                            <option key={sp.id} value={sp.id}>{sp.name}</option>
                          ))}
                        </select>
                        <button type="button" onClick={() => setShowNewSalesPoint(true)} className="px-3 py-2 border border-dashed border-indigo-300 dark:border-indigo-600 text-indigo-600 dark:text-indigo-400 text-xs rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors whitespace-nowrap flex items-center gap-1">
                          <MapPin className="w-3 h-3" /> Nuevo
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3 justify-end flex-wrap">
              <button
                onClick={() => { resetForm(); setActiveTab(editingQuoteId ? 'detail' : 'list'); }}
                className="px-4 py-2 text-sm text-slate-600 dark:text-gray-400 border border-slate-200 dark:border-gray-600 rounded-xl hover:bg-slate-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancelar
              </button>
              {editingQuoteId ? (
                <button
                  disabled={saving}
                  onClick={handleSaveEdit}
                  className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {saving ? 'Guardando...' : 'Guardar cambios'}
                </button>
              ) : (
                <>
                  <button
                    disabled={saving}
                    onClick={() => handleCreate(true)}
                    className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-gray-300 border border-slate-300 dark:border-gray-600 rounded-xl hover:bg-slate-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
                  >
                    <PenLine className="w-4 h-4 inline mr-1.5" />
                    Guardar borrador
                  </button>
                  <button
                    disabled={saving}
                    onClick={() => handleCreate(false)}
                    className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm"
                  >
                    <Send className="w-4 h-4" />
                    {saving ? 'Guardando...' : 'Crear y enviar'}
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* ── DETAIL TAB ── */}
        {activeTab === 'detail' && selectedQuote && (
          <div className="max-w-3xl mx-auto">
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-slate-200 dark:border-gray-700 overflow-hidden">
              {/* Detail header */}
              <div className="p-6 border-b border-slate-100 dark:border-gray-700">
                <div className="flex items-start justify-between mb-3 gap-4">
                  <div className="flex items-start gap-4">
                    <div className="hidden sm:flex flex-col items-center gap-2 rounded-xl border border-slate-200 dark:border-gray-600 p-2 bg-slate-50 dark:bg-gray-700/50">
                      <img
                        src={buildQuoteQrUrl(selectedQuote.id)}
                        alt={`QR ${selectedQuote.number}`}
                        className="w-20 h-20 rounded-lg bg-white"
                      />
                      <p className="text-[10px] text-slate-500 dark:text-gray-400 font-mono">[{selectedQuote.id.slice(-8)}]</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 dark:text-gray-400 mb-0.5">Presupuesto</p>
                      <h2 className="text-xl font-bold text-slate-900 dark:text-gray-100 font-mono">{selectedQuote.number}</h2>
                      {selectedQuote.reference && (
                        <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5 flex items-center gap-1">
                          <Hash className="w-3 h-3" /> Ref: {selectedQuote.reference}
                        </p>
                      )}
                    </div>
                  </div>
                  <StatusBadge status={selectedQuote.status} />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mt-4">
                  <div>
                    <p className="text-xs text-slate-500 dark:text-gray-400">Cliente</p>
                    <p className="font-medium text-slate-900 dark:text-gray-100">{selectedQuote.clientName}</p>
                    <p className="text-xs text-slate-400 dark:text-gray-500">{selectedQuote.clientEmail}</p>
                    {selectedQuote.clientPhone && (
                      <p className="text-xs text-slate-400 dark:text-gray-500 flex items-center gap-1 mt-0.5">
                        <Phone className="w-3 h-3" /> {selectedQuote.clientPhone}
                      </p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-gray-400">{terms.MARTE}</p>
                    <p className="font-medium text-slate-900 dark:text-gray-100">{selectedQuote.vehicleName || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-gray-400">Fecha</p>
                    <p className="font-medium text-slate-900 dark:text-gray-100">{formatDate(selectedQuote.quoteDate || selectedQuote.createdAt)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-gray-400">Válido hasta</p>
                    <p className="font-medium text-slate-900 dark:text-gray-100">{formatDate(selectedQuote.validUntil)}</p>
                  </div>
                </div>
                {selectedQuote.salesPointName && (
                  <div className="mt-3 flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-indigo-500" />
                    <span className="text-xs text-slate-500 dark:text-gray-400">Centro de trabajo:</span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-800">
                      {selectedQuote.salesPointName}
                    </span>
                  </div>
                )}
              </div>

              {/* Lines */}
              <div className="p-6 border-b border-slate-100 dark:border-gray-700">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-gray-300 mb-3">Líneas</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[700px]">
                    <thead>
                      <tr className="text-xs text-slate-500 dark:text-gray-400 border-b border-slate-100 dark:border-gray-700">
                        <th className="text-left py-1 font-medium">Concepto</th>
                        <th className="text-center py-1 font-medium">Cant.</th>
                        <th className="text-right py-1 font-medium">Precio</th>
                        <th className="text-center py-1 font-medium">Dto.</th>
                        <th className="text-center py-1 font-medium">IVA</th>
                        <th className="text-right py-1 font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedQuote.lines.map((line) => (
                        <tr key={line.id} className="border-b border-slate-50 dark:border-gray-700/50">
                          <td className="py-2 text-slate-900 dark:text-gray-100">{line.description}</td>
                          <td className="py-2 text-center text-slate-700 dark:text-gray-300">{line.quantity}</td>
                          <td className="py-2 text-right text-slate-700 dark:text-gray-300">{formatCurrency(line.unitPrice)}</td>
                          <td className="py-2 text-center text-slate-500 dark:text-gray-400">{line.discountPercent > 0 ? `${line.discountPercent}%` : '—'}</td>
                          <td className="py-2 text-center text-slate-500 dark:text-gray-400">{line.taxRate}%</td>
                          <td className="py-2 text-right font-medium text-slate-900 dark:text-gray-100">{formatCurrency(line.lineTotal)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-4 flex justify-end">
                  <div className="space-y-1.5 text-sm w-64">
                    <div className="flex justify-between text-slate-600 dark:text-gray-400">
                      <span>Base imponible</span>
                      <span>{formatCurrency(selectedQuote.subtotal)}</span>
                    </div>
                    {selectedQuote.discountAmount > 0 && (
                      <div className="flex justify-between text-red-600 dark:text-red-400">
                        <span>Descuento</span>
                        <span>-{formatCurrency(selectedQuote.discountAmount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-slate-600 dark:text-gray-400">
                      <span>Impuestos</span>
                      <span>{formatCurrency(selectedQuote.taxAmount)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-slate-900 dark:text-gray-100 border-t border-slate-200 dark:border-gray-600 pt-1.5 mt-1.5 text-base">
                      <span>Total</span>
                      <span>{formatCurrency(selectedQuote.total)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Client notes */}
              {selectedQuote.notes && (
                <div className="px-6 py-4 border-b border-slate-100 dark:border-gray-700 bg-slate-50/50 dark:bg-gray-800/50">
                  <p className="text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wide mb-1">Notas para el cliente</p>
                  <p className="text-sm text-slate-700 dark:text-gray-300">{selectedQuote.notes}</p>
                </div>
              )}

              {/* Internal notes */}
              {selectedQuote.internalNotes && (
                <div className="px-6 py-4 border-b border-slate-100 dark:border-gray-700 bg-amber-50/40 dark:bg-amber-900/10">
                  <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide mb-1 flex items-center gap-1.5">
                    <Lock className="w-3 h-3" /> Notas internas
                  </p>
                  <p className="text-sm text-slate-700 dark:text-gray-300">{selectedQuote.internalNotes}</p>
                </div>
              )}

              {/* Actions */}
              <div className="p-6 flex flex-wrap gap-3">
                {(selectedQuote.status === 'draft' || selectedQuote.status === 'sent') && (
                  <button
                    onClick={() => handleStartEdit(selectedQuote)}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-700/50 bg-amber-50 dark:bg-amber-900/20 rounded-xl hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
                  >
                    <PenLine className="w-4 h-4" />
                    Editar
                  </button>
                )}
                <button
                  onClick={() => handlePrint(selectedQuote)}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-slate-700 dark:text-gray-300 border border-slate-200 dark:border-gray-600 rounded-xl hover:bg-slate-50 dark:hover:bg-gray-700 transition-colors"
                >
                  <Printer className="w-4 h-4" />
                  Imprimir / PDF
                </button>
                {selectedQuote.status === 'draft' && (
                  <button
                    onClick={() => handleSend(selectedQuote)}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-700/50 bg-blue-50 dark:bg-blue-900/20 rounded-xl hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
                  >
                    <Mail className="w-4 h-4" />
                    Enviar por email
                  </button>
                )}
                {selectedQuote.clientPhone && (
                  <button
                    onClick={() => handleSendWhatsApp(selectedQuote)}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-green-700 dark:text-green-400 border border-green-200 dark:border-green-700/50 bg-green-50 dark:bg-green-900/20 rounded-xl hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
                  >
                    <MessageCircle className="w-4 h-4" />
                    WhatsApp
                  </button>
                )}
                {selectedQuote.status === 'sent' && (
                  <>
                    <button
                      onClick={() => handleApprove(selectedQuote)}
                      className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-700/50 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors"
                    >
                      <ThumbsUp className="w-4 h-4" />
                      Aprobar
                    </button>
                    <button
                      onClick={() => handleReject(selectedQuote)}
                      className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-700 dark:text-red-400 border border-red-200 dark:border-red-700/50 bg-red-50 dark:bg-red-900/20 rounded-xl hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                    >
                      <ThumbsDown className="w-4 h-4" />
                      Rechazar
                    </button>
                  </>
                )}
                {(selectedQuote.status === 'approved' || selectedQuote.status === 'sent') && selectedQuote.status !== 'converted' && (
                  <button
                    onClick={() => setShowConvertModal(true)}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-purple-600 to-blue-600 rounded-xl hover:from-purple-700 hover:to-blue-700 transition-all shadow-sm"
                  >
                    <Zap className="w-4 h-4" />
                    Convertir con un clic
                  </button>
                )}
                <div className="flex-1" />
                <button
                  onClick={() => handleDelete(selectedQuote)}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-red-600 dark:text-red-400 border border-red-200 dark:border-red-700/50 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  Eliminar
                </button>
              </div>

              {/* Conversion info if already converted */}
              {selectedQuote.status === 'converted' && (
                <div className="px-6 pb-4">
                  <div className="flex items-center gap-2 text-sm text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700/50 rounded-lg px-4 py-2.5">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Presupuesto convertido</span>
                    {selectedQuote.convertedToSaleId && (
                      <button
                        onClick={() => navigate(`/saas/sales/${selectedQuote.convertedToSaleId}`)}
                        className="ml-2 underline hover:no-underline font-medium"
                      >
                        Ver venta →
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── CONVERSION MODAL ── */}
        {showConvertModal && selectedQuote && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowConvertModal(false)}>
            <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-gray-700 bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20">
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-gray-100 text-lg flex items-center gap-2">
                    <Zap className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                    Convertir presupuesto
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-gray-400 mt-0.5">{selectedQuote.number} · {formatCurrency(selectedQuote.total)}</p>
                </div>
                <button onClick={() => setShowConvertModal(false)} className="text-slate-400 dark:text-gray-500 hover:text-slate-600 dark:hover:text-gray-300">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 space-y-3">
                <p className="text-sm text-slate-600 dark:text-gray-400 mb-4">
                  Selecciona el tipo de documento que deseas crear a partir de este presupuesto:
                </p>

                {[
                  {
                    target: 'reservation' as ConversionTarget,
                    icon: '🤝',
                    title: 'Reserva',
                    desc: `Crea una venta en estado "Reservada" y bloquea el ${terms.MARTE.toLowerCase()}`,
                    color: 'border-amber-200 dark:border-amber-700/50 hover:bg-amber-50 dark:hover:bg-amber-900/20',
                    badge: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
                  },
                  {
                    target: 'sale' as ConversionTarget,
                    icon: '🚗',
                    title: 'Venta',
                    desc: 'Genera directamente una venta cerrada con todos los datos',
                    color: 'border-blue-200 dark:border-blue-700/50 hover:bg-blue-50 dark:hover:bg-blue-900/20',
                    badge: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
                  },
                  {
                    target: 'invoice' as ConversionTarget,
                    icon: '🧾',
                    title: 'Factura',
                    desc: 'Emite una factura al cliente con los importes del presupuesto',
                    color: 'border-emerald-200 dark:border-emerald-700/50 hover:bg-emerald-50 dark:hover:bg-emerald-900/20',
                    badge: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
                  },
                ].map(({ target, icon, title, desc, color, badge }) => (
                  <button
                    key={target}
                    onClick={() => handleConvert(selectedQuote, target)}
                    disabled={converting}
                    className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left disabled:opacity-50 ${color}`}
                  >
                    <span className="text-2xl">{icon}</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900 dark:text-gray-100">{title}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge}`}>
                          {title}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">{desc}</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-400 dark:text-gray-500" />
                  </button>
                ))}
              </div>
              <div className="px-6 pb-6">
                <button
                  onClick={() => setShowConvertModal(false)}
                  className="w-full py-2 text-sm text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Action menu dropdown (rendered outside overflow containers) */}
      {actionMenuId && actionMenuPos && (() => {
        const quote = quotes.find((q) => q.id === actionMenuId);
        if (!quote) return null;
        return (
          <>
            <div className="fixed inset-0 z-40" onClick={() => { setActionMenuId(null); setActionMenuPos(null); }} />
            <div
              className="fixed z-50 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-xl shadow-lg py-1 w-44"
              style={{ top: actionMenuPos.top, right: actionMenuPos.right }}
            >
              <button
                onClick={() => { setSelectedQuote(quote); setActiveTab('detail'); setActionMenuId(null); setActionMenuPos(null); }}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-700 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-gray-700"
              >
                <Eye className="w-4 h-4" /> Ver detalle
              </button>
              <button
                onClick={() => { handleDownloadPdf(quote); setActionMenuId(null); setActionMenuPos(null); }}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-700 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-gray-700"
              >
                <Download className="w-4 h-4" /> Descargar PDF
              </button>
              {quote.status === 'draft' && (
                <button
                  onClick={() => { handleSend(quote); setActionMenuId(null); setActionMenuPos(null); }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                >
                  <Send className="w-4 h-4" /> Enviar por email
                </button>
              )}
              {quote.status === 'sent' && (
                <>
                  <button
                    onClick={() => { handleApprove(quote); setActionMenuId(null); setActionMenuPos(null); }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                  >
                    <ThumbsUp className="w-4 h-4" /> Aprobar
                  </button>
                  <button
                    onClick={() => { handleReject(quote); setActionMenuId(null); setActionMenuPos(null); }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                  >
                    <ThumbsDown className="w-4 h-4" /> Rechazar
                  </button>
                </>
              )}
              <div className="border-t border-slate-100 dark:border-gray-700 my-1" />
              <button
                onClick={() => { handleDelete(quote); setActionMenuId(null); setActionMenuPos(null); }}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                <Trash2 className="w-4 h-4" /> Eliminar
              </button>
            </div>
          </>
        );
      })()}

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3 rounded-xl shadow-xl text-sm font-medium transition-all ${
            toast.type === 'success'
              ? 'bg-emerald-600 text-white'
              : toast.type === 'warning'
              ? 'bg-amber-500 text-white'
              : 'bg-red-600 text-white'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          ) : toast.type === 'warning' ? (
            <Clock className="w-4 h-4 flex-shrink-0" />
          ) : (
            <XCircle className="w-4 h-4 flex-shrink-0" />
          )}
          {toast.msg}
        </div>
      )}

      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Presupuestos"
        fields={QUOTE_IMPORT_FIELDS}
        onImport={async (entries) => {
          if (!userId) return;
          let created = 0;
          let nextSeq = quotes.length + 1;
          for (const entry of entries) {
            try {
              const lines: QuoteLine[] = [
                calcQuoteLine(
                  entry.concept || '',
                  Number(entry.quantity) || 1,
                  Number(entry.unitPrice) || 0,
                  0,
                  Number(entry.taxRate) || 21,
                ),
              ];
              const lineTotals = calcQuoteTotals(lines);
              const payload: CreateQuotePayload = {
                user_id: userId,
                status: 'draft',
                clientName: entry.clientName || '',
                clientEmail: 'importado@sin-email.local',
                validUntil: (entry.validUntil || '').trim() || defaultValidUntil(),
                paymentMethod: 'Transferencia',
                notes: entry.notes || undefined,
                lines,
                ...lineTotals,
                responsible: user ? `${user.firstName} ${user.lastName}` : undefined,
                companyName: business?.name,
                companyCif: business?.taxId,
                companyAddress: business?.address,
              };
              await createQuote(userId, payload, nextSeq);
              nextSeq += 1;
              created += 1;
            } catch { /* skip */ }
          }
          await loadQuotes();
          showToast(`${created} presupuesto(s) importado(s)`);
        }}
      />

      <NuevoClienteModal
        open={showNuevoClienteModal}
        onClose={() => setShowNuevoClienteModal(false)}
        onClientCreated={(client) => {
          setForm(prev => ({
            ...prev,
            clientName: client.name,
            clientEmail: client.email,
            clientPhone: client.phone || '',
          }));
          setClientSearchQuery(`${client.name} · ${client.email}`);
          setClientMode('search');
          setShowNuevoClienteModal(false);
          showToast(`Cliente "${client.name}" creado`);
        }}
        contexto="presupuesto"
        vincularA={{ tipo: 'presupuesto' }}
      />
    </Layout>
  );
}
