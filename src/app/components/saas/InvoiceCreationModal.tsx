import { useState, useEffect, useCallback, useMemo } from 'react';
import { useModalClose } from '../../hooks/useModalClose';
import {
  X, FileText, ClipboardList, Zap, RotateCcw, ReceiptText,
  ExternalLink, Search, ArrowLeft, Check, Calendar,
  User, Loader2, Receipt, AlertCircle, Minus,
} from 'lucide-react';
import { listQuotes, type QuoteRecord } from '../../lib/quotesApi';
import { listPurchaseOrdersRequest, type PurchaseOrder } from '../../lib/purchaseOrderApi';

// ─── Public types ────────────────────────────────────────────────────────────

export type InvoiceCreationType = 'direct' | 'from-quote' | 'from-order' | 'credit-note';

export interface SourceInvoice {
  id: string;
  number: string;
  clientId?: string;
  clientName: string;
  vehicleName: string;
  vehiclePlate: string;
  total: number;
  paid: number;
  date: string;
  dueDate: string;
  status: string;
  paymentMethod?: string;
  notes?: string;
}

export interface InvoiceTypeSelection {
  type: InvoiceCreationType;
  quote?: QuoteRecord;
  order?: PurchaseOrder;
  sourceInvoice?: SourceInvoice;
  creditNoteMode?: 'total' | 'partial';
  partialAmount?: number;
}

interface Props {
  userId: string;
  invoices: SourceInvoice[];
  onClose: () => void;
  onSelect: (selection: InvoiceTypeSelection) => void;
}

// ─── Step definitions ────────────────────────────────────────────────────────

type Step = 'type-select' | 'pick-quote' | 'pick-order' | 'pick-invoice' | 'credit-mode';

