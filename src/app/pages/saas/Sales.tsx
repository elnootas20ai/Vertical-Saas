import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { v4 as uuidv4 } from 'uuid';
import { toast } from 'sonner';
import { Layout } from '../../components/saas/Layout';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { useColumnPreferences, type ColumnDef } from '../../hooks/useColumnPreferences';
import { ColumnCustomizer } from '../../components/saas/ColumnCustomizer';
import { useModalClose } from '../../hooks/useModalClose';
import { SAAS__CreateSaleModal } from '../../components/design-system/SAAS__CreateSaleModal';
import { SAAS__GenerateDocumentsModal } from '../../components/design-system/SAAS__GenerateDocumentsModal';
import { SALE_STAGE_TOKEN } from '../../components/saas/DesignTokens';
import { createSaleInCouch, listSalesRecords, updateSaleInCouch } from '../../lib/salesApi';
import {
  getSaleCoveredAmount,
  getSalePendingAmount,
  computeSaleUiAlertLevel,
  type SaleRecord,
  type SaleStage,
} from '../../lib/salesTypes';
import {
  Plus, FileText,
  Calendar, Search, X,
  ArrowUp, ArrowDown, Check, ChevronDown,
  Receipt, Download, AlertCircle,
  Copy, UserX, Umbrella, Trophy,
  LayoutGrid, List, Target, Users, MapPin,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { useActivationFocus } from '../../hooks/useActivationFocus';
import { ActivationFieldWrap } from '../../components/saas/ActivationGuideUi';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';
import { useWorkCenters } from '../../hooks/useWorkCenters';

// ─── Column definitions (tabla tab) ──────────────────────────────────────────

type SaleColId = 'vehiculo' | 'cliente' | 'estado' | 'total' | 'cobros' | 'entrega' | 'responsable' | 'centro';

const SALE_COLUMNS: ColumnDef<SaleColId>[] = [
  { id: 'vehiculo',    label: 'Vehículo',    required: true },
  { id: 'cliente',     label: 'Cliente',     required: true },
  { id: 'estado',      label: 'Estado' },
  { id: 'centro',      label: 'Centro' },
  { id: 'total',       label: 'Total' },
  { id: 'cobros',      label: 'Cobros' },
  { id: 'entrega',     label: 'Fecha entrega' },
  { id: 'responsable', label: 'Responsable' },
];

// ─── Types ────────────────────────────────────────────────────────────────────

type SalesTab = 'pipeline' | 'tabla' | 'facturacion' | 'objetivos';

type Sale = SaleRecord;

interface Invoice {
  id: string;
  saleId: string;
  number: string;
  clientName: string;
  vehicleName: string;
  vehiclePlate: string;
  date: string;
  dueDate: string;
  total: number;
  paid: number;
  status: 'paid' | 'pending' | 'overdue' | 'draft';
}

const STAGE_ORDER: Record<SaleStage, number> = {
  interested: 0, reserved: 1, documentation: 2, sold: 3, delivered: 4,
};

const INVOICE_STATUS_CONFIG = {
  paid:    { i18nKey: 'sales.invoice.paid',    bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500', border: 'border-l-emerald-400' },
  pending: { i18nKey: 'sales.invoice.pending', bg: 'bg-amber-100',   text: 'text-amber-700',   dot: 'bg-amber-500',   border: 'border-l-amber-400' },
  overdue: { i18nKey: 'sales.invoice.overdue', bg: 'bg-red-100',     text: 'text-red-700',     dot: 'bg-red-500',     border: 'border-l-red-400' },
  draft:   { i18nKey: 'sales.invoice.draft',   bg: 'bg-gray-100 dark:bg-gray-700',    text: 'text-gray-600 dark:text-gray-400',    dot: 'bg-gray-400',    border: 'border-l-gray-300' },
};

type SortState = { key: string; dir: 'asc' | 'desc' } | null;

function addDays(date: string, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next.toISOString();
}

function buildInvoiceStatus(sale: Sale): Invoice['status'] {
  const covered = getSaleCoveredAmount(sale);
  const dueDate = sale.expectedDelivery || addDays(sale.createdAt, 15);

  if (covered >= sale.totalPrice) {
    return 'paid';
  }
  if (!sale.generatedDocuments.some((doc) => doc.type === 'invoice')) {
    return 'draft';
  }
  return new Date(dueDate).getTime() < Date.now() ? 'overdue' : 'pending';
}

// ─── ColFilter ────────────────────────────────────────────────────────────────

function ColFilter({ label, options, selected, onChange, renderOption, sortKey, currentSort, onSort, align = 'left' }: {
  label: string; options: string[]; selected: string[];
  onChange: (vals: string[]) => void;
  renderOption?: (val: string) => React.ReactNode;
  sortKey?: string; currentSort?: SortState;
  onSort?: (key: string, dir: 'asc' | 'desc') => void;
  align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const [innerSearch, setInnerSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const isActive = selected.length > 0;
  const isSorted = !!(sortKey && currentSort?.key === sortKey);
  const sortDir = isSorted ? currentSort!.dir : null;

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setInnerSearch(''); }
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const toggle = (val: string) => onChange(selected.includes(val) ? selected.filter(s => s !== val) : [...selected, val]);
  const visible = innerSearch.trim() ? options.filter(o => o.toLowerCase().includes(innerSearch.toLowerCase())) : options;
  const handleSort = (dir: 'asc' | 'desc') => {
    if (sortKey && onSort) {
      if (isSorted && sortDir === dir) onSort('', dir);
      else onSort(sortKey, dir);
    }
  };
  const hasSort = !!(sortKey && onSort);
  const hasOptions = options.length > 0;

  return (
    <div ref={ref} className="relative inline-flex">
      <button onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-1 transition-colors group ${isActive || isSorted ? 'text-amber-700 dark:text-amber-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'}`}>
        <span className="text-xs font-semibold uppercase tracking-wider whitespace-nowrap">{label}</span>
        {isActive && <span className="bg-amber-500 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center flex-shrink-0">{selected.length}</span>}
        {isSorted && !isActive && (sortDir === 'asc' ? <ArrowUp className="w-3 h-3 text-amber-500 flex-shrink-0" /> : <ArrowDown className="w-3 h-3 text-amber-500 flex-shrink-0" />)}
        <ChevronDown className={`w-3 h-3 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''} ${isActive || isSorted ? 'text-amber-600' : 'text-gray-400 dark:text-gray-500 group-hover:text-gray-600'}`} />
      </button>
      {open && (
        <div className={`absolute top-full mt-2 bg-slate-50 dark:bg-gray-900 border-2 border-slate-200 dark:border-gray-700 rounded-xl shadow-2xl ring-4 ring-slate-900/5 dark:ring-gray-900/40 z-50 w-56 overflow-hidden ${align === 'right' ? 'right-0' : 'left-0'}`}>
          {hasSort && (
            <div className="px-3 pt-2.5 pb-2 border-b border-slate-200 dark:border-gray-700 bg-white/80 dark:bg-gray-800/80">
              <p className="text-[10px] font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Ordenar</p>
              <div className="flex gap-1.5">
                <button onClick={() => handleSort('asc')} className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg border-2 text-xs font-semibold transition-all ${isSorted && sortDir === 'asc' ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-400 text-amber-700 dark:text-amber-300' : 'border-slate-200 dark:border-gray-600 text-slate-600 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-gray-700 hover:border-slate-300 dark:hover:border-gray-500'}`}><ArrowUp className="w-3 h-3" /> Asc</button>
                <button onClick={() => handleSort('desc')} className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg border-2 text-xs font-semibold transition-all ${isSorted && sortDir === 'desc' ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-400 text-amber-700 dark:text-amber-300' : 'border-slate-200 dark:border-gray-600 text-slate-600 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-gray-700 hover:border-slate-300 dark:hover:border-gray-500'}`}><ArrowDown className="w-3 h-3" /> Desc</button>
              </div>
            </div>
          )}
          {hasOptions && (
            <>
              <div className="px-2.5 pt-2.5 pb-2 bg-white/60 dark:bg-gray-800/60">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[10px] font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wider">Filtrar</p>
                  {isActive && <button onClick={() => onChange([])} className="text-[10px] text-slate-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 flex items-center gap-0.5 font-medium"><X className="w-2.5 h-2.5" /> Limpiar</button>}
                </div>
                <div className="relative">
                  <Search className="w-3 h-3 text-slate-400 dark:text-gray-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input value={innerSearch} onChange={e => setInnerSearch(e.target.value)} placeholder="Buscar..."
                    className="w-full pl-7 pr-2 py-1.5 text-xs text-slate-800 dark:text-gray-200 bg-white dark:bg-gray-800 border-2 border-slate-200 dark:border-gray-600 rounded-lg focus:border-amber-400 dark:focus:border-amber-500 focus:ring-2 focus:ring-amber-200 dark:focus:ring-amber-900/30 focus:outline-none placeholder:text-slate-400 dark:placeholder:text-gray-500"
                    onClick={e => e.stopPropagation()} />
                </div>
              </div>
              <div className="px-1.5 py-1 max-h-44 overflow-y-auto bg-slate-50/80 dark:bg-gray-900/80">
                {visible.map(opt => {
                  const checked = selected.includes(opt);
                  return (
                    <button key={opt} onClick={() => toggle(opt)} className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors ${checked ? 'bg-amber-50/80 dark:bg-amber-900/20 border border-amber-200/60 dark:border-amber-700/40' : 'hover:bg-slate-100 dark:hover:bg-gray-800 border border-transparent'}`}>
                      <span className={`w-4 h-4 rounded-md flex-shrink-0 flex items-center justify-center border-2 ${checked ? 'bg-amber-600 border-amber-600' : 'border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-800'}`}>
                        {checked && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                      </span>
                      <span className="text-sm text-slate-800 dark:text-gray-200 truncate flex-1 font-medium">{renderOption ? renderOption(opt) : opt}</span>
                    </button>
                  );
                })}
              </div>
              <div className="border-t-2 border-slate-200 dark:border-gray-700 px-3 py-2.5 flex items-center justify-between bg-white/80 dark:bg-gray-800/80">
                <span className="text-xs text-slate-500 dark:text-gray-400 font-medium">{selected.length > 0 ? `${selected.length} sel.` : 'Ninguno'}</span>
                <button onClick={() => { setOpen(false); setInnerSearch(''); }} className="text-xs font-semibold text-white bg-slate-700 hover:bg-slate-800 dark:bg-gray-600 dark:hover:bg-gray-500 px-3 py-1.5 rounded-lg transition-colors">Aplicar</button>
              </div>
            </>
          )}
          {!hasOptions && hasSort && (
            <div className="px-3 py-2 flex justify-end bg-white/60 dark:bg-gray-800/60">
              <button onClick={() => setOpen(false)} className="text-xs font-semibold text-slate-600 dark:text-gray-300 bg-slate-200 dark:bg-gray-700 hover:bg-slate-300 dark:hover:bg-gray-600 px-2.5 py-1 rounded-lg transition-colors">Cerrar</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── StagePill ────────────────────────────────────────────────────────────────

function StagePill({ stage }: { stage: SaleStage }) {
  const stageToken = SALE_STAGE_TOKEN[stage];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-medium whitespace-nowrap px-2.5 py-0.5 text-xs ${stageToken.badgeBg} ${stageToken.badgeText}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${stageToken.dot}`} />
      {stageToken.label}
    </span>
  );
}

// ─── InvoiceBadge ─────────────────────────────────────────────────────────────

function InvoiceBadge({ status }: { status: Invoice['status'] }) {
  const { t } = useTranslation();
  const s = INVOICE_STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-full ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.dot}`} />
      {t(s.i18nKey)}
    </span>
  );
}

// ─── KanbanCard ───────────────────────────────────────────────────────────────

function KanbanCard({ sale, onDocs }: { sale: Sale; onDocs: (s: Sale) => void }) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const stageToken = SALE_STAGE_TOKEN[sale.stage];
  const paid = getSaleCoveredAmount(sale);
  const pending = getSalePendingAmount(sale);
  const pct = sale.totalPrice ? Math.min(100, Math.round((paid / sale.totalPrice) * 100)) : 0;
  return (
    <div onClick={() => navigate(`/saas/sales/${sale.id}`)}
      className={`group bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 border-l-4 ${stageToken.accentBorder} hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600 cursor-pointer transition-all duration-150 overflow-hidden`}>
      <div className="p-4">
        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 leading-snug mb-0.5 truncate">{sale.vehicleName}</p>
        <div className="flex items-center gap-1.5 mb-3">
          <div className="w-4 h-4 rounded bg-violet-500 flex items-center justify-center flex-shrink-0">
            <span className="text-[8px] font-bold text-white">{sale.clientName.charAt(0)}</span>
          </div>
          <p className="text-[11px] text-gray-400 dark:text-gray-500 truncate">{sale.clientName}</p>
        </div>
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-[10px] text-gray-400 dark:text-gray-500">Total</span>
          <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{sale.totalPrice.toLocaleString('es-ES')}€</span>
        </div>
        <div className="mb-3">
          <div className="flex justify-between text-[10px] mb-1">
            <span className="text-gray-400 dark:text-gray-500">{pct}% {t('sales.invoice.collected')}</span>
            {pending > 0 ? <span className="text-red-400">{pending.toLocaleString('es-ES')}€ {t('sales.invoice.pendingShort')}</span> : <span className="text-emerald-500">✓ {t('sales.invoice.completed')}</span>}
          </div>
          <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${pct === 100 ? 'bg-emerald-500' : 'bg-amber-400'}`} style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div className="flex items-center justify-between pt-2.5 border-t border-gray-100 dark:border-gray-800">
          {sale.expectedDelivery ? (
            <div className="flex items-center gap-1 text-[10px] text-gray-400 dark:text-gray-500">
              <Calendar className="w-3 h-3" />
              {new Date(sale.expectedDelivery).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
            </div>
          ) : <span className="text-[10px] text-gray-300">{sale.responsible}</span>}
          <button onClick={e => { e.stopPropagation(); onDocs(sale); }}
            className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors">
            <FileText className="w-3 h-3" /> Docs
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MobileListCard ───────────────────────────────────────────────────────────

function MobileListCard({ sale, onDocs }: { sale: Sale; onDocs: (s: Sale) => void }) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const stageToken = SALE_STAGE_TOKEN[sale.stage];
  const paid = getSaleCoveredAmount(sale);
  const pending = getSalePendingAmount(sale);
  const pct = sale.totalPrice ? Math.min(100, Math.round((paid / sale.totalPrice) * 100)) : 0;
  return (
    <div onClick={() => navigate(`/saas/sales/${sale.id}`)}
      className={`bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 border-l-4 ${stageToken.accentBorder} active:scale-[0.99] transition-all cursor-pointer overflow-hidden`}>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-gray-900 dark:text-gray-100 leading-tight">{sale.vehicleName}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{sale.clientName}</p>
          </div>
          <div className="flex-shrink-0 text-right">
            <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{sale.totalPrice.toLocaleString('es-ES')}€</p>
            {pending > 0 ? <p className="text-[10px] text-red-500">{pending.toLocaleString('es-ES')}€ {t('sales.invoice.pendingShort')}</p> : <p className="text-[10px] text-emerald-500">✓ {t('sales.invoice.paid')}</p>}
          </div>
        </div>
        <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden mb-3">
          <div className={`h-full rounded-full ${pct === 100 ? 'bg-emerald-500' : 'bg-amber-400'}`} style={{ width: `${pct}%` }} />
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <StagePill stage={sale.stage} />
            {sale.expectedDelivery && (
              <div className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
                <Calendar className="w-3 h-3" />
                {new Date(sale.expectedDelivery).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
              </div>
            )}
          </div>
          <button onClick={e => { e.stopPropagation(); onDocs(sale); }}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-blue-600 bg-blue-50 active:bg-blue-100 rounded-lg">
            <FileText className="w-3.5 h-3.5" /> Docs
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── InvoiceCard — tarjeta de factura estilo Clientes ────────────────────────

function InvoiceCard({ invoice }: { invoice: Invoice }) {
  const { t } = useTranslation();
  const s = INVOICE_STATUS_CONFIG[invoice.status];
  const pending = invoice.total - invoice.paid;
  const pct = Math.min(100, Math.round((invoice.paid / invoice.total) * 100));
  return (
    <div className={`bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 border-l-4 ${s.border} hover:shadow-md active:scale-[0.99] cursor-pointer transition-all overflow-hidden`}>
      <div className="p-4">
        {/* Número + badge */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Receipt className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
            <span className="text-xs font-mono font-bold text-gray-700 dark:text-gray-300">{invoice.number}</span>
          </div>
          <InvoiceBadge status={invoice.status} />
        </div>

        {/* Cliente */}
        <p className="text-sm font-bold text-gray-900 dark:text-gray-100 leading-tight mb-0.5">{invoice.clientName}</p>
        <div className="flex items-center gap-2 mb-3">
          <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{invoice.vehicleName}</p>
          <span className="font-mono text-[10px] bg-blue-600 text-white px-1.5 py-0.5 rounded flex-shrink-0">{invoice.vehiclePlate}</span>
        </div>

        {/* Barra cobro */}
        <div className="mb-3">
          <div className="flex justify-between text-[10px] mb-1">
            <span className="text-gray-400 dark:text-gray-500">{pct}% {t('sales.invoice.collected')}</span>
            {pending > 0
              ? <span className="text-red-500 font-semibold">{pending.toLocaleString('es-ES')}€ {t('sales.invoice.pendingAmount')}</span>
              : <span className="text-emerald-500 font-semibold">✓ {t('sales.invoice.completed')}</span>}
          </div>
          <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${pct === 100 ? 'bg-emerald-500' : 'bg-amber-400'}`} style={{ width: `${pct}%` }} />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-800">
          <div className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {new Date(invoice.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
            {invoice.status !== 'paid' && invoice.status !== 'draft' && (
              <span className={`ml-1.5 ${invoice.status === 'overdue' ? 'text-red-500 font-semibold' : 'text-gray-400 dark:text-gray-500'}`}>
                · {t('sales.invoice.dueDate')} {new Date(invoice.dueDate).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
              </span>
            )}
          </div>
          <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{invoice.total.toLocaleString('es-ES')}€</span>
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Objetivos (SA-07) ───────────────────────────────────────────────────

const MEDALS = ['🥇', '🥈', '🥉'];

type GoalsMap = Record<string, number>;
type AgentStatus = 'active' | 'vacation' | 'fired';
type AgentStatusMap = Record<string, AgentStatus>;

const AGENT_STATE_KEY = 'sales_agent_states';
const AGENT_ORDER_KEY = 'sales_agent_order';

function getMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function TabObjetivos({ sales }: { sales: Sale[] }) {
  const { t } = useTranslation();
  const today      = new Date();
  const monthKey   = getMonthKey(today);
  const storageKey = `sales_goals_${monthKey}`;

  const daysInMonth   = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const daysRemaining = daysInMonth - today.getDate();
  const isEndOfMonth  = daysRemaining <= 7;

  const [objetivosViewMode, setObjetivosViewMode] = useState<'quick' | 'advanced'>('advanced');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    resumen: true,
    agentes: true,
    despedidos: false,
  });

  const [goals, setGoals]       = useState<GoalsMap>(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) || '{}') as GoalsMap; }
    catch { return {}; }
  });
  const [editing, setEditing]   = useState<string | null>(null);
  const [editVal, setEditVal]   = useState('');
  const [addName, setAddName]   = useState('');
  const [addGoal, setAddGoal]   = useState('');
  const [showAdd, setShowAdd]   = useState(false);
  const [agentStates, setAgentStates] = useState<AgentStatusMap>(() => {
    try { return JSON.parse(localStorage.getItem(AGENT_STATE_KEY) || '{}') as AgentStatusMap; }
    catch { return {}; }
  });
  const [customOrder, setCustomOrder] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(AGENT_ORDER_KEY) || '[]') as string[]; }
    catch { return []; }
  });

  const saveGoals = (next: GoalsMap) => {
    setGoals(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
  };

  const saveAgentStates = (next: AgentStatusMap) => {
    setAgentStates(next);
    localStorage.setItem(AGENT_STATE_KEY, JSON.stringify(next));
  };

  const saveCustomOrder = (next: string[]) => {
    setCustomOrder(next);
    localStorage.setItem(AGENT_ORDER_KEY, JSON.stringify(next));
  };

  const thisMonthSales = useMemo(() => {
    return sales.filter(s => getMonthKey(new Date(s.createdAt)) === monthKey);
  }, [sales, monthKey]);

  const teamStats = useMemo(() => {
    const people = [...new Set([...Object.keys(goals), ...thisMonthSales.map(s => s.responsible)])];
    return people.map(name => {
      const personSales  = thisMonthSales.filter(s => s.responsible === name);
      const achieved     = personSales.filter(s => ['sold', 'delivered'].includes(s.stage)).reduce((a, s) => a + s.totalPrice, 0);
      const target       = goals[name] ?? 0;
      const pct          = target > 0 ? Math.min(150, Math.round((achieved / target) * 100)) : 0;
      const salesCount   = personSales.filter(s => ['sold', 'delivered'].includes(s.stage)).length;
      const status       = agentStates[name] ?? 'active';
      return { name, achieved, target, pct, salesCount, status };
    }).sort((a, b) => b.achieved - a.achieved);
  }, [goals, thisMonthSales, agentStates]);

  const orderedStats = useMemo(() => {
    if (customOrder.length === 0) return teamStats;
    const orderMap: Record<string, number> = {};
    customOrder.forEach((name, idx) => { orderMap[name] = idx; });
    return [...teamStats].sort((a, b) => (orderMap[a.name] ?? 9999) - (orderMap[b.name] ?? 9999));
  }, [teamStats, customOrder]);

  const activeStats = orderedStats.filter(s => s.status !== 'fired');
  const firedStats  = orderedStats.filter(s => s.status === 'fired');

  const startEdit = (name: string) => {
    setEditing(name);
    setEditVal(String(goals[name] ?? ''));
  };

  const confirmEdit = (name: string) => {
    const val = parseFloat(editVal);
    if (!isNaN(val) && val >= 0) saveGoals({ ...goals, [name]: val });
    setEditing(null);
  };

  const confirmAdd = () => {
    const name = addName.trim();
    const val  = parseFloat(addGoal);
    if (name && !isNaN(val) && val > 0) {
      saveGoals({ ...goals, [name]: val });
      setAddName('');
      setAddGoal('');
      setShowAdd(false);
    }
  };

  const removeGoal = (name: string) => {
    const next = { ...goals };
    delete next[name];
    saveGoals(next);
  };

  const toggleVacation = (name: string) => {
    const next = { ...agentStates };
    if (next[name] === 'vacation') delete next[name];
    else next[name] = 'vacation';
    saveAgentStates(next);
  };

  const fireAgent = (name: string) => {
    saveAgentStates({ ...agentStates, [name]: 'fired' });
  };

  const restoreAgent = (name: string) => {
    const next = { ...agentStates };
    delete next[name];
    saveAgentStates(next);
  };

  const duplicateAgent = (name: string) => {
    const existingNames = new Set([...Object.keys(goals), ...teamStats.map(s => s.name)]);
    let newName = `${name} (copia)`;
    let counter = 1;
    while (existingNames.has(newName)) newName = `${name} (copia ${++counter})`;
    saveGoals({ ...goals, [newName]: goals[name] ?? 0 });
  };

  const moveAgent = (name: string, dir: 'up' | 'down') => {
    const list = customOrder.length > 0 ? [...customOrder] : activeStats.map(s => s.name);
    const idx = list.indexOf(name);
    if (idx === -1) return;
    const newIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= list.length) return;
    const next = [...list];
    [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
    saveCustomOrder(next);
  };

  const totalTarget   = activeStats.reduce((a, s) => a + s.target, 0);
  const totalAchieved = activeStats.reduce((a, s) => a + s.achieved, 0);
  const totalPct      = totalTarget > 0 ? Math.min(100, Math.round((totalAchieved / totalTarget) * 100)) : 0;
  const monthLabel    = today.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

  return (
    <div className="space-y-4">
      {/* Vista rápida / Vista avanzada */}
      <div className="flex justify-end">
        <div className="inline-flex items-center bg-gray-100 dark:bg-gray-700 rounded-xl p-1">
          {([['quick', LayoutGrid, t('vehicles.views.quick')], ['advanced', List, t('vehicles.views.advanced')]] as const).map(([mode, Icon, lbl]) => (
            <button key={mode} onClick={() => setObjetivosViewMode(mode)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${objetivosViewMode === mode ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'}`}>
              <Icon className="w-3.5 h-3.5" />{lbl}
            </button>
          ))}
        </div>
      </div>

      {/* End-of-month alert */}
      {isEndOfMonth && (
        <div className={`rounded-2xl border-2 p-4 flex items-start gap-3 ${daysRemaining <= 3 ? 'bg-red-50 border-red-300' : 'bg-amber-50 dark:bg-amber-900/20 border-amber-300'}`}>
          <AlertCircle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${daysRemaining <= 3 ? 'text-red-500' : 'text-amber-500'}`} />
          <div>
            <p className={`font-bold text-sm ${daysRemaining <= 3 ? 'text-red-800' : 'text-amber-800'}`}>
              ⏰ {daysRemaining === 0 ? '¡Último día del mes!' : `Quedan ${daysRemaining} día${daysRemaining !== 1 ? 's' : ''} para cerrar el mes`}
            </p>
            <p className={`text-xs mt-0.5 ${daysRemaining <= 3 ? 'text-red-600' : 'text-amber-700'}`}>
              El equipo lleva {totalPct}% del objetivo mensual. ¡Hay que acelerar!
            </p>
          </div>
        </div>
      )}

      {objetivosViewMode === 'quick' ? (
        /* Vista rápida: cards simples de agentes */
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">{monthLabel} · {activeStats.length} agentes</p>
            <button onClick={() => setShowAdd(v => !v)} className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 hover:bg-black text-white rounded-xl text-xs font-medium transition-colors">
              <Plus className="w-3.5 h-3.5" /> Añadir agente
            </button>
          </div>
          {showAdd && (
            <div className="bg-gray-50 dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700">
              <div className="flex gap-2 flex-wrap">
                <input value={addName} onChange={e => setAddName(e.target.value)} placeholder="Nombre comercial…" className="flex-1 min-w-[120px] px-3 py-2 border-2 border-gray-200 dark:border-gray-700 focus:border-blue-400 rounded-xl text-sm focus:outline-none" />
                <input type="number" value={addGoal} onChange={e => setAddGoal(e.target.value)} placeholder="Objetivo €" className="w-28 px-3 py-2 border-2 border-gray-200 dark:border-gray-700 focus:border-blue-400 rounded-xl text-sm focus:outline-none" />
                <button onClick={confirmAdd} disabled={!addName.trim() || !addGoal} className="px-4 py-2 bg-gray-900 text-white rounded-xl text-sm font-medium disabled:opacity-40">Añadir</button>
                <button onClick={() => setShowAdd(false)} className="px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700"><X className="w-4 h-4 text-gray-500 dark:text-gray-400" /></button>
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {activeStats.map((stat, idx) => {
            const medal = MEDALS[idx] ?? '👤';
            const overGoal = stat.target > 0 && stat.pct >= 100;
            return (
              <div key={stat.name} className="bg-white dark:bg-gray-900 rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">{medal}</span>
                  <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{stat.name}</p>
                  {stat.status === 'vacation' && <span className="text-[10px] px-1.5 py-0.5 bg-sky-100 text-sky-700 rounded-full">🌴</span>}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  <span className={`font-bold ${overGoal ? 'text-emerald-600' : 'text-gray-800 dark:text-gray-200'}`}>{stat.achieved.toLocaleString('es-ES')}€</span>
                  {stat.target > 0 && <span className="text-gray-400 dark:text-gray-500"> / {stat.target.toLocaleString('es-ES')}€</span>}
                </p>
                {stat.target > 0 && (
                  <p className={`text-xs font-bold mt-0.5 ${overGoal ? 'text-emerald-600' : stat.pct >= 70 ? 'text-blue-600' : 'text-red-500'}`}>{stat.pct}%</p>
                )}
              </div>
            );
          })}
          </div>
        </div>
      ) : (
        <>
      {/* Submenú: Resumen */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <button
          type="button"
          onClick={() => setExpandedSections(s => ({ ...s, resumen: !s.resumen }))}
          className="flex w-full items-center justify-between px-5 py-4 hover:bg-gray-50/80 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-amber-500" />
            <span className="font-semibold text-gray-900 dark:text-gray-100">Resumen</span>
            <span className="text-xs text-gray-400 dark:text-gray-500">· Objetivos y progreso global</span>
          </div>
          <ChevronDown className={`w-4 h-4 text-gray-400 dark:text-gray-500 transition-transform ${expandedSections.resumen ? 'rotate-180' : ''}`} />
        </button>
        {expandedSections.resumen && (
          <div className="border-t border-gray-100 dark:border-gray-800 px-5 pb-5 pt-2 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: `Objetivo ${monthLabel}`, value: totalTarget > 0 ? `${totalTarget.toLocaleString('es-ES')}€` : 'Sin definir', color: 'text-gray-900 dark:text-gray-100', icon: '🎯' },
                { label: 'Conseguido este mes', value: `${totalAchieved.toLocaleString('es-ES')}€`, color: totalAchieved >= totalTarget && totalTarget > 0 ? 'text-emerald-600' : 'text-blue-600', icon: '💰' },
                { label: 'Ventas cerradas', value: thisMonthSales.filter(s => ['sold', 'delivered'].includes(s.stage)).length, color: 'text-violet-600', icon: '✅' },
                { label: 'Progreso del equipo', value: totalTarget > 0 ? `${totalPct}%` : '—', color: totalPct >= 100 ? 'text-emerald-600' : totalPct >= 70 ? 'text-amber-600' : 'text-red-500', icon: totalPct >= 100 ? '🏆' : '📈' },
              ].map(s => (
                <div key={s.label} className="bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-800 p-3">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm">{s.icon}</span>
                    <p className={`text-lg font-bold leading-none ${s.color}`}>{s.value}</p>
                  </div>
                  <p className="text-[11px] text-gray-400 dark:text-gray-500">{s.label}</p>
                </div>
              ))}
            </div>
            {totalTarget > 0 && (
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 bg-gray-50/50">
                <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-2">
                  <span className="font-semibold">Progreso global del equipo</span>
                  <span className="font-bold text-gray-900 dark:text-gray-100">{totalAchieved.toLocaleString('es-ES')}€ / {totalTarget.toLocaleString('es-ES')}€</span>
                </div>
                <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${totalPct >= 100 ? 'bg-emerald-500' : totalPct >= 70 ? 'bg-amber-400' : 'bg-red-400'}`} style={{ width: `${totalPct}%` }} />
                </div>
                <div className="flex justify-between text-xs text-gray-400 dark:text-gray-500 mt-1.5">
                  <span>{totalPct}% completado</span>
                  <span>{daysRemaining}d restantes en {monthLabel}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Submenú: Agentes activos */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <button
          type="button"
          onClick={() => setExpandedSections(s => ({ ...s, agentes: !s.agentes }))}
          className="flex w-full items-center justify-between px-5 py-4 hover:bg-gray-50/80 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-500" />
            <span className="font-semibold text-gray-900 dark:text-gray-100">Agentes</span>
            <span className="text-xs text-gray-400 dark:text-gray-500">· {monthLabel} · {activeStats.length} agentes</span>
          </div>
          <ChevronDown className={`w-4 h-4 text-gray-400 dark:text-gray-500 transition-transform ${expandedSections.agentes ? 'rotate-180' : ''}`} />
        </button>
        {expandedSections.agentes && (
          <div className="border-t border-gray-100 dark:border-gray-800">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-50 bg-gray-50/50">
          <p className="text-xs text-gray-500 dark:text-gray-400">Ranking del equipo</p>
          <button
            onClick={() => setShowAdd(v => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 hover:bg-black text-white rounded-xl text-xs font-medium transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Añadir agente
          </button>
        </div>

        {showAdd && (
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800">
            <div className="flex gap-2">
              <input
                type="text"
                value={addName}
                onChange={e => setAddName(e.target.value)}
                placeholder="Nombre comercial…"
                className="flex-1 px-3 py-2 border-2 border-gray-200 dark:border-gray-700 focus:border-blue-400 rounded-xl text-sm focus:outline-none"
              />
              <input
                type="number"
                value={addGoal}
                onChange={e => setAddGoal(e.target.value)}
                placeholder="Objetivo €"
                className="w-32 px-3 py-2 border-2 border-gray-200 dark:border-gray-700 focus:border-blue-400 rounded-xl text-sm focus:outline-none"
              />
              <button
                onClick={confirmAdd}
                disabled={!addName.trim() || !addGoal}
                className="px-4 py-2 bg-gray-900 hover:bg-black text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-40"
              >
                Añadir
              </button>
              <button onClick={() => setShowAdd(false)} className="px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                <X className="w-4 h-4 text-gray-500 dark:text-gray-400" />
              </button>
            </div>
          </div>
        )}

        {activeStats.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-3xl mb-2">🎯</p>
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Sin objetivos definidos</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Añade objetivos mensuales por comercial para activar el ranking.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {activeStats.map((stat, idx) => {
              const medal    = MEDALS[idx] ?? '👤';
              const overGoal = stat.target > 0 && stat.pct >= 100;
              const onTrack  = stat.target > 0 && stat.pct >= 70;
              const isFirst  = idx === 0;
              const isLast   = idx === activeStats.length - 1;
              const badge    = overGoal ? { text: '¡Objetivo!', cls: 'bg-emerald-100 text-emerald-700' }
                             : onTrack  ? { text: 'En camino',  cls: 'bg-blue-100 text-blue-700' }
                             : stat.target > 0 ? { text: 'Por detrás', cls: 'bg-red-50 text-red-600' }
                             : null;
              return (
                <div key={stat.name} className="px-5 py-4">
                  {/* Main info row */}
                  <div className="flex items-start gap-3 mb-2">
                    <span className="text-xl flex-shrink-0 mt-0.5">{medal}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{stat.name}</p>
                        {stat.status === 'vacation' && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-100 text-sky-700">🌴 Vacaciones</span>
                        )}
                        {badge && (
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badge.cls}`}>{badge.text}</span>
                        )}
                        {stat.salesCount > 0 && (
                          <span className="text-[10px] text-gray-400 dark:text-gray-500">{stat.salesCount} venta{stat.salesCount !== 1 ? 's' : ''}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          <span className={`font-bold ${overGoal ? 'text-emerald-600' : 'text-gray-800 dark:text-gray-200'}`}>{stat.achieved.toLocaleString('es-ES')}€</span>
                          {stat.target > 0 && <span className="text-gray-400 dark:text-gray-500"> / {stat.target.toLocaleString('es-ES')}€</span>}
                        </span>
                        {stat.target > 0 && (
                          <span className={`text-xs font-bold ${overGoal ? 'text-emerald-600' : onTrack ? 'text-blue-600' : 'text-red-500'}`}>{stat.pct}%</span>
                        )}
                      </div>
                    </div>
                    {/* Goal edit */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {editing === stat.name ? (
                        <>
                          <input
                            type="number"
                            value={editVal}
                            onChange={e => setEditVal(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') confirmEdit(stat.name); if (e.key === 'Escape') setEditing(null); }}
                            autoFocus
                            className="w-24 px-2 py-1 text-xs border-2 border-blue-400 rounded-lg focus:outline-none"
                            placeholder="€ objetivo"
                          />
                          <button onClick={() => confirmEdit(stat.name)} className="text-xs px-2 py-1 bg-gray-900 text-white rounded-lg font-medium">✓</button>
                          <button onClick={() => setEditing(null)} className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-lg">✕</button>
                        </>
                      ) : (
                        <button
                          onClick={() => startEdit(stat.name)}
                          className="text-xs px-2.5 py-1 border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 rounded-lg transition-colors"
                        >
                          {stat.target > 0 ? 'Editar' : 'Fijar objetivo'}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Progress bar */}
                  {stat.target > 0 && (
                    <div className="flex items-center gap-2 mb-2.5">
                      <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${overGoal ? 'bg-emerald-500' : onTrack ? 'bg-blue-500' : 'bg-red-400'}`}
                          style={{ width: `${Math.min(100, stat.pct)}%` }}
                        />
                      </div>
                      {overGoal && <span className="text-xs text-emerald-600 font-bold flex-shrink-0">+{(stat.achieved - stat.target).toLocaleString('es-ES')}€ extra</span>}
                    </div>
                  )}

                  {/* Agent actions */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => moveAgent(stat.name, 'up')}
                      disabled={isFirst}
                      title="Subir posición"
                      className="flex items-center justify-center w-7 h-7 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => moveAgent(stat.name, 'down')}
                      disabled={isLast}
                      title="Bajar posición"
                      className="flex items-center justify-center w-7 h-7 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <div className="w-px h-4 bg-gray-200 mx-0.5" />
                    <button
                      onClick={() => toggleVacation(stat.name)}
                      title={stat.status === 'vacation' ? 'Quitar vacaciones' : 'Poner en vacaciones'}
                      className={`flex items-center justify-center w-7 h-7 rounded-lg border transition-colors ${
                        stat.status === 'vacation'
                          ? 'border-sky-300 bg-sky-50 text-sky-600 hover:bg-sky-100'
                          : 'border-gray-200 dark:border-gray-700 hover:border-sky-300 hover:bg-sky-50 text-gray-400 dark:text-gray-500 hover:text-sky-600'
                      }`}
                    >
                      <Umbrella className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => duplicateAgent(stat.name)}
                      title="Duplicar agente"
                      className="flex items-center justify-center w-7 h-7 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => fireAgent(stat.name)}
                      title="Despedir agente"
                      className="flex items-center justify-center w-7 h-7 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-red-200 hover:bg-red-50 text-gray-400 dark:text-gray-500 hover:text-red-600 transition-colors"
                    >
                      <UserX className="w-3.5 h-3.5" />
                    </button>
                    {goals[stat.name] !== undefined && editing !== stat.name && (
                      <>
                        <div className="w-px h-4 bg-gray-200 mx-0.5" />
                        <button
                          onClick={() => removeGoal(stat.name)}
                          title="Quitar objetivo"
                          className="flex items-center justify-center w-7 h-7 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
        )}
      </div>

      {/* Submenú: Despedidos */}
      {firedStats.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <button
            type="button"
            onClick={() => setExpandedSections(s => ({ ...s, despedidos: !s.despedidos }))}
            className="flex w-full items-center justify-between px-5 py-4 hover:bg-gray-50/80 transition-colors"
          >
            <div className="flex items-center gap-2">
              <UserX className="w-4 h-4 text-gray-400 dark:text-gray-500" />
              <span className="font-semibold text-gray-700 dark:text-gray-300">Despedidos</span>
              <span className="text-xs text-gray-400 dark:text-gray-500">· {firedStats.length} agente{firedStats.length !== 1 ? 's' : ''}</span>
            </div>
            <ChevronDown className={`w-4 h-4 text-gray-400 dark:text-gray-500 transition-transform ${expandedSections.despedidos ? 'rotate-180' : ''}`} />
          </button>
          {expandedSections.despedidos && (
            <div className="border-t border-gray-100 dark:border-gray-800 divide-y divide-gray-50">
              {firedStats.map(stat => (
                <div key={stat.name} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <UserX className="w-4 h-4 text-gray-300 flex-shrink-0" />
                    <p className="text-sm text-gray-400 dark:text-gray-500 line-through">{stat.name}</p>
                  </div>
                  <button
                    onClick={() => restoreAgent(stat.name)}
                    className="text-xs px-2.5 py-1 border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 rounded-lg transition-colors flex-shrink-0"
                  >
                    Reincorporar
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <p className="text-center text-xs text-gray-400 dark:text-gray-500 pb-2">
        Los objetivos se guardan localmente en este dispositivo · Mes: {monthLabel}
      </p>
        </>
      )}
    </div>
  );
}

// ─── RampSidebar ──────────────────────────────────────────────────────────────

function RampSidebar({ sales, isOpen, onClose }: { sales: Sale[]; isOpen: boolean; onClose: () => void }) {
  useModalClose(isOpen, onClose);
  const today      = new Date();
  const monthKey   = getMonthKey(today);
  const storageKey = `sales_goals_${monthKey}`;

  const goals = useMemo<GoalsMap>(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) || '{}') as GoalsMap; }
    catch { return {}; }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, isOpen]);

  const agentStates = useMemo<AgentStatusMap>(() => {
    try { return JSON.parse(localStorage.getItem(AGENT_STATE_KEY) || '{}') as AgentStatusMap; }
    catch { return {}; }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const customOrder = useMemo<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(AGENT_ORDER_KEY) || '[]') as string[]; }
    catch { return []; }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const thisMonthSales = sales.filter(s => getMonthKey(new Date(s.createdAt)) === monthKey);

  const teamStats = useMemo(() => {
    const people = [...new Set([...Object.keys(goals), ...thisMonthSales.map(s => s.responsible)])];
    return people
      .map(name => {
        const personSales = thisMonthSales.filter(s => s.responsible === name);
        const achieved    = personSales.filter(s => ['sold', 'delivered'].includes(s.stage)).reduce((a, s) => a + s.totalPrice, 0);
        const target      = goals[name] ?? 0;
        const pct         = target > 0 ? Math.min(150, Math.round((achieved / target) * 100)) : 0;
        const salesCount  = personSales.filter(s => ['sold', 'delivered'].includes(s.stage)).length;
        const status      = agentStates[name] ?? 'active';
        return { name, achieved, target, pct, salesCount, status };
      })
      .filter(s => s.status !== 'fired')
      .sort((a, b) => b.achieved - a.achieved);
  }, [goals, thisMonthSales, agentStates]);

  const orderedStats = useMemo(() => {
    if (customOrder.length === 0) return teamStats;
    const orderMap: Record<string, number> = {};
    customOrder.forEach((name, idx) => { orderMap[name] = idx; });
    return [...teamStats].sort((a, b) => (orderMap[a.name] ?? 9999) - (orderMap[b.name] ?? 9999));
  }, [teamStats, customOrder]);

  const totalTarget   = orderedStats.reduce((a, s) => a + s.target, 0);
  const totalAchieved = orderedStats.reduce((a, s) => a + s.achieved, 0);
  const totalPct      = totalTarget > 0 ? Math.min(100, Math.round((totalAchieved / totalTarget) * 100)) : 0;
  const monthLabel    = today.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 backdrop-blur-[1px] z-40 transition-opacity"
          onClick={onClose}
        />
      )}
      <aside
        className={`fixed top-0 right-0 h-full w-80 z-50 flex flex-col bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 shadow-2xl transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800 bg-gradient-to-r from-amber-50 to-white dark:from-amber-900/20 dark:to-gray-900">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-amber-500">
              <Trophy className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 leading-tight">RAMP View</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">{orderedStats.length} agentes · {monthLabel}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-md text-gray-400 dark:text-gray-500 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-gray-50 dark:bg-gray-800 rounded-2xl p-3">
              <p className="text-base font-bold text-gray-900 dark:text-gray-100">
                {totalTarget > 0 ? `${totalTarget.toLocaleString('es-ES')}€` : '—'}
              </p>
              <p className="text-[11px] text-gray-400 dark:text-gray-500">Objetivo mes</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-2xl p-3">
              <p className={`text-base font-bold ${totalAchieved >= totalTarget && totalTarget > 0 ? 'text-emerald-600' : 'text-blue-600'}`}>
                {totalAchieved.toLocaleString('es-ES')}€
              </p>
              <p className="text-[11px] text-gray-400 dark:text-gray-500">Conseguido</p>
            </div>
          </div>

          {totalTarget > 0 && (
            <div>
              <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1.5">
                <span>Progreso global</span>
                <span className="font-bold text-gray-800 dark:text-gray-200">{totalPct}%</span>
              </div>
              <div className="h-2.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${totalPct >= 100 ? 'bg-emerald-500' : totalPct >= 70 ? 'bg-amber-400' : 'bg-red-400'}`}
                  style={{ width: `${totalPct}%` }}
                />
              </div>
            </div>
          )}

          {/* Ranking */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3">Ranking del equipo</p>
            {orderedStats.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-2xl mb-2">🎯</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Sin agentes configurados</p>
                <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">Ve a la pestaña Objetivos para añadir agentes.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {orderedStats.map((stat, idx) => {
                  const medal    = MEDALS[idx] ?? '👤';
                  const overGoal = stat.target > 0 && stat.pct >= 100;
                  const onTrack  = stat.target > 0 && stat.pct >= 70;
                  return (
                    <div key={stat.name} className={`rounded-2xl border p-3 ${overGoal ? 'bg-emerald-50 border-emerald-200' : 'bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-800'}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-base flex-shrink-0">{medal}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate">{stat.name}</p>
                            {stat.status === 'vacation' && (
                              <span className="text-[10px] px-1.5 py-0.5 bg-sky-100 text-sky-700 rounded-full flex-shrink-0">🌴</span>
                            )}
                          </div>
                          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                            <span className={`font-bold ${overGoal ? 'text-emerald-600' : 'text-gray-800 dark:text-gray-200'}`}>{stat.achieved.toLocaleString('es-ES')}€</span>
                            {stat.target > 0 && <span className="text-gray-400 dark:text-gray-500"> / {stat.target.toLocaleString('es-ES')}€</span>}
                          </p>
                        </div>
                        {stat.target > 0 && (
                          <div className="text-right flex-shrink-0">
                            <p className={`text-xs font-bold ${overGoal ? 'text-emerald-600' : onTrack ? 'text-blue-600' : 'text-red-500'}`}>{stat.pct}%</p>
                            <p className="text-[10px] text-gray-400 dark:text-gray-500">{stat.salesCount} vtas</p>
                          </div>
                        )}
                      </div>
                      {stat.target > 0 && (
                        <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${overGoal ? 'bg-emerald-500' : onTrack ? 'bg-blue-500' : 'bg-red-400'}`}
                            style={{ width: `${Math.min(100, stat.pct)}%` }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800 flex items-center justify-center">
          <p className="text-xs text-gray-400 dark:text-gray-500">Datos locales · {monthLabel}</p>
        </div>
      </aside>
    </>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function Sales() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { vehicles, clients, addClient, createNotification, addDocument } = useApp();
  const { listUsers } = useAuth();
  const { workCenters, activeWorkCenters, hasWorkCenters, getWorkCenterName } = useWorkCenters();
  const [teamMemberOptions, setTeamMemberOptions] = useState<{ id: string; name: string }[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showGenerateDocsModal, setShowGenerateDocsModal] = useState(false);
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const { focus: activationFocus, clearFocus: clearActivationFocus } = useActivationFocus();

  useEffect(() => {
    if (activationFocus === 'sale-new') {
      setShowCreateModal(true);
      clearActivationFocus();
    }
  }, [activationFocus, clearActivationFocus]);

  const SALES_AI_FIELDS: AIFieldDef[] = [
    { key: 'vehiclePlate', label: 'Matrícula vehículo' },
    { key: 'clientName', label: 'Nombre cliente' },
    { key: 'clientPhone', label: 'Teléfono cliente' },
    { key: 'clientEmail', label: 'Email cliente' },
    { key: 'totalPrice', label: 'Precio total', type: 'number' },
    { key: 'stage', label: 'Etapa (interested/reserved/documentation/sold/delivered)' },
    { key: 'deliveryDate', label: 'Fecha entrega' },
    { key: 'notes', label: 'Notas' },
  ];

  const SALES_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'vehiclePlate', label: 'Matrícula vehículo', required: true, example: '1234ABC' },
    { key: 'clientName', label: 'Nombre cliente', required: true, example: 'Juan García' },
    { key: 'clientPhone', label: 'Teléfono cliente', example: '600123456' },
    { key: 'clientEmail', label: 'Email cliente', example: 'juan@email.com' },
    { key: 'totalPrice', label: 'Precio total', required: true, example: '18500' },
    { key: 'stage', label: 'Etapa', example: 'interested' },
    { key: 'deliveryDate', label: 'Fecha entrega', example: '2024-06-15' },
    { key: 'notes', label: 'Notas', example: '' },
  ];

  const handleImportEntries = async (entries: Record<string, string>[]) => {
    let created = 0;
    for (const entry of entries) {
      try {
        const vehicle = vehicles?.find((v: any) => v.registrationPlate === entry.vehiclePlate);
        const client = clients?.find((c: any) => c.name === entry.clientName);
        await handleCreateSale({
          vehicleId: vehicle?.id || '',
          clientId: client?.id || '',
          totalPrice: Number(entry.totalPrice) || 0,
          stage: (entry.stage as SaleStage) || 'interested',
          deliveryDate: entry.deliveryDate || '',
          notes: entry.notes || '',
        } as any);
        created++;
      } catch { /* skip */ }
    }
    toast.success(`${created} venta(s) importada(s)`);
  };

  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [activeTab, setActiveTab] = useState<SalesTab>('pipeline');
  const [search, setSearch] = useState('');
  const [sales, setSales] = useState<Sale[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [invoiceFilter, setInvoiceFilter] = useState<Invoice['status'] | 'all'>('all');
  const [showRampSidebar, setShowRampSidebar] = useState(false);
  const [pipelineTablaView, setPipelineTablaView] = useState<'quick' | 'advanced'>('quick');

  const [filterStage,       setFilterStage]       = useState<string[]>([]);
  const [filterVehicle,     setFilterVehicle]     = useState<string[]>([]);
  const [filterClient,      setFilterClient]      = useState<string[]>([]);
  const [filterResponsible, setFilterResponsible] = useState<string[]>([]);
  const [filterWorkCenter,  setFilterWorkCenter]  = useState<string>('all');
  const [sortState, setSortState] = useState<SortState>(null);
  const { visibleColumns: visibleSaleCols, visibleIds: visibleSaleColIds, columnOrder: saleColOrder, toggleColumn: toggleSaleCol, reorderColumns: reorderSaleCols, resetToDefault: resetSaleCols } = useColumnPreferences('sales', SALE_COLUMNS);

  const handleSort = useCallback((key: string, dir: 'asc' | 'desc') => {
    setSortState(key ? { key, dir } : null);
  }, []);
  const loadSales = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const nextSales = await listSalesRecords();
      setSales(nextSales);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('sales.errors.loadFailed'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSales();
  }, [loadSales]);

  useEffect(() => {
    listUsers().then(users => {
      const options = users
        .filter(u => u.fullName)
        .map(u => ({
          id: u.user_id || u.id || '',
          name: u.fullName,
        }))
        .filter(option => option.id && option.name);
      if (options.length > 0) setTeamMemberOptions(options);
    }).catch(() => {});
  }, [listUsers]);

  const allSales = useMemo<Sale[]>(() => sales, [sales]);

  const salesAlertRollup = useMemo(() => {
    let critical = 0;
    let warning = 0;
    for (const s of allSales) {
      const lvl = computeSaleUiAlertLevel(s);
      if (lvl === 'critical') critical += 1;
      else if (lvl === 'warning') warning += 1;
    }
    return { critical, warning };
  }, [allSales]);

  const allInvoices = useMemo<Invoice[]>(() => {
    return allSales.map((sale, index) => {
      const created = new Date(sale.createdAt);
      const covered = getSaleCoveredAmount(sale);
      return {
        id: `inv-${sale.id}`,
        saleId: sale.id,
        number: `FAC-${created.getFullYear()}-${String(index + 1).padStart(3, '0')}`,
        clientName: sale.clientName,
        vehicleName: sale.vehicleName,
        vehiclePlate: sale.vehiclePlate,
        date: sale.createdAt,
        dueDate: sale.expectedDelivery || addDays(sale.createdAt, 15),
        total: sale.totalPrice,
        paid: covered,
        status: buildInvoiceStatus(sale),
      };
    });
  }, [allSales]);

  // ── Opciones ColFilter ────────────────────────────────────────────────────
  const stageOptions       = (Object.keys(SALE_STAGE_TOKEN) as SaleStage[]).map(k => SALE_STAGE_TOKEN[k].label);
  const vehicleOptions     = [...new Set(allSales.map(s => s.vehicleName))].sort();
  const clientOptions      = [...new Set(allSales.map(s => s.clientName))].sort();
  const responsibleOptions = [...new Set(allSales.map(s => s.responsible))].sort();

  const workCenterOptions = [...new Set(allSales.map(s => s.workCenterName).filter(Boolean))].sort() as string[];
  const activeFilters = filterStage.length + filterVehicle.length + filterClient.length + filterResponsible.length + (filterWorkCenter !== 'all' ? 1 : 0);
  const clearFilters = () => { setFilterStage([]); setFilterVehicle([]); setFilterClient([]); setFilterResponsible([]); setFilterWorkCenter('all'); };

  // ── Pipeline: search only ─────────────────────────────────────────────────
  const wcFilteredSales = useMemo(() => {
    if (filterWorkCenter === 'all') return allSales;
    return allSales.filter(s => s.workCenterId === filterWorkCenter);
  }, [allSales, filterWorkCenter]);

  const searchedSales = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return wcFilteredSales;
    return wcFilteredSales.filter(s =>
      s.vehicleName.toLowerCase().includes(q) ||
      s.clientName.toLowerCase().includes(q) ||
      s.responsible.toLowerCase().includes(q) ||
      SALE_STAGE_TOKEN[s.stage].label.toLowerCase().includes(q)
    );
  }, [wcFilteredSales, search]);

  // ── Tabla: search + col filters + sort ───────────────────────────────────
  const tableSales = useMemo(() => {
    const q = search.trim().toLowerCase();
    let result = wcFilteredSales.filter(s => {
      const matchSearch = !q || s.vehicleName.toLowerCase().includes(q) || s.clientName.toLowerCase().includes(q) || s.responsible.toLowerCase().includes(q) || SALE_STAGE_TOKEN[s.stage].label.toLowerCase().includes(q);
      const stageLabel  = SALE_STAGE_TOKEN[s.stage].label;
      return matchSearch &&
        (filterStage.length === 0       || filterStage.includes(stageLabel)) &&
        (filterVehicle.length === 0     || filterVehicle.includes(s.vehicleName)) &&
        (filterClient.length === 0      || filterClient.includes(s.clientName)) &&
        (filterResponsible.length === 0 || filterResponsible.includes(s.responsible));
    });
    if (sortState?.key) {
      const { key, dir } = sortState;
      const mul = dir === 'asc' ? 1 : -1;
      result = [...result].sort((a, b) => {
        let va: string | number = '', vb: string | number = '';
        if      (key === 'vehicleName') { va = a.vehicleName; vb = b.vehicleName; }
        else if (key === 'clientName')  { va = a.clientName; vb = b.clientName; }
        else if (key === 'stage')       { va = STAGE_ORDER[a.stage]; vb = STAGE_ORDER[b.stage]; }
        else if (key === 'totalPrice')  { va = a.totalPrice; vb = b.totalPrice; }
        else if (key === 'cobros')      { va = getSaleCoveredAmount(a); vb = getSaleCoveredAmount(b); }
        else if (key === 'delivery')    { va = a.expectedDelivery ?? ''; vb = b.expectedDelivery ?? ''; }
        else if (key === 'responsible') { va = a.responsible; vb = b.responsible; }
        else if (key === 'workCenterName') { va = a.workCenterName || ''; vb = b.workCenterName || ''; }
        if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * mul;
        return String(va).localeCompare(String(vb), 'es') * mul;
      });
    }
    return result;
  }, [allSales, search, filterStage, filterVehicle, filterClient, filterResponsible, sortState]);

  // ── Facturas: search ─────────────────────────────────────────────────────
  const filteredInvoices = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allInvoices.filter(i => {
      const matchesSearch = !q ||
      i.clientName.toLowerCase().includes(q) ||
      i.vehicleName.toLowerCase().includes(q) ||
      i.number.toLowerCase().includes(q) ||
      i.vehiclePlate.toLowerCase().includes(q);
      const matchesStatus = invoiceFilter === 'all' || i.status === invoiceFilter;
      return matchesSearch && matchesStatus;
    });
  }, [allInvoices, search, invoiceFilter]);

  const invoiceStats = useMemo(() => ({
    total:      allInvoices.length,
    cobradas:   allInvoices.filter(i => i.status === 'paid').length,
    pendientes: allInvoices.filter(i => i.status === 'pending').length,
    vencidas:   allInvoices.filter(i => i.status === 'overdue').length,
    cobrado:    allInvoices.reduce((s, i) => s + i.paid, 0),
    facturado:  allInvoices.reduce((s, i) => s + i.total, 0),
  }), [allInvoices]);

  const openDocs = (sale: Sale) => { setSelectedSale(sale); setShowGenerateDocsModal(true); };
  const stages = (Object.keys(SALE_STAGE_TOKEN) as SaleStage[]).map(id => ({ id, ...SALE_STAGE_TOKEN[id] }));

  const handleCreateClient = useCallback(async (client: { name: string; email: string; phone: string }) => {
    return addClient({
      ...client,
      status: 'active',
      responsible: 'Equipo comercial',
      notes: 'Creado desde el modal de nueva venta',
    });
  }, [addClient]);

  const handleCreateSale = useCallback(async (formData: {
    vehicleId: string;
    clientId: string;
    clientName: string;
    clientEmail: string;
    clientPhone: string;
    stage: SaleStage;
    totalPrice: string;
    depositPaid: string;
    expectedDelivery: string;
    responsible: string;
    responsibleId?: string;
    paymentMethod: string;
    operationType: string;
    notes: string;
    workCenterId?: string;
    workCenterName?: string;
  }) => {
    const vehicle = vehicles.find((item) => item.id === formData.vehicleId);
    const client = clients.find((item) => item.id === formData.clientId);

    if (!vehicle) {
      throw new Error('Selecciona un vehículo válido');
    }

    const totalPrice = Number(formData.totalPrice || 0);
    const depositPaid = Number(formData.depositPaid || 0);
    const financingAmount =
      formData.paymentMethod === 'Financiación'
        ? Math.max(0, totalPrice - depositPaid)
        : 0;

    const createdSale = await createSaleInCouch({
      vehicleId: vehicle.id,
      vehicleName: `${vehicle.brand} ${vehicle.model}`.trim(),
      vehiclePlate: vehicle.registrationPlate,
      vehicleYear: vehicle.year,
      vehicleMileage: vehicle.mileage,
      vehicleFuel: vehicle.fuelType || '',
      purchasePrice: vehicle.purchasePrice,
      clientId: client?.id || formData.clientId,
      clientName: client?.name || formData.clientName,
      clientPhone: client?.phone || formData.clientPhone,
      clientEmail: client?.email || formData.clientEmail,
      stage: formData.stage,
      totalPrice,
      depositPaid,
      financingAmount,
      paymentMethod: formData.paymentMethod,
      operationType: formData.operationType,
      expectedDelivery: formData.expectedDelivery,
      responsible: formData.responsible || client?.responsible || 'Equipo comercial',
      responsibleId: formData.responsibleId || undefined,
      notes: formData.notes,
      workCenterId: formData.workCenterId || undefined,
      workCenterName: formData.workCenterName || undefined,
    });

    setSales((prev) => [createdSale, ...prev]);
    await createNotification({
      level: formData.stage === 'sold' || formData.stage === 'delivered' ? 'success' : 'info',
      category: 'sale',
      title: formData.stage === 'sold' || formData.stage === 'delivered' ? 'Venta completada' : 'Venta registrada',
      message: `${createdSale.vehicleName} ${formData.stage === 'sold' || formData.stage === 'delivered' ? `vendido a ${createdSale.clientName}` : `asociado a ${createdSale.clientName}`}`,
      entityId: createdSale.id,
      entityType: 'sale',
      route: `/saas/sales/${createdSale.id}`,
    });
  }, [clients, createNotification, vehicles]);

  const handleGenerateDocuments = useCallback(async (
    sale: Sale,
    templates: Record<string, boolean>,
  ) => {
    const now = new Date().toISOString();
    const templateMap = [
      { key: 'contract', name: 'Contrato de compraventa', type: 'contract' },
      { key: 'invoice', name: 'Factura de venta', type: 'invoice' },
      { key: 'worksheet', name: 'Hoja de encargo - Transferencia', type: 'worksheet' },
    ] as const;

    const newDocuments = templateMap
      .filter((template) => templates[template.key])
      .map((template) => ({
        id: `doc-${uuidv4()}`,
        name: template.name,
        status: 'ok' as const,
        type: template.type,
        size: '0.2 MB',
        date: now,
      }));

    const nextStage =
      sale.stage === 'interested' || sale.stage === 'reserved'
        ? 'documentation'
        : sale.stage;

    const updatedSale = await updateSaleInCouch({
      ...sale,
      stage: nextStage,
      generatedDocuments: [
        ...sale.generatedDocuments,
        ...newDocuments.filter((doc) => !sale.generatedDocuments.some((existing) => existing.type === doc.type)),
      ],
      stageHistory:
        nextStage !== sale.stage
          ? [
              {
                id: `hist-${uuidv4()}`,
                type: 'stage',
                title: 'Fase actualizada',
                description: 'La venta pasó a Documentación tras generar documentos.',
                date: now,
                user: sale.responsible,
              },
              ...sale.stageHistory,
            ]
          : sale.stageHistory,
    });

    setSales((prev) => prev.map((item) => (item.id === updatedSale.id ? updatedSale : item)));
    setSelectedSale(updatedSale);

    const docCategoryMap: Record<string, string> = { contract: 'contracts', invoice: 'financial', worksheet: 'contracts' };
    for (const doc of newDocuments) {
      try {
        await addDocument({
          name: `${doc.name} — ${sale.clientName}`,
          type: docCategoryMap[doc.type] || 'other',
          status: 'pending',
          relatedTo: 'vehicle',
          relatedToId: sale.vehicleId,
          templateId: doc.type,
        });
      } catch { /* doc creation in documents module is best-effort */ }
    }

    if (newDocuments.length > 0) {
      await createNotification({
        level: 'warning',
        category: 'document',
        title: 'Documento pendiente',
        message: `${newDocuments.length} documento${newDocuments.length === 1 ? '' : 's'} generado${newDocuments.length === 1 ? '' : 's'} para ${sale.clientName}`,
        entityId: updatedSale.id,
        entityType: 'sale',
        route: `/saas/sales/${updatedSale.id}`,
        metadata: {
          documents: newDocuments.map((document) => document.name),
        },
      });
    }
  }, [createNotification, addDocument]);

  const exportInvoices = useCallback(() => {
    if (!filteredInvoices.length) {
      return;
    }

    const rows = [
      ['Numero', 'Cliente', 'Vehiculo', 'Matricula', 'Fecha', 'Vencimiento', 'Total', 'Cobrado', 'Estado'],
      ...filteredInvoices.map((invoice) => [
        invoice.number,
        invoice.clientName,
        invoice.vehicleName,
        invoice.vehiclePlate,
        invoice.date,
        invoice.dueDate,
        String(invoice.total),
        String(invoice.paid),
        invoice.status,
      ]),
    ];

    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'ventas-facturacion.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [filteredInvoices]);

  return (
    <Layout title={t('sales.title')} subtitle={t('sales.subtitle')}>
      <div className="space-y-4">
        {errorMessage && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center justify-between gap-3">
            <span>{errorMessage}</span>
            <button
              onClick={() => void loadSales()}
              className="rounded-lg bg-white dark:bg-gray-800 px-3 py-1.5 text-xs font-semibold text-red-700 border border-red-200 hover:bg-red-100 transition-colors"
            >
              {t('common.retry')}
            </button>
          </div>
        )}
        {isLoading && (
          <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
            {t('sales.loading')}
          </div>
        )}

        {!isLoading && (salesAlertRollup.critical > 0 || salesAlertRollup.warning > 0) && (
          <div
            className={`rounded-2xl border px-4 py-3 text-sm flex flex-wrap items-center justify-between gap-2 ${
              salesAlertRollup.critical > 0
                ? 'border-red-200 bg-red-50 text-red-900 dark:bg-red-950/30 dark:border-red-800 dark:text-red-100'
                : 'border-amber-200 bg-amber-50 text-amber-900 dark:bg-amber-950/20 dark:border-amber-800 dark:text-amber-100'
            }`}
          >
            <span className="flex items-center gap-2 font-medium">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              Atención en operaciones:{' '}
              {salesAlertRollup.critical > 0 && (
                <span>{salesAlertRollup.critical} crítica{salesAlertRollup.critical !== 1 ? 's' : ''}</span>
              )}
              {salesAlertRollup.critical > 0 && salesAlertRollup.warning > 0 && ' · '}
              {salesAlertRollup.warning > 0 && (
                <span>{salesAlertRollup.warning} aviso{salesAlertRollup.warning !== 1 ? 's' : ''}</span>
              )}
              {' '}según cobros, plazos y entregas.
            </span>
          </div>
        )}

        {/* ── Tabs: Pipeline / Tabla / Facturación ─────────────────────── */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-x-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
            {([
              { id: 'pipeline',    label: t('sales.tabs.pipeline'),    count: allSales.length },
              { id: 'tabla',       label: t('sales.tabs.table'),        count: null },
              { id: 'facturacion', label: t('sales.tabs.billing'),      count: allInvoices.length },
              { id: 'objetivos',   label: 'Objetivos',                  count: null },
            ] as { id: SalesTab; label: string; count: number | null }[]).map((tab, i) => {
              const isActive = activeTab === tab.id;
              return (
              <button key={tab.id} onClick={() => { setActiveTab(tab.id); setSearch(''); if (tab.id === 'pipeline') setPipelineTablaView('quick'); if (tab.id === 'tabla') setPipelineTablaView('advanced'); }}
                className={`relative flex-shrink-0 flex items-center gap-2 px-5 py-3.5 text-sm font-semibold transition-colors whitespace-nowrap ${
                  isActive ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600'
                } ${i !== 0 ? 'border-l border-gray-100 dark:border-gray-800' : ''}`}>
                {tab.label}
                {tab.count !== null && <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${isActive ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500'}`}>{tab.count}</span>}
                {isActive && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-500 rounded-t-full" />}
              </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowRampSidebar(true)}
              title="RAMP View — ranking de agentes"
              className="flex items-center gap-1.5 px-3 py-2 mb-1 border border-amber-200 bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 text-amber-700 rounded-xl text-sm font-medium transition-colors"
            >
              <Trophy className="w-4 h-4" />
              <span className="hidden sm:inline">RAMP</span>
            </button>
            <ActivationFieldWrap fieldKey="sale-new" activeKey={activationFocus}>
              <AddButtonDropdown
                label={t('sales.newSale')}
                onQuickAdd={() => setShowCreateModal(true)}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de nueva venta"
              />
            </ActivationFieldWrap>
          </div>
        </div>

        {/* ── Vista rápida / Vista avanzada — Pipeline y Tabla ────────────── */}
        {(activeTab === 'pipeline' || activeTab === 'tabla') && (
          <div className="flex justify-end mb-2">
            <div className="inline-flex items-center bg-gray-100 dark:bg-gray-700 rounded-xl p-1">
              {([['quick', LayoutGrid, t('vehicles.views.quick')], ['advanced', List, t('vehicles.views.advanced')]] as const).map(([mode, Icon, lbl]) => (
                <button key={mode} onClick={() => setPipelineTablaView(mode)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${pipelineTablaView === mode ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'}`}>
                  <Icon className="w-3.5 h-3.5" />{lbl}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Stats — Pipeline y Tabla ──────────────────────────────────── */}
        {(activeTab === 'pipeline' || activeTab === 'tabla') && (
          <div className="grid grid-cols-2 gap-3">
            {[
              { value: allSales.length, label: t('sales.stats.total'), color: 'text-gray-900 dark:text-gray-100' },
              { value: allSales.filter(s => s.stage === 'delivered').length, label: t('sales.stats.delivered'), color: 'text-emerald-600' },
              { value: allSales.filter(s => ['documentation', 'sold'].includes(s.stage)).length, label: t('sales.stats.inProgress'), color: 'text-amber-600' },
              { value: `${allSales.filter(s => s.stage === 'delivered').reduce((a, v) => a + v.totalPrice, 0).toLocaleString('es-ES')}€`, label: t('sales.stats.billed'), color: 'text-blue-600' },
            ].map(s => (
              <div key={s.label} className="bg-white dark:bg-gray-900 rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-4">
                <p className={`text-2xl font-bold leading-none mb-1 ${s.color}`}>{s.value}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── Buscador + Filtro centro — Pipeline y Tabla ─────────────── */}
        {(activeTab === 'pipeline' || activeTab === 'tabla') && (
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500 pointer-events-none" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder={t('sales.searchPlaceholder')}
                className="w-full pl-10 pr-9 py-2.5 bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm placeholder-gray-400 focus:outline-none focus:border-blue-500 transition-all" />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            {hasWorkCenters && (
              <div className="relative flex-shrink-0">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500 pointer-events-none" />
                <select
                  value={filterWorkCenter}
                  onChange={(e) => setFilterWorkCenter(e.target.value)}
                  className="pl-9 pr-8 py-2.5 bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm appearance-none cursor-pointer focus:outline-none focus:border-blue-500 transition-all"
                >
                  <option value="all">Todos los centros</option>
                  {activeWorkCenters.map((wc) => (
                    <option key={wc.id} value={wc.id}>{wc.name}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 dark:text-gray-500 pointer-events-none" />
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Pipeline (Vista rápida) ───────────────────────────────── */}
        {(activeTab === 'pipeline' || activeTab === 'tabla') && pipelineTablaView === 'quick' && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-4 sm:p-5">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-semibold text-gray-900 dark:text-gray-100">{t('sales.pipeline.title')}</h2>
              {search && <span className="text-xs text-gray-400 dark:text-gray-500">{searchedSales.length} resultados · <strong>"{search}"</strong></span>}
            </div>
            {/* Desktop: kanban */}
            <div className="hidden lg:grid lg:grid-cols-5 gap-4">
              {stages.map(stage => {
                const cols = searchedSales.filter(s => s.stage === stage.id);
                return (
                  <div key={stage.id} className="flex flex-col gap-2">
                    <div className={`flex items-center justify-between px-3 py-2 rounded-xl ${stage.headerBg}`}>
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${stage.dot}`} />
                        <span className={`text-xs font-semibold ${stage.headerText}`}>{stage.label}</span>
                      </div>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${stage.countBg} ${stage.countText}`}>{cols.length}</span>
                    </div>
                    <div className="flex flex-col gap-2 min-h-[180px]">
                      {cols.map(sale => <KanbanCard key={sale.id} sale={sale} onDocs={openDocs} />)}
                      {cols.length === 0 && (
                        <div className="flex-1 border-2 border-dashed border-gray-100 dark:border-gray-800 rounded-2xl flex items-center justify-center p-6">
                          <span className="text-xs text-gray-300">{t('sales.pipeline.noSales')}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Mobile: secciones */}
            <div className="lg:hidden space-y-5">
              {stages.map(stage => {
                const cols = searchedSales.filter(s => s.stage === stage.id);
                return (
                  <div key={stage.id}>
                    <div className={`flex items-center justify-between px-3 py-2.5 rounded-xl mb-2 ${stage.headerBg}`}>
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${stage.dot}`} />
                        <span className={`text-xs font-semibold ${stage.headerText}`}>{stage.label}</span>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${stage.countBg} ${stage.countText}`}>{cols.length}</span>
                    </div>
                    {cols.length === 0 ? (
                      <div className="border border-dashed border-gray-200 dark:border-gray-700 rounded-2xl py-4 text-center">
                        <span className="text-xs text-gray-300">{t('sales.pipeline.noSalesStage')}</span>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {cols.map(sale => <MobileListCard key={sale.id} sale={sale} onDocs={openDocs} />)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Tab: Tabla (Vista avanzada) ─────────────────────────────────── */}
        {(activeTab === 'pipeline' || activeTab === 'tabla') && pipelineTablaView === 'advanced' && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between gap-3">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                <span className="font-semibold text-gray-900 dark:text-gray-100">{tableSales.length}</span> {tableSales.length !== 1 ? t('sales.salesPlural') : t('sales.saleSingular')}
              </p>
              <div className="flex items-center gap-2">
                {(activeFilters > 0 || sortState) && (
                  <button onClick={() => { clearFilters(); setSortState(null); }}
                    className="text-xs text-red-500 hover:text-red-700 font-medium flex items-center gap-1">
                    <X className="w-3 h-3" /> {t('common.clearFilters')}
                  </button>
                )}
                <ColumnCustomizer
                  columns={SALE_COLUMNS}
                  visibleIds={visibleSaleColIds}
                  columnOrder={saleColOrder}
                  onToggle={toggleSaleCol}
                  onReorder={reorderSaleCols}
                  onReset={resetSaleCols}
                />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[500px]">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800">
                    <th className="w-2 px-0" />
                    {visibleSaleCols.includes('vehiculo') && <th className="px-5 py-3 text-left"><ColFilter label={t('sales.table.vehicle')} options={vehicleOptions} selected={filterVehicle} onChange={setFilterVehicle} sortKey="vehicleName" currentSort={sortState} onSort={handleSort} /></th>}
                    {visibleSaleCols.includes('cliente') && <th className="px-5 py-3 text-left"><ColFilter label={t('sales.table.client')} options={clientOptions} selected={filterClient} onChange={setFilterClient} sortKey="clientName" currentSort={sortState} onSort={handleSort} /></th>}
                    {visibleSaleCols.includes('estado') && (
                      <th className="px-5 py-3 text-left">
                        <ColFilter label={t('sales.table.status')} options={stageOptions} selected={filterStage} onChange={setFilterStage} sortKey="stage" currentSort={sortState} onSort={handleSort}
                          renderOption={(opt) => { const e = Object.values(SALE_STAGE_TOKEN).find(tk => tk.label === opt); return <span className="flex items-center gap-2">{e && <span className={`w-2 h-2 rounded-full flex-shrink-0 ${e.dot}`} />}<span>{opt}</span></span>; }} />
                      </th>
                    )}
                    {visibleSaleCols.includes('total') && <th className="px-5 py-3 text-right"><ColFilter label={t('sales.table.total')} options={[]} selected={[]} onChange={() => {}} sortKey="totalPrice" currentSort={sortState} onSort={handleSort} align="right" /></th>}
                    {visibleSaleCols.includes('cobros') && <th className="px-5 py-3 text-left"><ColFilter label={t('sales.table.payments')} options={[]} selected={[]} onChange={() => {}} sortKey="cobros" currentSort={sortState} onSort={handleSort} /></th>}
                    {visibleSaleCols.includes('entrega') && <th className="px-5 py-3 text-left"><ColFilter label={t('sales.table.delivery')} options={[]} selected={[]} onChange={() => {}} sortKey="delivery" currentSort={sortState} onSort={handleSort} /></th>}
                    {visibleSaleCols.includes('responsable') && <th className="px-5 py-3 text-left"><ColFilter label={t('sales.table.responsible')} options={responsibleOptions} selected={filterResponsible} onChange={setFilterResponsible} sortKey="responsible" currentSort={sortState} onSort={handleSort} /></th>}
                    {visibleSaleCols.includes('centro') && hasWorkCenters && <th className="px-5 py-3 text-left"><ColFilter label="Centro" options={workCenterOptions} selected={[]} onChange={() => {}} sortKey="workCenterName" currentSort={sortState} onSort={handleSort} /></th>}
                    <th className="px-4 py-3 w-16" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {tableSales.length === 0 ? (
                    <tr><td colSpan={visibleSaleCols.length + 2} className="py-16 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-12 h-12 bg-gray-100 dark:bg-gray-700 rounded-2xl flex items-center justify-center"><Search className="w-6 h-6 text-gray-400 dark:text-gray-500" /></div>
                        <p className="text-sm text-gray-400 dark:text-gray-500">{t('common.noResults')}</p>
                        <button onClick={() => { setSearch(''); clearFilters(); setSortState(null); }} className="text-xs text-blue-600 font-medium hover:underline">{t('common.clearAll')}</button>
                      </div>
                    </td></tr>
                  ) : tableSales.map(sale => {
                    const paid = getSaleCoveredAmount(sale);
                    const pending = getSalePendingAmount(sale);
                    const pct = sale.totalPrice ? Math.min(100, Math.round((paid / sale.totalPrice) * 100)) : 0;
                    const stageToken = SALE_STAGE_TOKEN[sale.stage];
                    return (
                      <tr key={sale.id} onClick={() => navigate(`/saas/sales/${sale.id}`)} className="hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors group">
                        <td className="pl-3 pr-0 py-0"><div className={`w-1 h-10 rounded-full ${stageToken.dot}`} /></td>
                        {visibleSaleCols.includes('vehiculo') && <td className="px-5 py-3.5"><p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{sale.vehicleName}</p><p className="text-[11px] text-gray-400 dark:text-gray-500 font-mono">{sale.vehiclePlate}</p></td>}
                        {visibleSaleCols.includes('cliente') && (
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-400 to-violet-600 flex items-center justify-center flex-shrink-0"><span className="text-[10px] font-bold text-white">{sale.clientName.charAt(0)}</span></div>
                              <span className="text-sm text-gray-700 dark:text-gray-300">{sale.clientName}</span>
                            </div>
                          </td>
                        )}
                        {visibleSaleCols.includes('estado') && <td className="px-5 py-3.5"><StagePill stage={sale.stage} /></td>}
                        {visibleSaleCols.includes('total') && <td className="px-5 py-3.5 text-right"><span className="text-sm font-bold text-gray-900 dark:text-gray-100">{sale.totalPrice.toLocaleString('es-ES')}€</span></td>}
                        {visibleSaleCols.includes('cobros') && (
                          <td className="px-5 py-3.5">
                            <div className="space-y-1.5">
                              <div className="flex gap-2 text-[11px]">
                                <span className="text-emerald-600 font-semibold">{paid.toLocaleString('es-ES')}€</span>
                                {pending > 0 && <span className="text-red-400">−{pending.toLocaleString('es-ES')}€</span>}
                              </div>
                              <div className="w-20 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden"><div className={`h-full rounded-full ${pct === 100 ? 'bg-emerald-500' : 'bg-amber-400'}`} style={{ width: `${pct}%` }} /></div>
                            </div>
                          </td>
                        )}
                        {visibleSaleCols.includes('entrega') && <td className="px-5 py-3.5">{sale.expectedDelivery ? <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400"><Calendar className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />{new Date(sale.expectedDelivery).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}</div> : <span className="text-xs text-gray-300">—</span>}</td>}
                        {visibleSaleCols.includes('responsable') && <td className="px-5 py-3.5"><span className="text-xs text-gray-500 dark:text-gray-400">{sale.responsible}</span></td>}
                        {visibleSaleCols.includes('centro') && hasWorkCenters && (
                          <td className="px-5 py-3.5">
                            {sale.workCenterName ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-800">
                                <MapPin className="w-3 h-3" />{sale.workCenterName}
                              </span>
                            ) : <span className="text-xs text-gray-300 dark:text-gray-600">—</span>}
                          </td>
                        )}
                        <td className="px-4 py-3.5">
                          <button onClick={e => { e.stopPropagation(); openDocs(sale); }} className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg opacity-0 group-hover:opacity-100 transition-all">
                            <FileText className="w-3.5 h-3.5" /> Docs
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Tab: Objetivos ────────────────────────────────────────────── */}
        {activeTab === 'objetivos' && <TabObjetivos sales={allSales} />}

        {/* ── Tab: Facturación ──────────────────────────────────────────── */}
        {activeTab === 'facturacion' && (
          <>
            {/* Stats facturación — mismo patrón 2x2 */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { value: invoiceStats.total,                                 label: t('sales.billing.totalInvoices'), color: 'text-gray-900 dark:text-gray-100' },
                { value: invoiceStats.cobradas,                              label: t('sales.billing.collected'),     color: 'text-emerald-600' },
                { value: invoiceStats.vencidas,                              label: t('sales.billing.overdue'),       color: invoiceStats.vencidas > 0 ? 'text-red-500' : 'text-gray-400 dark:text-gray-500' },
                { value: `${invoiceStats.cobrado.toLocaleString('es-ES')}€`, label: t('sales.billing.totalCollected'), color: 'text-blue-600' },
              ].map(s => (
                <div key={s.label} className="bg-white dark:bg-gray-900 rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-4">
                  <p className={`text-2xl font-bold leading-none mb-1 ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Toolbar facturación */}
            <div className="flex items-center gap-2">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500 pointer-events-none" />
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder={t('sales.billing.searchPlaceholder')}
                  className="w-full pl-9 pr-8 py-2.5 bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm placeholder-gray-400 focus:outline-none focus:border-blue-500 transition-all" />
                {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2"><X className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" /></button>}
              </div>
              <button onClick={exportInvoices} className="flex-shrink-0 flex items-center gap-1.5 px-3.5 py-2.5 border-2 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-600 dark:text-gray-400 text-sm font-medium rounded-xl transition-colors">
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">{t('common.export')}</span>
              </button>
            </div>

            {/* Chips por estado de factura */}
            <div className="flex gap-1.5 overflow-x-auto pb-0.5 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
              {(['all', 'paid', 'pending', 'overdue', 'draft'] as const).map(st => {
                const count = st === 'all' ? allInvoices.length : allInvoices.filter(i => i.status === st).length;
                const label = st === 'all' ? t('common.all') : t(INVOICE_STATUS_CONFIG[st].i18nKey);
                if (st !== 'all' && count === 0) return null;
                return (
                  <button
                    key={st}
                    onClick={() => setInvoiceFilter(st)}
                    className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border-2 whitespace-nowrap transition-colors ${
                      invoiceFilter === st
                        ? 'bg-gray-900 border-gray-900 text-white'
                        : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    {label}
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${invoiceFilter === st ? 'bg-white/15 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>{count}</span>
                  </button>
                );
              })}
            </div>

            {/* Lista de facturas — grid estilo Clientes */}
            {filteredInvoices.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {filteredInvoices.map(inv => <InvoiceCard key={inv.id} invoice={inv} />)}
              </div>
            ) : (
              <div className="text-center py-14">
                <Receipt className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                <p className="text-sm text-gray-400 dark:text-gray-500">{t('sales.billing.noInvoices')}</p>
                {search && <button onClick={() => setSearch('')} className="mt-2 text-xs text-blue-600 font-medium">{t('common.clearSearch')}</button>}
              </div>
            )}
          </>
        )}

      </div>

      <SAAS__CreateSaleModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={handleCreateSale}
        onCreateClient={handleCreateClient}
        onAddVehicle={() => {
          setShowCreateModal(false);
          navigate('/saas/vehicles?quickAdd=1');
        }}
        vehicles={vehicles || []}
        clients={clients || []}
        teamMemberOptions={teamMemberOptions}
        existingSales={allSales}
      />
      {selectedSale && (
        <SAAS__GenerateDocumentsModal
          isOpen={showGenerateDocsModal}
          onClose={() => { setShowGenerateDocsModal(false); setSelectedSale(null); }}
          sale={selectedSale}
          onGenerate={async (data) => {
            await handleGenerateDocuments(selectedSale, data.templates || {});
            setShowGenerateDocsModal(false);
            navigate('/saas/documents');
          }}
        />
      )}

      <RampSidebar
        sales={allSales}
        isOpen={showRampSidebar}
        onClose={() => setShowRampSidebar(false)}
      />

      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="sales"
        moduleLabel="Ventas"
        fields={SALES_AI_FIELDS}
        onEntriesParsed={async (entries) => {
          let created = 0;
          for (const entry of entries) {
            try {
              const vehicle = vehicles?.find((v: any) => v.registrationPlate === entry.vehiclePlate);
              const client = clients?.find((c: any) => c.name === entry.clientName);
              await handleCreateSale({
                vehicleId: vehicle?.id || '',
                clientId: client?.id || '',
                totalPrice: Number(entry.totalPrice) || 0,
                stage: (entry.stage as SaleStage) || 'interested',
                deliveryDate: String(entry.deliveryDate || ''),
                notes: String(entry.notes || ''),
              } as any);
              created++;
            } catch { /* skip */ }
          }
          toast.success(`${created} venta(s) creada(s) con IA`);
        }}
        placeholder="Describe las ventas. Ejemplo:\n\n'Venta del Golf matrícula 1234ABC al cliente Juan García por 18.500€, reservado, entrega prevista 15 enero.'"
      />

      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Ventas"
        fields={SALES_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}