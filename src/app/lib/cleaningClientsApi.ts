import { getAuthHeaders } from './authApi';
import { getApiBase } from './apiBase';

const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};


const API_BASE = getApiBase();

function normalizeUserId(userId: string): string {
  const value = String(userId || '').trim();
  return value.startsWith('account:') ? value.slice('account:'.length) : value;
}

function getCouchHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (env.VITE_COUCHDB_URL) headers['x-couch-url'] = env.VITE_COUCHDB_URL;
  if (env.VITE_COUCHDB_USER) headers['x-couch-user'] = env.VITE_COUCHDB_USER;
  if (env.VITE_COUCHDB_PASSWORD) headers['x-couch-password'] = env.VITE_COUCHDB_PASSWORD;
  return headers;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
      ...getCouchHeaders(),
      ...(init?.headers || {}),
    },
    ...init,
  });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload?.error || 'Error inesperado en cleaning clients API');
  }
  return payload;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type ProfitabilityClass = 'high' | 'medium' | 'low' | 'negative' | 'unknown';
export type ContractStatusSummary = 'all_active' | 'some_paused' | 'pending_renewal' | 'expired' | 'no_contracts';
export type CleaningClientAlertType =
  | 'contract_expiring'
  | 'client_unpaid_invoices'
  | 'client_repeated_incidents'
  | 'client_no_responsible'
  | 'client_inactive'
  | 'client_low_profitability'
  | 'client_quality_drop';

export interface CleaningClientListItem {
  clientId: string;
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  clientType: string;
  activeContracts: number;
  totalContracts: number;
  locations: { address: string; zone: string; city: string }[];
  monthlyRevenue: number;
  totalInvoiced: number;
  unpaidAmount: number;
  openIncidents: number;
  totalIncidents: number;
  assignedResponsible: string;
  assignedWorkers: { id: string; name: string }[];
  nearestRenewal: string | null;
  contractStatus: ContractStatusSummary;
  profitability: ProfitabilityClass;
  lastServiceDate: string | null;
  lastIncidentDate: string | null;
  createdAt: string;
}

