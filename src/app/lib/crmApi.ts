import type { Client, ClientStats, ClientLoyalty, Lead, LeadInteraction } from '../context/AppContext';
import { v4 as uuidv4 } from 'uuid';
import { authFetch, getAuthHeaders } from './authApi';

interface ApiEnvelope {
  error?: string;
}

const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};

function getApiBase() {
  if (env.VITE_API_URL) {
    return env.VITE_API_URL;
  }

  const browserHost =
    typeof window !== 'undefined' && window.location.hostname
      ? window.location.hostname
      : 'localhost';

  const protocol =
    env.VITE_API_PROTOCOL ||
    (typeof window !== 'undefined' && window.location.protocol
      ? window.location.protocol.replace(':', '')
      : 'http');

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

  if (response.status === 401) {
    throw new Error('Sesión expirada. Por favor, inicia sesión de nuevo.');
  }

  if (!response.ok) {
    throw new Error(payload?.error || 'Error inesperado guardando CRM');
  }

  return payload;
}

function toIsoString(value?: Date | string) {
  if (!value) return new Date().toISOString();
  return value instanceof Date ? value.toISOString() : String(value);
}

function normalizeLeadRecord(value: unknown): Lead | null {
  if (!value || typeof value !== 'object') return null;

  const doc = value as Partial<Lead> & { _id?: string; id?: string; type?: string };
  if (doc.type !== 'lead') return null;

  const id = String(doc.id || doc._id || '');
  if (!id) return null;

  return {
    _rev: doc._rev,
    type: 'lead',
    user_id: doc.user_id ? String(doc.user_id) : '',
    id,
    name: String(doc.name || ''),
    phone: String(doc.phone || ''),
    email: doc.email ? String(doc.email) : '',
    source: String(doc.source || 'web'),
    status: (doc.status as Lead['status']) || 'new',
    interestedVehicle: doc.interestedVehicle ? String(doc.interestedVehicle) : '',
    vehicleInterest: doc.vehicleInterest
      ? String(doc.vehicleInterest)
      : String(doc.interestedVehicle || ''),
    vehicleInterestId: doc.vehicleInterestId ? String(doc.vehicleInterestId) : '',
    budget: doc.budget ? String(doc.budget) : '',
    notes: doc.notes ? String(doc.notes) : '',
    responsible: doc.responsible ? String(doc.responsible) : 'Sin asignar',
    tags: Array.isArray(doc.tags) ? doc.tags.map((t) => String(t)) : [],
    interactions: Array.isArray(doc.interactions)
      ? doc.interactions.map((item) => ({
          id: String(item.id || `interaction-${uuidv4()}`),
          type: (item.type as LeadInteraction['type']) || 'note',
          title: String(item.title || ''),
          description: String(item.description || ''),
          date: String(item.date || new Date().toISOString()),
          user: String(item.user || 'Sistema'),
        }))
      : [],
    score: Number(doc.score || 0),
    lastContact: doc.lastContact ? new Date(doc.lastContact as unknown as string) : undefined,
    convertedAt: doc.convertedAt ? new Date(doc.convertedAt as unknown as string) : undefined,
    convertedToClientId: doc.convertedToClientId ? String(doc.convertedToClientId) : '',
    convertedToClientName: doc.convertedToClientName ? String(doc.convertedToClientName) : '',
    utm_source: doc.utm_source ? String(doc.utm_source) : '',
    utm_medium: doc.utm_medium ? String(doc.utm_medium) : '',
    utm_campaign: doc.utm_campaign ? String(doc.utm_campaign) : '',
    utm_content: doc.utm_content ? String(doc.utm_content) : '',
    utm_term: doc.utm_term ? String(doc.utm_term) : '',
    referrer: doc.referrer ? String(doc.referrer) : '',
    landing_page: doc.landing_page ? String(doc.landing_page) : '',
    createdAt: new Date((doc.createdAt as unknown as string) || new Date().toISOString()),
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt as unknown as string) : undefined,
  };
}