const TYPE_OPTIONS: {
  id: InvoiceCreationType;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  title: string;
  description: string;
  tag?: string;
  tagColor?: string;
}[] = [
  {
    id: 'from-quote',
    icon: FileText,
    iconBg: 'bg-blue-100 dark:bg-blue-900/40',
    iconColor: 'text-blue-600 dark:text-blue-400',
    title: 'Desde presupuesto',
    description: 'Convierte un presupuesto aprobado en factura',
    tag: 'Recomendado',
    tagColor: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
  },
  {
    id: 'from-order',
    icon: ClipboardList,
    iconBg: 'bg-violet-100 dark:bg-violet-900/40',
    iconColor: 'text-violet-600 dark:text-violet-400',
    title: 'Desde pedido / orden',
    description: 'Genera la factura a partir de un pedido existente',
  },
  {
    id: 'direct',
    icon: Zap,
    iconBg: 'bg-emerald-100 dark:bg-emerald-900/40',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
    title: 'Factura directa',
    description: 'Crea una factura desde cero con todos los datos',
  },
  {
    id: 'credit-note',
    icon: RotateCcw,
    iconBg: 'bg-amber-100 dark:bg-amber-900/40',
    iconColor: 'text-amber-600 dark:text-amber-400',
    title: 'Abono / Rectificativa',
    description: 'Genera un abono total o parcial sobre una factura existente',
  },
];

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  draft:    { label: 'Borrador',  cls: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' },
  sent:     { label: 'Enviado',   cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400' },
  approved: { label: 'Aprobado',  cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400' },
  pending:  { label: 'Pendiente', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400' },
  paid:     { label: 'Pagada',    cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400' },
  overdue:  { label: 'Vencida',   cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400' },
  partial:  { label: 'Parcial',   cls: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-400' },
  received: { label: 'Recibido',  cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400' },
  cancelled:{ label: 'Cancelado', cls: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' },
  converted:{ label: 'Convertido',cls: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-400' },
  rejected: { label: 'Rechazado', cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400' },
  expired:  { label: 'Expirado',  cls: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_LABELS[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600' };
  return <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap ${s.cls}`}>{s.label}</span>;
}

function fmtCurrency(n: number) {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '€';
}

function fmtDate(iso: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── Component ───────────────────────────────────────────────────────────────

export function InvoiceCreationModal({ userId, invoices, onClose, onSelect }: Props) {
  useModalClose(true, onClose);

  const [step, setStep] = useState<Step>('type-select');
  const [hoveredId, setHoveredId] = useState<InvoiceCreationType | null>(null);
  const [search, setSearch] = useState('');

  // Data for sub-steps
  const [quotes, setQuotes] = useState<QuoteRecord[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState('');

  // Credit note state
  const [selectedInvoice, setSelectedInvoice] = useState<SourceInvoice | null>(null);
  const [creditMode, setCreditMode] = useState<'total' | 'partial'>('total');
  const [partialAmount, setPartialAmount] = useState<number>(0);

  const fetchQuotes = useCallback(async () => {
    setLoading(true);
    setFetchError('');
    try {
      const data = await listQuotes(userId);
      setQuotes(data.filter(q => q.status === 'approved' || q.status === 'sent'));
    } catch {
      setFetchError('No se pudieron cargar los presupuestos');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setFetchError('');
    try {
      const data = await listPurchaseOrdersRequest(userId);
      setOrders(data.filter(o => o.status !== 'cancelled'));
    } catch {
      setFetchError('No se pudieron cargar los pedidos');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const handleTypeSelect = useCallback((type: InvoiceCreationType) => {
    if (type === 'direct') {
      onSelect({ type: 'direct' });
      return;
    }
    setSearch('');
    if (type === 'from-quote') {
      setStep('pick-quote');
      fetchQuotes();
    } else if (type === 'from-order') {
      setStep('pick-order');
      fetchOrders();
    } else if (type === 'credit-note') {
      setStep('pick-invoice');
    }
  }, [onSelect, fetchQuotes, fetchOrders]);

  const handleBack = useCallback(() => {
    if (step === 'credit-mode') {
      setStep('pick-invoice');
      setSelectedInvoice(null);
    } else {
      setStep('type-select');
      setSearch('');
      setFetchError('');
    }
  }, [step]);

  const handleQuoteSelect = useCallback((quote: QuoteRecord) => {
    onSelect({ type: 'from-quote', quote });
  }, [onSelect]);

  const handleOrderSelect = useCallback((order: PurchaseOrder) => {
    onSelect({ type: 'from-order', order });
  }, [onSelect]);

  const handleInvoiceSelect = useCallback((inv: SourceInvoice) => {
    setSelectedInvoice(inv);
    setPartialAmount(inv.total);
    setCreditMode('total');
    setStep('credit-mode');
  }, []);

  const handleCreditConfirm = useCallback(() => {
    if (!selectedInvoice) return;
    onSelect({
      type: 'credit-note',
      sourceInvoice: selectedInvoice,
      creditNoteMode: creditMode,
      partialAmount: creditMode === 'partial' ? partialAmount : selectedInvoice.total,
    });
  }, [onSelect, selectedInvoice, creditMode, partialAmount]);

  // Filtered lists
  const lowerSearch = search.toLowerCase();

  const filteredQuotes = useMemo(() => {
    if (!lowerSearch) return quotes;
    return quotes.filter(q =>
      q.number.toLowerCase().includes(lowerSearch) ||
      q.clientName.toLowerCase().includes(lowerSearch) ||
      (q.vehicleName || '').toLowerCase().includes(lowerSearch),
    );
  }, [quotes, lowerSearch]);

  const filteredOrders = useMemo(() => {
    if (!lowerSearch) return orders;
    return orders.filter(o =>
      o.orderNumber.toLowerCase().includes(lowerSearch) ||
      o.supplierName.toLowerCase().includes(lowerSearch),
    );
  }, [orders, lowerSearch]);

  const filteredInvoices = useMemo(() => {
    const eligible = invoices.filter(i => !i.number.startsWith('ABONO-'));
    if (!lowerSearch) return eligible;
    return eligible.filter(i =>
      i.number.toLowerCase().includes(lowerSearch) ||
      i.clientName.toLowerCase().includes(lowerSearch) ||
      i.vehicleName.toLowerCase().includes(lowerSearch),
    );
  }, [invoices, lowerSearch]);

  // ─── Titles by step ───
  const stepMeta: Record<Step, { title: string; subtitle: string }> = {
    'type-select': { title: 'Nueva factura', subtitle: 'Selecciona cómo quieres crear la factura' },
    'pick-quote':  { title: 'Seleccionar presupuesto', subtitle: 'Elige un presupuesto aprobado para convertirlo en factura' },
    'pick-order':  { title: 'Seleccionar pedido', subtitle: 'Elige un pedido para generar su factura' },
    'pick-invoice':{ title: 'Seleccionar factura', subtitle: 'Elige la factura sobre la que generar el abono' },
    'credit-mode': { title: 'Tipo de abono', subtitle: `Abono sobre ${selectedInvoice?.number || 'factura'}` },
  };

  const meta = stepMeta[step];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-800 w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[94dvh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
          <div className="flex items-center gap-3">
            {step !== 'type-select' && (
              <button onClick={handleBack} className="p-1.5 -ml-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors">
                <ArrowLeft className="w-5 h-5 text-gray-400" />
              </button>
            )}
            <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-900/40 rounded-xl flex items-center justify-center">
              <ReceiptText className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">{meta.title}</h2>
              <p className="text-xs text-gray-400 dark:text-gray-500">{meta.subtitle}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {step === 'type-select' && (
            <StepTypeSelect
              hoveredId={hoveredId}
              onHover={setHoveredId}
              onSelect={handleTypeSelect}
            />
          )}
          {step === 'pick-quote' && (
            <StepPickList
              search={search}
              onSearchChange={setSearch}
              loading={loading}
              error={fetchError}
              emptyText="No hay presupuestos aprobados o enviados"
              searchPlaceholder="Buscar por nº, cliente o vehículo…"
            >
              {filteredQuotes.map(q => (
                <PickItem key={q.id} onClick={() => handleQuoteSelect(q)}>
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center flex-shrink-0">
                      <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">{q.number}</p>
                        <StatusBadge status={q.status} />
                      </div>
                      <p className="text-xs text-gray-400 dark:text-gray-500 truncate">
                        <span className="inline-flex items-center gap-1"><User className="w-3 h-3" />{q.clientName}</span>
                        {q.vehicleName && <span className="ml-2">· {q.vehicleName}</span>}
                      </p>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{fmtCurrency(q.total)}</p>
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 flex items-center justify-end gap-1"><Calendar className="w-3 h-3" />{fmtDate(q.createdAt)}</p>
                  </div>
                </PickItem>
              ))}
            </StepPickList>
          )}
          {step === 'pick-order' && (
            <StepPickList
              search={search}
              onSearchChange={setSearch}
              loading={loading}
              error={fetchError}
              emptyText="No hay pedidos disponibles"
              searchPlaceholder="Buscar por nº de pedido o proveedor…"
            >
              {filteredOrders.map(o => (
                <PickItem key={o.id} onClick={() => handleOrderSelect(o)}>
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center flex-shrink-0">
                      <ClipboardList className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">{o.orderNumber}</p>
                        <StatusBadge status={o.status} />
                      </div>
                      <p className="text-xs text-gray-400 dark:text-gray-500 truncate">
                        {o.supplierName} · {o.items.length} artículo{o.items.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{fmtCurrency(o.total)}</p>
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 flex items-center justify-end gap-1"><Calendar className="w-3 h-3" />{fmtDate(o.createdAt)}</p>
                  </div>
                </PickItem>
              ))}
            </StepPickList>
          )}
          {step === 'pick-invoice' && (
            <StepPickList
              search={search}
              onSearchChange={setSearch}
              loading={false}
              error=""
              emptyText="No hay facturas disponibles para abonar"
              searchPlaceholder="Buscar por nº de factura, cliente o vehículo…"
            >
              {filteredInvoices.map(inv => (
                <PickItem key={inv.id} onClick={() => handleInvoiceSelect(inv)}>
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center flex-shrink-0">
                      <Receipt className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">{inv.number}</p>
                        <StatusBadge status={inv.status} />
                      </div>
                      <p className="text-xs text-gray-400 dark:text-gray-500 truncate">
                        <span className="inline-flex items-center gap-1"><User className="w-3 h-3" />{inv.clientName}</span>
                        {inv.vehicleName && <span className="ml-2">· {inv.vehicleName}</span>}
                      </p>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{fmtCurrency(inv.total)}</p>
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 flex items-center justify-end gap-1"><Calendar className="w-3 h-3" />{fmtDate(inv.date)}</p>
                  </div>
                </PickItem>
              ))}
            </StepPickList>
          )}
          {step === 'credit-mode' && selectedInvoice && (
            <StepCreditMode
              invoice={selectedInvoice}
              creditMode={creditMode}
              setCreditMode={setCreditMode}
              partialAmount={partialAmount}
              setPartialAmount={setPartialAmount}
              onConfirm={handleCreditConfirm}
            />
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80 flex-shrink-0">
          <button
            onClick={onClose}
            className="w-full py-2.5 text-sm font-semibold text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 rounded-xl transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StepTypeSelect({
  hoveredId,
  onHover,
  onSelect,
}: {
  hoveredId: InvoiceCreationType | null;
  onHover: (id: InvoiceCreationType | null) => void;
  onSelect: (id: InvoiceCreationType) => void;
}) {
  return (
    <div className="p-4 sm:p-5 space-y-2.5">
      {TYPE_OPTIONS.map((opt) => {
        const Icon = opt.icon;
        const isHovered = hoveredId === opt.id;
        return (
          <button
            key={opt.id}
            onClick={() => onSelect(opt.id)}
            onMouseEnter={() => onHover(opt.id)}
            onMouseLeave={() => onHover(null)}
            className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left group ${
              isHovered
                ? 'border-emerald-400 dark:border-emerald-500 bg-emerald-50/50 dark:bg-emerald-900/10 shadow-sm'
                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform ${opt.iconBg} ${isHovered ? 'scale-110' : ''}`}>
              <Icon className={`w-5 h-5 ${opt.iconColor}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{opt.title}</p>
                {opt.tag && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${opt.tagColor}`}>{opt.tag}</span>
                )}
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 leading-relaxed">{opt.description}</p>
            </div>
            <ExternalLink className={`w-4 h-4 flex-shrink-0 transition-all ${isHovered ? 'text-emerald-500 translate-x-0.5' : 'text-gray-300 dark:text-gray-600'}`} />
          </button>
        );
      })}
    </div>
  );
}

function StepPickList({
  search,
  onSearchChange,
  loading,
  error,
  emptyText,
  searchPlaceholder,
  children,
}: {
  search: string;
  onSearchChange: (v: string) => void;
  loading: boolean;
  error: string;
  emptyText: string;
  searchPlaceholder: string;
  children: React.ReactNode;
}) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : !!children;

  return (
    <div className="p-4 sm:p-5 space-y-3">
      <div className="relative">
        <Search className="w-4 h-4 text-gray-400 dark:text-gray-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-full pl-10 pr-4 py-2.5 text-sm border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-blue-500 focus:outline-none transition-all bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400"
        />
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      )}

      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
        </div>
      )}

      {!loading && !error && !hasChildren && (
        <div className="text-center py-12">
          <Receipt className="w-10 h-10 text-gray-200 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-sm text-gray-400 dark:text-gray-500">{emptyText}</p>
        </div>
      )}

      {!loading && !error && (
        <div className="space-y-2 max-h-[50vh] overflow-y-auto">{children}</div>
      )}
    </div>
  );
}

