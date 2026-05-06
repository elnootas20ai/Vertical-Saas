import { getApiBase } from './apiBase';
const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};


function getCouchHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  return headers;
}

export interface DashboardKpis {
  stockCount: number;
  reservedCount: number;
  totalVehicles: number;
  enPreparacion: number;
  soldThisMonthCount: number;
  salesVolume: number;
  marginTotal: number;
  marginPct: number;
  cobrosPendientes: number;
  cobrosCount: number;
  oportunidades: number;
  pendingDeliveries: number;
  salesToday: number;
  salesTodayCount: number;
  salesMonth: number;
  expensesMonth: number;
  estimatedProfit: number;
  cashBalance: number;
  criticalStockCount: number;
  activeWorkers: number;
  totalClockinsToday: number;
  openIncidents: number;
}

export interface FunnelData {
  new: number;
  contacted: number;
  appointment: number;
  reserved: number;
  negotiation: number;
  won: number;
  lost: number;
}

export interface DashboardAlert {
  id: string;
  severity: 'error' | 'warning' | 'info';
  type: string;
  message: string;
  count: number;
  route: string;
}

export interface QuickFinance {
  incomeMonth: number;
  expensesMonth: number;
  estimatedProfit: number;
  pendingInvoices: number;
  pendingAmount: number;
  cashBalance: number;
  marginPct: number;
}

/** KPIs del pipeline CRM de ventas de vehículos (cierre / entrega). */
export interface SalesClosureKpis {
  activePipeline: number;
  soldAwaitingDelivery: number;
  pendingPayment: number;
  deliveredThisMonth: number;
}

export interface DashboardServerData {
  kpis: DashboardKpis;
  funnel: FunnelData;
  alerts: DashboardAlert[];
  quickFinance: QuickFinance;
  salesClosure?: SalesClosureKpis;
  updatedAt: string;
}

const API_BASE = getApiBase();

export async function fetchDashboardData(userId: string): Promise<DashboardServerData> {
  const response = await fetch(
    `${API_BASE}/api/dashboard/kpis/${encodeURIComponent(userId)}`,
    {
      headers: {
        'Content-Type': 'application/json',
        ...getCouchHeaders(),
      },
    },
  );

  const payload = await response.json().catch(() => ({ ok: false, error: 'Respuesta inválida' }));

  if (!response.ok || !payload.ok) {
    throw new Error(payload?.error || 'Error cargando KPIs del servidor');
  }

  return payload as DashboardServerData;
}