export async function getLeadAttributionRequest(userId: string): Promise<{
  total: number;
  bySource: Record<string, number>;
  byCampaign: Record<string, number>;
  byMedium: Record<string, number>;
  monthlyTrend: Record<string, Record<string, number>>;
  conversionBySource: Record<string, number>;
  wonBySource: Record<string, number>;
} | null> {
  try {
    const result = await request<{
      ok: boolean;
      attribution: {
        total: number;
        bySource: Record<string, number>;
        byCampaign: Record<string, number>;
        byMedium: Record<string, number>;
        monthlyTrend: Record<string, Record<string, number>>;
        conversionBySource: Record<string, number>;
        wonBySource: Record<string, number>;
      };
    }>(`/api/leads/${encodeURIComponent(userId)}/attribution`);
    return result.attribution;
  } catch {
    return null;
  }
}

function normalizeClientRecord(value: unknown): Client | null {
  if (!value || typeof value !== 'object') return null;

  const doc = value as Partial<Client> & { _id?: string; id?: string; type?: string };
  if (doc.type !== 'client') return null;

  const id = String(doc.id || doc._id || '');
  if (!id) return null;

  const raw = doc as Record<string, unknown>;

  return {
    _rev: doc._rev,
    type: 'client',
    user_id: doc.user_id ? String(doc.user_id) : '',
    id,
    clientType: (raw.clientType as Client['clientType']) || 'particular',
    name: String(doc.name || ''),
    phone: String(doc.phone || ''),
    phonePrefix: raw.phonePrefix ? String(raw.phonePrefix) : '+34',
    email: String(doc.email || ''),
    dni: doc.dni ? String(doc.dni) : '',
    legalName: raw.legalName ? String(raw.legalName) : '',
    fiscalId: raw.fiscalId ? String(raw.fiscalId) : '',
    fiscalAddress: raw.fiscalAddress ? String(raw.fiscalAddress) : '',
    fiscalCity: raw.fiscalCity ? String(raw.fiscalCity) : '',
    fiscalPostalCode: raw.fiscalPostalCode ? String(raw.fiscalPostalCode) : '',
    fiscalCountry: raw.fiscalCountry ? String(raw.fiscalCountry) : 'España',
    address: doc.address ? String(doc.address) : '',
    city: doc.city ? String(doc.city) : '',
    postalCode: doc.postalCode ? String(doc.postalCode) : '',
    status: (doc.status as Client['status']) || 'active',
    commercialStatus: raw.commercialStatus ? String(raw.commercialStatus) : 'active',
    responsible: doc.responsible ? String(doc.responsible) : 'Sin asignar',
    notes: doc.notes ? String(doc.notes) : '',
    defaultPaymentMethod: (raw.defaultPaymentMethod as Client['defaultPaymentMethod']) || '',
    tags: Array.isArray(raw.tags) ? (raw.tags as string[]) : [],
    consents: {
      dataProcessing: Boolean(doc.consents?.dataProcessing),
      commercial: Boolean(doc.consents?.commercial),
      thirdParty: Boolean(doc.consents?.thirdParty),
    },
    gdpr: (raw.gdpr as Client['gdpr']) || undefined,
    vehiclesPurchased: Array.isArray(doc.vehiclesPurchased)
      ? doc.vehiclesPurchased.map((item) => String(item))
      : [],
    vehiclesSold: Array.isArray(doc.vehiclesSold)
      ? doc.vehiclesSold.map((item) => String(item))
      : [],
    documentsCount: Number(doc.documentsCount || 0),
    contacts: Array.isArray(raw.contacts) ? (raw.contacts as Client['contacts']) : [],
    addresses: Array.isArray(raw.addresses)
      ? (raw.addresses as Array<Record<string, unknown>>).map((a) => ({
          id: String(a.id || ''),
          label: a.label ? String(a.label) : undefined,
          street: String(a.street || ''),
          city: a.city ? String(a.city) : undefined,
          postalCode: a.postalCode ? String(a.postalCode) : undefined,
          state: a.state ? String(a.state) : undefined,
          country: a.country ? String(a.country) : undefined,
          isPrimary: Boolean(a.isPrimary),
          usageCount: Number(a.usageCount || 0),
          lastUsedAt: a.lastUsedAt ? String(a.lastUsedAt) : null,
        }))
      : [],
    socialLinks: Array.isArray(raw.socialLinks) ? (raw.socialLinks as Client['socialLinks']) : [],
    interactions: Array.isArray(doc.interactions)
      ? doc.interactions.map((item) => ({
          id: String(item.id || `interaction-${uuidv4()}`),
          type: (item.type as 'call' | 'email' | 'meeting' | 'note') || 'note',
          title: String(item.title || ''),
          description: String(item.description || ''),
          date: String(item.date || new Date().toISOString()),
          user: String(item.user || 'Sistema'),
        }))
      : [],
    documentsList: Array.isArray(doc.documentsList)
      ? doc.documentsList.map((item) => ({
          id: String(item.id || `document-${uuidv4()}`),
          name: String(item.name || ''),
          date: String(item.date || new Date().toISOString()),
          status: String(item.status || 'Pendiente'),
        }))
      : [],
    referralCode: raw.referralCode ? String(raw.referralCode) : '',
    stats: raw.stats && typeof raw.stats === 'object'
      ? {
          totalOrders: Number((raw.stats as Record<string, unknown>).totalOrders || 0),
          lastOrderDate: ((raw.stats as Record<string, unknown>).lastOrderDate as string) || null,
          orderFrequencyDays: Number((raw.stats as Record<string, unknown>).orderFrequencyDays || 0),
          favoriteAddressId: ((raw.stats as Record<string, unknown>).favoriteAddressId as string) || null,
          totalSpent: Number((raw.stats as Record<string, unknown>).totalSpent || 0),
          createdFrom: ((raw.stats as Record<string, unknown>).createdFrom as ClientStats['createdFrom']) || 'crm',
        }
      : undefined,
    loyalty: raw.loyalty && typeof raw.loyalty === 'object'
      ? {
          enrolled: Boolean((raw.loyalty as Record<string, unknown>).enrolled),
          enrolledAt: ((raw.loyalty as Record<string, unknown>).enrolledAt as string) || null,
          points: Number((raw.loyalty as Record<string, unknown>).points || 0),
          level: ((raw.loyalty as Record<string, unknown>).level as ClientLoyalty['level']) || 'bronze',
          totalVisits: Number((raw.loyalty as Record<string, unknown>).totalVisits || 0),
        }
      : undefined,
    createdAt: new Date((doc.createdAt as unknown as string) || new Date().toISOString()),
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt as unknown as string) : undefined,
  };
}

