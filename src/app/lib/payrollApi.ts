import { v4 as uuidv4 } from 'uuid';
import { authFetch, getAuthHeaders } from './authApi';
import { getApiBase } from './apiBase';
import { ensureCouchDb } from './ensureCouchDb';
import { createNotificationRequest } from './notificationApi';

const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};


function normalizeDbName(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_$()+-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function getCouchHeaders() {
  const headers: Record<string, string> = {};
  return headers;
}

const API_BASE = getApiBase();
export const PAYROLL_DB_NAME = normalizeDbName(
  env.VITE_PAYROLL_DB || `${env.VITE_COUCHDB_DB || 'vertial'}-payroll`,
);

async function request<T>(path: string, init?: RequestInit): Promise<T> {
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
  const payload = (await response.json().catch(() => ({}))) as T & {
    error?: string;
    details?: { reason?: string; error?: string };
  };
  if (response.status === 401) {
    throw new Error('Sesión expirada. Por favor, inicia sesión de nuevo.');
  }
  if (!response.ok) {
    throw new Error(
      payload?.error ||
        (payload?.details as { reason?: string } | undefined)?.reason ||
        (payload?.details as { error?: string } | undefined)?.error ||
        'Error inesperado en nóminas API',
    );
  }
  return payload;
}

export type PayrollDocumentType =
  | 'nomina'
  | 'contrato'
  | 'certificado'
  | 'justificante'
  | 'baja'
  | 'dni_nie'
  | 'pasaporte'
  | 'permiso_trabajo'
  | 'reconocimiento_medico'
  | 'prl'
  | 'carnet_conducir'
  | 'certificado_penales'
  | 'seguro'
  | 'titulo'
  | 'otro';

export type DocumentExpiryStatus = 'valid' | 'expiring' | 'expired';

export interface PayrollDocument {
  _id: string;
  _rev?: string;
  type: 'payroll';
  id: string;
  /** Empresa a la que pertenece el documento (aislamiento multi-negocio). */
  business_id?: string;
  worker_id: string;
  worker_name: string;
  documentType: PayrollDocumentType;
  name: string;
  period?: string;
  expiryDate?: string;
  reminderDays?: number;
  documentCategory?: 'identity' | 'contract' | 'certificate' | 'medical' | 'training' | 'insurance' | 'other';
  fileData?: string;
  mimeType?: string;
  fileName?: string;
  size?: number;
  uploadedBy: string;
  uploadedByName?: string;
  entryMethod?: 'manual' | 'ocr';
  ocrData?: Record<string, unknown>;
  ocrImageBase64?: string;
  ocrProcessedAt?: string;
  ocrConfidence?: number;
  createdAt: string;
  updatedAt: string;
}

export const PAYROLL_DOC_TYPE_LABELS: Record<PayrollDocumentType, string> = {
  nomina: 'Nómina',
  contrato: 'Contrato',
  certificado: 'Certificado',
  justificante: 'Justificante',
  baja: 'Baja / IT',
  dni_nie: 'DNI / NIE',
  pasaporte: 'Pasaporte',
  permiso_trabajo: 'Permiso de trabajo',
  reconocimiento_medico: 'Reconocimiento médico',
  prl: 'PRL / Prevención',
  carnet_conducir: 'Carnet de conducir',
  certificado_penales: 'Certificado de penales',
  seguro: 'Seguro',
  titulo: 'Título / Certificación',
  otro: 'Otro',
};

export const DOC_CATEGORY_LABELS: Record<string, string> = {
  identity: 'Identidad',
  contract: 'Contractual',
  certificate: 'Certificados',
  medical: 'Médico / PRL',
  training: 'Formación',
  insurance: 'Seguros',
  other: 'Otros',
};

/** Carpeta lógica del documento según su tipo (nómina ≠ contrato ≠ identidad…). */
export function resolvePayrollDocumentCategory(
  documentType: PayrollDocumentType,
): NonNullable<PayrollDocument['documentCategory']> {
  switch (documentType) {
    case 'nomina':
      return 'other'; // se lista como nómina por documentType; category es secundaria
    case 'contrato':
      return 'contract';
    case 'dni_nie':
    case 'pasaporte':
    case 'permiso_trabajo':
    case 'carnet_conducir':
      return 'identity';
    case 'certificado':
    case 'certificado_penales':
    case 'titulo':
    case 'prl':
      return 'certificate';
    case 'reconocimiento_medico':
    case 'baja':
      return 'medical';
    case 'seguro':
      return 'insurance';
    case 'justificante':
    case 'otro':
    default:
      return 'other';
  }
}

/** Nombre legible al subir: respeta el tipo elegido (Contrato · Ana, Nómina mar 2026 · Ana…). */
export function buildPayrollDocumentDisplayName(options: {
  documentType: PayrollDocumentType;
  workerName?: string;
  period?: string;
  fileName?: string;
  customName?: string;
}): string {
  const custom = String(options.customName || '').trim();
  if (custom) return custom;
  const typeLabel = PAYROLL_DOC_TYPE_LABELS[options.documentType] || 'Documento';
  const worker = String(options.workerName || '').trim();
  const periodLabel = options.period ? formatPayrollPeriodLabel(options.period) : '';
  if (options.documentType === 'nomina' && periodLabel) {
    return worker ? `${typeLabel} ${periodLabel} · ${worker}` : `${typeLabel} ${periodLabel}`;
  }
  if (worker) return `${typeLabel} · ${worker}`;
  const fromFile = String(options.fileName || '').replace(/\.[^.]+$/, '').trim();
  return fromFile || typeLabel;
}

export function formatPayrollPeriodLabel(period?: string): string {
  if (!period) return '';
  const [year, month] = period.split('-');
  if (!year || !month) return period;
  const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const idx = parseInt(month, 10) - 1;
  if (idx < 0 || idx > 11) return period;
  return `${monthNames[idx]} ${year}`;
}

/** Título corto y claro (mismo estilo que «Nueva nómina disponible»). */
function workerPayrollNotificationTitle(documentType: PayrollDocumentType): string {
  switch (documentType) {
    case 'nomina':
      return 'Nueva nómina disponible';
    case 'contrato':
      return 'Nuevo contrato';
    case 'certificado':
      return 'Nuevo certificado';
    case 'justificante':
      return 'Nuevo justificante';
    case 'baja':
      return 'Documento de baja';
    case 'dni_nie':
    case 'pasaporte':
    case 'permiso_trabajo':
      return 'Nuevo documento de identidad';
    default:
      return `Nuevo documento: ${PAYROLL_DOC_TYPE_LABELS[documentType] || 'Documento'}`;
  }
}

/** Tras subir un documento, avisa al trabajador (app + push). No bloquea si falla. */
export async function notifyWorkerPayrollDocumentUploaded(doc: PayrollDocument): Promise<void> {
  if (!doc.worker_id) return;
  const periodSuffix = doc.period ? ` · ${formatPayrollPeriodLabel(doc.period)}` : '';
  await createNotificationRequest(doc.worker_id, {
    level: 'info',
    category: 'team',
    title: workerPayrollNotificationTitle(doc.documentType),
    message: `${doc.name}${periodSuffix} ya está en Documentos.`,
    entityId: doc.id || doc._id,
    entityType: 'payroll',
    route: '/saas/worker/documents',
    metadata: {
      documentType: doc.documentType,
      period: doc.period,
      workerId: doc.worker_id,
    },
  });
}

export async function finalizePayrollDocumentUpload(doc: PayrollDocument): Promise<void> {
  try {
    await notifyWorkerPayrollDocumentUploaded(doc);
  } catch {
    // La subida ya fue correcta; la notificación es complementaria.
  }
}

export function payrollUploadSuccessMessage(doc: PayrollDocument): string {
  const worker = doc.worker_name?.trim() || 'el trabajador';
  const periodSuffix = doc.period ? ` (${formatPayrollPeriodLabel(doc.period)})` : '';
  return `"${doc.name}"${periodSuffix} publicado. ${worker} lo verá en Documentos al instante.`;
}

export function getDocumentExpiryStatus(doc: PayrollDocument): DocumentExpiryStatus {
  if (!doc.expiryDate) return 'valid';
  const now = new Date();
  const expiry = new Date(doc.expiryDate);
  const diffMs = expiry.getTime() - now.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  const threshold = doc.reminderDays ?? 30;
  if (diffDays < 0) return 'expired';
  if (diffDays < threshold) return 'expiring';
  return 'valid';
}

async function ensurePayrollDatabase() {
  await ensureCouchDb(PAYROLL_DB_NAME, () => request(`/api/couch/db/${encodeURIComponent(PAYROLL_DB_NAME)}`, { method: 'PUT' }));
}

export type ListPayrollDocumentsOptions = {
  workerId?: string;
  memberIds?: string[];
  businessId?: string;
};

function parseListPayrollOptions(
  options?: string | ListPayrollDocumentsOptions,
): ListPayrollDocumentsOptions {
  if (typeof options === 'string') return { workerId: options };
  return options ?? {};
}

export function filterPayrollDocumentsForBusiness(
  docs: PayrollDocument[],
  options: ListPayrollDocumentsOptions,
): PayrollDocument[] {
  const memberSet =
    options.memberIds && options.memberIds.length > 0
      ? new Set(options.memberIds.filter(Boolean))
      : null;
  const businessId = String(options.businessId || '').trim();

  return docs.filter((doc) => {
    if (doc.type !== 'payroll') return false;
    if (options.workerId && doc.worker_id !== options.workerId) return false;
    if (memberSet && !memberSet.has(doc.worker_id)) return false;
    if (businessId) {
      const docBiz = String(doc.business_id || '').trim();
      if (!docBiz || docBiz !== businessId) return false;
    }
    return true;
  });
}

export async function listPayrollDocumentsRequest(
  options?: string | ListPayrollDocumentsOptions,
): Promise<PayrollDocument[]> {
  const opts = parseListPayrollOptions(options);
  await ensurePayrollDatabase();
  const payload = await request<{ docs: unknown[] }>(
    `/api/couch/docs/${encodeURIComponent(PAYROLL_DB_NAME)}`,
  );
  const all = (payload.docs || [])
    .filter((d): d is PayrollDocument => {
      const doc = d as Partial<PayrollDocument>;
      return doc.type === 'payroll';
    })
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return filterPayrollDocumentsForBusiness(all, opts);
}

export async function createPayrollDocumentRequest(
  data: Omit<PayrollDocument, '_id' | '_rev' | 'type' | 'id' | 'createdAt' | 'updatedAt'>,
): Promise<PayrollDocument> {
  await ensurePayrollDatabase();
  const id = `payroll-${uuidv4()}`;
  const now = new Date().toISOString();
  const documentType = data.documentType;
  const document: PayrollDocument = {
    _id: id,
    type: 'payroll',
    id,
    ...data,
    documentType,
    documentCategory: data.documentCategory || resolvePayrollDocumentCategory(documentType),
    // El mes solo aplica a nómina; un contrato/DNI no debe heredar periodo de la UI.
    period: documentType === 'nomina' ? (data.period || undefined) : undefined,
    createdAt: now,
    updatedAt: now,
  };
  const result = await request<{ id: string; rev: string }>(
    `/api/couch/doc/${encodeURIComponent(PAYROLL_DB_NAME)}/${encodeURIComponent(id)}`,
    { method: 'PUT', body: JSON.stringify(document) },
  );
  return { ...document, _rev: result.rev };
}

export async function deletePayrollDocumentRequest(document: PayrollDocument): Promise<void> {
  if (!document._rev) return;
  const rev = encodeURIComponent(document._rev);
  const docId = encodeURIComponent(document._id);
  await request(
    `/api/couch/doc/${encodeURIComponent(PAYROLL_DB_NAME)}/${docId}?rev=${rev}`,
    { method: 'DELETE' },
  );
}
