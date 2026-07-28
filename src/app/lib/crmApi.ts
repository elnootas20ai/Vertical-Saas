import type { Client, ClientStats, ClientLoyalty, Lead, LeadInteraction } from '../context/AppContext';
import { ImportAbortError } from './importAbort';
import { v4 as uuidv4 } from 'uuid';
import { authFetch, getAuthHeaders } from './authApi';
import { getApiBase } from './apiBase';

interface ApiEnvelope {
  error?: string | { message?: string; reason?: string; error?: string };
  message?: string;
}

const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};


const API_BASE = getApiBase();

/** Dashboard / CRM: refrescar contadores de clientes tras alta/edición/baja. */
export const CRM_CLIENTS_SYNC_EVENT = 'vertial:crm-clients-sync';

function notifyCrmClientsSync() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(CRM_CLIENTS_SYNC_EVENT));
}

function getCouchHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  return headers;
}

function formatCrmApiError(payload: ApiEnvelope | unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') {
    if (typeof payload === 'string' && payload.trim()) return payload.trim();
    return fallback;
  }
  const body = payload as ApiEnvelope & Record<string, unknown>;
  const err = body.error;
  if (typeof err === 'string' && err.trim()) return err.trim();
  if (err && typeof err === 'object') {
    const obj = err as Record<string, unknown>;
    if (typeof obj.message === 'string' && obj.message.trim()) return obj.message.trim();
    if (typeof obj.reason === 'string' && obj.reason.trim()) return obj.reason.trim();
    if (typeof obj.error === 'string' && obj.error.trim()) return obj.error.trim();
  }
  if (typeof body.message === 'string' && body.message.trim()) return body.message.trim();
  try {
    const raw = JSON.stringify(payload);
    if (raw && raw !== '{}' && raw !== '[object Object]') return raw.slice(0, 300);
  } catch {
    /* ignore */
  }
  return fallback;
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
    throw new Error(formatCrmApiError(payload, `Error CRM (${response.status})`));
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
          acquisitionKind: ((raw.stats as Record<string, unknown>).acquisitionKind as ClientStats['acquisitionKind']) || undefined,
          excludeFromNewMetrics: Boolean((raw.stats as Record<string, unknown>).excludeFromNewMetrics)
            || ((raw.stats as Record<string, unknown>).acquisitionKind === 'migration'),
          ...((raw.stats as Record<string, unknown>).lostFromQuickAttention
            ? { lostFromQuickAttention: true as const }
            : {}),
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
    branch_id: raw.branch_id ? String(raw.branch_id) : undefined,
    workCenterId: raw.workCenterId ? String(raw.workCenterId) : undefined,
    businessId: raw.businessId ? String(raw.businessId) : (raw.business_id ? String(raw.business_id) : undefined),
    business_id: raw.business_id ? String(raw.business_id) : (raw.businessId ? String(raw.businessId) : undefined),
  };
}

// ─── LEADS ────────────────────────────────────────────────────────────────────

export async function bulkCreateClientsRequest(userId: string, clients: Client[]): Promise<Client[]> {
  const result = await bulkCreateClientsV2Request(userId, clients);
  return result.created;
}

const CRM_BULK_CHUNK_SIZE = 500;

