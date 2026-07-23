/**
 * EBITDA core (multi-vertical) — Vertial
 *
 * Definición estándar:
 *   EBITDA ≈ ingresos operativos − COGS − opex
 *   (sin intereses, impuestos, depreciación ni amortización)
 *
 * Fuente de verdad: movimientos de Finanzas (cobros/pagos categorizados).
 * Cuando se registran gastos/costes en Finanzas (o sync TPV/pedidos), el KPI se actualiza solo.
 */
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
  nonOperating?: number;
  operatingCosts?: number;
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

/** Calidad del snapshot: evita vender margen 100% cuando faltan costes. */
export type CoreEbitdaQuality =
  | 'ok'
  | 'income_only'
  | 'costs_only'
  | 'empty';

export interface CoreEbitdaSnapshot {
  monthKey: string;
  income: number;
  cogs: number;
  opex: number;
  operatingCosts: number;
  nonOperating: number;
  expenses: number;
  ebitda: number;
  ebitdaMargin: number;
  grossProfit: number;
  quality: CoreEbitdaQuality;
  movementCount: number;
  scope: EbitdaScopeFilter;
}

const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function sumBuckets(movements: FinanceMovementRecord[]): EbitdaAnnualTotals & {
  nonOperating: number;
  operatingCosts: number;
} {
  let income = 0;
  let cogs = 0;
  let opex = 0;
  let nonOperating = 0;
  let expenses = 0;

  for (const m of movements) {
    const amt = Number(m.totalAmount) || 0;
    if (!Number.isFinite(amt) || amt === 0) continue;
    const bucket = getCategoryEbitdaBucket(m.category, m.type);
    if (m.type === 'cobro') {
      if (bucket === 'non_operating') nonOperating += amt;
      else income += amt;
    } else {
      expenses += amt;
      if (bucket === 'cogs') cogs += amt;
      else if (bucket === 'opex') opex += amt;
      else if (bucket === 'non_operating') nonOperating += amt;
      else opex += amt;
    }
  }

  const operatingCosts = cogs + opex;
  const ebitda = income - operatingCosts;
  const ebitdaMargin = income > 0 ? (ebitda / income) * 100 : 0;
  return {
    income: round2(income),
    expenses: round2(expenses),
    cogs: round2(cogs),
    opex: round2(opex),
    nonOperating: round2(nonOperating),
    operatingCosts: round2(operatingCosts),
    ebitda: round2(ebitda),
    ebitdaMargin: round2(ebitdaMargin),
    grossProfit: round2(income - cogs),
  };
}

function qualityFromTotals(t: { income: number; operatingCosts: number }): CoreEbitdaQuality {
  if (t.income <= 0 && t.operatingCosts <= 0) return 'empty';
  if (t.income > 0 && t.operatingCosts <= 0) return 'income_only';
  if (t.income <= 0 && t.operatingCosts > 0) return 'costs_only';
  return 'ok';
}

/**
 * Scope de empresa para el dashboard KPI.
 * - Varias empresas: solo movimientos etiquetados con ese businessId.
 * - Una sola empresa: también legacy sin businessId (datos antiguos).
 */
export function resolveCoreEbitdaBusinessScope(
  businessId: string | null | undefined,
  options?: { multiBusiness?: boolean },
): EbitdaScopeFilter {
  const bid = String(businessId || '').replace(/^business:/, '').trim();
  if (!bid) return { level: 'all' };
  return {
    level: 'business',
    businessId: bid,
    includeUntagged: options?.multiBusiness === false,
  };
}

/** Snapshot EBITDA del mes — API canónica del core (dashboard, widgets, etc.). */
export function computeCoreEbitdaForMonth(
  movements: FinanceMovementRecord[],
  monthKey: string,
  scope: EbitdaScopeFilter = { level: 'all' },
): CoreEbitdaSnapshot {
  const key = String(monthKey || '').slice(0, 7);
  const scoped = filterMovementsByEbitdaScope(movements, scope);
  const monthMvs = scoped.filter((m) => String(m.date || '').startsWith(key));
  const totals = sumBuckets(monthMvs);
  return {
    monthKey: key,
    income: totals.income,
    cogs: totals.cogs,
    opex: totals.opex,
    operatingCosts: totals.operatingCosts,
    nonOperating: totals.nonOperating,
    expenses: totals.expenses,
    ebitda: totals.ebitda,
    ebitdaMargin: totals.ebitdaMargin,
    grossProfit: totals.grossProfit,
    quality: qualityFromTotals(totals),
    movementCount: monthMvs.length,
    scope,
  };
}

/** Texto corto para KPI / toasts (castellano simple). */
export function coreEbitdaSubtitle(
  snap: CoreEbitdaSnapshot,
  businessName?: string | null,
): string {
  const name = String(businessName || '').trim();
  const suffix = name ? ` · ${name}` : '';
  if (snap.quality === 'empty') return `Sin movimientos este mes${suffix}`;
  if (snap.quality === 'income_only') {
    return `Solo cobros · registra gastos en Finanzas${suffix}`;
  }
  if (snap.quality === 'costs_only') {
    return `Solo gastos · sin ingresos operativos${suffix}`;
  }
  return `Margen ${snap.ebitdaMargin.toFixed(1)}% · costes ${snap.operatingCosts.toLocaleString('es-ES', { maximumFractionDigits: 0 })} €${suffix}`;
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

/** EBITDA de un mes concreto (compat). Preferir computeCoreEbitdaForMonth. */
export function computeEbitdaForMonth(
  movements: FinanceMovementRecord[],
  monthKey: string,
  scope: EbitdaScopeFilter = { level: 'all' },
): EbitdaAnnualTotals {
  const snap = computeCoreEbitdaForMonth(movements, monthKey, scope);
  return {
    income: snap.income,
    expenses: snap.expenses,
    cogs: snap.cogs,
    opex: snap.opex,
    ebitda: snap.ebitda,
    ebitdaMargin: snap.ebitdaMargin,
    grossProfit: snap.grossProfit,
    nonOperating: snap.nonOperating,
    operatingCosts: snap.operatingCosts,
  };
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
