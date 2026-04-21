import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Layout } from '../../components/saas/Layout';
import { useModalClose } from '../../hooks/useModalClose';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertCircle,
  ArrowDownRight,
  ArrowLeftRight,
  ArrowUpRight,
  BarChart2,
  Bell,
  BellRing,
  BookOpen,
  Calendar,
  Check,
  CheckCircle2,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  TrendingDown,
  TrendingUp,
  Wallet,
  X,
} from 'lucide-react';
import { PeriodBadge } from '../../components/ui/PeriodBadge';
import { useAuth } from '../../context/AuthContext';
import { createFinanceMovementInCouch, listFinanceMovements } from '../../lib/financeApi';
import {
  buildFinanceReference,
  type CreateFinanceMovementPayload,
  type FinanceMovementDocType,
  type FinanceMovementRecord,
} from '../../lib/financeTypes';
import {
  buildInvoiceFromMovement,
  buildInvoiceNumber,
  generateInvoicePdf,
} from '../../lib/invoicePdfGenerator';
import { exportAccountingToExcel } from '../../lib/accountingExport';
import {
  buildReminderEmailBody,
  createPaymentReminder,
  detectReminderLevel,
  listPaymentReminders,
  markReminderResolved,
  markReminderSent,
  REMINDER_LEVELS,
  type PaymentReminder,
} from '../../lib/paymentRemindersApi';
import {
  buildVatBook,
  downloadVatCsv,
  getAvailableYears,
  getQuarterLabel,
  type VatQuarter,
  type VatQuarterSummary,
} from '../../lib/vatBookApi';
import {
  convertAmount,
  fetchExchangeRates,
  getCurrencyList,
  type CurrencyCode,
} from '../../lib/currencyApi';
import BankAccountsWidget from '../../components/saas/finance/BankAccountsWidget';
import TaxCalendarWidget from '../../components/saas/finance/TaxCalendarWidget';

type FinanceTab = 'overview' | 'dashboard' | 'transactions' | 'reminders' | 'vat-book';
type TxType = 'income' | 'expense';
type NewMovementDraft = Omit<CreateFinanceMovementPayload, 'user_id' | 'companyName'>;

const INCOME_CATEGORIES = [
  { label: 'Venta vehículo', color: '#10b981', icon: '🚗' },
  { label: 'Señal / Reserva', color: '#f59e0b', icon: '🤝' },
  { label: 'Financiación', color: '#3b82f6', icon: '🏦' },
  { label: 'Garantía', color: '#8b5cf6', icon: '🛡️' },
  { label: 'Alquiler vehículo', color: '#06b6d4', icon: '🔑' },
  { label: 'Otros ingresos', color: '#64748b', icon: '💰' },
] as const;

const EXPENSE_CATEGORIES = [
  { label: 'Compra stock', color: '#ef4444', icon: '🏷️' },
  { label: 'Reparaciones', color: '#8b5cf6', icon: '🔧' },
  { label: 'Gestoría / Trámites', color: '#3b82f6', icon: '📋' },
  { label: 'Seguros', color: '#64748b', icon: '🛡️' },
  { label: 'Publicidad', color: '#f59e0b', icon: '📣' },
  { label: 'Suministros', color: '#06b6d4', icon: '⚡' },
  { label: 'Alquiler local', color: '#10b981', icon: '🏠' },
  { label: 'Nóminas', color: '#ec4899', icon: '👥' },
  { label: 'Otros gastos', color: '#94a3b8', icon: '📦' },
] as const;

const PAY_METHODS = [
  'Transferencia',
  'Efectivo',
  'Tarjeta',
  'Domiciliación',
  'Bizum',
  'PayPal',
  'Otros',
];
const TAX_OPTS = [0, 4, 10, 21];

const TX_TOKEN = {
  income: {
    label: 'Cobro',
    dot: 'bg-emerald-500',
    badgeBg: 'bg-emerald-50',
    badgeText: 'text-emerald-700',
    accentBorder: 'border-l-emerald-500',
    amountColor: 'text-emerald-600',
    sign: '+',
  },
  expense: {
    label: 'Pago',
    dot: 'bg-red-500',
    badgeBg: 'bg-red-50',
    badgeText: 'text-red-700',
    accentBorder: 'border-l-red-500',
    amountColor: 'text-red-600',
    sign: '-',
  },
} as const;

function formatCurrency(value: number) {
  return `${value.toLocaleString('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}€`;
}

function formatMonthLabel(date: Date) {
  const label = new Intl.DateTimeFormat('es-ES', { month: 'short' }).format(date);
  return label.charAt(0).toUpperCase() + label.slice(1).replace('.', '');
}

function toUiType(type: FinanceMovementDocType): TxType {
  return type === 'cobro' ? 'income' : 'expense';
}

function getCategoryMeta(txType: TxType, category: string) {
  const source = txType === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  return source.find((item) => item.label === category);
}

function matchesSearch(movement: FinanceMovementRecord, query: string) {
  if (!query.trim()) {
    return true;
  }

  const haystack = [
    movement.concept,
    movement.reference,
    movement.category,
    movement.payMethod,
    movement.notes,
  ]
    .join(' ')
    .toLowerCase();

  return haystack.includes(query.trim().toLowerCase());
}

function buildCsv(rows: FinanceMovementRecord[]) {
  const escapeCell = (value: string | number) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const header = [
    'Tipo',
    'Concepto',
    'Referencia',
    'Categoria',
    'Metodo',
    'Fecha',
    'Base',
    'IVA (%)',
    'IVA (€)',
    'Total (€)',
    'Notas',
  ];
  const lines = rows.map((movement) =>
    [
      movement.type,
      movement.concept,
      movement.reference,
      movement.category,
      movement.payMethod,
      movement.date,
      movement.amountBase.toFixed(2),
      movement.taxRate.toFixed(2),
      movement.taxAmount.toFixed(2),
      movement.totalAmount.toFixed(2),
      movement.notes,
    ]
      .map(escapeCell)
      .join(','),
  );

  return [header.map(escapeCell).join(','), ...lines].join('\n');
}

