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
    throw new Error(payload?.error || 'Error inesperado en cleaning API');
  }
  return payload;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type CleaningServiceStatus = 'pending' | 'assigned' | 'in_progress' | 'completed' | 'cancelled';

export type ExecutionStatus = 'not_started' | 'checked_in' | 'in_progress' | 'paused' | 'completed' | 'validated';

export type ExecIncidentSeverity = 'low' | 'medium' | 'high' | 'critical';
export type ExecIncidentType =
  | 'material_missing'
  | 'access_denied'
  | 'damage_found'
  | 'client_absent'
  | 'equipment_failure'
  | 'safety_hazard'
  | 'scope_change'
  | 'other';

export interface GeoPoint {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

export interface ExecPhoto {
  url: string;
  timestamp: string;
  geo?: GeoPoint | null;
}

export interface ExecIncident {
  id: string;
  type: ExecIncidentType;
  severity: ExecIncidentSeverity;
  description: string;
  photoUrl: string;
  timestamp: string;
  resolvedAt: string;
  resolvedBy: string;
  resolutionNotes: string;
}

export interface PauseEntry {
  startAt: string;
  endAt: string;
  reason: string;
}

export interface ServiceExecution {
  checkInAt: string;
  checkInGeo: GeoPoint | null;
  checkOutAt: string;
  checkOutGeo: GeoPoint | null;
  realMinutes: number;
  plannedMinutes: number;
  deviationMinutes: number;
  status: ExecutionStatus;
  workerNotes: string;
  photosBefore: ExecPhoto[];
  photosAfter: ExecPhoto[];
  incidents: ExecIncident[];
  pauseLog: PauseEntry[];
  validatedBy: string;
  validatedAt: string;
  validationNotes: string;
}

export interface CleaningTask {
  id: string;
  label: string;
  done: boolean;
}

export interface CleaningService {
  _id: string;
  _rev?: string;
  type: 'cleaning_service';
  id: string;
  serviceNumber: string;
  user_id: string;
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  address: string;
  clientType: string;
  date: string;
  time: string;
  duration: string;
  cleaningType: string;
  workerId: string;
  assignedTo: string;
  assignedToName: string;
  status: CleaningServiceStatus;
  priority: ServicePriority;
  recurrence: Recurrence;
  zone: string;
  routeId: string;
  recurrenceParentId: string;
  tasks: CleaningTask[];
  execution: ServiceExecution;
  checkInAt: string;
  checkOutAt: string;
  employeeNotes: string;
  photosBefore: string[];
  photosAfter: string[];
  qualityOk: boolean | null;
  qualityRating: number;
  qualityNotes: string;
  clientRating: number;
  clientReview: string;
  clientReviewAt: string;
  price: number;
  invoiceId: string;
  contractId: string;
  contractNumber: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export type AlertType = 'NO_CHECKIN' | 'INCOMPLETE_SERVICE' | 'LATE_START' | 'CHECKOUT_NO_CHECKIN' | 'OVERTIME' | 'UNRESOLVED_INCIDENT' | 'NO_PHOTOS';
export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface ExecutionAlert {
  type: AlertType;
  severity: AlertSeverity;
  serviceId: string;
  serviceNumber: string;
  workerName: string;
  message: string;
}

export interface ExecutionSummary {
  totalServices: number;
  completed: number;
  validated: number;
  pending: number;
  inProgress: number;
  withIncidents: number;
  totalPlannedMinutes: number;
  totalRealMinutes: number;
  deviationMinutes: number;
  avgCompletionRate: number;
  alerts: ExecutionAlert[];
  byWorker: {
    memberId: string;
    memberName: string;
    services: number;
    realMinutes: number;
    plannedMinutes: number;
    incidents: number;
  }[];
}

// ─── Cleaning Services API ────────────────────────────────────────────────────

export async function listCleaningServicesRequest(userId: string): Promise<CleaningService[]> {
  const id = normalizeUserId(userId);
  const payload = await request<{ ok: boolean; services: CleaningService[] }>(
    '/api/cleaning/services/' + encodeURIComponent(id),
  );
  return payload.services || [];
}

export async function createCleaningServiceRequest(userId: string, data: Partial<CleaningService>): Promise<CleaningService> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; service: CleaningService }>(
    '/api/cleaning/services/' + encodeURIComponent(id),
    { method: 'POST', body: JSON.stringify({ service: data }) },
  );
  if (!result.service) throw new Error('Respuesta inválida del servidor');
  return result.service;
}

