import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  FileSpreadsheet,
  TrendingUp,
  TrendingDown,
  Download,
  BarChart2,
  DollarSign,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import type { FinanceMovementRecord } from '../../../lib/financeTypes';
import {
  generateProfitAndLoss,
  generateCashFlowReport,
  generateBalanceSheet,
  generateExpenseAnalysis,
  exportReportToCsv,
} from '../../../lib/financeReportsApi';
import type {
  ProfitAndLossReport,
  CashFlowReport,
  BalanceSheet,
  ExpenseAnalysis,
} from '../../../lib/financeReportsApi';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatCurrency(n: number): string {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

function valueColor(n: number): string {
  if (n > 0) return 'text-emerald-600 dark:text-emerald-400';
  if (n < 0) return 'text-red-600 dark:text-red-400';
  return 'text-gray-500 dark:text-gray-400';
}

type TabKey = 'pnl' | 'cashflow' | 'gastos' | 'balance';

const TABS: Array<{ key: TabKey; label: string; icon: React.ElementType }> = [
  { key: 'pnl', label: 'P&L', icon: TrendingUp },
  { key: 'cashflow', label: 'Cash Flow', icon: DollarSign },
  { key: 'gastos', label: 'Gastos', icon: BarChart2 },
  { key: 'balance', label: 'Balance', icon: FileSpreadsheet },
];

const EMERALD = '#10b981';
const RED = '#ef4444';
const BLUE = '#3b82f6';
const AMBER = '#f59e0b';

interface FinanceReportsPanelProps {
  userId: string;
  movements: FinanceMovementRecord[];
  businessId?: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function FinanceReportsPanel({ userId, movements, businessId }: FinanceReportsPanelProps) {
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [activeTab, setActiveTab] = useState<TabKey>('pnl');
  const [loading, setLoading] = useState(false);

  const [pnl, setPnl] = useState<ProfitAndLossReport | null>(null);
  const [cashflow, setCashflow] = useState<CashFlowReport | null>(null);

  const balanceSheet = useMemo<BalanceSheet>(
    () => generateBalanceSheet(userId, movements),
    [userId, movements],
  );

  const expenseAnalysis = useMemo<ExpenseAnalysis>(
    () => generateExpenseAnalysis(movements, year),
    [movements, year],
  );

  const loadAsyncReports = useCallback(async () => {
    setLoading(true);
    try {
      const [pnlData, cfData] = await Promise.all([
        generateProfitAndLoss(userId, year, businessId),
        generateCashFlowReport(userId, year, businessId),
      ]);
      setPnl(pnlData);
      setCashflow(cfData);
    } catch {
      /* silently fail – data stays null */
    } finally {
      setLoading(false);
    }
  }, [userId, year, businessId]);

  useEffect(() => {
    loadAsyncReports();
  }, [loadAsyncReports]);

  // ── Export handlers ─────────────────────────────────────────────────────

  const exportPnl = useCallback(() => {
    if (!pnl) return;
    exportReportToCsv(
      `PnL_${pnl.year}`,
      ['Mes', 'Ingresos', 'Gastos', 'Resultado'],
      pnl.months.map(m => [m.label, m.income.toFixed(2), m.expenses.toFixed(2), m.netProfit.toFixed(2)]),
    );
  }, [pnl]);

  const exportCashflow = useCallback(() => {
    if (!cashflow) return;
    exportReportToCsv(
      `CashFlow_${cashflow.year}`,
      ['Mes', 'Saldo apertura', 'Ingresos', 'Gastos', 'Saldo cierre'],
      cashflow.months.map(m => [
        m.label, m.openingBalance.toFixed(2), m.income.toFixed(2),
        m.expenses.toFixed(2), m.closingBalance.toFixed(2),
      ]),
    );
  }, [cashflow]);

  const exportGastos = useCallback(() => {
    exportReportToCsv(
      `Gastos_${year}`,
      ['Categoría', 'Total'],
      expenseAnalysis.topCategories.map(c => [c.category, c.total.toFixed(2)]),
    );
  }, [expenseAnalysis, year]);

  const exportBalance = useCallback(() => {
    exportReportToCsv(
      'Balance',
      ['Concepto', 'Importe'],
      [
        ['Total cobros', balanceSheet.totalAssets.toFixed(2)],
        ['Total pagos', balanceSheet.totalLiabilities.toFixed(2)],
        ['Balance neto', balanceSheet.equity.toFixed(2)],
        ['Pendientes cobro', balanceSheet.receivables.toFixed(2)],
        ['Pendientes pago', balanceSheet.payables.toFixed(2)],
      ],
    );
  }, [balanceSheet]);

  const exportMap: Record<TabKey, () => void> = {
    pnl: exportPnl,
    cashflow: exportCashflow,
    gastos: exportGastos,
    balance: exportBalance,
  };

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* Year selector + export */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setYear(y => y - 1)}
            className="p-1.5 rounded-lg text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-lg font-bold text-gray-900 dark:text-white tabular-nums min-w-[4ch] text-center">
            {year}
          </span>
          <button
            onClick={() => setYear(y => y + 1)}
            className="p-1.5 rounded-lg text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        <button
          onClick={exportMap[activeTab]}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-700 dark:hover:bg-emerald-900/30"
        >
          <Download className="w-3.5 h-3.5" />
          Exportar CSV
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-gray-100 dark:bg-gray-800">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition-all ${
                isActive
                  ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {loading && (activeTab === 'pnl' || activeTab === 'cashflow') ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
        </div>
      ) : (
        <>
          {activeTab === 'pnl' && pnl && <PnLTab report={pnl} />}
          {activeTab === 'cashflow' && cashflow && <CashFlowTab report={cashflow} />}
          {activeTab === 'gastos' && <GastosTab analysis={expenseAnalysis} />}
          {activeTab === 'balance' && <BalanceTab sheet={balanceSheet} />}
        </>
      )}
    </div>
  );
}