export async function bulkCreateClientsInChunks(
  userId: string,
  clients: Client[],
  onProgress?: (done: number, total: number) => void,
  options?: { businessId?: string; signal?: AbortSignal },
): Promise<{ createdCount: number; errors: unknown[] }> {
  let createdCount = 0;
  const errors: unknown[] = [];
  const total = clients.length;
  const businessId = options?.businessId?.trim();
  const signal = options?.signal;

  for (let i = 0; i < clients.length; i += CRM_BULK_CHUNK_SIZE) {
    if (signal?.aborted) {
      throw new ImportAbortError();
    }
    const chunk = clients.slice(i, i + CRM_BULK_CHUNK_SIZE).map((c) => (
      businessId ? { ...c, businessId, business_id: businessId } : c
    ));
    const result = await bulkCreateClientsV2Request(userId, chunk, { businessId, signal });
    createdCount += Math.max(0, Number(result.total ?? result.created.length ?? 0));
    errors.push(...result.errors);
    onProgress?.(Math.min(i + chunk.length, total), total);
  }

  return { createdCount, errors };
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

export interface ClientsListMeta {
  total: number;
  skip: number;
  limit: number;
  hasMore: boolean;
  sort?: string;
  search?: string;
}

export async function listClientsPageRequest(
  userId: string,
  options: {
    limit?: number;
    skip?: number;
    search?: string;
    sort?: string;
    lite?: boolean;
    branchId?: string;
    workCenterId?: string;
    businessId?: string;
    /** Calcula stats/loyalty desde pedidos delivery (columnas Pro del listado). */
    liveStats?: boolean;
    /** Invalida caché servidor de clientes del titular (TPV / cuentas grandes). */
    refresh?: boolean;
    signal?: AbortSignal;
  } = {},
): Promise<{ clients: Client[]; meta: ClientsListMeta }> {
  const params = new URLSearchParams();
  const limit = options.limit ?? 50;
  const skip = options.skip ?? 0;
  params.set('limit', String(limit));
  params.set('skip', String(skip));
  if (options.search?.trim()) params.set('search', options.search.trim());
  if (options.sort) params.set('sort', options.sort);
  if (options.lite !== false) params.set('lite', '1');
  if (options.businessId?.trim()) params.set('businessId', options.businessId.trim());
  if (options.branchId && options.branchId !== 'all') {
    params.set('filter[branch_id]', options.branchId);
  }
  if (options.workCenterId && options.workCenterId !== 'all') {
    params.set('filter[workCenterId]', options.workCenterId);
  }
  if (options.liveStats) params.set('liveStats', '1');
  if (options.refresh) params.set('refresh', '1');

  const payload = await request<{ ok: boolean; clients: unknown[]; meta?: ClientsListMeta }>(
    `/api/clients/${encodeURIComponent(userId)}?${params.toString()}`,
    options.signal ? { signal: options.signal } : undefined,
  );

  const meta = payload.meta ?? { total: 0, skip, limit, hasMore: false };
  const clients = (payload.clients || [])
    .map(normalizeClientRecord)
    .filter((c): c is Client => Boolean(c));

  return { clients, meta };
}

export async function fetchAllClientsForExport(
  userId: string,
  onProgress?: (done: number, total: number) => void,
  businessId?: string,
  options?: { liveStats?: boolean },
): Promise<Client[]> {
  const pageSize = 500;
  let skip = 0;
  let all: Client[] = [];
  let total = 0;

  while (true) {
    const { clients, meta } = await listClientsPageRequest(userId, {
      limit: pageSize,
      skip,
      lite: true,
      businessId,
      liveStats: options?.liveStats,
    });
    if (skip === 0) total = meta.total;
    all = all.concat(clients);
    onProgress?.(all.length, total);
    if (!meta.hasMore || clients.length === 0) break;
    skip += pageSize;
  }

  return all;
}

export async function getClientDetailRequest(userId: string, clientId: string): Promise<Client | null> {
  try {
    const result = await request<{ ok: boolean; client: unknown }>(
      `/api/clients/${encodeURIComponent(userId)}/${encodeURIComponent(clientId)}`,
    );
    return normalizeClientRecord(result.client);
  } catch {
    return null;
  }
}

export type ClientDetailSummary = {
  totalInvoiced: number;
  totalOrders: number;
  avgTicket: number;
  lastPurchase: string | null;
  totalDeliveryRevenue?: number;
  deliveryOrders?: number;
  favoriteDeliveryType?: string | null;
  recentOrders?: ClientRecentOrderSummary[];
};

export type ClientRecentOrderSummary = {
  id: string;
  orderNumber: string;
  createdAt: string;
  status: string;
  deliveryType: string;
  channel: string;
  totalAmount: number;
  salesPointName: string;
  itemCount: number;
  paymentStatus: string;
  customerAddress: string;
};

export async function getClientDetailBundleRequest(
  userId: string,
  clientId: string,
): Promise<{ client: Client; summary: ClientDetailSummary } | null> {
  try {
    const result = await request<{ ok: boolean; client: unknown; summary: ClientDetailSummary }>(
      `/api/clients/${encodeURIComponent(userId)}/${encodeURIComponent(clientId)}`,
    );
    const client = normalizeClientRecord(result.client);
    if (!client) return null;
    return { client, summary: result.summary };
  } catch {
    return null;
  }
}

/** @deprecated Prefer listClientsPageRequest for large datasets. */
export async function listClientsRequest(
  userId: string,
  options?: { all?: boolean; businessId?: string },
): Promise<Client[]> {
  if (options?.all) {
    return fetchAllClientsForExport(userId, undefined, options.businessId);
  }
  const { clients } = await listClientsPageRequest(userId, {
    limit: 100,
    skip: 0,
    lite: true,
    businessId: options?.businessId,
  });
  return clients;
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
  const normalized = normalizeClientRecord(result.client);
  if (normalized) notifyCrmClientsSync();
  return {
    client: normalized,
    duplicates: (result.duplicates || []).map(normalizeClientRecord).filter((c): c is Client => Boolean(c)),
  };
}

export async function importClientsFromBusinessRequest(
  userId: string,
  sourceBusinessId: string,
  targetBusinessId: string,
): Promise<{ clients: Client[]; total: number; skipped: Array<{ name?: string; phone?: string; reason?: string }> }> {
  const result = await request<{
    ok: boolean;
    clients: unknown[];
    total: number;
    skipped?: Array<{ name?: string; phone?: string; reason?: string }>;
  }>(
    `/api/clients/${encodeURIComponent(userId)}/import-from-business`,
    {
      method: 'POST',
      body: JSON.stringify({ sourceBusinessId, targetBusinessId }),
    },
  );
  return {
    clients: (result.clients || []).map(normalizeClientRecord).filter((c): c is Client => Boolean(c)),
    total: result.total || 0,
    skipped: result.skipped || [],
  };
}

export type ClientPhoneSearchPayload = {
  clients: Client[];
  /** Tamaño de la cartera cargada en servidor (0 = carga fallida / vacía). */
  portfolioSize: number;
};

/** Busca clientes por dígitos de teléfono y/o por nombre (substring, sin acentos en servidor). */
export async function searchClientsByPhoneRequest(
  userId: string,
  query: string,
  limit = 5,
  signal?: AbortSignal,
  businessId?: string,
  options?: { includeLegacy?: boolean; fallbackAll?: boolean; refresh?: boolean },
): Promise<ClientPhoneSearchPayload> {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  if (businessId?.trim()) params.set('businessId', businessId.trim());
  if (options?.includeLegacy) params.set('includeLegacy', '1');
  if (options?.fallbackAll) params.set('fallbackAll', '1');
  if (options?.refresh) params.set('refresh', '1');
  const payload = await request<{ ok: boolean; clients: unknown[]; portfolioSize?: number }>(
    `/api/clients/${encodeURIComponent(userId)}/search-by-phone?${params.toString()}`,
    signal ? { signal } : undefined,
  );
  const clients = (payload.clients || [])
    .map(normalizeClientRecord)
    .filter((c): c is Client => Boolean(c));
  const portfolioSize =
    typeof payload.portfolioSize === 'number' && Number.isFinite(payload.portfolioSize)
      ? Math.max(0, Math.floor(payload.portfolioSize))
      : clients.length > 0
        ? clients.length
        : -1;
  return { clients, portfolioSize };
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
  const normalized = normalizeClientRecord(result.client);
  if (normalized) notifyCrmClientsSync();
  return normalized;
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
  notifyCrmClientsSync();
}

/** Soft-delete de varios clientes, o de todo el alcance del listado. */
export async function bulkDeleteClientsRequest(
  userId: string,
  options: {
    ids?: string[];
    allMatching?: boolean;
    businessId?: string;
    search?: string;
    branchId?: string;
    workCenterId?: string;
  },
): Promise<{ removed: number; skipped: number; failed: string[] }> {
  const body: Record<string, unknown> = {};
  if (options.allMatching) {
    body.allMatching = true;
    if (options.businessId?.trim()) body.businessId = options.businessId.trim();
    if (options.search?.trim()) body.search = options.search.trim();
    if (options.branchId && options.branchId !== 'all') body.branchId = options.branchId;
    if (options.workCenterId && options.workCenterId !== 'all') body.workCenterId = options.workCenterId;
  } else {
    body.ids = Array.isArray(options.ids) ? options.ids : [];
  }

  const result = await request<{
    ok: boolean;
    removed?: number;
    skipped?: number;
    failed?: string[];
  }>(
    // delete-all: ruta explícita en index.js (evita 404 de backends viejos sin bulk-delete en el router)
    `/api/clients/${encodeURIComponent(userId)}/delete-all`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  );
  notifyCrmClientsSync();
  return {
    removed: Number(result.removed) || 0,
    skipped: Number(result.skipped) || 0,
    failed: Array.isArray(result.failed) ? result.failed.map(String) : [],
  };
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

export async function bulkCreateClientsV2Request(
  userId: string,
  clients: Client[],
  options?: { businessId?: string; signal?: AbortSignal },
): Promise<{ created: Client[]; errors: unknown[]; total: number }> {
  const result = await request<{
    ok: boolean;
    clients: unknown[];
    errors: unknown[];
    total?: number;
  }>(
    `/api/clients/${encodeURIComponent(userId)}/bulk`,
    {
      method: 'POST',
      body: JSON.stringify({
        clients,
        ...(options?.businessId?.trim() ? { businessId: options.businessId.trim() } : {}),
      }),
      signal: options?.signal,
    },
  );
  const created = (result.clients || [])
    .map(normalizeClientRecord)
    .filter((c): c is Client => Boolean(c));
  const total = Math.max(
    0,
    Number(
      result.total != null && Number.isFinite(Number(result.total))
        ? result.total
        : created.length,
    ),
  );
  return {
    created,
    errors: result.errors || [],
    total,
  };
}

export async function previewClientAcquisitionPeakDayRequest(
  userId: string,
  options?: { businessId?: string },
): Promise<{ peakDay: string | null; peakCount: number; suggestMigration: boolean }> {
  const params = new URLSearchParams();
  if (options?.businessId?.trim()) params.set('businessId', options.businessId.trim());
  const qs = params.toString();
  const result = await request<{
    ok: boolean;
    peakDay: string | null;
    peakCount: number;
    suggestMigration: boolean;
  }>(
    `/api/clients/${encodeURIComponent(userId)}/acquisition-peak-day${qs ? `?${qs}` : ''}`,
  );
  return {
    peakDay: result.peakDay || null,
    peakCount: Number(result.peakCount || 0),
    suggestMigration: Boolean(result.suggestMigration),
  };
}

export async function markClientsAcquisitionRequest(
  userId: string,
  body: {
    businessId?: string;
    acquisitionKind: 'migration' | 'organic';
    createdDay: string;
    onlyUnmarked?: boolean;
    dryRun?: boolean;
  },
): Promise<{ matched: number; updated: number; createdDay: string; dryRun: boolean }> {
  const result = await request<{
    ok: boolean;
    matched: number;
    updated?: number;
    createdDay: string;
    dryRun: boolean;
  }>(`/api/clients/${encodeURIComponent(userId)}/mark-acquisition`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return {
    matched: Number(result.matched || 0),
    updated: Number(result.updated || 0),
    createdDay: String(result.createdDay || body.createdDay),
    dryRun: Boolean(result.dryRun),
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
