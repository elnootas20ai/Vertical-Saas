import type { FinanceMovementRecord } from './financeTypes';
import { getCategoryEbitdaBucket, getCategoryLabel } from './financeCategoryCatalog';
import {
  filterMovementsByEbitdaScope,
  type EbitdaScopeFilter,
} from './financeScope';

export interface EbitdaMonthRow {
  month: string;
  label: string;
  income: number;
  expenses: number;
  cogs: number;
  opex: number;
  depreciation: number;
  ebitda: number;
  ebitdaMargin: number;
}

export interface EbitdaAnnualTotals {
  income: number;
  expenses: number;
  cogs: number;
  opex: number;
  ebitda: number;
  ebitdaMargin: number;
  grossProfit: number;
}

export interface EbitdaBreakdownRow {
  id: string;
  label: string;
  income: number;
  cogs: number;
  opex: number;
  ebitda: number;
  ebitdaMargin: number;
  movementCount: number;
}

const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function sumBuckets(movements: FinanceMovementRecord[]) {
  let income = 0;
  let cogs = 0;
  let opex = 0;
  let expenses = 0;

  for (const m of movements) {
    const amt = Number(m.totalAmount) || 0;
    const bucket = getCategoryEbitdaBucket(m.category, m.type);
    if (m.type === 'cobro') {
      if (bucket === 'income') income += amt;
      else if (bucket === 'non_operating') { /* fuera EBITDA */ }
      else income += amt;
    } else {
      expenses += amt;
      if (bucket === 'cogs') cogs += amt;
      else if (bucket === 'opex') opex += amt;
    }
  }

  const ebitda = income - cogs - opex;
  const ebitdaMargin = income > 0 ? (ebitda / income) * 100 : 0;
  return { income, expenses, cogs, opex, ebitda, ebitdaMargin, grossProfit: income - cogs };
}

export function computeEbitdaMonthly(
  movements: FinanceMovementRecord[],
  year: number,
  scope: EbitdaScopeFilter = { level: 'all' },
): { months: EbitdaMonthRow[]; annual: EbitdaAnnualTotals } {
  const scoped = filterMovementsByEbitdaScope(movements, scope);
  const yearMvs = scoped.filter((m) => m.date.startsWith(String(year)));

  const months: EbitdaMonthRow[] = Array.from({ length: 12 }, (_, i) => {
    const month = `${year}-${String(i + 1).padStart(2, '0')}`;
    const monthMvs = yearMvs.filter((m) => m.date.startsWith(month));
    const totals = sumBuckets(monthMvs);
    return {
      month,
      label: MONTH_LABELS[i],
      income: totals.income,
      expenses: totals.expenses,
      cogs: totals.cogs,
      opex: totals.opex,
      depreciation: 0,
      ebitda: totals.ebitda,
      ebitdaMargin: totals.ebitdaMargin,
    };
  });

  const annual = sumBuckets(yearMvs);
  return { months, annual };
}

/** EBITDA de un mes concreto (p. ej. dashboard). */
export function computeEbitdaForMonth(
  movements: FinanceMovementRecord[],
  monthKey: string,
  scope: EbitdaScopeFilter = { level: 'all' },
): EbitdaAnnualTotals {
  const scoped = filterMovementsByEbitdaScope(movements, scope);
  const monthMvs = scoped.filter((m) => String(m.date || '').startsWith(monthKey));
  return sumBuckets(monthMvs);
}

export function extractYearsFromMovements(movements: FinanceMovementRecord[]): number[] {
  const yrs = new Set<number>();
  yrs.add(new Date().getFullYear());
  movements.forEach((m) => {
    const y = parseInt(m.date.slice(0, 4), 10);
    if (y >= 2020) yrs.add(y);
  });
  return Array.from(yrs).sort((a, b) => b - a);
}

/** Desglose por empresa o tienda a partir de movimientos etiquetados. */
export function computeEbitdaBreakdown(
  movements: FinanceMovementRecord[],
  year: number,
  groupBy: 'business' | 'store',
  businessNames: Map<string, string> = new Map(),
): EbitdaBreakdownRow[] {
  const yearMvs = movements.filter((m) => m.date.startsWith(String(year)));
  const groups = new Map<string, { label: string; items: FinanceMovementRecord[] }>();

  for (const m of yearMvs) {
    let id = '';
    let label = '';
    if (groupBy === 'business') {
      id = String(m.businessId || '').trim() || '__unassigned__';
      label =
        id === '__unassigned__'
          ? 'Sin empresa / central'
          : String(m.businessName || businessNames.get(id) || id);
    } else {
      id = String(m.workCenterId || '').trim() || '__unassigned__';
      label = id === '__unassigned__' ? 'Sin tienda' : String(m.workCenterName || id);
    }
    const g = groups.get(id) || { label, items: [] };
    g.items.push(m);
    groups.set(id, g);
  }

  const rows: EbitdaBreakdownRow[] = [];
  for (const [id, g] of groups) {
    const totals = sumBuckets(g.items);
    rows.push({
      id,
      label: g.label,
      income: totals.income,
      cogs: totals.cogs,
      opex: totals.opex,
      ebitda: totals.ebitda,
      ebitdaMargin: totals.ebitdaMargin,
      movementCount: g.items.length,
    });
  }

  return rows.sort((a, b) => b.ebitda - a.ebitda);
}

export { getCategoryLabel };
