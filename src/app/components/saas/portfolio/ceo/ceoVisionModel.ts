import type { PortfolioBusiness } from '../../../../hooks/usePortfolioOverview';
import {
  companyGeneratedMonth,
  companyGeneratedPrevMonthComparable,
  companyGeneratedYear,
} from '../portfolioCompanyPulse';
import { comparableMomPct } from '../../../../lib/portfolioMetrics';

export type CeoHealthTone = 'critical' | 'attention' | 'stable';

export type CeoCompanyVision = {
  businessId: string;
  name: string;
  brandColor: string;
  logo?: string;
  verticalLabel: string;
  /** Facturación / generado mes (ops delivery o finanzas). */
  income: number;
  incomePrev: number;
  mom: number | null;
  /** Ingresos contables del mes. */
  financeIncome: number;
  expenses: number;
  profit: number;
  ebitda: number;
  ebitdaMargin: number;
  today: number;
  /** Facturación año en curso (YTD cierres / mes). */
  year: number;
  cash: number;
  staffing: number;
  clockedIn: number;
  pending: number;
  risk: number;
  health: CeoHealthTone;
  pulse: number[];
  alertsUnresolved: number;
  alertsHigh: number;
  alertsNew: number;
  row: PortfolioBusiness;
};

const WEEK_SNAP_KEY = 'vertial.ceo.alertWeekSnap.v1';

/** ISO week key YYYY-Www (lunes local). */
export function ceoIsoWeekKey(d = new Date()): string {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - day + 3);
  const week1 = new Date(date.getFullYear(), 0, 4);
  const week =
    1
    + Math.round(
      ((date.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7,
    );
  return `${date.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

type WeekSnap = {
  currentWeekKey: string;
  current: Record<string, { unresolved: number; high: number }>;
  previousWeekKey: string | null;
  previous: Record<string, { unresolved: number; high: number }>;
};

function readWeekSnap(): WeekSnap | null {
  try {
    const raw = localStorage.getItem(WEEK_SNAP_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WeekSnap;
    if (!parsed?.currentWeekKey || typeof parsed.current !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeWeekSnap(snap: WeekSnap) {
  try {
    localStorage.setItem(WEEK_SNAP_KEY, JSON.stringify(snap));
  } catch {
    /* ignore */
  }
}

/**
 * Compara alertas actuales vs snapshot de la semana anterior (persistido en el navegador).
 */
export function syncAndCompareWeekAlerts(
  current: Array<{ businessId: string; unresolved: number; high: number }>,
): {
  weekKey: string;
  deltas: Record<string, { current: number; previous: number | null; delta: number | null; trend: 'up' | 'down' | 'flat' | 'unknown' }>;
} {
  const weekKey = ceoIsoWeekKey();
  const prevSnap = readWeekSnap();
  const byBiz: WeekSnap['current'] = {};
  for (const c of current) {
    byBiz[c.businessId] = { unresolved: c.unresolved, high: c.high };
  }

  let baseline: WeekSnap['previous'] = {};
  if (prevSnap) {
    if (prevSnap.currentWeekKey === weekKey) {
      baseline = prevSnap.previous || {};
      writeWeekSnap({
        currentWeekKey: weekKey,
        current: byBiz,
        previousWeekKey: prevSnap.previousWeekKey,
        previous: baseline,
      });
    } else {
      baseline = prevSnap.current || {};
      writeWeekSnap({
        currentWeekKey: weekKey,
        current: byBiz,
        previousWeekKey: prevSnap.currentWeekKey,
        previous: baseline,
      });
    }
  } else {
    writeWeekSnap({
      currentWeekKey: weekKey,
      current: byBiz,
      previousWeekKey: null,
      previous: {},
    });
  }

  const deltas: Record<
    string,
    { current: number; previous: number | null; delta: number | null; trend: 'up' | 'down' | 'flat' | 'unknown' }
  > = {};

  for (const c of current) {
    const score = c.high * 3 + c.unresolved;
    const p = baseline[c.businessId];
    const previous = p ? p.high * 3 + p.unresolved : null;
    const delta = previous == null ? null : score - previous;
    const trend =
      delta == null ? 'unknown' : delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
    deltas[c.businessId] = { current: score, previous, delta, trend };
  }

  return { weekKey, deltas };
}

export function companyBrandColor(row: PortfolioBusiness): string {
  const raw = String(row.brands.find((b) => b.primaryColor)?.primaryColor || '').trim();
  const hex = raw.startsWith('#') ? raw : raw ? `#${raw}` : '';
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  const palette = ['#2563EB', '#0D9488', '#059669', '#0284C7', '#334155', '#B45309'];
  let h = 0;
  const name = row.business.name || row.businessId;
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

export function computeRiskScore(input: {
  alertsHigh: number;
  alertsUnresolved: number;
  scheduleAlerts: number;
  mom: number | null;
  pending: number;
  income: number;
  openCash: number;
}): number {
  const high = Math.max(0, input.alertsHigh || 0);
  // Medium/low abiertas: no disparar riesgo en empresas sin actividad (cola vieja).
  const softOpen = Math.max(0, (input.alertsUnresolved || 0) - high);
  const active = (input.income || 0) > 0 || (input.openCash || 0) > 0;

  let risk = 0;
  risk += Math.min(40, high * 18);
  if (active) {
    risk += Math.min(12, softOpen * 2);
    risk += Math.min(12, (input.scheduleAlerts || 0) * 2);
  }
  if (input.mom != null && active) {
    if (input.mom <= -15) risk += 20;
    else if (input.mom < 0) risk += 10;
  }
  if (input.income > 0 && input.pending / input.income > 0.25) risk += 15;
  else if (input.income > 0 && input.pending / input.income > 0.1) risk += 8;
  if (input.openCash > 2) risk += 5;
  return Math.max(0, Math.min(100, Math.round(risk)));
}

export function healthFromRisk(risk: number, alertsHigh: number): CeoHealthTone {
  if (alertsHigh >= 2 || risk >= 60) return 'critical';
  if (alertsHigh >= 1 || risk >= 30) return 'attention';
  return 'stable';
}

export function pulseSeriesFromRow(row: PortfolioBusiness): number[] {
  const months = row.cajaMonthlyTotals || [];
  if (months.length >= 3) return months.map((m) => m.total);
  const days = (row.stores || []).flatMap((s) => s.ops7d?.days || []);
  if (days.length === 0) {
    const income = companyGeneratedMonth(row);
    return [income * 0.7, income * 0.85, income * 0.9, income * 0.95, income];
  }
  const byDay = new Map<string, number>();
  for (const d of days) {
    const key = String((d as { dayKey?: string }).dayKey || '');
    const rev = Number((d as { revenue?: number }).revenue || 0);
    if (!key) continue;
    byDay.set(key, (byDay.get(key) || 0) + rev);
  }
  return [...byDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, v]) => v)
    .slice(-7);
}

