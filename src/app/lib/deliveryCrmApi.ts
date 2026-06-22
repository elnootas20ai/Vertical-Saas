import { authFetch } from './authApi';
import { getApiBase } from './apiBase';
import { DELIVERY_CRM_UI_ENABLED } from './deliveryCrmFeature';

const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};


const API_BASE = getApiBase();

function normalizeUserId(userId: string): string {
  const value = String(userId || '').trim();
  return value.startsWith('account:') ? value.slice('account:'.length) : value;
}

function getCouchHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  return headers;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (!DELIVERY_CRM_UI_ENABLED) {
    throw new Error('El módulo CRM Delivery no está activo en la interfaz.');
  }
  const response = await authFetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...getCouchHeaders(),
      ...(init?.headers || {}),
    },
  });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload?.error || 'Error inesperado en delivery CRM API');
  }
  return payload;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DeliveryCrmDashboard {
  totalOrders: number;
  totalRevenue: number;
  recentRevenue: number;
  avgTicket: number;
  uniqueClients: number;
  repeatClients: number;
  repeatRate: number;
  vipClients: number;
  inactiveClients: number;
  totalIncidents: number;
  topZones: { zone: string; orders: number; revenue: number }[];
  channels: Record<string, { orders: number; revenue: number }>;
  totalRegisteredClients: number;
}

export interface ClientTopProduct {
  name: string;
  qty: number;
  revenue: number;
}

export interface DeliveryClientMetrics {
  totalOrders: number;
  deliveredOrders: number;
  totalSpent: number;
  avgTicket: number;
  lastOrderDate: string | null;
  lastOrderStatus: string | null;
  frequency: 'none' | 'monthly' | 'biweekly' | 'weekly';
  isVip: boolean;
  isInactive: boolean;
  isAtRisk: boolean;
  incidents: number;
  zones: string[];
  topProducts: ClientTopProduct[];
  preferredChannel: string;
}

export interface DeliveryCrmClient {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  postalCode: string;
  status: string;
  tags: string[];
  createdAt: string;
  delivery: DeliveryClientMetrics;
}

export interface DeliveryCrmAlert {
  id: string;
  type: 'vip_no_purchase' | 'zone_sales_drop' | 'repeat_incidents' | 'inactive_client';
  severity: 'warning' | 'info';
  title: string;
  description: string;
  clientId?: string;
  clientName?: string;
  lastOrderDate?: string;
  totalSpent?: number;
  totalOrders?: number;
  zone?: string;
  recentRevenue?: number;
  previousRevenue?: number;
  dropPercent?: number;
  incidentCount?: number;
  lastIncident?: string;
}

export interface DeliveryCrmAlertsSummary {
  total: number;
  vipNoPurchase: number;
  zoneDrop: number;
  repeatIncidents: number;
  inactiveClients: number;
}

export type CampaignStatus = 'draft' | 'active' | 'paused' | 'completed' | 'cancelled';
export type CampaignTrigger = 'manual' | 'inactive_client' | 'vip_reward' | 'zone_promo' | 'frequency_upsell' | 'new_client_welcome' | 'birthday';

export interface CampaignStats {
  sent: number;
  opened: number;
  converted: number;
  revenue: number;
}

export interface DeliveryCampaign {
  id: string;
  name: string;
  description: string;
  type: string;
  trigger: CampaignTrigger;
  triggerConfig: Record<string, unknown>;
  status: CampaignStatus;
  targetSegment: string;
  targetFilters: Record<string, unknown>;
  channel: string;
  message: string;
  promotionId: string;
  discountPercent: number;
  startDate: string;
  endDate: string;
  stats: CampaignStats;
  createdAt: string;
  updatedAt: string;
}

