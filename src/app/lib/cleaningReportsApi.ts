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

async function request<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders(), ...getCouchHeaders() },
  });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(payload?.error || 'Error en cleaning reports API');
  return payload;
}

function buildQs(params: ReportFilters): string {
  const qs = new URLSearchParams();
  if (params.from) qs.set('from', params.from);
  if (params.to) qs.set('to', params.to);
  if (params.clientId && params.clientId !== 'all') qs.set('clientId', params.clientId);
  if (params.workerId && params.workerId !== 'all') qs.set('workerId', params.workerId);
  if (params.zone && params.zone !== 'all') qs.set('zone', params.zone);
  if (params.cleaningType && params.cleaningType !== 'all') qs.set('cleaningType', params.cleaningType);
  const s = qs.toString();
  return s ? '?' + s : '';
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ReportFilters {
  from?: string;
  to?: string;
  clientId?: string;
  workerId?: string;
  zone?: string;
  cleaningType?: string;
}

export interface CleaningOverview {
  ok: boolean;
  period: { from: string; to: string };
  clients: { activeCount: number; newCount: number; lostCount: number; totalContracts: number };
  services: { total: number; completed: number; cancelled: number; pending: number; inProgress: number; completionRate: number };
  hours: { planned: number; real: number; deviation: number; deviationPercent: number };
  financial: { revenue: number; laborCost: number; materialCost: number; totalCost: number; grossMargin: number; grossMarginPercent: number; billedAmount: number; collectedAmount: number; pendingAmount: number };
  operational: { avgServicesPerDay: number; avgRevenuePerService: number; avgRevenuePerHour: number; avgCostPerService: number; incidentCount: number; incidentRate: number; absenteeismCount: number; absenteeismRate: number };
}

export interface ClientProfitabilityItem {
  clientName: string;
  clientId: string;
  clientType: string;
  zone: string;
  servicesCompleted: number;
  hoursReal: number;
  revenue: number;
  laborCost: number;
  materialCost: number;
  totalCost: number;
  grossMargin: number;
  grossMarginPercent: number;
  avgRevenuePerService: number;
  avgCostPerService: number;
  incidentCount: number;
  avgQualityRating: number;
  avgClientRating: number;
  trend: 'up' | 'down' | 'stable';
}

export interface ClientProfitabilityResponse {
  ok: boolean;
  period: { from: string; to: string };
  clients: ClientProfitabilityItem[];
}

export interface WorkerProfitabilityItem {
  workerName: string;
  workerId: string;
  servicesCompleted: number;
  hoursPlanned: number;
  hoursReal: number;
  deviation: number;
  revenue: number;
  laborCost: number;
  materialCost: number;
  profitability: number;
  profitabilityPercent: number;
  revenuePerHour: number;
  servicesPerDay: number;
  lateArrivals: number;
  absences: number;
  incidentCount: number;
  avgQualityRating: number;
  avgClientRating: number;
  efficiency: number;
  topClients: string[];
}

export interface WorkerProfitabilityResponse {
  ok: boolean;
  period: { from: string; to: string };
  workers: WorkerProfitabilityItem[];
}

export interface ServicesSummaryResponse {
  ok: boolean;
  period: { from: string; to: string };
  totals: { total: number; completed: number; cancelled: number; pending: number; assigned: number; in_progress: number; totalPlannedHours: number; totalRealHours: number };
  byDate: { date: string; count: number; planned: number; real: number }[];
  byWorker: { name: string; planned: number; real: number; count: number }[];
  byClient: { name: string; planned: number; real: number; count: number }[];
  recent: { id: string; date: string; time: string; clientName: string; workerName: string; cleaningType: string; hoursPlanned: number; hoursReal: number; deviation: number; status: string; qualityRating: number }[];
}

export interface AbsenteeismResponse {
  ok: boolean;
  period: { from: string; to: string };
  totalAssigned: number;
  totalAbsences: number;
  totalLateArrivals: number;
  absenteeismRate: number;
  avgDelayMinutes: number;
  byWorker: { workerName: string; assigned: number; absences: number; lateArrivals: number; totalDelay: number; avgDelayMinutes: number; rate: number }[];
  byDate: { date: string; absences: number; lateArrivals: number }[];
  details: { date: string; workerName: string; clientName: string; address: string; scheduledTime: string; checkInAt: string | null; delayMinutes: number | null; type: 'absence' | 'late' }[];
}

export interface IncidentsSummaryResponse {
  ok: boolean;
  period: { from: string; to: string };
  totalIncidents: number;
  resolved: number;
  unresolved: number;
  avgResolutionMinutes: number;
  byType: { type: string; count: number; avgResolutionMinutes: number }[];
  bySeverity: { severity: string; count: number }[];
  byWorker: { workerName: string; count: number; resolvedCount: number }[];
  byClient: { clientName: string; count: number }[];
  trend: { date: string; count: number }[];
}

export interface MaterialsCostResponse {
  ok: boolean;
  period: { from: string; to: string };
  totalCost: number;
  totalDeliveries: number;
  avgCostPerService: number;
  byClient: { clientName: string; cost: number; servicesCount: number; avgPerService: number }[];
  byWorker: { workerName: string; cost: number; servicesCount: number }[];
  byMaterial: { materialName: string; quantity: number; cost: number; servicesCount: number }[];
  trend: { month: string; cost: number; servicesCount: number }[];
}

export interface BillingResponse {
  ok: boolean;
  period: { from: string; to: string };
  totalBilled: number;
  totalCollected: number;
  totalPending: number;
  collectionRate: number;
  byMonth: { month: string; billed: number; collected: number; pending: number; count: number }[];
  byClient: { clientName: string; billed: number; collected: number; pending: number; servicesCount: number }[];
}

export interface ComparativesResponse {
  ok: boolean;
  period: { from: string; to: string };
  byZone: { zone: string; servicesCount: number; revenue: number; laborCost: number; materialCost: number; grossMargin: number; grossMarginPercent: number; avgQualityRating: number; incidentCount: number; workersCount: number; clientsCount: number }[];
  byCleaningType: { cleaningType: string; servicesCount: number; revenue: number; laborCost: number; materialCost: number; grossMargin: number; grossMarginPercent: number; avgDurationMinutes: number; avgRevenuePerHour: number; incidentCount: number }[];
}

// ─── API Calls ──────────────────────────────────────────────────────────────

function reportPath(userId: string) {
  return '/api/cleaning/reports/' + encodeURIComponent(normalizeUserId(userId));
}

export async function fetchCleaningOverview(userId: string, filters: ReportFilters = {}): Promise<CleaningOverview> {
  return request<CleaningOverview>(reportPath(userId) + '/overview' + buildQs(filters));
}

export async function fetchClientProfitability(userId: string, filters: ReportFilters = {}): Promise<ClientProfitabilityResponse> {
  return request<ClientProfitabilityResponse>(reportPath(userId) + '/profitability/clients' + buildQs(filters));
}

export async function fetchWorkerProfitability(userId: string, filters: ReportFilters = {}): Promise<WorkerProfitabilityResponse> {
  return request<WorkerProfitabilityResponse>(reportPath(userId) + '/profitability/workers' + buildQs(filters));
}

export async function fetchServicesSummary(userId: string, filters: ReportFilters = {}): Promise<ServicesSummaryResponse> {
  return request<ServicesSummaryResponse>(reportPath(userId) + '/services-summary' + buildQs(filters));
}

export async function fetchAbsenteeism(userId: string, filters: ReportFilters = {}): Promise<AbsenteeismResponse> {
  return request<AbsenteeismResponse>(reportPath(userId) + '/absenteeism' + buildQs(filters));
}

export async function fetchIncidentsSummary(userId: string, filters: ReportFilters = {}): Promise<IncidentsSummaryResponse> {
  return request<IncidentsSummaryResponse>(reportPath(userId) + '/incidents-summary' + buildQs(filters));
}

export async function fetchMaterialsCost(userId: string, filters: ReportFilters = {}): Promise<MaterialsCostResponse> {
  return request<MaterialsCostResponse>(reportPath(userId) + '/materials-cost' + buildQs(filters));
}

export async function fetchBilling(userId: string, filters: ReportFilters = {}): Promise<BillingResponse> {
  return request<BillingResponse>(reportPath(userId) + '/billing' + buildQs(filters));
}

export async function fetchComparatives(userId: string, filters: ReportFilters = {}): Promise<ComparativesResponse> {
  return request<ComparativesResponse>(reportPath(userId) + '/comparatives' + buildQs(filters));
}
