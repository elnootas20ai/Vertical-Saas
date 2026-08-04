import { comparableMomPct } from '../../../../lib/portfolioMetrics';
import type { PortfolioBusiness } from '../../../../hooks/usePortfolioOverview';
import type { PortfolioFinanceTotals } from '../../../../lib/portfolioMetrics';
import {
  companyGeneratedMonth,
  companyGeneratedPrevMonthComparable,
  deliveryChannelShares,
  deliveryBrandSheet,
  portfolioVerticalKind,
} from '../portfolioCompanyPulse';

export function pctOf(part: number, total: number): number | null {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return null;
  return (part / total) * 100;
}

export function formatMomLabel(pct: number | null): string | null {
  if (pct == null) return null;
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(1).replace('.', ',')}%`;
}

export type CompanyGlance = {
  row: PortfolioBusiness;
  generated: number;
  prevGenerated: number;
  mom: number | null;
  shareOfGroup: number | null;
  kind: ReturnType<typeof portfolioVerticalKind>;
};

export function buildCompanyGlances(
  rows: PortfolioBusiness[],
  groupGenerated: number,
): CompanyGlance[] {
  return rows.map((row) => {
    const generated = companyGeneratedMonth(row);
    const prevGenerated = companyGeneratedPrevMonthComparable(row);
    return {
      row,
      generated,
      prevGenerated,
      mom: comparableMomPct(generated, prevGenerated),
      shareOfGroup: pctOf(generated, groupGenerated),
      kind: portfolioVerticalKind(row),
    };
  });
}

export type GroupPnLGlance = {
  incomeMonth: number;
  expensesMonth: number;
  profitMonth: number;
  ebitdaMonth: number;
  ebitdaMarginMonth: number;
  pendingAmount: number;
  cashBalance: number;
  incomeMom: number | null;
  result: number;
  resultLabel: 'EBITDA' | 'Resultado';
};

export function buildGroupPnL(
  finance: PortfolioFinanceTotals,
  canViewEbitda: boolean,
): GroupPnLGlance {
  return {
    incomeMonth: finance.incomeMonth,
    expensesMonth: finance.expensesMonth,
    profitMonth: finance.profitMonth,
    ebitdaMonth: finance.ebitdaMonth,
    ebitdaMarginMonth: finance.ebitdaMarginMonth,
    pendingAmount: finance.pendingAmount,
    cashBalance: finance.cashBalance,
    incomeMom: comparableMomPct(finance.incomeMonth, finance.incomePrevMonthMtd),
    result: canViewEbitda ? finance.ebitdaMonth : finance.profitMonth,
    resultLabel: canViewEbitda ? 'EBITDA' : 'Resultado',
  };
}

export type AggregatedChannel = {
  label: string;
  amount: number;
  percent: number;
};

/** Mix de canales del grupo (solo delivery). */
export function aggregateGroupChannels(rows: PortfolioBusiness[], limit = 8): AggregatedChannel[] {
  const map = new Map<string, number>();
  let total = 0;
  for (const row of rows) {
    if (!row.isDelivery) continue;
    for (const ch of deliveryChannelShares(row, 20)) {
      map.set(ch.label, (map.get(ch.label) || 0) + ch.amount);
      total += ch.amount;
    }
  }
  return [...map.entries()]
    .map(([label, amount]) => ({
      label,
      amount,
      percent: total > 0 ? (amount / total) * 100 : 0,
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
}

export type GroupFoodToday = {
  pizzas: number;
  burgers: number;
  tacos: number;
  kebabs: number;
};

export function aggregateFoodToday(rows: PortfolioBusiness[]): GroupFoodToday {
  return {
    pizzas: rows.reduce((s, r) => s + (r.metrics.pizzasToday || 0), 0),
    burgers: rows.reduce((s, r) => s + (r.metrics.burgersToday || 0), 0),
    tacos: rows.reduce((s, r) => s + (r.metrics.tacosToday || 0), 0),
    kebabs: rows.reduce((s, r) => s + (r.metrics.kebabsToday || 0), 0),
  };
}

export function topBrandsAcrossDelivery(rows: PortfolioBusiness[], limit = 6) {
  const items: { name: string; amount: number; color?: string; businessName: string }[] = [];
  for (const row of rows) {
    if (!row.isDelivery) continue;
    for (const b of deliveryBrandSheet(row, 12)) {
      items.push({
        name: b.name,
        amount: b.revenueMonth,
        color: b.color,
        businessName: row.business.name,
      });
    }
  }
  return items.sort((a, b) => b.amount - a.amount).slice(0, limit);
}

export type OpsChip = {
  businessId: string;
  businessName: string;
  activeOrders: number;
  openCajas: number;
  cancelledMonth: number;
  tone: 'ok' | 'warn' | 'bad';
};

export function buildOpsChips(rows: PortfolioBusiness[]): OpsChip[] {
  return rows
    .filter((r) => r.isDelivery)
    .map((r) => {
      const active = r.metrics.activeOrders || 0;
      const cajas = r.metrics.openCashRegisters || 0;
      const cancelled = r.metrics.cancelledMonth || 0;
      let tone: OpsChip['tone'] = 'ok';
      if (active > 15 || cancelled > 10) tone = 'bad';
      else if (active > 5 || cajas === 0) tone = 'warn';
      return {
        businessId: r.businessId,
        businessName: r.business.name,
        activeOrders: active,
        openCajas: cajas,
        cancelledMonth: cancelled,
        tone,
      };
    });
}

export type PeopleGlance = {
  clockedInNow: number;
  pendingVacations: number;
  payslipsThisMonth: number;
  scheduleAlerts: number;
  noShiftToday: number;
};

export function buildPeopleGlance(rows: PortfolioBusiness[]): PeopleGlance {
  return {
    clockedInNow: rows.reduce((s, r) => s + (r.team.clockedInNow || 0), 0),
    pendingVacations: rows.reduce((s, r) => s + (r.team.pendingVacationRequests || 0), 0),
    payslipsThisMonth: rows.reduce((s, r) => s + (r.team.payslipsThisMonth || 0), 0),
    scheduleAlerts: rows.reduce((s, r) => s + (r.team.scheduleAlertsCount || 0), 0),
    noShiftToday: rows.reduce((s, r) => s + (r.team.noShiftToday || 0), 0),
  };
}
