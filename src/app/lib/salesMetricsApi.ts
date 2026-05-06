import { getApiBase } from './apiBase';
const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};


function getCouchHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  return headers;
}

export interface TimePoint {
  date?: string;
  week?: string;
  month?: string;
  revenue: number;
  cost: number;
  margin: number;
  count: number;
}

export interface TopProduct {
  name: string;
  count: number;
  revenue: number;
}

export interface PeriodSummary {
  revenue: number;
  cost: number;
  margin: number;
  count: number;
}

export interface SalesMetricsData {
  summary: {
    totalRevenue: number;
    totalCost: number;
    totalMargin: number;
    totalSales: number;
    avgTicket: number;
  };
  comparison: {
    current: PeriodSummary;
    previous: PeriodSummary;
    change: { revenue: number; cost: number; margin: number; count: number };
  };
  daily: TimePoint[];
  weekly: TimePoint[];
  monthly: TimePoint[];
  topProducts: TopProduct[];
  stageDistribution: Record<string, number>;
  trend: TimePoint[];
}

export interface SalesMetricsResponse {
  ok: boolean;
  metrics: SalesMetricsData;
  range: { from: string; to: string };
  updatedAt: string;
}

const API_BASE = getApiBase();

export async function fetchSalesMetrics(
  userId: string,
  from?: string,
  to?: string,
): Promise<SalesMetricsResponse> {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);

  const qs = params.toString() ? `?${params.toString()}` : '';

  const response = await fetch(
    `${API_BASE}/api/sales-metrics/${encodeURIComponent(userId)}${qs}`,
    {
      headers: {
        'Content-Type': 'application/json',
        ...getCouchHeaders(),
      },
      credentials: 'include',
    },
  );

  const payload = await response.json().catch(() => ({ ok: false, error: 'Respuesta inválida' }));

  if (!response.ok || !payload.ok) {
    throw new Error(payload?.error || 'Error cargando métricas de ventas');
  }

  return payload as SalesMetricsResponse;
}