export async function updateCleaningServiceRequest(userId: string, service: CleaningService): Promise<CleaningService> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; service: CleaningService }>(
    '/api/cleaning/services/' + encodeURIComponent(id) + '/' + encodeURIComponent(service._id),
    { method: 'PUT', body: JSON.stringify({ service }) },
  );
  if (!result.service) throw new Error('Respuesta inválida del servidor');
  return result.service;
}

export async function deleteCleaningServiceRequest(userId: string, serviceId: string): Promise<void> {
  const id = normalizeUserId(userId);
  await request(
    '/api/cleaning/services/' + encodeURIComponent(id) + '/' + encodeURIComponent(serviceId),
    { method: 'DELETE' },
  );
}

// ─── Execution API ───────────────────────────────────────────────────────────

function execPath(userId: string, serviceId: string) {
  const id = normalizeUserId(userId);
  return '/api/cleaning/services/' + encodeURIComponent(id) + '/' + encodeURIComponent(serviceId);
}

export async function checkInServiceRequest(
  userId: string,
  serviceId: string,
  geo?: GeoPoint | null,
): Promise<CleaningService> {
  const result = await request<{ ok: boolean; service: CleaningService }>(
    execPath(userId, serviceId) + '/check-in',
    { method: 'POST', body: JSON.stringify({ geo: geo || null }) },
  );
  if (!result.service) throw new Error('Respuesta inválida del servidor');
  return result.service;
}

export async function checkOutServiceRequest(
  userId: string,
  serviceId: string,
  data: { geo?: GeoPoint | null; workerNotes?: string },
): Promise<CleaningService> {
  const result = await request<{ ok: boolean; service: CleaningService }>(
    execPath(userId, serviceId) + '/check-out',
    { method: 'POST', body: JSON.stringify(data) },
  );
  if (!result.service) throw new Error('Respuesta inválida del servidor');
  return result.service;
}

export async function pauseServiceRequest(
  userId: string,
  serviceId: string,
  reason?: string,
): Promise<CleaningService> {
  const result = await request<{ ok: boolean; service: CleaningService }>(
    execPath(userId, serviceId) + '/pause',
    { method: 'POST', body: JSON.stringify({ reason: reason || '' }) },
  );
  if (!result.service) throw new Error('Respuesta inválida del servidor');
  return result.service;
}

export async function resumeServiceRequest(
  userId: string,
  serviceId: string,
): Promise<CleaningService> {
  const result = await request<{ ok: boolean; service: CleaningService }>(
    execPath(userId, serviceId) + '/resume',
    { method: 'POST' },
  );
  if (!result.service) throw new Error('Respuesta inválida del servidor');
  return result.service;
}

export async function reportExecIncidentRequest(
  userId: string,
  serviceId: string,
  incident: Omit<ExecIncident, 'id' | 'timestamp' | 'resolvedAt' | 'resolvedBy' | 'resolutionNotes'>,
): Promise<CleaningService> {
  const result = await request<{ ok: boolean; service: CleaningService }>(
    execPath(userId, serviceId) + '/incident',
    { method: 'POST', body: JSON.stringify({ incident }) },
  );
  if (!result.service) throw new Error('Respuesta inválida del servidor');
  return result.service;
}

export async function resolveExecIncidentRequest(
  userId: string,
  serviceId: string,
  incidentId: string,
  resolution: { resolvedBy: string; resolutionNotes: string },
): Promise<CleaningService> {
  const result = await request<{ ok: boolean; service: CleaningService }>(
    execPath(userId, serviceId) + '/incident/' + encodeURIComponent(incidentId),
    { method: 'PUT', body: JSON.stringify(resolution) },
  );
  if (!result.service) throw new Error('Respuesta inválida del servidor');
  return result.service;
}

export async function uploadServicePhotoRequest(
  userId: string,
  serviceId: string,
  data: { phase: 'before' | 'after'; url: string; geo?: GeoPoint | null },
): Promise<CleaningService> {
  const result = await request<{ ok: boolean; service: CleaningService }>(
    execPath(userId, serviceId) + '/photo',
    { method: 'POST', body: JSON.stringify(data) },
  );
  if (!result.service) throw new Error('Respuesta inválida del servidor');
  return result.service;
}

