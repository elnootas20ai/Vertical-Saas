import { authFetch } from './authApi';
import { getApiBase } from './apiBase';

const API_BASE = getApiBase();

function normalizeUserId(userId: string): string {
  const value = String(userId || '').trim();
  return value.startsWith('account:') ? value.slice('account:'.length) : value;
}

function stockAnalyticsErrorMessage(
  payload: { error?: unknown; message?: unknown },
  status: number,
): string {
  const err = payload?.error;
  if (typeof err === 'string' && err.trim()) return err.trim();
  if (err && typeof err === 'object') {
    const obj = err as { message?: unknown; code?: unknown };
    if (typeof obj.message === 'string' && obj.message.trim()) return obj.message.trim();
    if (obj.code === 'NOT_FOUND') {
      return 'El servidor aún no tiene analytics de stock (falta desplegar backend). En local, reinicia node index.js.';
    }
  }
  if (typeof payload?.message === 'string' && payload.message.trim()) return payload.message.trim();
  if (status === 404) {
    return 'Ruta /api/stock-analytics no encontrada. ¿Backend actualizado y en marcha?';
  }
  if (status === 403) return 'Sin permiso para ver analytics de stock.';
  if (status === 401) return 'Sesión caducada. Vuelve a iniciar sesión.';
  return 'Error en stock analytics API';
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await authFetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  const payload = (await response.json().catch(() => ({}))) as T & {
    error?: unknown;
    message?: unknown;
  };
  if (!response.ok) {
    throw new Error(stockAnalyticsErrorMessage(payload, response.status));
  }
  return payload;
}

export type StockAnalyticsKpiId =
  | 'food_cost_pct'
  | 'gross_margin'
  | 'waste_on_sales_pct'
  | 'inventory_variance'
  | 'recipe_coverage'
  | 'operating_margin';

export type StockAnalyticsBlockId =
  | 'waste_overview'
  | 'waste_by_type'
  | 'waste_top_items'
  | 'waste_by_ingredient'
  | 'escandallo_overview'
  | 'escandallo_products'
  | 'inventory_overview'
  | 'inventory_variance_table'
  | 'period_comparison'
  | 'weekly_evolution'
  | 'pdv_pnl'
  | 'pnl_summary';

export type StockAnalyticsReportId = 'escandallo' | 'reductores' | 'gerencial';

export type StockAnalyticsTone = 'ok' | 'warn' | 'bad' | 'neutral';

export interface StockAnalyticsKpi {
  id: StockAnalyticsKpiId;
  label: string;
  value: number | null;
  unit: 'pct' | 'eur';
  amount?: number;
  pct?: number | null;
  shrinkage?: number;
  count?: number;
  total?: number;
  vsPrevPeriod?: number | null;
  tone?: StockAnalyticsTone;
  hint?: string;
}

export interface StockAnalyticsOverview {
  range: { from: string; to: string };
  kpis: StockAnalyticsKpi[];
  alerts: Array<{ id: string; severity: string; message: string }>;
  generatedAt: string;
}

export interface StockAnalyticsPeriodComparisonRow {
  metric: string;
  actual: string;
  previous: string;
  delta: string;
}

export interface StockAnalyticsInsightsKpi {
  id: string;
  label: string;
  value: string;
  tone?: 'positive' | 'negative' | string;
}

export interface StockAnalyticsWeeklyPoint {
  label: string;
  sales: number;
  recipeCost: number;
  wasteCost: number;
  foodCostPct: number | null;
  marginOper: number;
}

export interface StockAnalyticsPdvPnlRow {
  pdvId: string;
  name: string;
  sales: number;
  orders: number;
  sharePct: number;
  recipeCost: number;
  wasteCost: number;
  shrinkage: number;
  foodCostPct: number | null;
  wasteOnSalesPct: number | null;
  operatingMargin: number;
  marginPct: number | null;
}

export interface StockAnalyticsInsights {
  range: { from: string; to: string };
  prevRange?: { from: string; to: string };
  periodComparison: {
    rows: Array<{
      metric: string;
      actual: number | null;
      previous: number | null;
      deltaPct?: number | null;
      deltaPp?: number | null;
      unit: 'eur' | 'pct';
    }>;
    kpis: StockAnalyticsInsightsKpi[];
  };
  weeklyEvolution: StockAnalyticsWeeklyPoint[];
  pdvPnl: StockAnalyticsPdvPnlRow[];
  chart: import('../verticals/delivery/informes/loaders/informeTypes').InformeChart;
  exportRows: Record<string, unknown>[];
  generatedAt: string;
}