export interface ClientLocationRecord {
  id: string;
  _rev?: string;
  clientId: string;
  name: string;
  address: string;
  addressLine2: string;
  city: string;
  postalCode: string;
  zone: string;
  coordinates: { lat: number; lng: number } | null;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  accessInstructions: string;
  parkingNotes: string;
  squareMeters: number;
  floors: number;
  locationNotes: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CleaningClientContract {
  id: string;
  contractNumber: string;
  cleaningType: string;
  frequency: string;
  scheduleSummary: string;
  hoursPerMonth: number;
  pricingModel: string;
  monthlyPrice: number;
  assignedWorkerName: string;
  assignedWorkerId: string;
  contractStatus: string;
  startDate: string;
  endDate: string | null;
  renewalDate: string | null;
  autoRenew: boolean;
  address: string;
  zone: string;
}

export interface CleaningClientServiceRecord {
  id: string;
  serviceNumber: string;
  date: string;
  time: string;
  status: string;
  assignedToName: string;
  duration: string;
  contractNumber: string | null;
  qualityRating: number | null;
}

export interface CleaningClientIncidentRecord {
  id: string;
  incidentNumber: string;
  incidentType: string;
  date: string;
  priority: string;
  status: string;
  description: string;
  workerName: string;
  resolution: string;
  resolvedAt: string | null;
}

export interface CleaningClientInvoiceRecord {
  id: string;
  number: string;
  date: string;
  dueDate: string;
  total: number;
  paid: number;
  status: string;
}

export interface CleaningClientNoteRecord {
  id: string;
  text: string;
  authorName: string;
  important: boolean;
  createdAt: string;
}

export interface ClientProfitability {
  monthlyRevenue: number;
  monthlyCost: number;
  monthlyProfit: number;
  marginPercent: number;
  classification: ProfitabilityClass;
  revenueHistory: { month: string; revenue: number; cost: number; profit: number }[];
}

export interface CleaningClientAlert {
  id: string;
  type: CleaningClientAlertType;
  severity: 'critical' | 'warning' | 'info';
  clientId: string;
  clientName: string;
  title: string;
  description: string;
  data: Record<string, unknown>;
  actionLabel: string;
  actionRoute: string;
  createdAt: string;
  dismissed: boolean;
}

export interface CleaningClientProfile {
  client: {
    id: string;
    name: string;
    phone: string;
    email: string;
    dni: string;
    clientType: string;
    address: string;
    city: string;
    postalCode: string;
    status: string;
    responsible: string;
    tags: string[];
    notes: string;
    createdAt: string;
  };
  locations: ClientLocationRecord[];
  contracts: CleaningClientContract[];
  recentServices: CleaningClientServiceRecord[];
  serviceStats: {
    totalCompleted: number;
    totalCancelled: number;
    avgQualityRating: number;
    totalHoursWorked: number;
    completionRate: number;
  };
  incidents: CleaningClientIncidentRecord[];
  incidentStats: {
    total: number;
    open: number;
    resolvedAvgDays: number;
    repeatTypes: { type: string; count: number }[];
    trend: 'improving' | 'stable' | 'worsening';
  };
  invoices: CleaningClientInvoiceRecord[];
  invoiceStats: {
    totalInvoiced: number;
    totalPaid: number;
    totalPending: number;
    totalOverdue: number;
    avgPaymentDays: number;
  };
  notes: CleaningClientNoteRecord[];
  profitability: ClientProfitability;
  alerts: CleaningClientAlert[];
}

export interface CleaningClientStats {
  totalClients: number;
  activeClients: number;
  inactiveClients: number;
  newClientsThisMonth: number;
  totalMonthlyRevenue: number;
  totalMonthlyProfit: number;
  avgRevenuePerClient: number;
  clientsWithUnpaid: number;
  clientsWithOpenIncidents: number;
  clientsWithoutResponsible: number;
  contractsExpiringThisMonth: number;
  profitabilityDistribution: Record<ProfitabilityClass, number>;
}

export interface PortfolioProfitability {
  clients: {
    clientId: string;
    clientName: string;
    monthlyRevenue: number;
    monthlyCost: number;
    monthlyProfit: number;
    marginPercent: number;
    classification: ProfitabilityClass;
  }[];
  totals: {
    totalRevenue: number;
    totalCost: number;
    totalProfit: number;
    avgMargin: number;
  };
  distribution: Record<ProfitabilityClass, number>;
}

// ─── Cleaning Clients API ─────────────────────────────────────────────────────

export async function listCleaningClientsRequest(
  userId: string,
  filters?: {
    status?: string;
    responsible?: string;
    zone?: string;
    search?: string;
    profitability?: string;
    sort?: string;
    sortDir?: string;
  },
): Promise<CleaningClientListItem[]> {
  const id = normalizeUserId(userId);
  const qs = new URLSearchParams();
  if (filters?.status) qs.set('status', filters.status);
  if (filters?.responsible) qs.set('responsible', filters.responsible);
  if (filters?.zone) qs.set('zone', filters.zone);
  if (filters?.search) qs.set('search', filters.search);
  if (filters?.profitability) qs.set('profitability', filters.profitability);
  if (filters?.sort) qs.set('sort', filters.sort);
  if (filters?.sortDir) qs.set('sortDir', filters.sortDir);
  const query = qs.toString() ? '?' + qs.toString() : '';
  const payload = await request<{ ok: boolean; clients: CleaningClientListItem[] }>(
    '/api/cleaning/clients/' + encodeURIComponent(id) + query,
  );
  return payload.clients || [];
}

export async function getCleaningClientProfileRequest(
  userId: string,
  clientId: string,
): Promise<CleaningClientProfile> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; profile: CleaningClientProfile }>(
    '/api/cleaning/clients/' + encodeURIComponent(id) + '/' + encodeURIComponent(clientId),
  );
  if (!result.profile) throw new Error('Respuesta inválida del servidor');
  return result.profile;
}

export async function getCleaningClientStatsRequest(
  userId: string,
): Promise<CleaningClientStats> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; stats: CleaningClientStats }>(
    '/api/cleaning/clients/' + encodeURIComponent(id) + '/stats',
  );
  if (!result.stats) throw new Error('Respuesta inválida del servidor');
  return result.stats;
}