export interface DeliveryOrderBrief {
  id: string;
  orderNumber: string;
  status: string;
  totalAmount: number;
  customerName: string;
  customerAddress: string;
  channel: string;
  items: { name: string; quantity: number; total: number }[];
  createdAt: string;
  deliveredAt: string;
  incidentType: string;
  incidentNotes: string;
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

export async function getDashboardRequest(userId: string, businessId?: string): Promise<DeliveryCrmDashboard | null> {
  try {
    const uid = normalizeUserId(userId);
    const qs = businessId?.trim() ? `?businessId=${encodeURIComponent(businessId.trim())}` : '';
    const data = await request<{ ok: boolean; dashboard: DeliveryCrmDashboard }>(
      `/api/delivery-crm/dashboard/${encodeURIComponent(uid)}${qs}`,
    );
    return data.ok ? data.dashboard : null;
  } catch { return null; }
}

// ─── Clients ─────────────────────────────────────────────────────────────────

export async function listCrmClientsRequest(userId: string, businessId?: string): Promise<DeliveryCrmClient[]> {
  try {
    const uid = normalizeUserId(userId);
    const qs = businessId?.trim() ? `?businessId=${encodeURIComponent(businessId.trim())}` : '';
    const data = await request<{ ok: boolean; clients: DeliveryCrmClient[] }>(
      `/api/delivery-crm/clients/${encodeURIComponent(uid)}${qs}`,
    );
    return data.ok ? data.clients : [];
  } catch { return []; }
}

export async function getClientOrdersRequest(
  userId: string,
  clientId: string,
  businessId?: string,
): Promise<DeliveryOrderBrief[]> {
  try {
    const uid = normalizeUserId(userId);
    const qs = businessId?.trim() ? `?businessId=${encodeURIComponent(businessId.trim())}` : '';
    const data = await request<{ ok: boolean; orders: DeliveryOrderBrief[] }>(
      `/api/delivery-crm/clients/${encodeURIComponent(uid)}/${encodeURIComponent(clientId)}/orders${qs}`,
    );
    return data.ok ? data.orders : [];
  } catch { return []; }
}

// ─── Alerts ──────────────────────────────────────────────────────────────────

export async function getAlertsRequest(
  userId: string,
  businessId?: string,
): Promise<{ alerts: DeliveryCrmAlert[]; summary: DeliveryCrmAlertsSummary } | null> {
  try {
    const uid = normalizeUserId(userId);
    const qs = businessId?.trim() ? `?businessId=${encodeURIComponent(businessId.trim())}` : '';
    const data = await request<{ ok: boolean; alerts: DeliveryCrmAlert[]; summary: DeliveryCrmAlertsSummary }>(
      `/api/delivery-crm/alerts/${encodeURIComponent(uid)}${qs}`,
    );
    return data.ok ? { alerts: data.alerts, summary: data.summary } : null;
  } catch { return null; }
}

// ─── Campaigns ───────────────────────────────────────────────────────────────

export async function listCampaignsRequest(userId: string): Promise<DeliveryCampaign[]> {
  try {
    const uid = normalizeUserId(userId);
    const data = await request<{ ok: boolean; campaigns: DeliveryCampaign[] }>(
      `/api/delivery-crm/campaigns/${encodeURIComponent(uid)}`
    );
    return data.ok ? data.campaigns : [];
  } catch { return []; }
}

export async function createCampaignRequest(userId: string, campaign: Partial<DeliveryCampaign>): Promise<DeliveryCampaign | null> {
  try {
    const uid = normalizeUserId(userId);
    const data = await request<{ ok: boolean; campaign: DeliveryCampaign }>(
      `/api/delivery-crm/campaigns/${encodeURIComponent(uid)}`,
      { method: 'POST', body: JSON.stringify({ campaign }) }
    );
    return data.ok ? data.campaign : null;
  } catch { return null; }
}

export async function updateCampaignRequest(userId: string, campaignId: string, campaign: Partial<DeliveryCampaign>): Promise<DeliveryCampaign | null> {
  try {
    const uid = normalizeUserId(userId);
    const data = await request<{ ok: boolean; campaign: DeliveryCampaign }>(
      `/api/delivery-crm/campaigns/${encodeURIComponent(uid)}/${encodeURIComponent(campaignId)}`,
      { method: 'PUT', body: JSON.stringify({ campaign }) }
    );
    return data.ok ? data.campaign : null;
  } catch { return null; }
}

export async function deleteCampaignRequest(userId: string, campaignId: string): Promise<boolean> {
  try {
    const uid = normalizeUserId(userId);
    const data = await request<{ ok: boolean }>(
      `/api/delivery-crm/campaigns/${encodeURIComponent(uid)}/${encodeURIComponent(campaignId)}`,
      { method: 'DELETE' }
    );
    return data.ok;
  } catch { return false; }
}
