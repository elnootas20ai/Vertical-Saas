import { v4 as uuidv4 } from 'uuid';
import { authFetch, getAuthHeaders } from './authApi';

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

function normalizeDbName(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_$()+-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function getCouchHeaders() {
  const headers: Record<string, string> = {};
  if (env.VITE_COUCHDB_URL) headers['x-couch-url'] = env.VITE_COUCHDB_URL;
  if (env.VITE_COUCHDB_USER) headers['x-couch-user'] = env.VITE_COUCHDB_USER;
  if (env.VITE_COUCHDB_PASSWORD) headers['x-couch-password'] = env.VITE_COUCHDB_PASSWORD;
  return headers;
}

const API_BASE = getApiBase();
export const PAYROLL_DB_NAME = normalizeDbName(
  env.VITE_PAYROLL_DB || `${env.VITE_COUCHDB_DB || 'udar'}-payroll`,
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
  await request(`/api/couch/db/${encodeURIComponent(PAYROLL_DB_NAME)}`, { method: 'PUT' });
}

export async function listPayrollDocumentsRequest(workerId?: string): Promise<PayrollDocument[]> {
  await ensurePayrollDatabase();
  const payload = await request<{ docs: unknown[] }>(
    `/api/couch/docs/${encodeURIComponent(PAYROLL_DB_NAME)}`,
  );
  return (payload.docs || [])
    .filter((d): d is PayrollDocument => {
      const doc = d as Partial<PayrollDocument>;
      return doc.type === 'payroll' && (!workerId || doc.worker_id === workerId);
    })
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function createPayrollDocumentRequest(
  data: Omit<PayrollDocument, '_id' | '_rev' | 'type' | 'id' | 'createdAt' | 'updatedAt'>,
): Promise<PayrollDocument> {
  await ensurePayrollDatabase();
  const id = `payroll-${uuidv4()}`;
  const now = new Date().toISOString();
  const document: PayrollDocument = {
    _id: id,
    type: 'payroll',
    id,
    ...data,
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