// ─── P&L Tab ─────────────────────────────────────────────────────────────────

function PnLTab({ report }: { report: ProfitAndLossReport }) {
  const chartData = report.months.map(m => ({
    name: m.label,
    Ingresos: m.income,
    Gastos: m.expenses,
  }));

  const incomeEntries = Object.entries(report.incomeByCategory).sort((a, b) => b[1] - a[1]);
  const expenseEntries = Object.entries(report.expenseByCategory).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <SummaryCard label="Ingresos totales" value={report.totalIncome} positive />
        <SummaryCard label="Gastos totales" value={report.totalExpenses} positive={false} />
        <SummaryCard label="Resultado neto" value={report.totalNetProfit} />
      </div>

      {/* Chart */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
        <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-3">Ingresos vs Gastos</h4>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={chartData} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip
              formatter={(value: number) => formatCurrency(value)}
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
            />
            <Bar dataKey="Ingresos" fill={EMERALD} radius={[4, 4, 0, 0]} />
            <Bar dataKey="Gastos" fill={RED} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Monthly table */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="sticky top-0 bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                <th className="text-left px-4 py-2.5 font-medium">Mes</th>
                <th className="text-right px-4 py-2.5 font-medium">Ingresos</th>
                <th className="text-right px-4 py-2.5 font-medium">Gastos</th>
                <th className="text-right px-4 py-2.5 font-medium">Resultado</th>
              </tr>
            </thead>
            <tbody>
              {report.months.map((m, i) => (
                <tr
                  key={m.month}
                  className={i % 2 === 0
                    ? 'bg-white dark:bg-gray-900'
                    : 'bg-gray-50/50 dark:bg-gray-800/30'}
                >
                  <td className="px-4 py-2 font-medium text-gray-900 dark:text-white">{m.label}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(m.income)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-red-600 dark:text-red-400">
                    {formatCurrency(m.expenses)}
                  </td>
                  <td className={`px-4 py-2 text-right tabular-nums font-medium ${valueColor(m.netProfit)}`}>
                    {formatCurrency(m.netProfit)}
                  </td>
                </tr>
              ))}
              {/* Totals */}
              <tr className="border-t-2 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 font-bold">
                <td className="px-4 py-2.5 text-gray-900 dark:text-white">Total</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(report.totalIncome)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-red-600 dark:text-red-400">
                  {formatCurrency(report.totalExpenses)}
                </td>
                <td className={`px-4 py-2.5 text-right tabular-nums ${valueColor(report.totalNetProfit)}`}>
                  {formatCurrency(report.totalNetProfit)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Category breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <CategoryList title="Top ingresos" entries={incomeEntries} color="emerald" />
        <CategoryList title="Top gastos" entries={expenseEntries} color="red" />
      </div>
    </div>
  );
}

// ─── Cash Flow Tab ───────────────────────────────────────────────────────────

function CashFlowTab({ report }: { report: CashFlowReport }) {
  const chartData = report.months.map(m => ({
    name: m.label,
    Saldo: m.closingBalance,
  }));

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <SummaryCard label="Entradas" value={report.totalInflow} positive />
        <SummaryCard label="Salidas" value={report.totalOutflow} positive={false} />
        <SummaryCard label="Flujo neto" value={report.netCashFlow} />
      </div>

      {/* Line chart */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
        <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-3">Flujo de caja acumulado</h4>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip
              formatter={(value: number) => formatCurrency(value)}
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
            />
            <Line
              type="monotone"
              dataKey="Saldo"
              stroke={BLUE}
              strokeWidth={2}
              dot={{ r: 3, fill: BLUE }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Waterfall table */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="sticky top-0 bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                <th className="text-left px-4 py-2.5 font-medium">Mes</th>
                <th className="text-right px-4 py-2.5 font-medium">Apertura</th>
                <th className="text-right px-4 py-2.5 font-medium">Entradas</th>
                <th className="text-right px-4 py-2.5 font-medium">Salidas</th>
                <th className="text-right px-4 py-2.5 font-medium">Cierre</th>
              </tr>
            </thead>
            <tbody>
              {report.months.map((m, i) => (
                <tr
                  key={m.month}
                  className={i % 2 === 0
                    ? 'bg-white dark:bg-gray-900'
                    : 'bg-gray-50/50 dark:bg-gray-800/30'}
                >
                  <td className="px-4 py-2 font-medium text-gray-900 dark:text-white">{m.label}</td>
                  <td className={`px-4 py-2 text-right tabular-nums ${valueColor(m.openingBalance)}`}>
                    {formatCurrency(m.openingBalance)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(m.income)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-red-600 dark:text-red-400">
                    {formatCurrency(m.expenses)}
                  </td>
                  <td className={`px-4 py-2 text-right tabular-nums font-medium ${valueColor(m.closingBalance)}`}>
                    {formatCurrency(m.closingBalance)}
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

// ─── Gastos Tab ──────────────────────────────────────────────────────────────

const CATEGORY_COLORS = [EMERALD, BLUE, AMBER, '#8b5cf6', RED, '#06b6d4', '#ec4899', '#64748b'];

function GastosTab({ analysis }: { analysis: ExpenseAnalysis }) {
  const chartData = analysis.topCategories.slice(0, 8).map((c, i) => ({
    name: c.category,
    total: c.total,
    fill: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
  }));

  return (
    <div className="space-y-4">
      {/* KPI */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center">
          <BarChart2 className="w-5 h-5 text-amber-600 dark:text-amber-400" />
        </div>
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400">Gasto medio mensual</p>
          <p className="text-lg font-bold text-gray-900 dark:text-white tabular-nums">
            {formatCurrency(analysis.averageMonthlyExpense)}
          </p>
        </div>
      </div>

      {/* Bar chart by category */}
      {chartData.length > 0 && (
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
          <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-3">Gastos por categoría</h4>
          <ResponsiveContainer width="100%" height={Math.max(180, chartData.length * 36)}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 80 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fontSize: 11 }}
                width={75}
              />
              <Tooltip
                formatter={(value: number) => formatCurrency(value)}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
              <Bar dataKey="total" radius={[0, 4, 4, 0]}>
                {chartData.map((entry, idx) => (
                  <Cell key={idx} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Month over month table */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
          <h4 className="text-sm font-bold text-gray-900 dark:text-white">Comparativa mensual</h4>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="sticky top-0 bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                <th className="text-left px-4 py-2.5 font-medium">Mes</th>
                <th className="text-right px-4 py-2.5 font-medium">Total</th>
                <th className="text-right px-4 py-2.5 font-medium">Variación</th>
              </tr>
            </thead>
            <tbody>
              {analysis.monthOverMonth.map((m, i) => (
                <tr
                  key={m.month}
                  className={i % 2 === 0
                    ? 'bg-white dark:bg-gray-900'
                    : 'bg-gray-50/50 dark:bg-gray-800/30'}
                >
                  <td className="px-4 py-2 font-medium text-gray-900 dark:text-white">{m.label}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-gray-900 dark:text-white">
                    {formatCurrency(m.total)}
                  </td>
                  <td className={`px-4 py-2 text-right tabular-nums ${valueColor(m.diff)}`}>
                    {m.month === 1 ? '—' : (
                      <span className="inline-flex items-center gap-0.5">
                        {m.diff > 0 ? <TrendingUp className="w-3 h-3" /> : m.diff < 0 ? <TrendingDown className="w-3 h-3" /> : null}
                        {formatCurrency(m.diff)}
                      </span>
                    )}
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

// ─── Balance Tab ─────────────────────────────────────────────────────────────

function BalanceTab({ sheet }: { sheet: BalanceSheet }) {
  const cards: Array<{ label: string; value: number; icon: React.ElementType; accent: string }> = [
    {
      label: 'Total cobros',
      value: sheet.totalAssets,
      icon: TrendingUp,
      accent: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400',
    },
    {
      label: 'Total pagos',
      value: sheet.totalLiabilities,
      icon: TrendingDown,
      accent: 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400',
    },
    {
      label: 'Balance neto',
      value: sheet.equity,
      icon: DollarSign,
      accent: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400',
    },
    {
      label: 'Pendientes cobro',
      value: sheet.receivables,
      icon: FileSpreadsheet,
      accent: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400',
    },
    {
      label: 'Pendientes pago',
      value: sheet.payables,
      icon: FileSpreadsheet,
      accent: 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {cards.map(card => {
        const Icon = card.icon;
        return (
          <div
            key={card.label}
            className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 flex items-center gap-3"
          >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${card.accent}`}>
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">{card.label}</p>
              <p className={`text-lg font-bold tabular-nums ${valueColor(card.value)}`}>
                {formatCurrency(card.value)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Shared sub-components ───────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  positive,
}: {
  label: string;
  value: number;
  positive?: boolean;
}) {
  const color = positive === true
    ? 'text-emerald-600 dark:text-emerald-400'
    : positive === false
      ? 'text-red-600 dark:text-red-400'
      : valueColor(value);

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${color}`}>
        {formatCurrency(value)}
      </p>
    </div>
  );
}

function CategoryList({
  title,
  entries,
  color,
}: {
  title: string;
  entries: Array<[string, number]>;
  color: 'emerald' | 'red';
}) {
  const barColor = color === 'emerald' ? 'bg-emerald-500' : 'bg-red-500';
  const textColor = color === 'emerald'
    ? 'text-emerald-600 dark:text-emerald-400'
    : 'text-red-600 dark:text-red-400';

  const max = entries.length > 0 ? entries[0][1] : 1;

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
      <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-3">{title}</h4>
      {entries.length === 0 ? (
        <p className="text-xs text-gray-400 dark:text-gray-500">Sin datos</p>
      ) : (
        <div className="space-y-2">
          {entries.slice(0, 8).map(([cat, total]) => (
            <div key={cat}>
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-xs text-gray-700 dark:text-gray-300 truncate mr-2">{cat}</span>
                <span className={`text-xs font-medium tabular-nums ${textColor}`}>
                  {formatCurrency(total)}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                <div
                  className={`h-full rounded-full ${barColor}`}
                  style={{ width: `${Math.max(2, (total / max) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