// ─── LEADS ────────────────────────────────────────────────────────────────────

export async function bulkCreateClientsRequest(userId: string, clients: Client[]): Promise<Client[]> {
  const result = await request<{ ok: boolean; clients: unknown[]; errors: unknown[] }>(
    `/api/clients/${encodeURIComponent(userId)}/bulk`,
    {
      method: 'POST',
      body: JSON.stringify({ clients }),
    },
  );
  return (result.clients || [])
    .map(normalizeClientRecord)
    .filter((c): c is Client => Boolean(c));
}

export async function bulkCreateLeadsRequest(userId: string, leads: Lead[]): Promise<Lead[]> {
  const result = await request<{ ok: boolean; leads: unknown[]; errors: unknown[] }>(
    `/api/leads/${encodeURIComponent(userId)}/bulk`,
    {
      method: 'POST',
      body: JSON.stringify({ leads }),
    },
  );
  return (result.leads || [])
    .map(normalizeLeadRecord)
    .filter((l): l is Lead => Boolean(l));
}

export async function listLeadsRequest(userId: string): Promise<Lead[]> {
  const payload = await request<{ ok: boolean; leads: unknown[] }>(
    `/api/leads/${encodeURIComponent(userId)}`,
  );

  return (payload.leads || [])
    .map(normalizeLeadRecord)
    .filter((l): l is Lead => Boolean(l))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function createLeadRequest(
  userId: string,
  lead: Lead,
): Promise<{ lead: Lead | null; duplicates: Lead[] }> {
  const result = await request<{ ok: boolean; lead: unknown; duplicates?: unknown[] }>(
    `/api/leads/${encodeURIComponent(userId)}`,
    {
      method: 'POST',
      body: JSON.stringify({ lead }),
    },
  );
  return {
    lead: normalizeLeadRecord(result.lead),
    duplicates: (result.duplicates || []).map(normalizeLeadRecord).filter((l): l is Lead => Boolean(l)),
  };
}

export async function checkLeadDuplicatesRequest(userId: string, lead: Partial<Lead>): Promise<Lead[]> {
  const result = await request<{ ok: boolean; duplicates: unknown[] }>(
    `/api/leads/${encodeURIComponent(userId)}/check-duplicates`,
    {
      method: 'POST',
      body: JSON.stringify({ lead }),
    },
  );
  return (result.duplicates || []).map(normalizeLeadRecord).filter((l): l is Lead => Boolean(l));
}

export async function updateLeadRequest(userId: string, lead: Lead): Promise<Lead | null> {
  const result = await request<{ ok: boolean; lead: unknown }>(
    `/api/leads/${encodeURIComponent(userId)}/${encodeURIComponent(lead.id)}`,
    {
      method: 'PUT',
      body: JSON.stringify({ lead }),
    },
  );
  return normalizeLeadRecord(result.lead);
}

export async function deleteLeadRequest(userId: string, lead: Lead): Promise<void> {
  await request(
    `/api/leads/${encodeURIComponent(userId)}/${encodeURIComponent(lead.id)}`,
    { method: 'DELETE' },
  );
}

// ─── CLIENTS ──────────────────────────────────────────────────────────────────

export async function listClientsRequest(userId: string): Promise<Client[]> {
  const payload = await request<{ ok: boolean; clients: unknown[] }>(
    `/api/clients/${encodeURIComponent(userId)}`,
  );

  return (payload.clients || [])
    .map(normalizeClientRecord)
    .filter((c): c is Client => Boolean(c))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function createClientRequest(
  userId: string,
  client: Client,
): Promise<{ client: Client | null; duplicates: Client[] }> {
  const result = await request<{ ok: boolean; client: unknown; duplicates?: unknown[] }>(
    `/api/clients/${encodeURIComponent(userId)}`,
    {
      method: 'POST',
      body: JSON.stringify({ client }),
    },
  );
  return {
    client: normalizeClientRecord(result.client),
    duplicates: (result.duplicates || []).map(normalizeClientRecord).filter((c): c is Client => Boolean(c)),
  };
}

export async function searchClientsByPhoneRequest(
  userId: string,
  query: string,
  limit = 5,
  signal?: AbortSignal,
): Promise<Client[]> {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  const payload = await request<{ ok: boolean; clients: unknown[] }>(
    `/api/clients/${encodeURIComponent(userId)}/search-by-phone?${params.toString()}`,
    signal ? { signal } : undefined,
  );
  return (payload.clients || [])
    .map(normalizeClientRecord)
    .filter((c): c is Client => Boolean(c));
}

export async function checkClientDuplicatesRequest(userId: string, client: Partial<Client>): Promise<Client[]> {
  const result = await request<{ ok: boolean; duplicates: unknown[] }>(
    `/api/clients/${encodeURIComponent(userId)}/check-duplicates`,
    {
      method: 'POST',
      body: JSON.stringify({ client }),
    },
  );
  return (result.duplicates || []).map(normalizeClientRecord).filter((c): c is Client => Boolean(c));
}

export async function checkClientDuplicatesByFieldRequest(
  userId: string,
  field: 'phone' | 'email' | 'dni',
  value: string,
  signal?: AbortSignal,
): Promise<{ duplicates: Client[]; matchedField: string }> {
  const result = await request<{ ok: boolean; duplicates: unknown[]; matchedField: string }>(
    `/api/clients/${encodeURIComponent(userId)}/check-duplicates`,
    {
      method: 'POST',
      body: JSON.stringify({ field, value }),
      signal,
    },
  );
  return {
    duplicates: (result.duplicates || []).map(normalizeClientRecord).filter((c): c is Client => Boolean(c)),
    matchedField: result.matchedField || field,
  };
}

export async function updateClientRequest(userId: string, client: Client): Promise<Client | null> {
  const result = await request<{ ok: boolean; client: unknown }>(
    `/api/clients/${encodeURIComponent(userId)}/${encodeURIComponent(client.id)}`,
    {
      method: 'PUT',
      body: JSON.stringify({ client }),
    },
  );
  return normalizeClientRecord(result.client);
}

export interface ClientCLV {
  clientId: string;
  totalRevenue: number;
  totalSalesRevenue: number;
  totalInvoicesRevenue: number;
  totalTransactions: number;
  vehiclesPurchasedCount: number;
  vehiclesSoldCount: number;
  firstTransaction: string | null;
  lastTransaction: string | null;
  relationshipDays: number;
  avgMonthlyRevenue: number;
  projectedCLV: number;
  segment: 'vip' | 'high' | 'medium' | 'low';
  calculatedAt: string;
}

export async function getClientCLVRequest(userId: string, clientId: string): Promise<ClientCLV | null> {
  try {
    const result = await request<{ ok: boolean; clv: ClientCLV }>(
      `/api/clients/${encodeURIComponent(userId)}/${encodeURIComponent(clientId)}/clv`,
    );
    return result.clv;
  } catch {
    return null;
  }
}

export async function deleteClientRequest(userId: string, client: Client): Promise<void> {
  await request(
    `/api/clients/${encodeURIComponent(userId)}/${encodeURIComponent(client.id)}`,
    { method: 'DELETE' },
  );
}

// ─── MERGE DUPLICADOS ─────────────────────────────────────────────────────────

export async function mergeLeadRequest(userId: string, keepId: string, deleteId: string): Promise<Lead | null> {
  const result = await request<{ ok: boolean; lead: unknown }>(
    `/api/leads/${encodeURIComponent(userId)}/merge`,
    {
      method: 'POST',
      body: JSON.stringify({ keepId, deleteId }),
    },
  );
  return normalizeLeadRecord(result.lead);
}

export async function mergeClientRequest(userId: string, keepId: string, deleteId: string): Promise<Client | null> {
  const result = await request<{ ok: boolean; client: unknown }>(
    `/api/clients/${encodeURIComponent(userId)}/merge`,
    {
      method: 'POST',
      body: JSON.stringify({ keepId, deleteId }),
    },
  );
  return normalizeClientRecord(result.client);
}

// ─── SEGMENTOS CRM ────────────────────────────────────────────────────────────

export interface CrmSegment {
  id: string;
  name: string;
  entityType: 'leads' | 'clients' | 'both';
  conditions: Array<{ id: string; field: string; operator: string; value: string }>;
  description: string;
  color: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export async function listSegmentsRequest(userId: string): Promise<CrmSegment[]> {
  const result = await request<{ ok: boolean; segments: CrmSegment[] }>(
    `/api/crm/segments/${encodeURIComponent(userId)}`,
  );
  return result.segments || [];
}

export async function createSegmentRequest(userId: string, segment: Partial<CrmSegment>): Promise<CrmSegment | null> {
  const result = await request<{ ok: boolean; segment: CrmSegment }>(
    `/api/crm/segments/${encodeURIComponent(userId)}`,
    { method: 'POST', body: JSON.stringify({ segment }) },
  );
  return result.segment || null;
}

export async function updateSegmentRequest(userId: string, segmentId: string, segment: Partial<CrmSegment>): Promise<CrmSegment | null> {
  const result = await request<{ ok: boolean; segment: CrmSegment }>(
    `/api/crm/segments/${encodeURIComponent(userId)}/${encodeURIComponent(segmentId)}`,
    { method: 'PUT', body: JSON.stringify({ segment }) },
  );
  return result.segment || null;
}

export async function deleteSegmentRequest(userId: string, segmentId: string): Promise<void> {
  await request(`/api/crm/segments/${encodeURIComponent(userId)}/${encodeURIComponent(segmentId)}`, { method: 'DELETE' });
}

// ─── REGLAS DE REASIGNACIÓN (C-08) ───────────────────────────────────────────

export interface AssignmentRule {
  id: string;
  name: string;
  inactiveHours: number;
  fromUser: string;
  toUser: string;
  toStrategy: 'specific' | 'roundrobin' | 'leastload';
  enabled: boolean;
  createdAt: string;
}

export async function listAssignmentRulesRequest(userId: string): Promise<AssignmentRule[]> {
  const result = await request<{ ok: boolean; rules: AssignmentRule[] }>(
    `/api/crm/assignment/${encodeURIComponent(userId)}/rules`,
  );
  return result.rules || [];
}

export async function createAssignmentRuleRequest(userId: string, rule: Partial<AssignmentRule>): Promise<AssignmentRule | null> {
  const result = await request<{ ok: boolean; rule: AssignmentRule }>(
    `/api/crm/assignment/${encodeURIComponent(userId)}/rules`,
    { method: 'POST', body: JSON.stringify({ rule }) },
  );
  return result.rule || null;
}

export async function updateAssignmentRuleRequest(userId: string, ruleId: string, rule: Partial<AssignmentRule>): Promise<AssignmentRule | null> {
  const result = await request<{ ok: boolean; rule: AssignmentRule }>(
    `/api/crm/assignment/${encodeURIComponent(userId)}/rules/${encodeURIComponent(ruleId)}`,
    { method: 'PUT', body: JSON.stringify({ rule }) },
  );
  return result.rule || null;
}

export async function deleteAssignmentRuleRequest(userId: string, ruleId: string): Promise<void> {
  await request(`/api/crm/assignment/${encodeURIComponent(userId)}/rules/${encodeURIComponent(ruleId)}`, { method: 'DELETE' });
}

// ─── SLA CONFIG (C-09) ───────────────────────────────────────────────────────

export interface SlaConfig {
  enabled: boolean;
  maxResponseHours: number;
  alertAfterHours: number;
  applyToStatuses: string[];
  escalationUser: string;
}

export async function getSlaConfigRequest(userId: string): Promise<SlaConfig | null> {
  try {
    const result = await request<{ ok: boolean; sla: SlaConfig }>(
      `/api/crm/assignment/${encodeURIComponent(userId)}/sla`,
    );
    return result.sla || null;
  } catch {
    return null;
  }
}

export async function saveSlaConfigRequest(userId: string, sla: SlaConfig): Promise<SlaConfig | null> {
  const result = await request<{ ok: boolean; sla: SlaConfig }>(
    `/api/crm/assignment/${encodeURIComponent(userId)}/sla`,
    { method: 'POST', body: JSON.stringify({ sla }) },
  );
  return result.sla || null;
}

// ─── BULK IMPORT (C-11) ───────────────────────────────────────────────────────

export async function bulkCreateLeadsV2Request(userId: string, leads: Lead[]): Promise<{ created: Lead[]; errors: unknown[] }> {
  const result = await request<{ ok: boolean; leads: unknown[]; errors: unknown[] }>(
    `/api/leads/${encodeURIComponent(userId)}/bulk`,
    { method: 'POST', body: JSON.stringify({ leads }) },
  );
  return {
    created: (result.leads || []).map(normalizeLeadRecord).filter((l): l is Lead => Boolean(l)),
    errors: result.errors || [],
  };
}

export async function bulkCreateClientsV2Request(userId: string, clients: Client[]): Promise<{ created: Client[]; errors: unknown[] }> {
  const result = await request<{ ok: boolean; clients: unknown[]; errors: unknown[] }>(
    `/api/clients/${encodeURIComponent(userId)}/bulk`,
    { method: 'POST', body: JSON.stringify({ clients }) },
  );
  return {
    created: (result.clients || []).map(normalizeClientRecord).filter((c): c is Client => Boolean(c)),
    errors: result.errors || [],
  };
}

// ─── EMAIL RECORDATORIO DE CITA ───────────────────────────────────────────────

export async function sendAppointmentReminderRequest(params: {
  to: string;
  name: string;
  appointmentDate: string;
  vehicleInterest?: string;
  dealerName?: string;
  dealerPhone?: string;
  notes?: string;
}): Promise<{ ok: boolean; messageId?: string }> {
  return request<{ ok: boolean; messageId?: string }>('/api/email/appointment-reminder', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

// ─── CRM ALERTS ──────────────────────────────────────────────────────────────

export interface CrmAlert {
  id: string;
  type: 'uncontacted_lead' | 'pending_quote' | 'inactive_client' | 'opportunity_no_followup' | 'interested_no_response' | 'stale_reservation' | 'lead_no_opportunity';
  severity: 'warning' | 'info' | 'low';
  name?: string;
  clientName?: string;
  phone?: string;
  email?: string;
  status?: string;
  clientId?: string;
  vehicleId?: string;
  vehicleInterest?: string;
  vehicleInterestId?: string;
  responsible?: string;
  total?: number;
  daysSinceContact?: number;
  daysPending?: number;
  daysSinceActivity?: number;
  daysSinceReserved?: number;
  daysSinceCreated?: number;
  commercialStatus?: string;
  createdAt?: string;
  lastActivity?: string;
}

export interface CrmAlertsSummary {
  uncontactedLeads: number;
  pendingQuotes: number;
  inactiveClients: number;
  opportunitiesNoFollowup: number;
  interestedNoResponse: number;
  staleReservations: number;
  leadsNoOpportunity: number;
  total: number;
}

export async function getCrmAlertsRequest(userId: string): Promise<{ alerts: CrmAlert[]; summary: CrmAlertsSummary } | null> {
  try {
    const result = await request<{ ok: boolean; alerts: CrmAlert[]; summary: CrmAlertsSummary }>(
      `/api/crm/${encodeURIComponent(userId)}/alerts`,
    );
    return { alerts: result.alerts || [], summary: result.summary };
  } catch {
    return null;
  }
}

// ─── CLIENT LINKED QUOTES ─────────────────────────────────────────────────────

export interface ClientQuote {
  id: string;
  number: string;
  title: string;
  clientName: string;
  clientId: string;
  status: string;
  total: number;
  tax: number;
  subtotal: number;
  validUntil: string;
  items: number;
  createdAt: string;
  updatedAt: string;
}

export async function getClientQuotesRequest(userId: string, clientId: string): Promise<ClientQuote[]> {
  try {
    const result = await request<{ ok: boolean; quotes: ClientQuote[] }>(
      `/api/crm/${encodeURIComponent(userId)}/clients/${encodeURIComponent(clientId)}/quotes`,
    );
    return result.quotes || [];
  } catch {
    return [];
  }
}

// ─── COMMERCIAL REMINDERS ─────────────────────────────────────────────────────

export interface CrmReminder {
  id: string;
  title: string;
  description: string;
  entityType: 'lead' | 'client' | 'quote';
  entityId: string;
  entityName: string;
  dueDate: string;
  priority: 'low' | 'medium' | 'high';
  completed: boolean;
  assignedTo: string;
  createdAt: string;
  updatedAt: string;
}

export async function listRemindersRequest(userId: string): Promise<CrmReminder[]> {
  try {
    const result = await request<{ ok: boolean; reminders: CrmReminder[] }>(
      `/api/crm/${encodeURIComponent(userId)}/reminders`,
    );
    return result.reminders || [];
  } catch {
    return [];
  }
}

export async function createReminderRequest(userId: string, reminder: Partial<CrmReminder>): Promise<CrmReminder | null> {
  try {
    const result = await request<{ ok: boolean; reminder: CrmReminder }>(
      `/api/crm/${encodeURIComponent(userId)}/reminders`,
      { method: 'POST', body: JSON.stringify({ reminder }) },
    );
    return result.reminder || null;
  } catch {
    return null;
  }
}

export async function updateReminderRequest(userId: string, reminderId: string, reminder: Partial<CrmReminder>): Promise<CrmReminder | null> {
  try {
    const result = await request<{ ok: boolean; reminder: CrmReminder }>(
      `/api/crm/${encodeURIComponent(userId)}/reminders/${encodeURIComponent(reminderId)}`,
      { method: 'PUT', body: JSON.stringify({ reminder }) },
    );
    return result.reminder || null;
  } catch {
    return null;
  }
}

export async function deleteReminderRequest(userId: string, reminderId: string): Promise<boolean> {
  try {
    await request(`/api/crm/${encodeURIComponent(userId)}/reminders/${encodeURIComponent(reminderId)}`, { method: 'DELETE' });
    return true;
  } catch {
    return false;
  }
}

// Alias de compatibilidad (usado en algunas páginas que pasan client con _rev)
export { toIsoString };