export function buildCeoCompanyVisions(
  rows: PortfolioBusiness[],
  alertByBiz: Record<string, { unresolved: number; high: number; newest: number }>,
): CeoCompanyVision[] {
  return rows.map((row) => {
    const income = companyGeneratedMonth(row);
    const incomePrev = companyGeneratedPrevMonthComparable(row);
    // MoM MTD vs MTD: mismo tramo de días, no mes incompleto vs mes entero
    const mom = comparableMomPct(income, incomePrev);
    const alerts = alertByBiz[row.businessId] || { unresolved: 0, high: 0, newest: 0 };
    const risk = computeRiskScore({
      alertsHigh: alerts.high,
      alertsUnresolved: alerts.unresolved,
      scheduleAlerts: row.team.scheduleAlertsCount || 0,
      mom,
      pending: row.finance.pendingAmount || 0,
      income,
      openCash: row.metrics.openCashRegisters || 0,
    });
    return {
      businessId: row.businessId,
      name: row.business.name,
      brandColor: companyBrandColor(row),
      logo: row.business.logo || undefined,
      verticalLabel: row.business.businessType || '',
      income,
      incomePrev,
      mom,
      financeIncome: row.finance.incomeMonth || 0,
      expenses: row.finance.expensesMonth || 0,
      profit: row.finance.profitMonth || 0,
      ebitda: row.finance.ebitdaMonth || 0,
      ebitdaMargin: row.finance.ebitdaMarginMonth || 0,
      today:
        row.isDelivery || row.isRestaurant
          ? row.metrics.revenueToday || 0
          : 0,
      year: companyGeneratedYear(row),
      cash: row.finance.cashBalance || 0,
      staffing: row.team.totalMembers || row.memberCount || 0,
      clockedIn: row.team.clockedInNow || 0,
      pending: row.finance.pendingAmount || 0,
      risk,
      health: healthFromRisk(risk, alerts.high),
      pulse: pulseSeriesFromRow(row),
      alertsUnresolved: alerts.unresolved,
      alertsHigh: alerts.high,
      alertsNew: alerts.newest,
      row,
    };
  });
}

export const HEALTH_LABEL: Record<CeoHealthTone, string> = {
  critical: 'Crítico',
  attention: 'Atención',
  stable: 'Estable',
};
