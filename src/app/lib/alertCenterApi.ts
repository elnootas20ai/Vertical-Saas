import { authFetch, getAuthHeaders } from './authApi';
import { getApiBase } from './apiBase';

// ─── Types ───────────────────────────────────────────────────────────────────

export type AlertPriority = 'high' | 'medium' | 'low';
export type AlertStatus = 'new' | 'seen' | 'resolved';
export type AlertSource =
  | 'finanzas' | 'stock' | 'equipo' | 'documentacion'
  | 'verticales' | 'ocr' | 'conciliacion' | 'crm' | 'taller' | 'sistema';

export interface AlertRecord {
  id: string;
  _rev?: string;
  user_id: string;
  level: string;
  category: string;
  title: string;
  message: string;
  entityId?: string;
  entityType?: string;
  route?: string;
  metadata?: Record<string, unknown>;
  read: boolean;
  priority: AlertPriority;
  status: AlertStatus;
  businessId: string;
  source: AlertSource;
  channels: string[];
  assignedTo: { userIds: string[]; roles: string[] };
  resolvedAt: string | null;
  resolvedBy: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface AlertSummary {
  total: number;
  byPriority: Record<AlertPriority, number>;
  byStatus: Record<AlertStatus, number>;
  bySource: Partial<Record<AlertSource, number>>;
  unresolved: number;
  lastAlertAt: string | null;
}

export interface AlertsPagination {
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface ListAlertsFilters {
  status?: string;
  priority?: string;
  source?: string;
  assignedTo?: string;
  search?: string;
  sort?: string;
  order?: 'asc' | 'desc';
  page?: number;
  limit?: number;
  from?: string;
  to?: string;
}

// ─── API helpers ─────────────────────────────────────────────────────────────

const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};


function getCouchHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  return headers;
}

const API_BASE = getApiBase();

async function request<T = Record<string, unknown>>(path: string, init?: RequestInit): Promise<T & { ok: boolean; error?: string }> {
  const response = await authFetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
      ...getCouchHeaders(),
      ...(init?.headers || {}),
    },
    credentials: 'include',
    ...init,
  });

  const payload = await response.json().catch(() => ({ ok: false, error: 'Respuesta inválida' }));

  if (response.status === 401) {
    throw new Error('Sesión expirada. Por favor, inicia sesión de nuevo.');
  }

  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || 'Error inesperado');
  }

  return payload;
}

// ─── Alert Center API ────────────────────────────────────────────────────────

export async function fetchAlerts(businessId: string, filters: ListAlertsFilters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value));
    }
  });

  const qs = params.toString();
  const path = `/api/alerts/${encodeURIComponent(businessId)}/center${qs ? `?${qs}` : ''}`;

  return request<{ alerts: AlertRecord[]; pagination: AlertsPagination }>(path);
}

export async function fetchAlertSummary(businessId: string) {
  return request<{ summary: AlertSummary }>(
    `/api/alerts/${encodeURIComponent(businessId)}/summary`,
  );
}

export async function updateAlertStatus(businessId: string, alertId: string, status: AlertStatus) {
  return request<{ alert: AlertRecord }>(
    `/api/alerts/${encodeURIComponent(businessId)}/${encodeURIComponent(alertId)}/status`,
    { method: 'PUT', body: JSON.stringify({ status }) },
  );
}

export async function bulkUpdateAlertStatus(businessId: string, alertIds: string[], status: AlertStatus) {
  return request<{ updated: number; errors: number }>(
    `/api/alerts/${encodeURIComponent(businessId)}/bulk-status`,
    { method: 'PUT', body: JSON.stringify({ alertIds, status }) },
  );
}

export async function assignAlert(businessId: string, alertId: string, assignment: { userIds?: string[]; roles?: string[] }) {
  return request<{ alert: AlertRecord }>(
    `/api/alerts/${encodeURIComponent(businessId)}/${encodeURIComponent(alertId)}/assign`,
    { method: 'PUT', body: JSON.stringify(assignment) },
  );
}

export async function deleteAlert(businessId: string, alertId: string) {
  return request(
    `/api/alerts/${encodeURIComponent(businessId)}/${encodeURIComponent(alertId)}`,
    { method: 'DELETE' },
  );
}

// ─── Source display helpers ──────────────────────────────────────────────────

export const SOURCE_LABELS: Record<AlertSource, string> = {
  finanzas: 'Finanzas',
  stock: 'Stock',
  equipo: 'Equipo',
  documentacion: 'Documentación',
  verticales: 'Operaciones',
  ocr: 'OCR',
  conciliacion: 'Conciliación',
  crm: 'CRM',
  taller: 'Taller',
  sistema: 'Sistema',
};

export const SOURCE_COLORS: Record<AlertSource, string> = {
  finanzas: '#10B981',
  stock: '#F59E0B',
  equipo: '#6366F1',
  documentacion: '#8B5CF6',
  verticales: '#3B82F6',
  ocr: '#EC4899',
  conciliacion: '#14B8A6',
  crm: '#F97316',
  taller: '#64748B',
  sistema: '#6B7280',
};

export const PRIORITY_LABELS: Record<AlertPriority, string> = {
  high: 'Alta',
  medium: 'Media',
  low: 'Baja',
};

export const STATUS_LABELS: Record<AlertStatus, string> = {
  new: 'Nueva',
  seen: 'Vista',
  resolved: 'Resuelta',
};
