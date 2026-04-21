import { getAuthHeaders } from './authApi';
import type { CleaningService, CleaningServiceStatus, CleaningIncident } from './cleaningApi';

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

function getCouchHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (env.VITE_COUCHDB_URL) headers['x-couch-url'] = env.VITE_COUCHDB_URL;
  if (env.VITE_COUCHDB_USER) headers['x-couch-user'] = env.VITE_COUCHDB_USER;
  if (env.VITE_COUCHDB_PASSWORD) headers['x-couch-password'] = env.VITE_COUCHDB_PASSWORD;
  return headers;
}

function normalizeUserId(userId: string): string {
  const value = String(userId || '').trim();
  return value.startsWith('account:') ? value.slice('account:'.length) : value;
}

async function request<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
      ...getCouchHeaders(),
    },
  });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(payload?.error || 'Error en cleaning hub API');
  return payload;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CleaningHubKpis {
  servicesToday: number;
  servicesCompleted: number;
  servicesInProgress: number;
  servicesPending: number;
  servicesUncovered: number;
  activeWorkers: number;
  totalWorkers: number;
  absentWorkers: number;
  clockinsPending: number;
  hoursWorkedToday: number;
  openIncidents: number;
  billingToday: number;
  billingPending: number;
  profitabilityAvg: number;
  criticalMaterials: number;
  recurrentServices: number;
  oneTimeServices: number;
}

export type CleaningAlertType =
  | 'service_uncovered'
  | 'worker_absent'
  | 'clockin_pending'
  | 'incident_open'
  | 'material_critical'
  | 'service_delayed'
  | 'billing_pending';

export interface CleaningHubAlert {
  id: string;
  type: CleaningAlertType;
  severity: 'error' | 'warning' | 'info';
  message: string;
  route: string;
  relatedId?: string;
  timestamp: string;
}

export interface CleaningHubService extends CleaningService {
  isRecurrent: boolean;
  recurrencePattern?: string;
  workerClockedIn: boolean;
  estimatedStart: string;
  estimatedEnd: string;
  actualStart?: string;
  actualEnd?: string;
  zoneName?: string;
  checklistDone: number;
  checklistTotal: number;
}

export interface CleaningHubWorker {
  id: string;
  name: string;
  avatar: string;
  clockedIn: boolean;
  clockInTime?: string;
  clockOutTime?: string;
  currentService?: { id: string; clientName: string; address: string; status: CleaningServiceStatus };
  nextService?: { id: string; clientName: string; time: string };
  servicesTotal: number;
  servicesCompleted: number;
  hoursToday: number;
  incidents: number;
  rating: number;
}

export interface CleaningMaterial {
  id: string;
  name: string;
  category: string;
  currentStock: number;
  minStock: number;
  unit: string;
  lastRestocked?: string;
  isCritical: boolean;
}

export interface CleaningHubMetrics {
  servicesByHour: { hour: string; scheduled: number; completed: number }[];
  profitByClient: { client: string; revenue: number; cost: number; margin: number }[];
  hoursByWorker: { worker: string; hours: number; services: number }[];
  weeklyTrend: { day: string; services: number; completed: number; incidents: number }[];
}

// ─── API Requests ────────────────────────────────────────────────────────────

export async function fetchCleaningHubKpis(userId: string): Promise<CleaningHubKpis> {
  const id = normalizeUserId(userId);
  const payload = await request<{ ok: boolean; data: CleaningHubKpis }>(
    `/api/cleaning/hub/kpis/${encodeURIComponent(id)}`,
  );
  return payload.data;
}

export async function fetchCleaningHubToday(userId: string): Promise<CleaningHubService[]> {
  const id = normalizeUserId(userId);
  const payload = await request<{ ok: boolean; services: CleaningHubService[] }>(
    `/api/cleaning/hub/today/${encodeURIComponent(id)}`,
  );
  return payload.services || [];
}

export async function fetchCleaningHubAlerts(userId: string): Promise<CleaningHubAlert[]> {
  const id = normalizeUserId(userId);
  const payload = await request<{ ok: boolean; alerts: CleaningHubAlert[] }>(
    `/api/cleaning/hub/alerts/${encodeURIComponent(id)}`,
  );
  return payload.alerts || [];
}

export async function fetchCleaningHubWorkers(userId: string): Promise<CleaningHubWorker[]> {
  const id = normalizeUserId(userId);
  const payload = await request<{ ok: boolean; workers: CleaningHubWorker[] }>(
    `/api/cleaning/hub/workers/${encodeURIComponent(id)}`,
  );
  return payload.workers || [];
}

export async function fetchCleaningHubMaterials(userId: string): Promise<CleaningMaterial[]> {
  const id = normalizeUserId(userId);
  const payload = await request<{ ok: boolean; materials: CleaningMaterial[] }>(
    `/api/cleaning/hub/materials/${encodeURIComponent(id)}`,
  );
  return payload.materials || [];
}

export async function fetchCleaningHubMetrics(userId: string): Promise<CleaningHubMetrics> {
  const id = normalizeUserId(userId);
  const payload = await request<{ ok: boolean; data: CleaningHubMetrics }>(
    `/api/cleaning/hub/metrics/${encodeURIComponent(id)}`,
  );
  return payload.data;
}

export type { CleaningService, CleaningServiceStatus, CleaningIncident };
