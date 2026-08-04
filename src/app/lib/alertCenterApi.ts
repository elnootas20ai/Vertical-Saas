import { authFetch, getAuthHeaders } from './authApi';
import { getApiBase } from './apiBase';

// ─── Types ───────────────────────────────────────────────────────────────────

export type AlertPriority = 'high' | 'medium' | 'low';
export type AlertStatus = 'new' | 'seen' | 'resolved';

export type AlertHistoryAction = 'created' | 'status_change' | 'assigned' | 'deleted';

export interface AlertHistoryEntry {
  action: AlertHistoryAction;
  at: string;
  by: string | null;
  status?: AlertStatus;
  from?: AlertStatus;
  to?: AlertStatus;
  meta?: Record<string, unknown>;
}

export type AlertSource =
  | 'finanzas' | 'stock' | 'equipo' | 'documentacion'
  | 'verticales' | 'delivery' | 'construccion' | 'limpieza'
  | 'ocr' | 'conciliacion' | 'crm' | 'taller' | 'carniceria'
  | 'compraventa' | 'adquisiciones' | 'desguaces' | 'sistema';

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
  seenAt: string | null;
  seenBy: string | null;
  deletedBy: string | null;
  statusHistory: AlertHistoryEntry[];
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
  historyTotal?: number;
}

const EMPTY_ALERT_SUMMARY: AlertSummary = {
  total: 0,
  byPriority: { high: 0, medium: 0, low: 0 },
  byStatus: { new: 0, seen: 0, resolved: 0 },
  bySource: {},
  unresolved: 0,
  lastAlertAt: null,
  historyTotal: 0,
};

/** Normaliza respuestas legacy o parciales del backend. */
export function normalizeAlertSummary(raw: Partial<AlertSummary> | null | undefined): AlertSummary {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_ALERT_SUMMARY };
  const byPriority = raw.byPriority || {};
  const byStatus = raw.byStatus || {};
  return {
    total: Number(raw.total) || 0,
    byPriority: {
      high: Number(byPriority.high) || 0,
      medium: Number(byPriority.medium) || 0,
      low: Number(byPriority.low) || 0,
    },
    byStatus: {
      new: Number(byStatus.new) || 0,
      seen: Number(byStatus.seen) || 0,
      resolved: Number(byStatus.resolved) || 0,
    },
    bySource: raw.bySource && typeof raw.bySource === 'object' ? raw.bySource : {},
    unresolved: Number(raw.unresolved) || 0,
    lastAlertAt: raw.lastAlertAt ?? null,
    historyTotal: Number(raw.historyTotal) || 0,
  };
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
  includeDeleted?: boolean | string;
  historyOnly?: boolean | string;
}

export interface AlertHistoryFilters extends ListAlertsFilters {
  includeDeleted?: boolean;
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

export async function fetchAlertHistory(businessId: string, filters: AlertHistoryFilters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value));
    }
  });

  const qs = params.toString();
  const path = `/api/alerts/${encodeURIComponent(businessId)}/history${qs ? `?${qs}` : ''}`;

  return request<{ alerts: AlertRecord[]; pagination: AlertsPagination }>(path);
}

export async function fetchAlertTimeline(businessId: string, alertId: string) {
  return request<{ alert: AlertRecord; timeline: AlertHistoryEntry[] }>(
    `/api/alerts/${encodeURIComponent(businessId)}/${encodeURIComponent(alertId)}/timeline`,
  );
}

export async function fetchAlertSummary(businessId: string) {
  const res = await request<{ summary: AlertSummary }>(
    `/api/alerts/${encodeURIComponent(businessId)}/summary`,
  );
  return { ...res, summary: normalizeAlertSummary(res.summary) };
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

/** Resuelve todas las alertas pendientes del negocio (bandeja). */
export async function resolveAllUnresolvedAlerts(businessId: string) {
  return request<{ updated: number; errors: number; message?: string }>(
    `/api/alerts/${encodeURIComponent(businessId)}/resolve-all`,
    { method: 'POST', body: JSON.stringify({}) },
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

/** Dispara el motor de alertas (OP, finanzas, delivery, RRHH…) */
export async function triggerAlertEngineCheck(userId: string) {
  return request<{ message?: string }>(
    `/api/alerts/${encodeURIComponent(userId)}/check`,
    { method: 'POST' },
  );
}

// ─── Source display helpers ──────────────────────────────────────────────────

export const SOURCE_LABELS: Record<AlertSource, string> = {
  finanzas: 'Finanzas',
  stock: 'Stock',
  equipo: 'RRHH',
  documentacion: 'Documentación',
  verticales: 'Operaciones',
  delivery: 'Delivery',
  construccion: 'Construcción',
  limpieza: 'Limpieza',
  ocr: 'OCR',
  conciliacion: 'Conciliación',
  crm: 'CRM',
  taller: 'Taller',
  carniceria: 'Carnicería',
  compraventa: 'Compraventa',
  adquisiciones: 'Adquisiciones',
  desguaces: 'Desguace',
  sistema: 'Sistema',
};

export const SOURCE_COLORS: Record<AlertSource, string> = {
  finanzas: '#10B981',
  stock: '#F59E0B',
  equipo: '#6366F1',
  documentacion: '#8B5CF6',
  verticales: '#3B82F6',
  delivery: '#EF4444',
  construccion: '#F97316',
  limpieza: '#06B6D4',
  ocr: '#EC4899',
  conciliacion: '#14B8A6',
  crm: '#F97316',
  taller: '#64748B',
  carniceria: '#DC2626',
  compraventa: '#2563EB',
  adquisiciones: '#7C3AED',
  desguaces: '#475569',
  sistema: '#6B7280',
};

/** @deprecated Usar getAlertDepartmentsForVertical / useAlertDepartments */
export type CeoAlertDepartment = import('./alertDepartments').BusinessAlertDepartment;

import {
  CEO_ALERT_DEPARTMENTS,
  getAlertDepartmentsForVertical,
  departmentSourceFilter,
  isDepartmentVisibleForVertical,
} from './alertDepartments';

export {
  CEO_ALERT_DEPARTMENTS,
  getAlertDepartmentsForVertical,
  departmentSourceFilter,
  isDepartmentVisibleForVertical,
};

export function countAlertsForDepartment(
  summary: AlertSummary | null,
  deptId: string,
  vertical?: string | null,
): number {
  if (!summary) return 0;
  if (deptId === 'all') return summary.unresolved;
  const dept = getAlertDepartmentsForVertical(vertical).find((d) => d.id === deptId);
  if (!dept || dept.sources.length === 0) return summary.unresolved;
  return dept.sources.reduce((sum, src) => sum + (summary.bySource[src] || 0), 0);
}

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

export const HISTORY_ACTION_LABELS: Record<AlertHistoryAction, string> = {
  created: 'Creada',
  status_change: 'Cambio de estado',
  assigned: 'Asignada',
  deleted: 'Eliminada',
};

export function formatHistoryEntry(entry: AlertHistoryEntry): string {
  switch (entry.action) {
    case 'created':
      return 'Alerta generada';
    case 'status_change':
      if (entry.from && entry.to) {
        return `${STATUS_LABELS[entry.from]} → ${STATUS_LABELS[entry.to]}`;
      }
      return entry.to ? `Marcada como ${STATUS_LABELS[entry.to]}` : 'Estado actualizado';
    case 'assigned':
      return 'Asignación actualizada';
    case 'deleted':
      return 'Eliminada del centro activo';
    default:
      return 'Evento registrado';
  }
}
