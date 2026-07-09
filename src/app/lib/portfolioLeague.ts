import { fmtEuro, monthOverMonthPct } from './portfolioMetrics';
import type { PortfolioBusiness } from '../hooks/usePortfolioOverview';

export type LeagueMetricId = 'revenue' | 'income' | 'clients';

export type LeagueMetricDef = {
  id: LeagueMetricId;
  label: string;
  shortLabel: string;
};

export const LEAGUE_METRICS: LeagueMetricDef[] = [
  { id: 'revenue', label: 'Ventas delivery', shortLabel: 'Delivery' },
  { id: 'income', label: 'Ingresos finanzas', shortLabel: 'Finanzas' },
  { id: 'clients', label: 'Clientes nuevos', shortLabel: 'Clientes' },
];

const RESTAURANT_LEAGUE_METRICS: LeagueMetricDef[] = [
  { id: 'revenue', label: 'Ventas sala', shortLabel: 'Sala' },
  { id: 'income', label: 'Ingresos finanzas', shortLabel: 'Finanzas' },
  { id: 'clients', label: 'Clientes nuevos', shortLabel: 'Clientes' },
];

export function getLeagueMetrics(rows: Array<{ isRestaurant?: boolean }>): LeagueMetricDef[] {
  if (rows.length > 0 && rows.every((row) => row.isRestaurant)) {
    return RESTAURANT_LEAGUE_METRICS;
  }
  return LEAGUE_METRICS;
}

export type CompanyLeagueEntry = {
  businessId: string;
  name: string;
  logo?: string;
  businessType: string;
  rank: number;
  score: number;
  scoreFormatted: string;
  momPct: number | null;
  shareOfGroup: number;
  vsGroupAvgPct: number;
  progressPct: number;
  isLeader: boolean;
  trend: 'up' | 'down' | 'flat';
};

function metricValue(row: PortfolioBusiness, metric: LeagueMetricId): number {
  if (metric === 'revenue') return row.metrics.revenueMonth;
  if (metric === 'income') return row.finance.incomeMonth;
  return row.clients.newClientsMonth;
}

function metricPrev(row: PortfolioBusiness, metric: LeagueMetricId): number {
  if (metric === 'revenue') return row.metrics.revenuePrevMonth;
  if (metric === 'income') return row.finance.incomePrevMonth;
  return row.clients.newClientsPrevMonth;
}

function formatScore(metric: LeagueMetricId, value: number): string {
  if (metric === 'clients') return String(Math.round(value));
  return fmtEuro(value);
}

function trendFromMom(mom: number | null): 'up' | 'down' | 'flat' {
  if (mom === null || mom === 0) return 'flat';
  return mom > 0 ? 'up' : 'down';
}

export function buildCompanyLeague(
  rows: PortfolioBusiness[],
  metric: LeagueMetricId,
): CompanyLeagueEntry[] {
  if (rows.length === 0) return [];

  const scored = rows.map((row) => ({
    row,
    score: metricValue(row, metric),
    momPct: monthOverMonthPct(metricValue(row, metric), metricPrev(row, metric)),
  }));

  scored.sort((a, b) => b.score - a.score || a.row.business.name.localeCompare(b.row.business.name, 'es'));

  const total = scored.reduce((s, x) => s + x.score, 0);
  const avg = rows.length > 0 ? total / rows.length : 0;
  const leaderScore = scored[0]?.score ?? 0;

  return scored.map((item, index) => {
    const { row, score, momPct } = item;
    const rank = index + 1;
    const shareOfGroup = total > 0 ? Math.round((score / total) * 1000) / 10 : 0;
    const vsGroupAvgPct =
      avg > 0 ? Math.round(((score - avg) / avg) * 1000) / 10 : score > 0 ? 100 : 0;
    const progressPct = leaderScore > 0 ? Math.round((score / leaderScore) * 100) : 0;

    return {
      businessId: row.businessId,
      name: row.business.name,
      logo: row.business.logo,
      businessType: row.business.businessType || '',
      rank,
      score,
      scoreFormatted: formatScore(metric, score),
      momPct,
      shareOfGroup,
      vsGroupAvgPct,
      progressPct,
      isLeader: rank === 1,
      trend: trendFromMom(momPct),
    };
  });
}