export async function uploadServicePhotoFileRequest(
  userId: string,
  serviceId: string,
  file: File,
  phase: 'before' | 'after',
  geo?: GeoPoint | null,
): Promise<CleaningService> {
  const id = normalizeUserId(userId);
  const formData = new FormData();
  formData.append('file', file);
  formData.append('phase', phase);
  if (geo) formData.append('geo', JSON.stringify(geo));
  const path = '/api/cleaning/services/' + encodeURIComponent(id) + '/' + encodeURIComponent(serviceId) + '/photo';
  const response = await fetch(API_BASE + path, {
    method: 'POST',
    headers: { ...getAuthHeaders(), ...getCouchHeaders() },
    body: formData,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || 'Error al subir foto');
  return payload.service;
}

export async function validateExecutionRequest(
  userId: string,
  serviceId: string,
  data: { validatedBy: string; validationNotes?: string },
): Promise<CleaningService> {
  const result = await request<{ ok: boolean; service: CleaningService }>(
    execPath(userId, serviceId) + '/validate',
    { method: 'PUT', body: JSON.stringify(data) },
  );
  if (!result.service) throw new Error('Respuesta inválida del servidor');
  return result.service;
}

export async function fetchExecutionSummaryRequest(
  userId: string,
  params?: { date?: string; from?: string; to?: string },
): Promise<ExecutionSummary> {
  const id = normalizeUserId(userId);
  const qs = new URLSearchParams();
  if (params?.date) qs.set('date', params.date);
  if (params?.from) qs.set('from', params.from);
  if (params?.to) qs.set('to', params.to);
  const query = qs.toString() ? '?' + qs.toString() : '';
  const result = await request<{ ok: boolean; summary: ExecutionSummary }>(
    '/api/cleaning/services/' + encodeURIComponent(id) + '/execution-summary' + query,
  );
  return result.summary;
}

// ─── Incident Types ──────────────────────────────────────────────────────────

export type IncidentType = 'falta_limpieza' | 'rotura' | 'ausencia' | 'queja_cliente' | 'urgencia_extra' | 'material_faltante' | 'acceso_no_permitido';
export type IncidentStatus = 'open' | 'in_progress' | 'resolved' | 'closed' | 'reopened';
export type IncidentPriority = 'low' | 'medium' | 'high' | 'critical';

export interface IncidentStatusHistoryEntry {
  date: string;
  from: string;
  to: string;
  user: string;
  notes: string;
}

export interface CleaningIncident {
  _id: string;
  _rev?: string;
  type: 'cleaning_incident';
  user_id: string;
  incidentNumber: string;
  incidentType: IncidentType;
  clientId: string;
  clientName: string;
  serviceId: string;
  serviceNumber: string;
  date: string;
  workerId: string;
  workerName: string;
  priority: IncidentPriority;
  description: string;
  photos: string[];
  status: IncidentStatus;
  responsibleId: string;
  responsibleName: string;
  resolution: string;
  resolvedAt: string;
  resolvedBy: string;
  dueDate: string;
  reopenCount: number;
  statusHistory: IncidentStatusHistoryEntry[];
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

// ─── Cleaning Incidents API ──────────────────────────────────────────────────

export async function listCleaningIncidentsRequest(userId: string): Promise<CleaningIncident[]> {
  const id = normalizeUserId(userId);
  const payload = await request<{ ok: boolean; incidents: CleaningIncident[] }>(
    '/api/cleaning/incidents/' + encodeURIComponent(id),
  );
  return payload.incidents || [];
}

export async function createCleaningIncidentRequest(userId: string, data: Partial<CleaningIncident>): Promise<CleaningIncident> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; incident: CleaningIncident }>(
    '/api/cleaning/incidents/' + encodeURIComponent(id),
    { method: 'POST', body: JSON.stringify({ incident: data }) },
  );
  if (!result.incident) throw new Error('Respuesta inválida del servidor');
  return result.incident;
}

export async function updateCleaningIncidentRequest(userId: string, incident: CleaningIncident): Promise<CleaningIncident> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; incident: CleaningIncident }>(
    '/api/cleaning/incidents/' + encodeURIComponent(id) + '/' + encodeURIComponent(incident._id),
    { method: 'PUT', body: JSON.stringify({ incident }) },
  );
  if (!result.incident) throw new Error('Respuesta inválida del servidor');
  return result.incident;
}

export async function deleteCleaningIncidentRequest(userId: string, incidentId: string): Promise<void> {
  const id = normalizeUserId(userId);
  await request(
    '/api/cleaning/incidents/' + encodeURIComponent(id) + '/' + encodeURIComponent(incidentId),
    { method: 'DELETE' },
  );
}

// ─── Cleaning Routes Types ──────────────────────────────────────────────────

