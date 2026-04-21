import { authFetch, getAuthHeaders } from './authApi';

interface ApiEnvelope {
  error?: string;
}

const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};

function getApiBase() {
  if (env.VITE_API_URL) return env.VITE_API_URL;
  const browserHost = typeof window !== 'undefined' && window.location.hostname ? window.location.hostname : 'localhost';
  const protocol = env.VITE_API_PROTOCOL || (typeof window !== 'undefined' && window.location.protocol ? window.location.protocol.replace(':', '') : 'http');
  const host = env.VITE_API_HOST || browserHost;
  const port = env.VITE_API_PORT || '3001';
  return `${protocol}://${host}:${port}`;
}

const API_BASE = getApiBase();

function getCouchHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (env.VITE_COUCHDB_URL) headers['x-couch-url'] = env.VITE_COUCHDB_URL;
  if (env.VITE_COUCHDB_USER) headers['x-couch-user'] = env.VITE_COUCHDB_USER;
  if (env.VITE_COUCHDB_PASSWORD) headers['x-couch-password'] = env.VITE_COUCHDB_PASSWORD;
  return headers;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await authFetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
      ...getCouchHeaders(),
      ...(init?.headers || {}),
    },
    ...init,
  });
  const payload = (await response.json().catch(() => ({}))) as T & ApiEnvelope;
  if (response.status === 401) throw new Error('Sesion expirada.');
  if (!response.ok) throw new Error(payload?.error || 'Error inesperado');
  return payload;
}

export type OpportunityStatus = 'new' | 'contacted' | 'test_drive' | 'quoted' | 'negotiation' | 'reserved' | 'won' | 'lost';

