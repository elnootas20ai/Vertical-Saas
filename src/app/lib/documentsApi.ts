import { v4 as uuidv4 } from 'uuid';
import { authFetch, getAuthHeaders } from './authApi';
import { getApiBase } from './apiBase';
import { ensureCouchDb } from './ensureCouchDb';

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
export const DOCUMENTS_DB_NAME = normalizeDbName(
  env.VITE_DOCUMENTS_DB || `${env.VITE_COUCHDB_DB || 'vertial'}-documents`,
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
        'Error inesperado en documentos API',
    );
  }
  return payload;
}

export type CompraventaDocCategory =
  | 'permiso_circulacion' | 'ficha_tecnica' | 'contrato_compra' | 'contrato_venta'
  | 'factura_compra' | 'factura_venta' | 'itv' | 'reparacion' | 'justificante'
  | 'doc_cliente' | 'anexo' | 'seguro' | 'informe_trafico' | 'otro';

export type ScrapyardDocCategory =
  | CompraventaDocCategory
  | 'baja_temporal' | 'baja_definitiva' | 'certificado_destruccion'
  | 'certificado_descontaminacion' | 'acta_retirada' | 'albaran_grua'
  | 'justificante_deposito' | 'informe_medioambiental' | 'licencia_actividad'
  | 'registro_productor_residuos' | 'garantia_pieza' | 'informe_pieza'
  | 'albaran_venta_pieza' | 'acta_adjudicacion' | 'doc_tasacion';

export interface OcrData {
  documentType?: string | null;
  documentTypeLabel?: string | null;
  emitter?: string | null;
  receiver?: string | null;
  date?: string | null;
  documentNumber?: string | null;
  subtotal?: number | null;
  taxRate?: number | null;
  taxAmount?: number | null;
  total?: number | null;
  currency?: string | null;
  lines?: { description: string; quantity: number | null; unitPrice: number | null; total: number | null }[];
  notes?: string | null;
  registrationPlate?: string | null;
  vin?: string | null;
  vehicleBrand?: string | null;
  vehicleModel?: string | null;
  vehicleYear?: number | null;
  ownerName?: string | null;
  ownerNif?: string | null;
  buyerName?: string | null;
  buyerNif?: string | null;
  sellerName?: string | null;
  sellerNif?: string | null;
  expiryDate?: string | null;
  confidence?: number | null;
}

export interface DocumentRecord {
  _id: string;
  _rev?: string;
  type: 'document';
  id: string;
  user_id: string;
  name: string;
  docType: string;
  status: 'pending' | 'signed' | 'sent';
  relatedTo?: string;
  relatedToId?: string;
  templateId?: string;
  notes?: string;
  expiresAt?: string;
  fileData?: string;
  mimeType?: string;
  fileName?: string;
  size?: string;
  ocrData?: OcrData;
  docSubCategory?: CompraventaDocCategory;
  registrationPlate?: string;
  vin?: string;
  itvExpiryDate?: string;
  isRequired?: boolean;
  supplierId?: string;
  supplierName?: string;
  archived?: boolean;
  clientId?: string;
  clientName?: string;
  vehicleId?: string;
  vehicleName?: string;
  ocrConfidence?: number;
  partId?: string;
  partName?: string;
  partCode?: string;
  acquisitionId?: string;
  deregistrationId?: string;
  deregistrationType?: string | null;
  deregistrationDate?: string | null;
  expiryDateDoc?: string | null;
  isScrapyard?: boolean;
  documentHash?: string;
  createdAt: string;
  updatedAt: string;
}

async function ensureDocumentsDatabase() {
  await ensureCouchDb(DOCUMENTS_DB_NAME, () => request(`/api/couch/db/${encodeURIComponent(DOCUMENTS_DB_NAME)}`, { method: 'PUT' }));
}

export async function listDocumentsRequest(userId: string): Promise<DocumentRecord[]> {
  await ensureDocumentsDatabase();
  const payload = await request<{ docs: unknown[] }>(
    `/api/couch/docs/${encodeURIComponent(DOCUMENTS_DB_NAME)}`,
  );
  return (payload.docs || [])
    .filter((d): d is DocumentRecord => {
      const doc = d as Partial<DocumentRecord>;
      return doc.type === 'document' && (!userId || doc.user_id === userId);
    })
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function createDocumentRequest(
  userId: string,
  data: Omit<DocumentRecord, '_id' | '_rev' | 'type' | 'id' | 'createdAt' | 'updatedAt'>,
): Promise<DocumentRecord> {
  await ensureDocumentsDatabase();
  const id = `document-${uuidv4()}`;
  const now = new Date().toISOString();
  const document: DocumentRecord = {
    _id: id,
    type: 'document',
    id,
    ...data,
    user_id: userId,
    createdAt: now,
    updatedAt: now,
  };
  const result = await request<{ id: string; rev: string }>(
    `/api/couch/doc/${encodeURIComponent(DOCUMENTS_DB_NAME)}/${encodeURIComponent(id)}`,
    { method: 'PUT', body: JSON.stringify(document) },
  );
  return { ...document, _rev: result.rev };
}

export async function updateDocumentRequest(document: DocumentRecord): Promise<DocumentRecord> {
  await ensureDocumentsDatabase();
  const next = { ...document, updatedAt: new Date().toISOString() };
  const result = await request<{ id: string; rev: string }>(
    `/api/couch/doc/${encodeURIComponent(DOCUMENTS_DB_NAME)}/${encodeURIComponent(next._id)}`,
    { method: 'PUT', body: JSON.stringify(next) },
  );
  return { ...next, _rev: result.rev };
}

export async function deleteDocumentRequest(document: DocumentRecord): Promise<void> {
  if (!document._rev) return;
  const rev = encodeURIComponent(document._rev);
  const docId = encodeURIComponent(document._id);
  await request(
    `/api/couch/doc/${encodeURIComponent(DOCUMENTS_DB_NAME)}/${docId}?rev=${rev}`,
    { method: 'DELETE' },
  );
}