export async function listCleaningClientAlertsRequest(
  userId: string,
  filters?: { severity?: string; type?: string },
): Promise<CleaningClientAlert[]> {
  const id = normalizeUserId(userId);
  const qs = new URLSearchParams();
  if (filters?.severity) qs.set('severity', filters.severity);
  if (filters?.type) qs.set('type', filters.type);
  const query = qs.toString() ? '?' + qs.toString() : '';
  const payload = await request<{ ok: boolean; alerts: CleaningClientAlert[] }>(
    '/api/cleaning/clients/' + encodeURIComponent(id) + '/alerts' + query,
  );
  return payload.alerts || [];
}

export async function dismissCleaningClientAlertRequest(
  userId: string,
  alertId: string,
): Promise<void> {
  const id = normalizeUserId(userId);
  await request(
    '/api/cleaning/clients/' + encodeURIComponent(id) + '/alerts/' + encodeURIComponent(alertId) + '/dismiss',
    { method: 'POST' },
  );
}

// ─── Client Locations API ─────────────────────────────────────────────────────

export async function listClientLocationsRequest(
  userId: string,
  clientId: string,
): Promise<ClientLocationRecord[]> {
  const id = normalizeUserId(userId);
  const payload = await request<{ ok: boolean; locations: ClientLocationRecord[] }>(
    '/api/cleaning/clients/' + encodeURIComponent(id) + '/' + encodeURIComponent(clientId) + '/locations',
  );
  return payload.locations || [];
}

export async function saveClientLocationRequest(
  userId: string,
  clientId: string,
  data: Partial<ClientLocationRecord>,
  existingId?: string,
): Promise<ClientLocationRecord> {
  const id = normalizeUserId(userId);
  const basePath =
    '/api/cleaning/clients/' + encodeURIComponent(id) + '/' + encodeURIComponent(clientId) + '/locations';
  if (existingId) {
    const result = await request<{ ok: boolean; location: ClientLocationRecord }>(
      basePath + '/' + encodeURIComponent(existingId),
      { method: 'PUT', body: JSON.stringify({ location: data }) },
    );
    if (!result.location) throw new Error('Respuesta inválida del servidor');
    return result.location;
  }
  const result = await request<{ ok: boolean; location: ClientLocationRecord }>(
    basePath,
    { method: 'POST', body: JSON.stringify({ location: data }) },
  );
  if (!result.location) throw new Error('Respuesta inválida del servidor');
  return result.location;
}

export async function deleteClientLocationRequest(
  userId: string,
  clientId: string,
  locationId: string,
): Promise<void> {
  const id = normalizeUserId(userId);
  await request(
    '/api/cleaning/clients/' + encodeURIComponent(id) + '/' + encodeURIComponent(clientId) + '/locations/' + encodeURIComponent(locationId),
    { method: 'DELETE' },
  );
}

// ─── Profitability API ────────────────────────────────────────────────────────

export async function getCleaningClientProfitabilityRequest(
  userId: string,
  clientId: string,
  period?: string,
): Promise<ClientProfitability> {
  const id = normalizeUserId(userId);
  const qs = new URLSearchParams();
  if (period) qs.set('period', period);
  const query = qs.toString() ? '?' + qs.toString() : '';
  const result = await request<{ ok: boolean; profitability: ClientProfitability }>(
    '/api/cleaning/clients/' + encodeURIComponent(id) + '/' + encodeURIComponent(clientId) + '/profitability' + query,
  );
  if (!result.profitability) throw new Error('Respuesta inválida del servidor');
  return result.profitability;
}

export async function getPortfolioProfitabilityRequest(
  userId: string,
  period?: string,
): Promise<PortfolioProfitability> {
  const id = normalizeUserId(userId);
  const qs = new URLSearchParams();
  if (period) qs.set('period', period);
  const query = qs.toString() ? '?' + qs.toString() : '';
  const result = await request<{ ok: boolean; portfolio: PortfolioProfitability }>(
    '/api/cleaning/clients/' + encodeURIComponent(id) + '/profitability' + query,
  );
  if (!result.portfolio) throw new Error('Respuesta inválida del servidor');
  return result.portfolio;
}