export type CleaningRouteStatus = 'draft' | 'active' | 'completed' | 'cancelled';
export type RouteEntryStatus = 'pending' | 'in_transit' | 'in_progress' | 'completed' | 'skipped';
export type ServicePriority = 'normal' | 'urgent';
export type RecurrenceType = 'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly';

export interface Recurrence {
  type: RecurrenceType;
  days: number[];
  endDate: string;
}

export interface RouteEntry {
  serviceId: string;
  order: number;
  estimatedStartTime: string;
  estimatedEndTime: string;
  actualStartTime: string;
  actualEndTime: string;
  status: RouteEntryStatus;
  travelTimeMin: number;
  clientName: string;
  address: string;
  cleaningType: string;
  duration: string;
  priority: ServicePriority;
  zone: string;
  overlap: boolean;
}

export interface CleaningRoute {
  _id: string;
  _rev?: string;
  type: 'cleaning_route';
  id: string;
  user_id: string;
  date: string;
  workerId: string;
  workerName: string;
  status: CleaningRouteStatus;
  entries: RouteEntry[];
  zone: string;
  totalEstimatedMinutes: number;
  totalActualMinutes: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface GenerateRoutesResult {
  ok: boolean;
  routes: CleaningRoute[];
  warnings: { type: string; serviceId?: string; routeWorker?: string; message: string }[];
  expandedServices: number;
}

// ─── Cleaning Routes API ────────────────────────────────────────────────────

export async function listCleaningRoutesRequest(userId: string, params?: { date?: string; workerId?: string }): Promise<CleaningRoute[]> {
  const id = normalizeUserId(userId);
  const qs = new URLSearchParams();
  if (params?.date) qs.set('date', params.date);
  if (params?.workerId) qs.set('workerId', params.workerId);
  const query = qs.toString() ? '?' + qs.toString() : '';
  const payload = await request<{ ok: boolean; routes: CleaningRoute[] }>(
    '/api/cleaning/routes/' + encodeURIComponent(id) + query,
  );
  return payload.routes || [];
}

export async function createCleaningRouteRequest(userId: string, data: Partial<CleaningRoute>): Promise<CleaningRoute> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; route: CleaningRoute }>(
    '/api/cleaning/routes/' + encodeURIComponent(id),
    { method: 'POST', body: JSON.stringify({ route: data }) },
  );
  if (!result.route) throw new Error('Respuesta invalida del servidor');
  return result.route;
}

export async function updateCleaningRouteRequest(userId: string, route: CleaningRoute): Promise<CleaningRoute> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; route: CleaningRoute }>(
    '/api/cleaning/routes/' + encodeURIComponent(id) + '/' + encodeURIComponent(route._id),
    { method: 'PUT', body: JSON.stringify({ route }) },
  );
  if (!result.route) throw new Error('Respuesta invalida del servidor');
  return result.route;
}

export async function reorderCleaningRouteRequest(userId: string, routeId: string, entryOrder: string[]): Promise<CleaningRoute> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; route: CleaningRoute }>(
    '/api/cleaning/routes/' + encodeURIComponent(id) + '/' + encodeURIComponent(routeId) + '/reorder',
    { method: 'PATCH', body: JSON.stringify({ entryOrder }) },
  );
  if (!result.route) throw new Error('Respuesta invalida del servidor');
  return result.route;
}

export async function reassignCleaningRouteRequest(userId: string, routeId: string, newWorkerId: string, newWorkerName: string): Promise<CleaningRoute> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; route: CleaningRoute }>(
    '/api/cleaning/routes/' + encodeURIComponent(id) + '/' + encodeURIComponent(routeId) + '/reassign',
    { method: 'PATCH', body: JSON.stringify({ newWorkerId, newWorkerName }) },
  );
  if (!result.route) throw new Error('Respuesta invalida del servidor');
  return result.route;
}

export async function deleteCleaningRouteRequest(userId: string, routeId: string): Promise<void> {
  const id = normalizeUserId(userId);
  await request(
    '/api/cleaning/routes/' + encodeURIComponent(id) + '/' + encodeURIComponent(routeId),
    { method: 'DELETE' },
  );
}

export async function generateCleaningRoutesRequest(userId: string, date: string): Promise<GenerateRoutesResult> {
  const id = normalizeUserId(userId);
  const result = await request<GenerateRoutesResult>(
    '/api/cleaning/routes/' + encodeURIComponent(id) + '/generate',
    { method: 'POST', body: JSON.stringify({ date }) },
  );
  return result;
}