export interface StockAnalyticsDateRange {
  dateFrom?: string;
  dateTo?: string;
  businessId?: string;
}

export const STOCK_ANALYTICS_KPI_SEQUENCE: StockAnalyticsKpiId[] = [
  'food_cost_pct',
  'gross_margin',
  'waste_on_sales_pct',
  'inventory_variance',
  'recipe_coverage',
  'operating_margin',
];

export async function fetchStockAnalyticsOverview(
  userId: string,
  range?: StockAnalyticsDateRange,
  signal?: AbortSignal,
): Promise<StockAnalyticsOverview> {
  const id = normalizeUserId(userId);
  const params = new URLSearchParams();
  if (range?.dateFrom) params.set('dateFrom', range.dateFrom);
  if (range?.dateTo) params.set('dateTo', range.dateTo);
  if (range?.businessId) params.set('businessId', range.businessId);
  const qs = params.toString() ? `?${params}` : '';
  const payload = await request<{ ok: boolean; overview: StockAnalyticsOverview }>(
    `/api/stock-analytics/${encodeURIComponent(id)}/overview${qs}`,
    { signal },
  );
  return payload.overview;
}

export async function fetchStockAnalyticsInsights(
  userId: string,
  range?: StockAnalyticsDateRange,
  signal?: AbortSignal,
): Promise<StockAnalyticsInsights> {
  const id = normalizeUserId(userId);
  const params = new URLSearchParams();
  if (range?.dateFrom) params.set('dateFrom', range.dateFrom);
  if (range?.dateTo) params.set('dateTo', range.dateTo);
  if (range?.businessId) params.set('businessId', range.businessId);
  const qs = params.toString() ? `?${params}` : '';
  const payload = await request<{ ok: boolean; insights: StockAnalyticsInsights }>(
    `/api/stock-analytics/${encodeURIComponent(id)}/insights${qs}`,
    { signal },
  );
  return payload.insights;
}

export async function fetchStockAnalyticsReport(
  userId: string,
  reportId: StockAnalyticsReportId,
  range?: StockAnalyticsDateRange,
  signal?: AbortSignal,
): Promise<{
  reportId: string;
  range: { from: string; to: string };
  prevRange?: { from: string; to: string };
  summary: string;
  dashboard: import('../verticals/delivery/informes/loaders/informeTypes').InformeDashboard;
  exportRows?: Record<string, unknown>[];
}> {
  const id = normalizeUserId(userId);
  const params = new URLSearchParams();
  if (range?.dateFrom) params.set('dateFrom', range.dateFrom);
  if (range?.dateTo) params.set('dateTo', range.dateTo);
  if (range?.businessId) params.set('businessId', range.businessId);
  const qs = params.toString() ? `?${params}` : '';
  const payload = await request<{ ok: boolean; report: {
    reportId: string;
    range: { from: string; to: string };
    prevRange?: { from: string; to: string };
    summary: string;
    dashboard: import('../verticals/delivery/informes/loaders/informeTypes').InformeDashboard;
    exportRows?: Record<string, unknown>[];
  } }>(
    `/api/stock-analytics/${encodeURIComponent(id)}/report/${encodeURIComponent(reportId)}${qs}`,
    { signal },
  );
  return payload.report;
}

/** @deprecated Usar fetchStockAnalyticsOverview (una sola petición). */
export async function fetchStockAnalyticsKpi(
  userId: string,
  kpiId: StockAnalyticsKpiId,
  range?: StockAnalyticsDateRange,
  signal?: AbortSignal,
): Promise<StockAnalyticsKpi> {
  const id = normalizeUserId(userId);
  const params = new URLSearchParams();
  if (range?.dateFrom) params.set('dateFrom', range.dateFrom);
  if (range?.dateTo) params.set('dateTo', range.dateTo);
  if (range?.businessId) params.set('businessId', range.businessId);
  const qs = params.toString() ? `?${params}` : '';
  const payload = await request<{ ok: boolean; kpi: StockAnalyticsKpi }>(
    `/api/stock-analytics/${encodeURIComponent(id)}/kpi/${encodeURIComponent(kpiId)}${qs}`,
    { signal },
  );
  return payload.kpi;
}

export function defaultStockAnalyticsRange(days = 30): { dateFrom: string; dateTo: string } {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  const from = new Date(now.getTime() - days * 86400000).toISOString().slice(0, 10);
  return { dateFrom: from, dateTo: to };
}