function downloadCsv(rows: FinanceMovementRecord[]) {
  const blob = new Blob([`\uFEFF${buildCsv(rows)}`], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `finance-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-3 text-sm shadow-lg">
      <p className="mb-2 font-bold text-gray-900 dark:text-gray-100">{label}</p>
      {payload.map((item: any, index: number) => (
        <p key={index} className="flex items-center gap-2">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: item.color }}
          />
          <span className="text-gray-500 dark:text-gray-400">
            {item.name === 'ingresos' ? 'Cobros' : 'Pagos'}:
          </span>
          <span className="font-semibold text-gray-900 dark:text-gray-100">{formatCurrency(item.value || 0)}</span>
        </p>
      ))}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-3">
      <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">{label}</p>
      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{value || '—'}</p>
    </div>
  );
}

function TransactionDetailModal({
  movement,
  onClose,
  allMovements,
  issuerName,
}: {
  movement: FinanceMovementRecord;
  onClose: () => void;
  allMovements: FinanceMovementRecord[];
  issuerName: string;
}) {
  const uiType = toUiType(movement.type);
  const token = TX_TOKEN[uiType];
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const [invoiceAddress, setInvoiceAddress] = useState('');
  const [invoiceCity, setInvoiceCity] = useState('');
  const [recipientName, setRecipientName] = useState(movement.companyName || '');
  const [recipientNif, setRecipientNif] = useState('');
  const [issuerNif, setIssuerNif] = useState('');

  const invoiceNumber = useMemo(() => {
    const year = movement.date.slice(0, 4);
    const seq = allMovements.filter(
      (m) => m.type === 'cobro' && m.date.slice(0, 4) === year,
    ).findIndex((m) => m.id === movement.id) + 1 || 1;
    return buildInvoiceNumber(seq, Number(year));
  }, [allMovements, movement]);

  const handleGenerateInvoice = () => {
    const inv = buildInvoiceFromMovement(
      movement,
      {
        companyName: issuerName || 'Mi Empresa',
        nif: issuerNif,
        address: invoiceAddress,
        city: invoiceCity,
      },
      invoiceNumber,
    );
    inv.recipient = { name: recipientName || movement.companyName || 'Cliente', nif: recipientNif };
    generateInvoicePdf(inv);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[94dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl bg-white dark:bg-gray-900 shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 px-6 py-4">
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">Detalle del movimiento</h2>
            <p className="text-xs text-gray-400 dark:text-gray-500">Información guardada en CouchDB</p>
          </div>
          <button onClick={onClose} className="rounded-xl p-2 hover:bg-gray-100 dark:hover:bg-gray-700">
            <X className="h-5 w-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-6 py-5">
          <div
            className={`rounded-2xl border p-4 ${
              uiType === 'income'
                ? 'border-emerald-100 bg-emerald-50'
                : 'border-red-100 bg-red-50'
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${token.badgeBg} ${token.badgeText}`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${token.dot}`} />
                  {token.label}
                </span>
                <p className="mt-3 text-lg font-bold text-gray-900 dark:text-gray-100">{movement.concept}</p>
                <p className="mt-1 font-mono text-xs text-gray-500 dark:text-gray-400">{movement.reference || 'Sin referencia'}</p>
              </div>
              <p className={`text-xl font-bold ${token.amountColor}`}>
                {token.sign}
                {formatCurrency(movement.totalAmount)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <DetailRow label="Tipología" value={movement.category} />
            <DetailRow label="Método" value={movement.payMethod} />
            <DetailRow
              label="Fecha"
              value={new Date(movement.date).toLocaleDateString('es-ES')}
            />
            <DetailRow label="Base imponible" value={formatCurrency(movement.amountBase)} />
            <DetailRow label="IVA" value={`${movement.taxRate}% · ${formatCurrency(movement.taxAmount)}`} />
            <DetailRow label="Total" value={formatCurrency(movement.totalAmount)} />
          </div>

          <DetailRow label="Notas" value={movement.notes || 'Sin observaciones'} />

          {/* Invoice generation section */}
          {uiType === 'income' && (
            <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
              <div className="mb-3 flex items-center gap-2">
                <FileText className="h-4 w-4 text-blue-600" />
                <p className="text-sm font-bold text-blue-900">Generar Factura PDF</p>
                <span className="ml-auto rounded-full bg-blue-100 px-2 py-0.5 font-mono text-[10px] font-semibold text-blue-700">
                  {invoiceNumber}
                </span>
              </div>

              {!showInvoiceForm ? (
                <button
                  onClick={() => setShowInvoiceForm(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
                >
                  <FileText className="h-4 w-4" />
                  Completar datos y generar PDF
                </button>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-blue-700">
                        NIF Emisor
                      </label>
                      <input
                        value={issuerNif}
                        onChange={(e) => setIssuerNif(e.target.value)}
                        placeholder="B12345678"
                        className="w-full rounded-xl border-2 border-blue-200 bg-white dark:bg-gray-900 px-3 py-2 text-xs focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-blue-700">
                        Dirección Emisor
                      </label>
                      <input
                        value={invoiceAddress}
                        onChange={(e) => setInvoiceAddress(e.target.value)}
                        placeholder="Calle Mayor 1"
                        className="w-full rounded-xl border-2 border-blue-200 bg-white dark:bg-gray-900 px-3 py-2 text-xs focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-blue-700">
                        Ciudad Emisor
                      </label>
                      <input
                        value={invoiceCity}
                        onChange={(e) => setInvoiceCity(e.target.value)}
                        placeholder="Madrid 28001"
                        className="w-full rounded-xl border-2 border-blue-200 bg-white dark:bg-gray-900 px-3 py-2 text-xs focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-blue-700">
                        NIF Receptor
                      </label>
                      <input
                        value={recipientNif}
                        onChange={(e) => setRecipientNif(e.target.value)}
                        placeholder="12345678A"
                        className="w-full rounded-xl border-2 border-blue-200 bg-white dark:bg-gray-900 px-3 py-2 text-xs focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-blue-700">
                      Nombre / Razón Social Receptor
                    </label>
                    <input
                      value={recipientName}
                      onChange={(e) => setRecipientName(e.target.value)}
                      placeholder="Cliente o razón social"
                      className="w-full rounded-xl border-2 border-blue-200 bg-white dark:bg-gray-900 px-3 py-2 text-xs focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowInvoiceForm(false)}
                      className="flex-1 rounded-xl border-2 border-blue-200 py-2 text-xs font-semibold text-blue-700 hover:border-blue-300"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleGenerateInvoice}
                      className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Descargar PDF
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Financial Dashboard ─────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  color,
  icon: Icon,
  trend,
}: {
  label: string;
  value: string;
  sub: string;
  color: string;
  icon: React.ElementType;
  trend?: number;
}) {
  return (
    <div className={`rounded-2xl border bg-white dark:bg-gray-900 p-5 border-l-4 ${color}`}>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">{label}</span>
        <div className={`flex h-8 w-8 items-center justify-center rounded-xl bg-gray-50 dark:bg-gray-800`}>
          <Icon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
        </div>
      </div>
      <p className="text-2xl font-bold leading-none text-gray-900 dark:text-gray-100">{value}</p>
      <div className="mt-2 flex items-center gap-2">
        {trend !== undefined && (
          <span className={`flex items-center gap-0.5 text-xs font-semibold ${trend >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
            {trend >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {Math.abs(trend).toFixed(1)}%
          </span>
        )}
        <p className="text-xs text-gray-400 dark:text-gray-500">{sub}</p>
      </div>
    </div>
  );
}

function FinanceDashboard({ movements }: { movements: FinanceMovementRecord[] }) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.toISOString().slice(0, 7);
  const prevMonth = (() => {
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return d.toISOString().slice(0, 7);
  })();

  const ytd = useMemo(() => movements.filter((m) => m.date.slice(0, 4) === String(currentYear)), [movements, currentYear]);

  const ytdIncome = ytd.filter((m) => m.type === 'cobro').reduce((s, m) => s + m.totalAmount, 0);
  const ytdExpense = ytd.filter((m) => m.type === 'pago').reduce((s, m) => s + m.totalAmount, 0);
  const ytdProfit = ytdIncome - ytdExpense;
  const ytdMargin = ytdIncome > 0 ? (ytdProfit / ytdIncome) * 100 : 0;

  const curMonthMvs = movements.filter((m) => m.date.slice(0, 7) === currentMonth);
  const prevMonthMvs = movements.filter((m) => m.date.slice(0, 7) === prevMonth);

  const curIncome = curMonthMvs.filter((m) => m.type === 'cobro').reduce((s, m) => s + m.totalAmount, 0);
  const prevIncome = prevMonthMvs.filter((m) => m.type === 'cobro').reduce((s, m) => s + m.totalAmount, 0);
  const incomeTrend = prevIncome > 0 ? ((curIncome - prevIncome) / prevIncome) * 100 : 0;

  const curExpense = curMonthMvs.filter((m) => m.type === 'pago').reduce((s, m) => s + m.totalAmount, 0);
  const prevExpense = prevMonthMvs.filter((m) => m.type === 'pago').reduce((s, m) => s + m.totalAmount, 0);
  const expenseTrend = prevExpense > 0 ? ((curExpense - prevExpense) / prevExpense) * 100 : 0;

  // Monthly profitability (12 months)
  const monthlyProfit = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
      const key = d.toISOString().slice(0, 7);
      const label = new Intl.DateTimeFormat('es-ES', { month: 'short' }).format(d).replace('.', '').slice(0, 3);
      const monthMvs = movements.filter((m) => m.date.slice(0, 7) === key);
      const inc = monthMvs.filter((m) => m.type === 'cobro').reduce((s, m) => s + m.totalAmount, 0);
      const exp = monthMvs.filter((m) => m.type === 'pago').reduce((s, m) => s + m.totalAmount, 0);
      const profit = inc - exp;
      const margin = inc > 0 ? (profit / inc) * 100 : 0;
      return { mes: label, ingresos: inc, gastos: exp, beneficio: profit, margen: Number(margin.toFixed(1)) };
    });
  }, [movements]);

  // Category margins (income categories)
  const categoryMargins = useMemo(() => {
    const grouped = new Map<string, { income: number; count: number; color: string }>();
    ytd.filter((m) => m.type === 'cobro').forEach((m) => {
      const prev = grouped.get(m.category) || { income: 0, count: 0, color: m.categoryColor || '#10b981' };
      grouped.set(m.category, { income: prev.income + m.totalAmount, count: prev.count + 1, color: prev.color });
    });
    return Array.from(grouped.entries())
      .map(([cat, val]) => ({ name: cat, value: val.income, count: val.count, color: val.color }))
      .sort((a, b) => b.value - a.value);
  }, [ytd]);

  // Accumulated cashflow
  const accumulatedData = useMemo(() => {
    let acc = 0;
    return monthlyProfit.map((m) => {
      acc += m.beneficio;
      return { ...m, acumulado: acc };
    });
  }, [monthlyProfit]);

  const profitTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-3 text-xs shadow-lg">
        <p className="mb-2 font-bold text-gray-900 dark:text-gray-100">{label}</p>
        {payload.map((item: any, i: number) => (
          <p key={i} className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
            <span className="text-gray-500 dark:text-gray-400">{item.name}:</span>
            <span className="font-semibold text-gray-900 dark:text-gray-100">
              {item.name === 'margen' ? `${item.value}%` : formatCurrency(item.value)}
            </span>
          </p>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Ingresos YTD" value={formatCurrency(ytdIncome)} sub="Este año" color="border-l-emerald-500" icon={ArrowUpRight} trend={incomeTrend} />
        <KpiCard label="Gastos YTD" value={formatCurrency(ytdExpense)} sub="Este año" color="border-l-red-500" icon={ArrowDownRight} trend={expenseTrend} />
        <KpiCard label="Beneficio neto" value={formatCurrency(ytdProfit)} sub="Este año" color={ytdProfit >= 0 ? 'border-l-blue-500' : 'border-l-orange-500'} icon={TrendingUp} />
        <KpiCard label="Margen bruto" value={`${ytdMargin.toFixed(1)}%`} sub="Sobre ingresos" color="border-l-purple-500" icon={BarChart2} />
      </div>

      {/* Monthly profitability chart */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 relative">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-gray-900 dark:text-gray-100">Rentabilidad mensual</h3>
            <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">Beneficio neto y margen — últimos 12 meses</p>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400"><span className="h-2 w-2 rounded-full bg-blue-500" /> Beneficio</span>
            <span className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400"><span className="h-2 w-2 rounded-full bg-purple-400" /> Margen %</span>
          </div>
        </div>
        <div className="relative">
          <div className="absolute top-0 right-0 z-10"><PeriodBadge period="12m" variant="glass" className="text-[9px] tracking-[0.2em] opacity-75" /></div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={monthlyProfit} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid stroke="#f3f4f6" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
            <YAxis yAxisId="left" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
            <Tooltip content={profitTooltip} />
            <Bar yAxisId="left" dataKey="beneficio" name="beneficio" radius={[4, 4, 0, 0]} barSize={18}>
              {monthlyProfit.map((entry, index) => (
                <Cell key={`profit-${index}`} fill={entry.beneficio >= 0 ? '#3b82f6' : '#ef4444'} />
              ))}
            </Bar>
            <Line yAxisId="right" type="monotone" dataKey="margen" name="margen" stroke="#a855f7" strokeWidth={2} dot={false} />
          </BarChart>
        </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Accumulated cashflow */}
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 relative">
          <div className="mb-5">
            <h3 className="font-bold text-gray-900 dark:text-gray-100">Cashflow acumulado</h3>
            <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">Evolución del saldo a lo largo del año</p>
          </div>
          <div className="relative">
            <div className="absolute top-0 right-0 z-10"><PeriodBadge period="1y" variant="glass" className="text-[9px] tracking-[0.2em] opacity-75" /></div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={accumulatedData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid stroke="#f3f4f6" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
              <Tooltip formatter={(v: number) => [formatCurrency(v), 'Acumulado']} />
              <Area type="monotone" dataKey="acumulado" name="acumulado" stroke="#6366f1" strokeWidth={2} fill="#6366f1" fillOpacity={0.1} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
          </div>
        </div>

        {/* Category margins */}
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 relative">
          <div className="mb-5">
            <h3 className="font-bold text-gray-900 dark:text-gray-100">Ingresos por categoría (año)</h3>
            <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">Distribución de cobros — {currentYear}</p>
          </div>
          <div className="absolute top-5 right-5 z-10"><PeriodBadge period="1y" variant="glass" className="text-[9px] tracking-[0.2em] opacity-75" /></div>
          {categoryMargins.length === 0 ? (
            <div className="flex h-[140px] items-center justify-center rounded-2xl bg-gray-50 dark:bg-gray-800 text-sm text-gray-400 dark:text-gray-500">
              Sin cobros registrados este año
            </div>
          ) : (
            <div className="space-y-3">
              {categoryMargins.slice(0, 6).map((cat) => {
                const pct = ytdIncome > 0 ? (cat.value / ytdIncome) * 100 : 0;
                return (
                  <div key={cat.name}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5 font-medium text-gray-700 dark:text-gray-300">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: cat.color }} />
                        {cat.name}
                        <span className="text-gray-400 dark:text-gray-500">({cat.count})</span>
                      </span>
                      <span className="font-semibold text-gray-900 dark:text-gray-100">{formatCurrency(cat.value)}</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: cat.color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Monthly detail table */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5">
        <h3 className="mb-4 font-bold text-gray-900 dark:text-gray-100">Tabla de rentabilidad mensual</h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800">
                <th className="pb-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Mes</th>
                <th className="pb-3 text-right text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Ingresos</th>
                <th className="pb-3 text-right text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Gastos</th>
                <th className="pb-3 text-right text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Beneficio</th>
                <th className="pb-3 text-right text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Margen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {monthlyProfit.map((row) => (
                <tr key={row.mes} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                  <td className="py-2.5 font-semibold text-gray-900 dark:text-gray-100">{row.mes}</td>
                  <td className="py-2.5 text-right font-medium text-emerald-600">{formatCurrency(row.ingresos)}</td>
                  <td className="py-2.5 text-right font-medium text-red-500">{formatCurrency(row.gastos)}</td>
                  <td className={`py-2.5 text-right font-bold ${row.beneficio >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                    {formatCurrency(row.beneficio)}
                  </td>
                  <td className={`py-2.5 text-right text-xs font-semibold ${row.margen >= 0 ? 'text-purple-600' : 'text-red-500'}`}>
                    {row.margen.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function NewTransactionModal({
  onClose,
  onAdd,
  existingMovements,
  isSaving,
}: {
  onClose: () => void;
  onAdd: (draft: NewMovementDraft) => Promise<void>;
  existingMovements: FinanceMovementRecord[];
  isSaving: boolean;
}) {
  const [txType, setTxType] = useState<TxType>('income');
  const [concept, setConcept] = useState('');
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [tax, setTax] = useState(0);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState('');
  const [payMethod, setPayMethod] = useState('Transferencia');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState('');

  const cats = txType === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const selectedCat = cats.find((item) => item.label === category);
  const movementType: FinanceMovementDocType = txType === 'income' ? 'cobro' : 'pago';

  const suggestedReference = useMemo(() => {
    const sequence =
      existingMovements.filter(
        (movement) =>
          movement.type === movementType && movement.date.slice(0, 4) === date.slice(0, 4),
      ).length + 1;

    return buildFinanceReference(movementType, date, sequence);
  }, [date, existingMovements, movementType]);

  const amountNumber = Number(amount) || 0;
  const taxAmount = Number((amountNumber * (tax / 100)).toFixed(2));
  const total = Number((amountNumber + taxAmount).toFixed(2));

  const inputClass = (error?: string) =>
    `w-full rounded-xl border-2 px-3.5 py-2.5 text-sm transition-all focus:outline-none ${
      error
        ? 'border-red-300 focus:border-red-400'
        : 'border-gray-200 dark:border-gray-700 focus:border-blue-500'
    }`;

  const validate = () => {
    const nextErrors: Record<string, string> = {};
    if (!concept.trim()) {
      nextErrors.concept = 'La descripción es obligatoria';
    }
    if (!category) {
      nextErrors.category = 'Selecciona una tipología';
    }
    if (!amount || Number(amount) <= 0) {
      nextErrors.amount = 'Introduce un importe válido';
    }
    if (!payMethod.trim()) {
      nextErrors.payMethod = 'Selecciona la forma de cobro o pago';
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitError('');
    if (!validate()) {
      return;
    }

    try {
      await onAdd({
        type: movementType,
        concept: concept.trim(),
        reference: reference.trim() || suggestedReference,
        category,
        categoryIcon: selectedCat?.icon || '',
        categoryColor: selectedCat?.color || '#64748b',
        amountBase: Number(amount),
        taxRate: tax,
        date,
        payMethod,
        notes: notes.trim(),
      });
      onClose();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'No se pudo guardar el movimiento');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={isSaving ? undefined : onClose} />
      <div className="relative flex max-h-[94dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white dark:bg-gray-900 shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 px-6 py-4">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                txType === 'income' ? 'bg-emerald-100' : 'bg-red-100'
              }`}
            >
              {txType === 'income' ? (
                <ArrowUpRight className="h-5 w-5 text-emerald-600" />
              ) : (
                <ArrowDownRight className="h-5 w-5 text-red-600" />
              )}
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">Nueva transacción</h2>
              <p className="text-xs text-gray-400 dark:text-gray-500">Registrar operación financiera</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSaving}
            className="rounded-xl p-2 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X className="h-5 w-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="space-y-5 px-6 py-5">
            <div>
              <p className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                Tipo de movimiento
              </p>
              <div className="grid grid-cols-2 gap-2">
                {([
                  {
                    id: 'income' as TxType,
                    label: 'Ingreso',
                    icon: ArrowUpRight,
                    active:
                      'bg-emerald-600 border-emerald-600 text-white',
                    idle: 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-emerald-300',
                  },
                  {
                    id: 'expense' as TxType,
                    label: 'Gasto',
                    icon: ArrowDownRight,
                    active: 'bg-red-600 border-red-600 text-white',
                    idle: 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-red-300',
                  },
                ]).map((option) => {
                  const Icon = option.icon;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => {
                        setTxType(option.id);
                        setCategory('');
                      }}
                      className={`flex items-center justify-center gap-2.5 rounded-xl border-2 py-3 text-sm font-semibold transition-all ${
                        txType === option.id ? option.active : option.idle
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {option.label}
                      {txType === option.id && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Concepto</p>
              <div className="space-y-3">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-gray-600 dark:text-gray-400">
                    Descripción <span className="text-red-500">*</span>
                  </label>
                  <input
                    value={concept}
                    onChange={(event) => setConcept(event.target.value)}
                    placeholder={
                      txType === 'income'
                        ? 'Ej. Venta BMW Serie 3 2022'
                        : 'Ej. Reparación motor Audi A4'
                    }
                    className={inputClass(errors.concept)}
                  />
                  {errors.concept && <p className="mt-1 text-xs text-red-500">{errors.concept}</p>}
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-gray-600 dark:text-gray-400">Referencia</label>
                  <input
                    value={reference}
                    onChange={(event) => setReference(event.target.value)}
                    placeholder={suggestedReference}
                    className={`${inputClass()} font-mono text-xs`}
                  />
                  <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">
                    Si lo dejas vacío se generará automáticamente como {suggestedReference}.
                  </p>
                </div>
              </div>
            </div>

            <div>
              <p className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Tipología</p>
              <div className="grid grid-cols-3 gap-2">
                {cats.map((cat) => (
                  <button
                    key={cat.label}
                    type="button"
                    onClick={() => setCategory(cat.label)}
                    className={`flex flex-col items-center gap-1.5 rounded-xl border-2 bg-white dark:bg-gray-900 px-2 py-3 text-center transition-all ${
                      category === cat.label
                        ? 'border-gray-900 bg-gray-50 dark:bg-gray-800 shadow-sm'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    <span className="text-xl leading-none">{cat.icon}</span>
                    <span
                      className={`text-[10px] font-semibold leading-tight ${
                        category === cat.label ? 'text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'
                      }`}
                    >
                      {cat.label}
                    </span>
                    {category === cat.label && (
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: cat.color }}
                      />
                    )}
                  </button>
                ))}
              </div>
              {errors.category && <p className="mt-2 text-xs text-red-500">{errors.category}</p>}
            </div>

            <div>
              <p className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Importe</p>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-gray-600 dark:text-gray-400">
                      Importe (sin IVA) <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={amount}
                        onChange={(event) => setAmount(event.target.value)}
                        placeholder="0,00"
                        className={`${inputClass(errors.amount)} pr-7`}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-gray-400 dark:text-gray-500">
                        €
                      </span>
                    </div>
                    {errors.amount && <p className="mt-1 text-xs text-red-500">{errors.amount}</p>}
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-gray-600 dark:text-gray-400">IVA</label>
                    <div className="flex gap-1.5">
                      {TAX_OPTS.map((value) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setTax(value)}
                          className={`flex-1 rounded-xl border-2 py-2.5 text-xs font-semibold transition-all ${
                            tax === value
                              ? 'border-gray-900 bg-gray-900 text-white'
                              : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
                          }`}
                        >
                          {value}%
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {amountNumber > 0 && (
                  <div
                    className={`space-y-1.5 rounded-xl border p-3 ${
                      txType === 'income'
                        ? 'border-emerald-100 bg-emerald-50'
                        : 'border-red-100 bg-red-50'
                    }`}
                  >
                    <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                      <span>Base imponible</span>
                      <span>{formatCurrency(amountNumber)}</span>
                    </div>
                    <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                      <span>IVA ({tax}%)</span>
                      <span>{formatCurrency(taxAmount)}</span>
                    </div>
                    <div
                      className={`flex justify-between border-t pt-1.5 ${
                        txType === 'income' ? 'border-emerald-200' : 'border-red-200'
                      }`}
                    >
                      <span className="text-sm font-bold text-gray-900 dark:text-gray-100">Total</span>
                      <span
                        className={`text-sm font-bold ${
                          txType === 'income' ? 'text-emerald-700' : 'text-red-700'
                        }`}
                      >
                        {txType === 'income' ? '+' : '-'}
                        {formatCurrency(total)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div>
              <p className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                Fecha y método
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-gray-600 dark:text-gray-400">Fecha</label>
                  <input
                    type="date"
                    value={date}
                    onChange={(event) => setDate(event.target.value)}
                    className={inputClass()}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-gray-600 dark:text-gray-400">
                    {txType === 'income' ? 'Forma de cobro' : 'Forma de pago'}
                  </label>
                  <select
                    value={payMethod}
                    onChange={(event) => setPayMethod(event.target.value)}
                    className={`${inputClass(errors.payMethod)} bg-white dark:bg-gray-900`}
                  >
                    {PAY_METHODS.map((method) => (
                      <option key={method}>{method}</option>
                    ))}
                  </select>
                  {errors.payMethod && (
                    <p className="mt-1 text-xs text-red-500">{errors.payMethod}</p>
                  )}
                </div>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                Notas
              </label>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={3}
                placeholder="Observaciones adicionales…"
                className={`${inputClass()} resize-none`}
              />
            </div>

            {submitError && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {submitError}
              </div>
            )}
          </div>

          <div className="sticky bottom-0 flex gap-3 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800 px-6 py-4 rounded-b-2xl">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="flex-1 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-300 transition-colors hover:border-gray-300 dark:hover:border-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-70 ${
                txType === 'income'
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-red-600 hover:bg-red-700'
              }`}
            >
              {isSaving ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : txType === 'income' ? (
                <ArrowUpRight className="h-4 w-4" />
              ) : (
                <ArrowDownRight className="h-4 w-4" />
              )}
              {isSaving
                ? 'Guardando...'
                : `Registrar ${txType === 'income' ? 'ingreso' : 'pago'}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function Finance() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<FinanceTab>('overview');
  const [txFilter, setTxFilter] = useState<'all' | 'income' | 'expense'>('all');
  const [showModal, setShowModal] = useState(false);
  const [selectedTx, setSelectedTx] = useState<FinanceMovementRecord | null>(null);
  const [movements, setMovements] = useState<FinanceMovementRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  // F-05: Payment reminders
  const [reminders, setReminders] = useState<PaymentReminder[]>([]);
  const [remindersLoading, setRemindersLoading] = useState(false);

  // F-10: VAT Book
  const [vatYear, setVatYear] = useState(new Date().getFullYear());
  const [vatQuarter, setVatQuarter] = useState<VatQuarter>(
    Math.ceil((new Date().getMonth() + 1) / 3) as VatQuarter,
  );

  // F-09: Currency converter
  const [currFrom, setCurrFrom] = useState<CurrencyCode>('EUR');
  const [currTo, setCurrTo] = useState<CurrencyCode>('USD');
  const [currAmount, setCurrAmount] = useState('');
  const [currResult, setCurrResult] = useState<number | null>(null);
  const [currRates, setCurrRates] = useState<Record<string, number> | null>(null);
  const [currLoading, setCurrLoading] = useState(false);

  useModalClose(showModal, () => setShowModal(false));
  useModalClose(!!selectedTx, () => setSelectedTx(null));

  const loadMovements = useCallback(async () => {
    if (!user?.user_id) {
      setMovements([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError('');
    try {
      const nextMovements = await listFinanceMovements(user.user_id);
      setMovements(nextMovements);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudieron cargar los movimientos');
    } finally {
      setIsLoading(false);
    }
  }, [user?.user_id]);

  useEffect(() => {
    void loadMovements();
  }, [loadMovements]);

  const loadReminders = useCallback(async () => {
    if (!user?.user_id) return;
    setRemindersLoading(true);
    try {
      const data = await listPaymentReminders(user.user_id);
      setReminders(data);
    } catch {
      // non-critical
    } finally {
      setRemindersLoading(false);
    }
  }, [user?.user_id]);

  useEffect(() => {
    if (activeTab === 'reminders') void loadReminders();
  }, [activeTab, loadReminders]);

  useEffect(() => {
    void fetchExchangeRates('EUR').then((rates) => setCurrRates(rates)).catch(() => {});
  }, []);

  const handleConvertCurrency = async () => {
    if (!currAmount || !currFrom || !currTo) return;
    setCurrLoading(true);
    try {
      const result = await convertAmount(Number(currAmount), currFrom, currTo);
      setCurrResult(result);
    } finally {
      setCurrLoading(false);
    }
  };

  const handleMarkReminderSent = async (reminder: PaymentReminder) => {
    try {
      const updated = await markReminderSent(reminder);
      setReminders((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    } catch {
      // ignore
    }
  };

  const handleMarkReminderResolved = async (reminder: PaymentReminder) => {
    try {
      const updated = await markReminderResolved(reminder);
      setReminders((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    } catch {
      // ignore
    }
  };

  const filteredMovements = useMemo(() => {
    return movements.filter((movement) => {
      const uiType = toUiType(movement.type);
      const matchesType = txFilter === 'all' ? true : uiType === txFilter;
      return matchesType && matchesSearch(movement, searchQuery);
    });
  }, [movements, searchQuery, txFilter]);

  const currentMonthKey = new Date().toISOString().slice(0, 7);
  const currentMonthMovements = useMemo(
    () => movements.filter((movement) => movement.date.slice(0, 7) === currentMonthKey),
    [currentMonthKey, movements],
  );

  const cashflow = useMemo(() => {
    return movements.reduce((accumulator, movement) => {
      return accumulator + (movement.type === 'cobro' ? movement.totalAmount : -movement.totalAmount);
    }, 0);
  }, [movements]);

  const monthIncome = useMemo(
    () =>
      currentMonthMovements
        .filter((movement) => movement.type === 'cobro')
        .reduce((sum, movement) => sum + movement.totalAmount, 0),
    [currentMonthMovements],
  );

  const monthExpense = useMemo(
    () =>
      currentMonthMovements
        .filter((movement) => movement.type === 'pago')
        .reduce((sum, movement) => sum + movement.totalAmount, 0),
    [currentMonthMovements],
  );

  const margin = monthIncome > 0 ? ((monthIncome - monthExpense) / monthIncome) * 100 : 0;

  const transactionIncome = useMemo(
    () =>
      filteredMovements
        .filter((movement) => movement.type === 'cobro')
        .reduce((sum, movement) => sum + movement.totalAmount, 0),
    [filteredMovements],
  );

  const transactionExpense = useMemo(
    () =>
      filteredMovements
        .filter((movement) => movement.type === 'pago')
        .reduce((sum, movement) => sum + movement.totalAmount, 0),
    [filteredMovements],
  );

  const monthlyData = useMemo(() => {
    const now = new Date();
    const buckets = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
      return {
        key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
        mes: formatMonthLabel(date),
        ingresos: 0,
        gastos: 0,
      };
    });

    movements.forEach((movement) => {
      const bucket = buckets.find((item) => item.key === movement.date.slice(0, 7));
      if (!bucket) {
        return;
      }
      if (movement.type === 'cobro') {
        bucket.ingresos += movement.totalAmount;
      } else {
        bucket.gastos += movement.totalAmount;
      }
    });

    return buckets;
  }, [movements]);

  const categoryData = useMemo(() => {
    const grouped = new Map<string, { name: string; value: number; color: string }>();

    currentMonthMovements
      .filter((movement) => movement.type === 'pago')
      .forEach((movement) => {
        const current = grouped.get(movement.category);
        grouped.set(movement.category, {
          name: movement.category,
          value: (current?.value || 0) + movement.totalAmount,
          color: movement.categoryColor || '#94a3b8',
        });
      });

    return Array.from(grouped.values()).sort((a, b) => b.value - a.value).slice(0, 6);
  }, [currentMonthMovements]);

  const summaryCards = useMemo(() => {
    const monthCount = currentMonthMovements.length;
    const averageTicket =
      monthCount > 0
        ? currentMonthMovements.reduce((sum, movement) => sum + movement.totalAmount, 0) / monthCount
        : 0;

    return [
      {
        label: 'Cobros del mes',
        value: String(currentMonthMovements.filter((movement) => movement.type === 'cobro').length),
        sub: `${formatCurrency(monthIncome)} registrados`,
        subColor: 'text-emerald-600',
      },
      {
        label: 'Pagos del mes',
        value: String(currentMonthMovements.filter((movement) => movement.type === 'pago').length),
        sub: `${formatCurrency(monthExpense)} registrados`,
        subColor: 'text-red-600',
      },
      {
        label: 'Ticket medio',
        value: formatCurrency(averageTicket),
        sub: monthCount > 0 ? `${monthCount} movimientos este mes` : 'Sin movimientos este mes',
        subColor: 'text-blue-600',
      },
    ];
  }, [currentMonthMovements, monthExpense, monthIncome]);

  const handleAdd = async (draft: NewMovementDraft) => {
    if (!user?.user_id) {
      throw new Error('No hay usuario autenticado para guardar en CouchDB');
    }

    setIsSaving(true);
    setError('');
    try {
      const created = await createFinanceMovementInCouch({
        ...draft,
        user_id: user.user_id,
        companyName: user.companyName || '',
      });
      setMovements((current) => [created, ...current]);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'No se pudo guardar el movimiento';
      setError(message);
      throw new Error(message);
    } finally {
      setIsSaving(false);
    }
  };

  // F-06: 12-month cash flow data
  const cashflowData = useMemo(() => {
    const now = new Date();
    const buckets = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      return {
        key,
        mes: d.toLocaleDateString('es-ES', { month: 'short', year: '2-digit' }).replace(' ', "'"),
        ingresos: 0,
        gastos: 0,
        neto: 0,
        acumulado: 0,
      };
    });
    movements.forEach((m) => {
      const bucket = buckets.find((b) => b.key === m.date.slice(0, 7));
      if (!bucket) return;
      if (m.type === 'cobro') bucket.ingresos += m.totalAmount;
      else bucket.gastos += m.totalAmount;
    });
    let acum = 0;
    for (const b of buckets) {
      b.neto = Math.round((b.ingresos - b.gastos) * 100) / 100;
      acum += b.neto;
      b.acumulado = Math.round(acum * 100) / 100;
    }
    return buckets;
  }, [movements]);

  // Projection: average of last 3 months
  const projectionData = useMemo(() => {
    const last3 = cashflowData.slice(-3);
    const avgIncome  = last3.reduce((s, m) => s + m.ingresos, 0) / 3;
    const avgExpense = last3.reduce((s, m) => s + m.gastos, 0) / 3;
    const now = new Date();
    return Array.from({ length: 3 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() + i + 1, 1);
      return {
        mes: d.toLocaleDateString('es-ES', { month: 'short', year: '2-digit' }).replace(' ', "'"),
        ingresos: Math.round(avgIncome * 100) / 100,
        gastos:   Math.round(avgExpense * 100) / 100,
        neto:     Math.round((avgIncome - avgExpense) * 100) / 100,
        isProjection: true,
      };
    });
  }, [cashflowData]);

  // F-10: VAT book
  const vatBook = useMemo(() => buildVatBook(movements, vatYear), [movements, vatYear]);
  const selectedVatQuarterData: VatQuarterSummary | null = vatBook.quarters.find((q) => q.quarter === vatQuarter) ?? null;
  const vatYears = useMemo(() => getAvailableYears(movements), [movements]);

  const handleExportCsv = () => {
    if (!filteredMovements.length) return;
    downloadCsv(filteredMovements);
  };

  const handleExportExcel = () => {
    if (!filteredMovements.length) return;
    exportAccountingToExcel(filteredMovements, user?.companyName);
  };

  const isEmpty = !isLoading && movements.length === 0;

  return (
    <Layout title={t('finance.title')} subtitle={t('finance.subtitle')}>
      <div className="space-y-4">
        <div
          className="flex bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-x-auto [&::-webkit-scrollbar]:hidden"
          style={{ scrollbarWidth: 'none' }}
        >
          {([
            { id: 'overview' as FinanceTab, label: t('finance.tabs.overview') },
            { id: 'dashboard' as FinanceTab, label: 'Cash Flow' },
            { id: 'transactions' as FinanceTab, label: t('finance.tabs.transactions'), count: movements.length },
            { id: 'reminders' as FinanceTab, label: 'Recordatorios', count: reminders.filter((r) => r.status === 'pending').length || undefined },
            { id: 'vat-book' as FinanceTab, label: 'Libro IVA' },
          ]).map((tab, i) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex-shrink-0 flex items-center gap-2 px-5 py-3.5 text-sm font-semibold transition-colors whitespace-nowrap ${
                  active ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600'
                } ${i !== 0 ? 'border-l border-gray-100 dark:border-gray-800' : ''}`}
              >
                {tab.label}
                {'count' in tab && (
                  <span
                    className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
                      active ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
                {active && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-500 rounded-t-full" />
                )}
              </button>
            );
          })}
        </div>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {activeTab === 'overview' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="sm:col-span-2 lg:col-span-1 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 p-5 text-white">
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-blue-100">
                    {t('finance.treasury')}
                  </span>
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/20">
                    <Wallet className="h-4 w-4 text-white" />
                  </div>
                </div>
                <p className="mb-1 text-3xl font-bold leading-none">{formatCurrency(cashflow)}</p>
                <p className="mt-2 text-xs text-blue-200">{t('finance.treasuryDesc')}</p>
              </div>

              <div className="rounded-2xl border border-gray-200 dark:border-gray-700 border-l-4 border-l-emerald-500 bg-white dark:bg-gray-900 p-5">
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                    {t('finance.income')}
                  </span>
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50">
                    <ArrowUpRight className="h-4 w-4 text-emerald-500" />
                  </div>
                </div>
                <p className="text-3xl font-bold leading-none text-emerald-600">
                  {formatCurrency(monthIncome)}
                </p>
                <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">{t('finance.thisMonth')}</p>
              </div>

              <div className="rounded-2xl border border-gray-200 dark:border-gray-700 border-l-4 border-l-red-500 bg-white dark:bg-gray-900 p-5">
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                    {t('finance.expenses')}
                  </span>
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-red-50">
                    <ArrowDownRight className="h-4 w-4 text-red-500" />
                  </div>
                </div>
                <p className="text-3xl font-bold leading-none text-red-600">
                  {formatCurrency(monthExpense)}
                </p>
                <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">{t('finance.thisMonth')}</p>
              </div>

              <div className="rounded-2xl border border-gray-200 dark:border-gray-700 border-l-4 border-l-blue-500 bg-white dark:bg-gray-900 p-5">
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                    {t('finance.margin')}
                  </span>
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50">
                    <TrendingUp className="h-4 w-4 text-blue-500" />
                  </div>
                </div>
                <p className="text-3xl font-bold leading-none text-blue-600">
                  {margin.toLocaleString('es-ES', {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1,
                  })}
                  %
                </p>
                <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">{t('finance.grossProfit')}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
              <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 lg:col-span-3">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-gray-900 dark:text-gray-100">{t('finance.monthlyEvolution')}</h3>
                    <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
                      {t('finance.last6Months')}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" /> {t('finance.income')}
                    </span>
                    <span className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
                      <span className="h-2 w-2 rounded-full bg-red-400" /> {t('finance.expenses')}
                    </span>
                  </div>
                </div>
                <div className="relative">
                  <div className="absolute top-0 right-0 z-10"><PeriodBadge period="m" variant="glass" className="text-[9px] tracking-[0.2em] opacity-75" /></div>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={monthlyData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <CartesianGrid stroke="#f3f4f6" strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="mes"
                      tick={{ fontSize: 11, fill: '#9ca3af' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: '#9ca3af' }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(value) => `${Math.round(value / 1000)}k`}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="ingresos"
                      stroke="#10b981"
                      strokeWidth={2}
                      fill="#10b981"
                      fillOpacity={0.1}
                      dot={false}
                    />
                    <Area
                      type="monotone"
                      dataKey="gastos"
                      stroke="#ef4444"
                      strokeWidth={2}
                      fill="#ef4444"
                      fillOpacity={0.08}
                      dot={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 lg:col-span-2 relative">
                <div className="mb-5">
                  <h3 className="font-bold text-gray-900 dark:text-gray-100">{t('finance.expensesByCategory')}</h3>
                  <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{t('finance.thisMonth')}</p>
                </div>
                <div className="absolute top-5 right-5 z-10"><PeriodBadge period="m" variant="glass" className="text-[9px] tracking-[0.2em] opacity-75" /></div>
                {categoryData.length === 0 ? (
                  <div className="flex h-[180px] items-center justify-center rounded-2xl bg-gray-50 dark:bg-gray-800 text-sm text-gray-400 dark:text-gray-500">
                    {t('finance.noExpenses')}
                  </div>
                ) : (
                  <>
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={categoryData} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                        <XAxis
                          type="number"
                          tick={{ fontSize: 10, fill: '#9ca3af' }}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={(value) => `${Math.round(value / 1000)}k`}
                        />
                        <YAxis
                          type="category"
                          dataKey="name"
                          tick={{ fontSize: 10, fill: '#6b7280' }}
                          axisLine={false}
                          tickLine={false}
                          width={88}
                        />
                        <Tooltip formatter={(value: number) => [formatCurrency(value), '']} />
                        <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={14}>
                          {categoryData.map((entry, index) => (
                            <Cell key={`cat-${entry.name}-${index}`} fill={entry.color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {categoryData.map((category) => (
                        <span
                          key={category.name}
                          className="flex items-center gap-1.5 text-[10px] text-gray-500 dark:text-gray-400"
                        >
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: category.color }}
                          />
                          {category.name}
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5">
              <h3 className="mb-4 font-bold text-gray-900 dark:text-gray-100">Resumen del mes</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {summaryCards.map((item) => (
                  <div key={item.label} className="rounded-2xl bg-gray-50 dark:bg-gray-800 p-4">
                    <p className="mb-1 text-xs text-gray-400 dark:text-gray-500">{item.label}</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{item.value}</p>
                    <p className={`mt-1 text-xs font-semibold ${item.subColor}`}>{item.sub}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <BankAccountsWidget userId={userId} />
              <TaxCalendarWidget userId={userId} />
            </div>
          </div>
        )}

        {activeTab === 'dashboard' && (
          <FinanceDashboard movements={movements} />
        )}

        {activeTab === 'transactions' && (
          <div className="space-y-3">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
              <div
                className="flex items-center gap-1.5 overflow-x-auto pb-0 xl:flex-1 [&::-webkit-scrollbar]:hidden"
                style={{ scrollbarWidth: 'none' }}
              >
                {([
                  { id: 'all', label: 'Todos', count: movements.length },
                  {
                    id: 'income',
                    label: 'Cobros',
                    count: movements.filter((movement) => movement.type === 'cobro').length,
                  },
                  {
                    id: 'expense',
                    label: 'Pagos',
                    count: movements.filter((movement) => movement.type === 'pago').length,
                  },
                ] as const).map((filter) => (
                  <button
                    key={filter.id}
                    onClick={() => setTxFilter(filter.id)}
                    className={`flex shrink-0 items-center gap-1.5 rounded-full border-2 px-3 py-1.5 text-xs font-semibold transition-all ${
                      txFilter === filter.id
                        ? 'border-gray-900 bg-gray-900 text-white'
                        : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:border-gray-400'
                    }`}
                  >
                    {filter.id === 'income' && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
                    {filter.id === 'expense' && <span className="h-1.5 w-1.5 rounded-full bg-red-500" />}
                    {filter.label}
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                        txFilter === filter.id ? 'bg-white/20 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                      }`}
                    >
                      {filter.count}
                    </span>
                  </button>
                ))}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row xl:w-auto">
                <div className="relative min-w-0 sm:min-w-[280px]">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                  <input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Buscar por concepto, referencia, categoría..."
                    className="w-full rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 py-2 pl-9 pr-3 text-sm text-gray-700 dark:text-gray-300 outline-none transition-colors focus:border-blue-500"
                  />
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={handleExportExcel}
                    disabled={!filteredMovements.length}
                    title="Exportar asientos contables en Excel (PGC España)"
                    className="flex shrink-0 items-center gap-1.5 rounded-xl border-2 border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 transition-colors hover:border-emerald-300 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Excel contable</span>
                  </button>
                  <button
                    onClick={handleExportCsv}
                    disabled={!filteredMovements.length}
                    title="Exportar CSV básico"
                    className="flex shrink-0 items-center gap-1.5 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-xs font-semibold text-gray-600 dark:text-gray-400 transition-colors hover:border-gray-300 dark:hover:border-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">CSV</span>
                  </button>
                  <button
                    onClick={() => void loadMovements()}
                    disabled={isLoading}
                    className="flex shrink-0 items-center gap-1.5 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-xs font-semibold text-gray-600 dark:text-gray-400 transition-colors hover:border-gray-300 dark:hover:border-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                    <span className="hidden sm:inline">Actualizar</span>
                  </button>
                  <button
                    onClick={() => setShowModal(true)}
                    className="flex shrink-0 items-center gap-1.5 rounded-xl bg-gray-900 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-black"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Nueva</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-gray-200 dark:border-gray-700 border-l-4 border-l-emerald-500 bg-white dark:bg-gray-900 p-4">
                <p className="text-xl font-bold text-emerald-600">
                  +{formatCurrency(transactionIncome)}
                </p>
                <p className="mt-0.5 text-[10px] text-gray-400 dark:text-gray-500">Cobros visibles</p>
              </div>
              <div className="rounded-2xl border border-gray-200 dark:border-gray-700 border-l-4 border-l-red-500 bg-white dark:bg-gray-900 p-4">
                <p className="text-xl font-bold text-red-600">-{formatCurrency(transactionExpense)}</p>
                <p className="mt-0.5 text-[10px] text-gray-400 dark:text-gray-500">Pagos visibles</p>
              </div>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 py-20">
                <LoaderCircle className="mr-3 h-5 w-5 animate-spin text-gray-400 dark:text-gray-500" />
                <span className="text-sm text-gray-500 dark:text-gray-400">Cargando movimientos desde CouchDB...</span>
              </div>
            ) : (
              <>
                <div className="hidden overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 md:block">
                  <table className="w-full min-w-[900px]">
                    <thead>
                      <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800">
                        <th className="w-1 px-0" />
                        <th className="px-5 py-3.5 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Tipo</th>
                        <th className="px-5 py-3.5 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Concepto</th>
                        <th className="px-5 py-3.5 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Categoría</th>
                        <th className="px-5 py-3.5 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Método</th>
                        <th className="px-5 py-3.5 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Fecha</th>
                        <th className="px-5 py-3.5 text-right text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Total</th>
                        <th className="w-12 px-5 py-3.5" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {filteredMovements.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-12 text-center text-sm text-gray-400 dark:text-gray-500">
                            {isEmpty
                              ? 'No hay movimientos guardados todavía'
                              : 'Sin resultados para el filtro o búsqueda actual'}
                          </td>
                        </tr>
                      ) : (
                        filteredMovements.map((movement) => {
                          const uiType = toUiType(movement.type);
                          const token = TX_TOKEN[uiType];
                          return (
                            <tr key={movement.id} className="group transition-colors hover:bg-gray-50 dark:hover:bg-gray-800">
                              <td className="pl-3 pr-0 py-0">
                                <div
                                  className={`h-14 w-1 rounded-full ${
                                    uiType === 'income' ? 'bg-emerald-500' : 'bg-red-500'
                                  }`}
                                />
                              </td>
                              <td className="px-5 py-4">
                                <span
                                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${token.badgeBg} ${token.badgeText}`}
                                >
                                  <span className={`h-1.5 w-1.5 rounded-full ${token.dot}`} />
                                  {token.label}
                                </span>
                              </td>
                              <td className="px-5 py-4">
                                <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{movement.concept}</p>
                                <p className="mt-0.5 font-mono text-[10px] text-gray-400 dark:text-gray-500">
                                  {movement.reference || 'Sin referencia'}
                                </p>
                              </td>
                              <td className="px-5 py-4">
                                <span className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
                                  <span
                                    className="h-2 w-2 rounded-full"
                                    style={{ backgroundColor: movement.categoryColor || '#94a3b8' }}
                                  />
                                  {movement.category}
                                </span>
                              </td>
                              <td className="px-5 py-4">
                                <span className="rounded-lg bg-gray-100 dark:bg-gray-700 px-2 py-1 text-xs text-gray-400 dark:text-gray-500">
                                  {movement.payMethod || '—'}
                                </span>
                              </td>
                              <td className="px-5 py-4">
                                <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
                                  <Calendar className="h-3.5 w-3.5" />
                                  {new Date(movement.date).toLocaleDateString('es-ES')}
                                </div>
                              </td>
                              <td className="px-5 py-4 text-right">
                                <span className={`text-base font-bold ${token.amountColor}`}>
                                  {token.sign}
                                  {formatCurrency(movement.totalAmount)}
                                </span>
                                <p className="mt-0.5 text-[10px] text-gray-400 dark:text-gray-500">
                                  Base {formatCurrency(movement.amountBase)} · IVA {movement.taxRate}%
                                </p>
                              </td>
                              <td className="px-5 py-4">
                                <button
                                  onClick={() => setSelectedTx(movement)}
                                  className="rounded-xl p-2 transition-all hover:bg-gray-100 dark:hover:bg-gray-700 group-hover:opacity-100 md:opacity-0"
                                >
                                  <Eye className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="space-y-3 md:hidden">
                  {filteredMovements.length === 0 ? (
                    <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 py-12 text-center">
                      <p className="text-sm text-gray-400 dark:text-gray-500">
                        {isEmpty
                          ? 'No hay movimientos guardados todavía'
                          : 'Sin resultados para el filtro o búsqueda actual'}
                      </p>
                      <button
                        onClick={() => setShowModal(true)}
                        className="mt-4 rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white"
                      >
                        + Nueva transacción
                      </button>
                    </div>
                  ) : (
                    filteredMovements.map((movement) => {
                      const uiType = toUiType(movement.type);
                      const token = TX_TOKEN[uiType];
                      const meta = getCategoryMeta(uiType, movement.category);
                      return (
                        <button
                          key={movement.id}
                          onClick={() => setSelectedTx(movement)}
                          className={`w-full rounded-2xl border border-gray-200 dark:border-gray-700 border-l-4 bg-white dark:bg-gray-900 p-4 text-left ${token.accentBorder}`}
                        >
                          <div className="mb-2 flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-bold text-gray-900 dark:text-gray-100">{movement.concept}</p>
                              <p className="mt-0.5 font-mono text-[10px] text-gray-400 dark:text-gray-500">
                                {movement.reference || 'Sin referencia'}
                              </p>
                            </div>
                            <span className={`shrink-0 text-base font-bold ${token.amountColor}`}>
                              {token.sign}
                              {formatCurrency(movement.totalAmount)}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span
                                className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ${token.badgeBg} ${token.badgeText}`}
                              >
                                <span className={`h-1.5 w-1.5 rounded-full ${token.dot}`} />
                                {token.label}
                              </span>
                              <span className="flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400">
                                <span>{meta?.icon || '•'}</span>
                                {movement.category}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-gray-400 dark:text-gray-500">
                              {movement.payMethod && (
                                <span className="rounded bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5">
                                  {movement.payMethod}
                                </span>
                              )}
                              <span>{new Date(movement.date).toLocaleDateString('es-ES')}</span>
                            </div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── F-06: CASH FLOW DASHBOARD TAB ── */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {/* 12-month cash flow chart */}
            <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6 relative">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-bold text-gray-900 dark:text-gray-100 text-lg">Flujo de caja — últimos 12 meses</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Cobros vs pagos y resultado neto acumulado</p>
                </div>
              </div>
              <div className="relative">
                <div className="absolute top-0 right-0 z-10"><PeriodBadge period="12m" variant="glass" className="text-[9px] tracking-[0.2em] opacity-75" /></div>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={cashflowData} barSize={12} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="mes" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    formatter={(value: number, name: string) => [
                      formatCurrency(value),
                      name === 'ingresos' ? 'Cobros' : name === 'gastos' ? 'Pagos' : 'Neto',
                    ]}
                  />
                  <Bar dataKey="ingresos" fill="#10b981" radius={[3, 3, 0, 0]} name="ingresos" />
                  <Bar dataKey="gastos" fill="#ef4444" radius={[3, 3, 0, 0]} name="gastos" />
                </BarChart>
              </ResponsiveContainer>
              </div>
            </div>

            {/* Accrued cash flow line */}
            <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6 relative">
              <h2 className="font-bold text-gray-900 dark:text-gray-100 mb-4">Flujo de caja acumulado</h2>
              <div className="relative">
                <div className="absolute top-0 right-0 z-10"><PeriodBadge period="12m" variant="glass" className="text-[9px] tracking-[0.2em] opacity-75" /></div>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={cashflowData}>
                  <defs>
                    <linearGradient id="cashflowGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="mes" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => [formatCurrency(v), 'Acumulado']} />
                  <Area
                    type="monotone"
                    dataKey="acumulado"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    fill="url(#cashflowGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
              </div>
            </div>

            {/* Projection */}
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
              <h2 className="font-bold text-amber-900 mb-1 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-amber-600" />
                Proyección próximos 3 meses
              </h2>
              <p className="text-xs text-amber-700 mb-4">
                Basado en el promedio de los últimos 3 meses registrados
              </p>
              <div className="grid grid-cols-3 gap-4">
                {projectionData.map((p) => (
                  <div key={p.mes} className="bg-white dark:bg-gray-900 rounded-xl border border-amber-100 p-4">
                    <p className="text-xs font-semibold text-amber-700 uppercase mb-2">{p.mes}</p>
                    <div className="space-y-1.5 text-sm">
                      <div className="flex justify-between">
                        <span className="text-emerald-600">Cobros est.</span>
                        <span className="font-medium">{formatCurrency(p.ingresos)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-red-600">Pagos est.</span>
                        <span className="font-medium">{formatCurrency(p.gastos)}</span>
                      </div>
                      <div className={`flex justify-between font-bold border-t pt-1.5 ${p.neto >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                        <span>Neto</span>
                        <span>{formatCurrency(p.neto)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* F-09: Currency converter */}
            <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
              <h2 className="font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                <ArrowLeftRight className="w-5 h-5 text-blue-600" />
                Conversor de divisas
              </h2>
              <div className="flex flex-wrap gap-3 items-end">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Importe</label>
                  <input
                    type="number"
                    value={currAmount}
                    onChange={(e) => setCurrAmount(e.target.value)}
                    placeholder="10000"
                    className="border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm w-36 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">De</label>
                  <select
                    value={currFrom}
                    onChange={(e) => setCurrFrom(e.target.value as CurrencyCode)}
                    className="border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {getCurrencyList().map((c) => (
                      <option key={c.code} value={c.code}>{c.flag} {c.code} — {c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">A</label>
                  <select
                    value={currTo}
                    onChange={(e) => setCurrTo(e.target.value as CurrencyCode)}
                    className="border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {getCurrencyList().map((c) => (
                      <option key={c.code} value={c.code}>{c.flag} {c.code} — {c.name}</option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={handleConvertCurrency}
                  disabled={currLoading || !currAmount}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {currLoading ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <ArrowLeftRight className="w-4 h-4" />}
                  Convertir
                </button>
                {currResult !== null && (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2">
                    <p className="text-xs text-blue-600 font-medium">Resultado</p>
                    <p className="text-lg font-bold text-blue-900">
                      {currResult.toLocaleString('es-ES', { minimumFractionDigits: 2 })} {currTo}
                    </p>
                    {currRates && (
                      <p className="text-xs text-blue-400">
                        1 {currFrom} = {((currRates[currTo] ?? 1) / (currRates[currFrom] ?? 1)).toFixed(4)} {currTo}
                      </p>
                    )}
                  </div>
                )}
              </div>
              {currRates && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {(['USD', 'GBP', 'CHF', 'MAD', 'SAR', 'AED'] as CurrencyCode[]).map((code) => {
                    const rate = currRates[code];
                    if (!rate) return null;
                    return (
                      <div key={code} className="bg-slate-50 rounded-lg px-3 py-1.5 text-xs">
                        <span className="text-slate-500">1 EUR = </span>
                        <span className="font-semibold text-slate-800">{rate.toFixed(4)} {code}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── F-05: PAYMENT REMINDERS TAB ── */}
        {activeTab === 'reminders' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  <BellRing className="w-5 h-5 text-amber-500" />
                  Recordatorios de pago
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                  Facturas vencidas con escalado automático: nivel 1 (7d), 2 (15d), 3 (30d+)
                </p>
              </div>
              <button
                onClick={loadReminders}
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${remindersLoading ? 'animate-spin' : ''}`} />
                Actualizar
              </button>
            </div>

            {/* Level legend */}
            <div className="grid grid-cols-3 gap-3">
              {([1, 2, 3] as const).map((lvl) => {
                const cfg = REMINDER_LEVELS[lvl];
                const count = reminders.filter((r) => r.level === lvl && r.status !== 'resolved' && r.status !== 'cancelled').length;
                return (
                  <div key={lvl} className="bg-white dark:bg-gray-900 rounded-xl border border-slate-200 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <Bell className="w-4 h-4" style={{ color: cfg.color }} />
                      <span className="text-lg font-bold text-slate-900">{count}</span>
                    </div>
                    <p className="text-xs font-semibold text-slate-700">{cfg.label}</p>
                    <p className="text-xs text-slate-400 mt-0.5">+{cfg.daysThreshold} días vencido</p>
                  </div>
                );
              })}
            </div>

            {remindersLoading ? (
              <div className="flex items-center justify-center py-12">
                <LoaderCircle className="w-6 h-6 animate-spin text-blue-500" />
              </div>
            ) : reminders.length === 0 ? (
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-slate-200 p-12 text-center">
                <Bell className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 font-medium">Sin recordatorios activos</p>
                <p className="text-sm text-slate-400 mt-1">
                  Los recordatorios se crean automáticamente al detectar facturas vencidas
                </p>
              </div>
            ) : (
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-sm min-w-[900px]">
                  <thead>
                    <tr className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide border-b border-slate-200">
                      <th className="px-4 py-3 text-left">Cliente</th>
                      <th className="px-4 py-3 text-left">Factura</th>
                      <th className="px-4 py-3 text-left">Vencimiento</th>
                      <th className="px-4 py-3 text-right">Importe</th>
                      <th className="px-4 py-3 text-center">Nivel</th>
                      <th className="px-4 py-3 text-center">Estado</th>
                      <th className="px-4 py-3 text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reminders.map((r) => {
                      const lvlCfg = REMINDER_LEVELS[r.level];
                      return (
                        <tr key={r.id} className={`hover:bg-slate-50 ${r.status === 'resolved' ? 'opacity-60' : ''}`}>
                          <td className="px-4 py-3">
                            <p className="font-medium text-slate-800">{r.clientName}</p>
                            <p className="text-xs text-slate-400">{r.clientEmail}</p>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-slate-600">{r.invoiceNumber}</td>
                          <td className="px-4 py-3">
                            <p className="text-slate-700">{new Date(r.invoiceDueDate).toLocaleDateString('es-ES')}</p>
                            <p className="text-xs text-red-500">{r.daysOverdue} días vencido</p>
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-slate-900">
                            {formatCurrency(r.invoiceTotal)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span
                              className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full text-white"
                              style={{ backgroundColor: lvlCfg.color }}
                            >
                              Niv. {r.level}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              r.status === 'pending' ? 'bg-amber-50 text-amber-700' :
                              r.status === 'sent' ? 'bg-blue-50 text-blue-700' :
                              r.status === 'resolved' ? 'bg-emerald-50 text-emerald-700' :
                              'bg-slate-100 text-slate-500'
                            }`}>
                              {r.status === 'pending' ? 'Pendiente' : r.status === 'sent' ? 'Enviado' : r.status === 'resolved' ? 'Resuelto' : 'Cancelado'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1 justify-center">
                              {r.status === 'pending' && (
                                <button
                                  onClick={() => handleMarkReminderSent(r)}
                                  title="Marcar como enviado"
                                  className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded hover:bg-blue-100 transition-colors"
                                >
                                  Marcar enviado
                                </button>
                              )}
                              {(r.status === 'pending' || r.status === 'sent') && (
                                <button
                                  onClick={() => handleMarkReminderResolved(r)}
                                  title="Marcar como resuelto"
                                  className="text-xs px-2 py-1 bg-emerald-50 text-emerald-700 rounded hover:bg-emerald-100 transition-colors"
                                >
                                  Resuelto
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── F-10: VAT BOOK TAB ── */}
        {activeTab === 'vat-book' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-purple-600" />
                  Libro de IVA
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                  IVA repercutido (cobros) y soportado (pagos) con exportación trimestral
                </p>
              </div>
              <div className="flex gap-3">
                <select
                  value={vatYear}
                  onChange={(e) => setVatYear(Number(e.target.value))}
                  className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  {vatYears.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
                <select
                  value={vatQuarter}
                  onChange={(e) => setVatQuarter(Number(e.target.value) as VatQuarter)}
                  className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  {([1, 2, 3, 4] as VatQuarter[]).map((q) => (
                    <option key={q} value={q}>{getQuarterLabel(q)} {vatYear}</option>
                  ))}
                </select>
                {selectedVatQuarterData && (
                  <button
                    onClick={() => downloadVatCsv(selectedVatQuarterData)}
                    className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm rounded-xl hover:bg-purple-700 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    Exportar CSV
                  </button>
                )}
              </div>
            </div>

            {/* Annual summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: 'IVA repercutido anual', value: formatCurrency(vatBook.annualRepercutido), color: 'text-emerald-700', bg: 'bg-emerald-50' },
                { label: 'IVA soportado anual', value: formatCurrency(vatBook.annualSoportado), color: 'text-red-700', bg: 'bg-red-50' },
                { label: 'IVA neto anual', value: formatCurrency(vatBook.annualNet), color: vatBook.annualNet >= 0 ? 'text-blue-700' : 'text-orange-700', bg: vatBook.annualNet >= 0 ? 'bg-blue-50' : 'bg-orange-50' },
                { label: 'Resultado', value: vatBook.annualNet >= 0 ? 'A INGRESAR' : 'A DEVOLVER', color: vatBook.annualNet >= 0 ? 'text-slate-700' : 'text-orange-700', bg: 'bg-slate-50' },
              ].map((kpi) => (
                <div key={kpi.label} className={`rounded-xl border border-slate-200 p-4 ${kpi.bg}`}>
                  <p className="text-xs text-slate-500 mb-1">{kpi.label}</p>
                  <p className={`text-xl font-bold ${kpi.color}`}>{kpi.value}</p>
                </div>
              ))}
            </div>

            {/* Quarterly breakdown */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {vatBook.quarters.map((q) => (
                <button
                  key={q.quarter}
                  onClick={() => setVatQuarter(q.quarter)}
                  className={`text-left p-4 rounded-xl border-2 transition-all ${
                    vatQuarter === q.quarter
                      ? 'border-purple-500 bg-purple-50'
                      : 'border-slate-200 bg-white dark:bg-gray-900 hover:border-purple-200'
                  }`}
                >
                  <p className="text-xs font-semibold text-slate-500 uppercase mb-1">{q.label}</p>
                  <p className="text-sm font-bold text-emerald-600">Rep: {formatCurrency(q.repercutido.tax)}</p>
                  <p className="text-sm font-bold text-red-600">Sop: {formatCurrency(q.soportado.tax)}</p>
                  <p className={`text-sm font-bold mt-1 ${q.netVat >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>
                    Neto: {formatCurrency(q.netVat)}
                  </p>
                  <span className={`inline-block text-xs mt-1 px-2 py-0.5 rounded-full ${
                    q.result === 'a_ingresar' ? 'bg-blue-100 text-blue-700' :
                    q.result === 'a_devolver' ? 'bg-orange-100 text-orange-700' :
                    'bg-slate-100 text-slate-500'
                  }`}>
                    {q.result === 'a_ingresar' ? '⬆ A ingresar' : q.result === 'a_devolver' ? '⬇ A devolver' : '≈ Cero'}
                  </span>
                </button>
              ))}
            </div>

            {/* Selected quarter detail */}
            {selectedVatQuarterData && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Repercutido */}
                <div className="bg-white dark:bg-gray-900 rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100 bg-emerald-50 flex justify-between items-center">
                    <h3 className="font-semibold text-emerald-900">IVA Repercutido (cobros)</h3>
                    <span className="font-bold text-emerald-700">{formatCurrency(selectedVatQuarterData.repercutido.tax)}</span>
                  </div>
                  {selectedVatQuarterData.repercutido.entries.length === 0 ? (
                    <p className="text-slate-400 text-sm p-4">Sin cobros con IVA en este trimestre</p>
                  ) : (
                    <>
                      <div className="max-h-64 overflow-y-auto">
                        <table className="w-full text-xs min-w-[700px]">
                          <thead><tr className="bg-slate-50 text-slate-400 uppercase tracking-wide"><th className="px-4 py-2 text-left">Fecha</th><th className="px-4 py-2 text-left">Concepto</th><th className="px-4 py-2 text-right">Base</th><th className="px-4 py-2 text-center">%</th><th className="px-4 py-2 text-right">Cuota</th></tr></thead>
                          <tbody className="divide-y divide-slate-50">
                            {selectedVatQuarterData.repercutido.entries.map((e) => (
                              <tr key={e.movementId} className="hover:bg-slate-50">
                                <td className="px-4 py-2 text-slate-500">{new Date(e.date).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })}</td>
                                <td className="px-4 py-2 text-slate-700 max-w-32 truncate">{e.concept}</td>
                                <td className="px-4 py-2 text-right">{formatCurrency(e.baseAmount)}</td>
                                <td className="px-4 py-2 text-center text-slate-400">{e.taxRate}%</td>
                                <td className="px-4 py-2 text-right font-medium text-emerald-700">{formatCurrency(e.taxAmount)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="px-4 py-3 bg-emerald-50 border-t border-emerald-100 flex justify-between text-sm font-semibold">
                        <span>Base: {formatCurrency(selectedVatQuarterData.repercutido.base)}</span>
                        <span className="text-emerald-700">Cuota: {formatCurrency(selectedVatQuarterData.repercutido.tax)}</span>
                      </div>
                    </>
                  )}
                </div>

                {/* Soportado */}
                <div className="bg-white dark:bg-gray-900 rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100 bg-red-50 flex justify-between items-center">
                    <h3 className="font-semibold text-red-900">IVA Soportado (pagos)</h3>
                    <span className="font-bold text-red-700">{formatCurrency(selectedVatQuarterData.soportado.tax)}</span>
                  </div>
                  {selectedVatQuarterData.soportado.entries.length === 0 ? (
                    <p className="text-slate-400 text-sm p-4">Sin pagos con IVA en este trimestre</p>
                  ) : (
                    <>
                      <div className="max-h-64 overflow-y-auto">
                        <table className="w-full text-xs min-w-[700px]">
                          <thead><tr className="bg-slate-50 text-slate-400 uppercase tracking-wide"><th className="px-4 py-2 text-left">Fecha</th><th className="px-4 py-2 text-left">Concepto</th><th className="px-4 py-2 text-right">Base</th><th className="px-4 py-2 text-center">%</th><th className="px-4 py-2 text-right">Cuota</th></tr></thead>
                          <tbody className="divide-y divide-slate-50">
                            {selectedVatQuarterData.soportado.entries.map((e) => (
                              <tr key={e.movementId} className="hover:bg-slate-50">
                                <td className="px-4 py-2 text-slate-500">{new Date(e.date).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })}</td>
                                <td className="px-4 py-2 text-slate-700 max-w-32 truncate">{e.concept}</td>
                                <td className="px-4 py-2 text-right">{formatCurrency(e.baseAmount)}</td>
                                <td className="px-4 py-2 text-center text-slate-400">{e.taxRate}%</td>
                                <td className="px-4 py-2 text-right font-medium text-red-700">{formatCurrency(e.taxAmount)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="px-4 py-3 bg-red-50 border-t border-red-100 flex justify-between text-sm font-semibold">
                        <span>Base: {formatCurrency(selectedVatQuarterData.soportado.base)}</span>
                        <span className="text-red-700">Cuota: {formatCurrency(selectedVatQuarterData.soportado.tax)}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {selectedVatQuarterData && (
              <div className={`rounded-xl border-2 p-5 ${
                selectedVatQuarterData.result === 'a_ingresar' ? 'border-blue-300 bg-blue-50' :
                selectedVatQuarterData.result === 'a_devolver' ? 'border-orange-300 bg-orange-50' :
                'border-slate-200 bg-slate-50'
              }`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600">Resultado {selectedVatQuarterData.label}</p>
                    <p className={`text-2xl font-bold mt-1 ${
                      selectedVatQuarterData.result === 'a_ingresar' ? 'text-blue-900' :
                      selectedVatQuarterData.result === 'a_devolver' ? 'text-orange-900' :
                      'text-slate-900'
                    }`}>
                      {selectedVatQuarterData.result === 'a_ingresar'
                        ? `A INGRESAR: ${formatCurrency(selectedVatQuarterData.netVat)}`
                        : selectedVatQuarterData.result === 'a_devolver'
                        ? `A DEVOLVER: ${formatCurrency(Math.abs(selectedVatQuarterData.netVat))}`
                        : 'RESULTADO CERO'}
                    </p>
                  </div>
                  <button
                    onClick={() => downloadVatCsv(selectedVatQuarterData)}
                    className="flex items-center gap-2 px-4 py-2.5 bg-purple-600 text-white text-sm font-medium rounded-xl hover:bg-purple-700 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    Exportar {selectedVatQuarterData.label}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {showModal && (
        <NewTransactionModal
          onClose={() => setShowModal(false)}
          onAdd={handleAdd}
          existingMovements={movements}
          isSaving={isSaving}
        />
      )}

      {selectedTx && (
        <TransactionDetailModal
          movement={selectedTx}
          onClose={() => setSelectedTx(null)}
          allMovements={movements}
          issuerName={user?.companyName || ''}
        />
      )}
    </Layout>
  );
}
