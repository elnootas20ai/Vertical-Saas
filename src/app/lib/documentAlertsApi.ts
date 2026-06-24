import { authFetch, getAuthHeaders } from './authApi';
import { getApiBase } from './apiBase';
import type { AlertPriority, AlertRecord, AlertSource, AlertSummary } from './alertCenterApi';

export interface DocumentAlert {
  type: string;
  severity: string;
  message: string;
  documentId?: string;
  documentName?: string;
  vehicleId?: string;
  registrationPlate?: string;
  actionUrl?: string;
  missingDocs?: string[];
  category?: string;
}

const DOC_TYPE_TITLES: Record<string, string> = {
  expired: 'Documento caducado',
  expiring_soon: 'Documento por vencer',
  itv_expired: 'ITV caducada',
  itv_expiring: 'ITV por vencer',
  missing_vehicle_docs: 'Documentación de vehículo incompleta',
  missing_required: 'Documento obligatorio faltante',
  document_missing_required: 'Documento obligatorio faltante',
  contract_pending_sign: 'Contrato pendiente de firma',
  stale_pending: 'Documento pendiente demasiado tiempo',
  ocr_incomplete: 'OCR con baja confianza',
  scrapyard_missing_docs: 'Documentación desguace incompleta',
  scrapyard_pending_deregistration: 'Baja pendiente en desguace',
};

const SEVERITY_TO_PRIORITY: Record<string, AlertPriority> = {
  critical: 'high',
  alert: 'high',
  warning: 'medium',
  info: 'low',
};

function docAlertId(alert: DocumentAlert): string {
  const key = [
    alert.type,
    alert.documentId || '',
    alert.vehicleId || '',
    alert.registrationPlate || '',
    alert.documentName || '',
    alert.message.slice(0, 60),
  ].join(':');
  return `doc:${key}`;
}

export function isSyntheticDocumentAlert(alertId: string): boolean {
  return String(alertId || '').startsWith('doc:');
}

const DISMISSED_DOC_ALERTS_PREFIX = 'vertial_dismissed_doc_alerts:';
const DISMISSED_DOC_ALERTS_MAX = 500;

function dismissedDocAlertsStorageKey(userId: string, businessId: string): string {
  return `${DISMISSED_DOC_ALERTS_PREFIX}${userId}:${businessId}`;
}

function readDismissedDocAlertIds(userId: string, businessId: string): Set<string> {
  if (typeof localStorage === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(dismissedDocAlertsStorageKey(userId, businessId));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return new Set();
  }
}

function writeDismissedDocAlertIds(userId: string, businessId: string, ids: Set<string>): void {
  if (typeof localStorage === 'undefined') return;
  const list = [...ids].slice(-DISMISSED_DOC_ALERTS_MAX);
  localStorage.setItem(dismissedDocAlertsStorageKey(userId, businessId), JSON.stringify(list));
}

/** Persiste el archivado de alertas de documentación (no existen en CouchDB). */
export function dismissDocumentAlert(userId: string, businessId: string, alertId: string): void {
  const uid = String(userId || '').trim();
  const biz = String(businessId || '').trim();
  const id = String(alertId || '').trim();
  if (!uid || !biz || !id || !isSyntheticDocumentAlert(id)) return;
  const ids = readDismissedDocAlertIds(uid, biz);
  ids.add(id);
  writeDismissedDocAlertIds(uid, biz, ids);
}

export function dismissDocumentAlerts(userId: string, businessId: string, alertIds: string[]): void {
  for (const alertId of alertIds) {
    dismissDocumentAlert(userId, businessId, alertId);
  }
}

export function filterDismissedDocumentAlerts(
  alerts: AlertRecord[],
  userId: string,
  businessId: string,
): AlertRecord[] {
  const dismissed = readDismissedDocAlertIds(userId, businessId);
  if (dismissed.size === 0) return alerts;
  return alerts.filter((alert) => !dismissed.has(alert.id));
}

export function documentAlertToRecord(
  alert: DocumentAlert,
  userId: string,
  businessId: string,
): AlertRecord {
  const priority = SEVERITY_TO_PRIORITY[alert.severity] || 'medium';
  const now = new Date().toISOString();
  return {
    id: docAlertId(alert),
    user_id: userId,
    level: alert.severity,
    category: alert.type,
    title: DOC_TYPE_TITLES[alert.type] || 'Alerta de documentación',
    message: alert.message,
    entityId: alert.documentId || alert.vehicleId,
    entityType: alert.vehicleId ? 'vehicle' : 'document',
    route: alert.actionUrl,
    metadata: {
      documentId: alert.documentId,
      vehicleId: alert.vehicleId,
      category: alert.category,
      missingDocs: alert.missingDocs,
      synthetic: true,
    },
    read: false,
    priority,
    status: 'new',
    businessId,
    source: 'documentacion' as AlertSource,
    channels: ['in_app'],
    assignedTo: { userIds: [], roles: [] },
    resolvedAt: null,
    resolvedBy: null,
    seenAt: null,
    seenBy: null,
    deletedBy: null,
    statusHistory: [],
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

export async function fetchDocumentAlerts(userId: string): Promise<DocumentAlert[]> {
  const id = String(userId || '').trim();
  if (!id) return [];
  try {
    const res = await authFetch(`${getApiBase()}/api/documents/${encodeURIComponent(id)}/alerts`, {
      headers: { ...getAuthHeaders() },
    });
    const data = await res.json();
    if (!data.ok) return [];
    return Array.isArray(data.alerts) ? data.alerts : [];
  } catch {
    return [];
  }
}

export async function fetchDocumentAlertsAsRecords(
  userId: string,
  businessId: string,
): Promise<AlertRecord[]> {
  const raw = await fetchDocumentAlerts(userId);
  const records = raw.map((alert) => documentAlertToRecord(alert, userId, businessId));
  return filterDismissedDocumentAlerts(records, userId, businessId);
}

const PRIORITY_RANK: Record<AlertPriority, number> = { high: 0, medium: 1, low: 2 };

export function mergeAlertLists(
  globalAlerts: AlertRecord[],
  documentAlerts: AlertRecord[],
  limit?: number,
): AlertRecord[] {
  const seen = new Set<string>();
  const merged = [...globalAlerts, ...documentAlerts]
    .filter((alert) => {
      if (seen.has(alert.id)) return false;
      seen.add(alert.id);
      return true;
    })
    .sort((a, b) => {
    const pr = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (pr !== 0) return pr;
    return String(b.createdAt).localeCompare(String(a.createdAt));
  });
  return limit ? merged.slice(0, limit) : merged;
}

export function mergeDocumentAlertsIntoSummary(
  summary: AlertSummary,
  documentAlerts: AlertRecord[],
): AlertSummary {
  if (documentAlerts.length === 0) return summary;

  const next = {
    ...summary,
    byPriority: { ...summary.byPriority },
    byStatus: { ...summary.byStatus },
    bySource: { ...summary.bySource },
  };

  for (const alert of documentAlerts) {
    next.byPriority[alert.priority] = (next.byPriority[alert.priority] || 0) + 1;
    next.byStatus.new = (next.byStatus.new || 0) + 1;
    next.bySource.documentacion = (next.bySource.documentacion || 0) + 1;
    next.unresolved += 1;
    next.total += 1;
  }

  return next;
}

/** Incluye alertas de documentación si el filtro de departamento lo permite. */
export function shouldIncludeDocumentAlerts(sourceFilter?: string): boolean {
  if (!sourceFilter) return true;
  const parts = sourceFilter.split(',').map((s) => s.trim());
  return parts.includes('documentacion');
}
