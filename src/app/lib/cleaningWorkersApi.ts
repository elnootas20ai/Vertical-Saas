import { getAuthHeaders } from './authApi';

const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};

function getApiBase() {
  if (env.VITE_API_URL) return env.VITE_API_URL;
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
    throw new Error(payload?.error || 'Error inesperado en cleaning workers API');
  }
  return payload;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type CleaningWorkerStatus = 'active' | 'inactive' | 'on_leave' | 'trial';
export type ContractType = 'full_time' | 'part_time' | 'temporary' | 'freelance' | 'internship';
export type VehicleType = 'coche' | 'moto' | 'bicicleta' | 'transporte_publico' | 'a_pie';
export type DocumentType = 'dni' | 'contract' | 'prl' | 'driving_license' | 'social_security' | 'medical' | 'certification' | 'other';
export type MaterialCondition = 'good' | 'fair' | 'poor' | 'needs_replacement';

export interface WorkerDocument {
  id: string;
  name: string;
  documentType: DocumentType;
  url: string;
  expiresAt: string;
  uploadedAt: string;
  verified: boolean;
}

export interface DayAvailability {
  available: boolean;
  startTime: string;
  endTime: string;
  breakStart: string;
  breakEnd: string;
}

export interface WorkerAvailability {
  monday: DayAvailability;
  tuesday: DayAvailability;
  wednesday: DayAvailability;
  thursday: DayAvailability;
  friday: DayAvailability;
  saturday: DayAvailability;
  sunday: DayAvailability;
}

export interface AssignedMaterial {
  id: string;
  name: string;
  catalogItemId: string;
  quantity: number;
  assignedAt: string;
  returnedAt: string;
  condition: MaterialCondition;
  notes: string;
}

export interface WorkerPermissions {
  canViewOwnDocs: boolean;
  canViewOwnStats: boolean;
  canViewOwnSchedule: boolean;
}

export interface CleaningWorker {
  _id: string;
  _rev?: string;
  type: 'cleaning_worker';
  id: string;
  user_id: string;
  name: string;
  phone: string;
  email: string;
  avatar: string;
  address: string;
  teamMemberId: string;
  documents: WorkerDocument[];
  contractType: ContractType;
  hourlyCost: number;
  hourlyRate: number;
  weeklyHours: number;
  startDate: string;
  endDate: string;
  socialSecurityNumber: string;
  availability: WorkerAvailability;
  zones: string[];
  preferredZone: string;
  hasOwnVehicle: boolean;
  vehicleType: VehicleType | '';
  vehicleOwnership: 'own' | 'company' | '';
  licensePlate: string;
  assignedMaterials: AssignedMaterial[];
  status: CleaningWorkerStatus;
  specializations: string[];
  languages: string[];
  notes: string;
  workerPermissions: WorkerPermissions;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

// ─── API ──────────────────────────────────────────────────────────────────────

export async function listCleaningWorkersRequest(userId: string): Promise<CleaningWorker[]> {
  const id = normalizeUserId(userId);
  const payload = await request<{ ok: boolean; workers: CleaningWorker[] }>(
    `/api/cleaning/workers/${encodeURIComponent(id)}`,
  );
  return payload.workers || [];
}

export async function getCleaningWorkerRequest(userId: string, workerId: string): Promise<CleaningWorker> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; worker: CleaningWorker }>(
    `/api/cleaning/workers/${encodeURIComponent(id)}/${encodeURIComponent(workerId)}`,
  );
  if (!result.worker) throw new Error('Trabajador no encontrado');
  return result.worker;
}

export async function createCleaningWorkerRequest(userId: string, data: Partial<CleaningWorker>): Promise<CleaningWorker> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; worker: CleaningWorker }>(
    `/api/cleaning/workers/${encodeURIComponent(id)}`,
    { method: 'POST', body: JSON.stringify({ worker: data }) },
  );
  if (!result.worker) throw new Error('Respuesta inválida del servidor');
  return result.worker;
}

export async function updateCleaningWorkerRequest(userId: string, worker: CleaningWorker): Promise<CleaningWorker> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; worker: CleaningWorker }>(
    `/api/cleaning/workers/${encodeURIComponent(id)}/${encodeURIComponent(worker._id)}`,
    { method: 'PUT', body: JSON.stringify({ worker }) },
  );
  if (!result.worker) throw new Error('Respuesta inválida del servidor');
  return result.worker;
}

export async function deleteCleaningWorkerRequest(userId: string, workerId: string): Promise<void> {
  const id = normalizeUserId(userId);
  await request(
    `/api/cleaning/workers/${encodeURIComponent(id)}/${encodeURIComponent(workerId)}`,
    { method: 'DELETE' },
  );
}

export async function assignWorkerToServiceRequest(
  userId: string,
  serviceId: string,
  workerId: string,
): Promise<{ ok: boolean; service: unknown }> {
  const id = normalizeUserId(userId);
  return request(
    `/api/cleaning/services/${encodeURIComponent(id)}/${encodeURIComponent(serviceId)}/assign`,
    { method: 'PATCH', body: JSON.stringify({ workerId }) },
  );
}

export async function listWorkerServicesRequest(
  userId: string,
  workerId: string,
  from?: string,
  to?: string,
): Promise<unknown[]> {
  const id = normalizeUserId(userId);
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const qs = params.toString() ? `?${params}` : '';
  const payload = await request<{ ok: boolean; services: unknown[] }>(
    `/api/cleaning/workers/${encodeURIComponent(id)}/${encodeURIComponent(workerId)}/services${qs}`,
  );
  return payload.services || [];
}

// ─── Productivity ─────────────────────────────────────────────────────────────

export interface WorkerProductivity {
  workerId: string;
  workerName: string;
  status: string;
  serviceHours: number;
  completedServices: number;
  cancelledServices: number;
  totalServices: number;
  lateArrivals: number;
  avgDelayMinutes: number;
  absences: number;
  servicesPerHour: number;
  revenuePerHour: number;
  avgQualityRating: number;
  avgClientRating: number;
  totalRevenue: number;
  laborCost: number;
  profitability: number;
}

export interface ClientLaborCost {
  clientName: string;
  totalHours: number;
  laborCost: number;
  servicesCount: number;
  avgCostPerService: number;
  workers: string[];
}

export interface ProductivityResponse {
  ok: boolean;
  period: { from: string; to: string };
  workers: WorkerProductivity[];
  totals: {
    totalWorkers: number;
    totalServiceHours: number;
    totalServicesCompleted: number;
    totalRevenue: number;
    totalLaborCost: number;
    avgServicesPerHour: number;
    avgRevenuePerHour: number;
  };
  costByClient: ClientLaborCost[];
}

export interface WorkerStatsResponse {
  ok: boolean;
  period: { from: string; to: string };
  stats: {
    totalServices: number;
    completedServices: number;
    serviceHours: number;
    totalRevenue: number;
    servicesPerHour: number;
    revenuePerHour: number;
  };
}

export async function getCleaningProductivityRequest(userId: string, from: string, to: string): Promise<ProductivityResponse> {
  const id = normalizeUserId(userId);
  const params = new URLSearchParams({ from, to });
  return request(`/api/cleaning/workers/${encodeURIComponent(id)}/productivity?${params}`);
}

export async function getWorkerStatsRequest(userId: string, workerId: string, period: 'today' | 'week' | 'month' = 'month'): Promise<WorkerStatsResponse> {
  const id = normalizeUserId(userId);
  return request(`/api/cleaning/workers/${encodeURIComponent(id)}/${encodeURIComponent(workerId)}/stats?period=${period}`);
}