export interface Opportunity {
  id: string;
  _rev?: string;
  user_id: string;
  leadId: string;
  clientId: string;
  vehicleId: string;
  vehicleName: string;
  vehiclePlate: string;
  vehicleYear?: number;
  vehiclePrice: number;
  commercialStatus: OpportunityStatus;
  responsible: string;
  responsibleName: string;
  budget: number;
  quoteId: string;
  saleId: string;
  expectedCloseDate: string;
  probability: number;
  source: string;
  notes: string;
  nextAction: NextAction | null;
  interactions: OpportunityInteraction[];
  tags: string[];
  lostReason: string;
  financingRequested: boolean;
  tradeInVehicleId: string;
  stageHistory: StageChange[];
  lastContact: string;
  workCenterId: string;
  workCenterName: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface NextAction {
  type: string;
  description: string;
  dueDate: string;
  completed: boolean;
}

export interface OpportunityInteraction {
  id: string;
  type: 'call' | 'email' | 'meeting' | 'note' | 'whatsapp';
  title: string;
  description: string;
  date: string;
  user: string;
}

export interface StageChange {
  from: string;
  to: string;
  at: string;
  by: string;
}

export interface OpportunityStats {
  total: number;
  active: number;
  won: number;
  lost: number;
  reserved: number;
  pipelineValue: number;
  conversionRate: number;
  avgCloseTimeDays: number;
  byStage: Record<string, { count: number; value: number }>;
}

export interface ActivityEvent {
  type: 'stage_change' | 'interaction' | 'opportunity_created';
  opportunityId: string;
  vehicleName: string;
  description: string;
  from?: string;
  to?: string;
  interactionType?: string;
  actor: string;
  date: string;
}

export interface TeamMember {
  responsible: string;
  responsibleName: string;
  active: number;
  won: number;
  lost: number;
  pipelineValue: number;
  totalValue: number;
  conversionRate: number;
}

export async function listOpportunitiesRequest(
  userId: string,
  params?: { responsible?: string; commercialStatus?: string; scope?: string; currentUserId?: string },
): Promise<Opportunity[]> {
  const qs = new URLSearchParams();
  if (params?.responsible) qs.set('responsible', params.responsible);
  if (params?.commercialStatus) qs.set('commercialStatus', params.commercialStatus);
  if (params?.scope) qs.set('scope', params.scope);
  if (params?.currentUserId) qs.set('currentUserId', params.currentUserId);
  const query = qs.toString() ? `?${qs.toString()}` : '';
  const result = await request<{ ok: boolean; opportunities: Opportunity[] }>(
    `/api/opportunities/${encodeURIComponent(userId)}${query}`,
  );
  return result.opportunities || [];
}

export async function getOpportunityStatsRequest(
  userId: string,
  params?: { scope?: string; currentUserId?: string },
): Promise<OpportunityStats | null> {
  try {
    const qs = new URLSearchParams();
    if (params?.scope) qs.set('scope', params.scope);
    if (params?.currentUserId) qs.set('currentUserId', params.currentUserId);
    const query = qs.toString() ? `?${qs.toString()}` : '';
    const result = await request<{ ok: boolean; stats: OpportunityStats }>(
      `/api/opportunities/${encodeURIComponent(userId)}/stats${query}`,
    );
    return result.stats;
  } catch {
    return null;
  }
}

export async function getOpportunityDetailRequest(userId: string, opportunityId: string): Promise<Opportunity | null> {
  try {
    const result = await request<{ ok: boolean; opportunity: Opportunity }>(
      `/api/opportunities/${encodeURIComponent(userId)}/${encodeURIComponent(opportunityId)}`,
    );
    return result.opportunity;
  } catch {
    return null;
  }
}

export async function createOpportunityRequest(userId: string, opportunity: Partial<Opportunity>): Promise<Opportunity | null> {
  const result = await request<{ ok: boolean; opportunity: Opportunity }>(
    `/api/opportunities/${encodeURIComponent(userId)}`,
    { method: 'POST', body: JSON.stringify({ opportunity }) },
  );
  return result.opportunity || null;
}

export async function updateOpportunityRequest(userId: string, opportunityId: string, opportunity: Partial<Opportunity>): Promise<Opportunity | null> {
  const result = await request<{ ok: boolean; opportunity: Opportunity }>(
    `/api/opportunities/${encodeURIComponent(userId)}/${encodeURIComponent(opportunityId)}`,
    { method: 'PUT', body: JSON.stringify({ opportunity }) },
  );
  return result.opportunity || null;
}

export async function changeOpportunityStageRequest(
  userId: string,
  opportunityId: string,
  commercialStatus: OpportunityStatus,
  lostReason?: string,
): Promise<Opportunity | null> {
  const result = await request<{ ok: boolean; opportunity: Opportunity }>(
    `/api/opportunities/${encodeURIComponent(userId)}/${encodeURIComponent(opportunityId)}/stage`,
    { method: 'PUT', body: JSON.stringify({ commercialStatus, lostReason }) },
  );
  return result.opportunity || null;
}

export async function updateNextActionRequest(userId: string, opportunityId: string, nextAction: NextAction | null): Promise<Opportunity | null> {
  const result = await request<{ ok: boolean; opportunity: Opportunity }>(
    `/api/opportunities/${encodeURIComponent(userId)}/${encodeURIComponent(opportunityId)}/next-action`,
    { method: 'PUT', body: JSON.stringify({ nextAction }) },
  );
  return result.opportunity || null;
}

export async function deleteOpportunityRequest(userId: string, opportunityId: string): Promise<boolean> {
  try {
    await request(`/api/opportunities/${encodeURIComponent(userId)}/${encodeURIComponent(opportunityId)}`, { method: 'DELETE' });
    return true;
  } catch {
    return false;
  }
}

export async function getOpportunityActivityRequest(
  userId: string,
  params?: { scope?: string; currentUserId?: string; limit?: number },
): Promise<ActivityEvent[]> {
  try {
    const qs = new URLSearchParams();
    if (params?.scope) qs.set('scope', params.scope);
    if (params?.currentUserId) qs.set('currentUserId', params.currentUserId);
    if (params?.limit) qs.set('limit', String(params.limit));
    const query = qs.toString() ? `?${qs.toString()}` : '';
    const result = await request<{ ok: boolean; events: ActivityEvent[] }>(
      `/api/opportunities/${encodeURIComponent(userId)}/activity${query}`,
    );
    return result.events || [];
  } catch {
    return [];
  }
}

export async function getTeamStatsRequest(userId: string): Promise<TeamMember[]> {
  try {
    const result = await request<{ ok: boolean; team: TeamMember[] }>(
      `/api/opportunities/${encodeURIComponent(userId)}/team-stats`,
    );
    return result.team || [];
  } catch {
    return [];
  }
}
