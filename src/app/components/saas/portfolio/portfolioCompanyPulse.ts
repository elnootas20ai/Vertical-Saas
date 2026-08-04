import type { PortfolioBusiness } from '../../../hooks/usePortfolioOverview';
import { comparableMomPct } from '../../../lib/portfolioMetrics';

export type PortfolioVerticalKind = 'delivery' | 'restaurant' | 'finance';

export function portfolioVerticalKind(row: PortfolioBusiness): PortfolioVerticalKind {
  if (row.isDelivery) return 'delivery';
  if (row.isRestaurant) return 'restaurant';
  return 'finance';
}

/** Lo que “genera” la empresa en el mes (ops retail o ingresos finanzas). */
export function companyGeneratedMonth(row: PortfolioBusiness): number {
  const kind = portfolioVerticalKind(row);
  if (kind === 'delivery' || kind === 'restaurant') {
    return Number(row.metrics.revenueMonth) || 0;
  }
  return Number(row.finance.incomeMonth) || 0;
}

export function companyGeneratedToday(row: PortfolioBusiness): number {
  const kind = portfolioVerticalKind(row);
  if (kind === 'delivery' || kind === 'restaurant') {
    return Number(row.metrics.revenueToday) || 0;
  }
  return 0;
}

export function companyGeneratedPrevMonth(row: PortfolioBusiness): number {
  const kind = portfolioVerticalKind(row);
  if (kind === 'delivery' || kind === 'restaurant') {
    return Number(row.metrics.revenuePrevMonth) || 0;
  }
  return Number(row.finance.incomePrevMonth) || 0;
}

/**
 * Baseline MoM justo: mes anterior solo hasta el mismo día (MTD vs MTD).
 * Sin fallback al mes completo — si no hay MTD, 0 → MoM null.
 */
export function companyGeneratedPrevMonthComparable(row: PortfolioBusiness): number {
  const kind = portfolioVerticalKind(row);
  if (kind === 'delivery' || kind === 'restaurant') {
    return Number(row.metrics.revenuePrevMonthMtd) || 0;
  }
  return Number(row.finance.incomePrevMonthMtd) || 0;
}

/** Año en curso (YTD) desde cierres mensuales de caja; si no hay, cae al mes. */
export function companyGeneratedYear(row: PortfolioBusiness, now = new Date()): number {
  const yearPrefix = `${now.getFullYear()}-`;
  const months = row.cajaMonthlyTotals || [];
  let ytd = 0;
  let hit = false;
  for (const m of months) {
    if (String(m.yearMonth || '').startsWith(yearPrefix)) {
      ytd += Number(m.total) || 0;
      hit = true;
    }
  }
  if (hit && ytd > 0) return ytd;
  return companyGeneratedMonth(row);
}

/** MoM MTD vs MTD (mismo tramo de días), no mes incompleto vs mes entero. */
export function companyMomPct(row: PortfolioBusiness): number | null {
  return comparableMomPct(companyGeneratedMonth(row), companyGeneratedPrevMonthComparable(row));
}

export type ChannelShare = {
  key: string;
  label: string;
  amount: number;
  percent: number;
};

/** Integradores / canales ordenados por € (mes). */
export function deliveryChannelShares(row: PortfolioBusiness, limit = 6): ChannelShare[] {
  const total = Number(row.metrics.revenueMonth) || 0;
  const entries = Object.entries(row.metrics.revenueByChannel || {})
    .map(([label, amount]) => ({
      key: label,
      label,
      amount: Number(amount) || 0,
      percent: 0,
    }))
    .filter((c) => c.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);

  return entries.map((c) => ({
    ...c,
    percent: total > 0 ? (c.amount / total) * 100 : 0,
  }));
}

export type BrandSheetRow = {
  id: string;
  name: string;
  color?: string;
  revenueMonth: number;
  revenueToday: number;
  sharePercent: number;
};

/** Filas tipo Excel: marcas con facturación. Sin `limit` (o ≤0) → todas. */
export function deliveryBrandSheet(row: PortfolioBusiness, limit = 8): BrandSheetRow[] {
  const total = Number(row.billing?.totalRevenueMonth ?? row.metrics.revenueMonth) || 0;
  const list = [...row.brands]
    .map((b) => ({
      id: b.id,
      name: b.name,
      color: b.primaryColor,
      revenueMonth: Number(b.revenueMonth) || 0,
      revenueToday: Number(b.revenueToday) || 0,
      sharePercent:
        total > 0
          ? ((Number(b.revenueMonth) || 0) / total) * 100
          : Number(b.sharePercent) || 0,
    }))
    .filter((b) => b.revenueMonth > 0 || b.revenueToday > 0)
    .sort((a, b) => b.revenueMonth - a.revenueMonth);
  if (limit == null || limit <= 0) return list;
  return list.slice(0, limit);
}

/** Unidades del mes desde mix de caja (extensible: no solo pizza/burger/taco). */
export type CajaUnitPulse = { key: string; label: string; value: number };

export function deliveryUnitPulses(row: PortfolioBusiness): CajaUnitPulse[] {
  const mix = row.cajaMix;
  if (!mix) return [];
  const defs: Array<{ key: keyof typeof mix; label: string }> = [
    { key: 'pizza', label: 'Pizza' },
    { key: 'burger', label: 'Burger' },
    { key: 'taco', label: 'Tacos' },
  ];
  // Futuro: más claves en CeoCajaChannelMix se listan aquí sin rediseñar la tarjeta.
  return defs
    .map((d) => ({
      key: String(d.key),
      label: d.label,
      value: Math.max(0, Math.floor(Number(mix[d.key]) || 0)),
    }))
    .filter((u) => u.value > 0);
}

export function sumCompanyGenerated(rows: PortfolioBusiness[]): {
  month: number;
  today: number;
  opsMonth: number;
  financeMonth: number;
} {
  let month = 0;
  let today = 0;
  let opsMonth = 0;
  let financeMonth = 0;
  for (const row of rows) {
    month += companyGeneratedMonth(row);
    today += companyGeneratedToday(row);
    if (row.isDelivery || row.isRestaurant) {
      opsMonth += Number(row.metrics.revenueMonth) || 0;
    }
    financeMonth += Number(row.finance.incomeMonth) || 0;
  }
  return { month, today, opsMonth, financeMonth };
}
