import { listFinanceMovements } from './financeApi';
import type { FinanceMovementRecord } from './financeTypes';

const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function getMonthIndex(dateStr: string): number {
  return new Date(dateStr).getMonth();
}

function getYear(dateStr: string): number {
  return new Date(dateStr).getFullYear();
}

function filterByYear(movements: FinanceMovementRecord[], year: number): FinanceMovementRecord[] {
  return movements.filter(m => getYear(m.date) === year);
}

function aggregateByCategory(movements: FinanceMovementRecord[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const m of movements) {
    const key = m.category || 'Sin categoría';
    map[key] = round2((map[key] || 0) + m.totalAmount);
  }
  return map;
}

// ─── P&L Report ──────────────────────────────────────────────────────────────

export interface PnLMonth {
  month: number;
  label: string;
  income: number;
  expenses: number;
  netProfit: number;
}

export interface ProfitAndLossReport {
  year: number;
  months: PnLMonth[];
  totalIncome: number;
  totalExpenses: number;
  totalNetProfit: number;
  incomeByCategory: Record<string, number>;
  expenseByCategory: Record<string, number>;
}

export async function generateProfitAndLoss(
  userId: string,
  year: number,
  businessId?: string,
): Promise<ProfitAndLossReport> {
  const all = await listFinanceMovements(userId, businessId);
  const yearly = filterByYear(all, year);

  const incomeMovements = yearly.filter(m => m.type === 'cobro');
  const expenseMovements = yearly.filter(m => m.type === 'pago');

  const months: PnLMonth[] = Array.from({ length: 12 }, (_, i) => {
    const monthIncome = incomeMovements
      .filter(m => getMonthIndex(m.date) === i)
      .reduce((sum, m) => sum + m.totalAmount, 0);
    const monthExpenses = expenseMovements
      .filter(m => getMonthIndex(m.date) === i)
      .reduce((sum, m) => sum + m.totalAmount, 0);

    return {
      month: i + 1,
      label: MONTH_LABELS[i],
      income: round2(monthIncome),
      expenses: round2(monthExpenses),
      netProfit: round2(monthIncome - monthExpenses),
    };
  });

  const totalIncome = round2(months.reduce((s, m) => s + m.income, 0));
  const totalExpenses = round2(months.reduce((s, m) => s + m.expenses, 0));

  return {
    year,
    months,
    totalIncome,
    totalExpenses,
    totalNetProfit: round2(totalIncome - totalExpenses),
    incomeByCategory: aggregateByCategory(incomeMovements),
    expenseByCategory: aggregateByCategory(expenseMovements),
  };
}

// ─── Cash Flow Report ────────────────────────────────────────────────────────

export interface CashFlowMonth {
  month: number;
  label: string;
  openingBalance: number;
  income: number;
  expenses: number;
  closingBalance: number;
}

export interface CashFlowReport {
  year: number;
  months: CashFlowMonth[];
  totalInflow: number;
  totalOutflow: number;
  netCashFlow: number;
}

export async function generateCashFlowReport(
  userId: string,
  year: number,
  businessId?: string,
): Promise<CashFlowReport> {
  const all = await listFinanceMovements(userId, businessId);

  const priorMovements = all.filter(m => getYear(m.date) < year);
  let runningBalance = priorMovements.reduce((sum, m) => {
    return sum + (m.type === 'cobro' ? m.totalAmount : -m.totalAmount);
  }, 0);

  const yearly = filterByYear(all, year);
  let totalInflow = 0;
  let totalOutflow = 0;

  const months: CashFlowMonth[] = Array.from({ length: 12 }, (_, i) => {
    const monthMovements = yearly.filter(m => getMonthIndex(m.date) === i);
    const income = round2(monthMovements.filter(m => m.type === 'cobro').reduce((s, m) => s + m.totalAmount, 0));
    const expenses = round2(monthMovements.filter(m => m.type === 'pago').reduce((s, m) => s + m.totalAmount, 0));

    const openingBalance = round2(runningBalance);
    runningBalance = round2(runningBalance + income - expenses);

    totalInflow += income;
    totalOutflow += expenses;

    return {
      month: i + 1,
      label: MONTH_LABELS[i],
      openingBalance,
      income,
      expenses,
      closingBalance: round2(runningBalance),
    };
  });

  return {
    year,
    months,
    totalInflow: round2(totalInflow),
    totalOutflow: round2(totalOutflow),
    netCashFlow: round2(totalInflow - totalOutflow),
  };
}

// ─── Balance Sheet ───────────────────────────────────────────────────────────

export interface BalanceSheet {
  totalAssets: number;
  totalLiabilities: number;
  equity: number;
  receivables: number;
  payables: number;
}

export function generateBalanceSheet(
  _userId: string,
  movements: FinanceMovementRecord[],
): BalanceSheet {
  const cobros = movements.filter(m => m.type === 'cobro');
  const pagos = movements.filter(m => m.type === 'pago');

  const paidCobros = round2(cobros.filter(m => m.status === 'paid').reduce((s, m) => s + m.totalAmount, 0));
  const paidPagos = round2(pagos.filter(m => m.status === 'paid').reduce((s, m) => s + m.totalAmount, 0));

  const receivables = round2(cobros.filter(m => m.status === 'pending').reduce((s, m) => s + m.totalAmount, 0));
  const payables = round2(pagos.filter(m => m.status === 'pending').reduce((s, m) => s + m.totalAmount, 0));

  const totalAssets = round2(paidCobros + receivables);
  const totalLiabilities = round2(paidPagos + payables);
  const equity = round2(totalAssets - totalLiabilities);

  return { totalAssets, totalLiabilities, equity, receivables, payables };
}

// ─── Expense Analysis ────────────────────────────────────────────────────────

export interface ExpenseAnalysis {
  year: number;
  topCategories: Array<{ category: string; total: number }>;
  monthOverMonth: Array<{ month: number; label: string; total: number; diff: number }>;
  averageMonthlyExpense: number;
}

export function generateExpenseAnalysis(
  movements: FinanceMovementRecord[],
  year: number,
): ExpenseAnalysis {
  const yearly = filterByYear(movements, year).filter(m => m.type === 'pago');

  const byCategory = aggregateByCategory(yearly);
  const topCategories = Object.entries(byCategory)
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total);

  const monthlyTotals = Array.from({ length: 12 }, (_, i) =>
    round2(yearly.filter(m => getMonthIndex(m.date) === i).reduce((s, m) => s + m.totalAmount, 0)),
  );

  const monthOverMonth = monthlyTotals.map((total, i) => ({
    month: i + 1,
    label: MONTH_LABELS[i],
    total,
    diff: i === 0 ? 0 : round2(total - monthlyTotals[i - 1]),
  }));

  const monthsWithData = monthlyTotals.filter(t => t > 0);
  const averageMonthlyExpense = monthsWithData.length > 0
    ? round2(monthsWithData.reduce((a, b) => a + b, 0) / monthsWithData.length)
    : 0;

  return { year, topCategories, monthOverMonth, averageMonthlyExpense };
}

// ─── CSV Export ──────────────────────────────────────────────────────────────

export function exportReportToCsv(
  reportName: string,
  headers: string[],
  rows: string[][],
): void {
  const escape = (v: string) => {
    if (v.includes(',') || v.includes('"') || v.includes('\n')) {
      return `"${v.replace(/"/g, '""')}"`;
    }
    return v;
  };

  const csvLines = [
    headers.map(escape).join(','),
    ...rows.map(row => row.map(escape).join(',')),
  ];

  const blob = new Blob(['\uFEFF' + csvLines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${reportName}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