function PickItem({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 p-3.5 rounded-xl border-2 border-gray-200 dark:border-gray-700 hover:border-emerald-400 dark:hover:border-emerald-500 hover:bg-emerald-50/50 dark:hover:bg-emerald-900/10 transition-all text-left group"
    >
      {children}
    </button>
  );
}

function StepCreditMode({
  invoice,
  creditMode,
  setCreditMode,
  partialAmount,
  setPartialAmount,
  onConfirm,
}: {
  invoice: SourceInvoice;
  creditMode: 'total' | 'partial';
  setCreditMode: (m: 'total' | 'partial') => void;
  partialAmount: number;
  setPartialAmount: (v: number) => void;
  onConfirm: () => void;
}) {
  const maxAmount = invoice.total;
  const isValid = creditMode === 'total' || (partialAmount > 0 && partialAmount <= maxAmount);

  return (
    <div className="p-4 sm:p-5 space-y-4">
      {/* Invoice summary card */}
      <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center flex-shrink-0">
            <Receipt className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{invoice.number}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">{invoice.clientName} · {fmtDate(invoice.date)}</p>
          </div>
          <p className="text-base font-bold text-gray-900 dark:text-gray-100 flex-shrink-0">{fmtCurrency(invoice.total)}</p>
        </div>
      </div>

      {/* Mode selection */}
      <div className="space-y-2.5">
        <p className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Tipo de abono</p>
        <button
          onClick={() => setCreditMode('total')}
          className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left ${
            creditMode === 'total'
              ? 'border-amber-400 dark:border-amber-500 bg-amber-50/50 dark:bg-amber-900/10'
              : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
          }`}
        >
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
            creditMode === 'total' ? 'bg-amber-100 dark:bg-amber-900/40' : 'bg-gray-100 dark:bg-gray-700'
          }`}>
            <RotateCcw className={`w-5 h-5 ${creditMode === 'total' ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400'}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-gray-900 dark:text-gray-100">Abono total</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Anula completamente la factura — {fmtCurrency(maxAmount)}</p>
          </div>
          {creditMode === 'total' && (
            <div className="w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center flex-shrink-0">
              <Check className="w-3 h-3 text-white" strokeWidth={3} />
            </div>
          )}
        </button>

        <button
          onClick={() => setCreditMode('partial')}
          className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left ${
            creditMode === 'partial'
              ? 'border-amber-400 dark:border-amber-500 bg-amber-50/50 dark:bg-amber-900/10'
              : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
          }`}
        >
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
            creditMode === 'partial' ? 'bg-amber-100 dark:bg-amber-900/40' : 'bg-gray-100 dark:bg-gray-700'
          }`}>
            <Minus className={`w-5 h-5 ${creditMode === 'partial' ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400'}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-gray-900 dark:text-gray-100">Abono parcial</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Indica el importe a abonar manualmente</p>
          </div>
          {creditMode === 'partial' && (
            <div className="w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center flex-shrink-0">
              <Check className="w-3 h-3 text-white" strokeWidth={3} />
            </div>
          )}
        </button>
      </div>

      {/* Partial amount input */}
      {creditMode === 'partial' && (
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400">
            Importe del abono <span className="text-gray-400 font-normal">(máx. {fmtCurrency(maxAmount)})</span>
          </label>
          <div className="relative">
            <input
              type="number"
              min={0.01}
              max={maxAmount}
              step={0.01}
              value={partialAmount}
              onChange={e => setPartialAmount(Number(e.target.value))}
              className={`w-full px-4 py-3 text-lg font-bold border-2 rounded-xl focus:outline-none transition-all text-right pr-8 ${
                !isValid
                  ? 'border-red-300 focus:border-red-400 text-red-600'
                  : 'border-gray-200 dark:border-gray-700 focus:border-amber-500 text-gray-900 dark:text-gray-100'
              } bg-white dark:bg-gray-800`}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-base text-gray-400 font-semibold">€</span>
          </div>
          {partialAmount > maxAmount && (
            <p className="text-xs text-red-500">El importe no puede superar el total de la factura</p>
          )}
        </div>
      )}

      {/* Confirm button */}
      <button
        onClick={onConfirm}
        disabled={!isValid}
        className={`w-full py-3 text-sm font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 ${
          isValid
            ? 'bg-amber-600 hover:bg-amber-700 text-white'
            : 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
        }`}
      >
        <RotateCcw className="w-4 h-4" />
        Generar abono por {fmtCurrency(creditMode === 'total' ? maxAmount : partialAmount)}
      </button>
    </div>
  );
}
