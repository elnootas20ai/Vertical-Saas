import { authFetch, getAuthHeaders } from './authApi';
import { getApiBase } from './apiBase';

const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};


function getCouchHeaders() {
  const headers: Record<string, string> = {};
  return headers;
}

const API = getApiBase();

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await authFetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders(), ...getCouchHeaders(), ...(init?.headers || {}) },
    credentials: 'include',
    ...init,
  });
  const payload = await res.json().catch(() => ({})) as T & { error?: string };
  if (!res.ok) throw new Error((payload as { error?: string })?.error || `Error ${res.status}`);
  return payload;
}

// ---- Types ----

export interface OcrLine {
  description: string;
  quantity: number | null;
  unitPrice: number | null;
  total: number | null;
  catalogItemId?: string;
  catalogItemName?: string;
  matchConfidence?: number;
  matchMethod?: string;
}

export interface OcrResult {
  documentType: string | null;
  documentTypeLabel: string | null;
  confidenceScore: number | null;
  emitter: string | null;
  emitterCIF: string | null;
  receiver: string | null;
  receiverCIF: string | null;
  date: string | null;
  documentNumber: string | null;
  subtotal: number | null;
  taxRate: number | null;
  taxAmount: number | null;
  total: number | null;
  currency: string | null;
  lines: OcrLine[];
  workerName: string | null;
  workerDNI: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  contractDuration: string | null;
  notes: string | null;
  parseError?: boolean;
  raw?: string;
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
}

export interface OcrScanMeta {
  sourceHash: string;
  processingTimeMs: number;
  tokensUsed: { prompt: number; completion: number };
  model: string;
}

export interface OcrEntityMatch {
  matchType: 'supplier' | 'client' | 'worker';
  confidence: number;
  matchedEntity: { _id: string; name: string; cif?: string; email?: string } | null;
  candidates: Array<{ _id: string; name: string; confidence: number }>;
  suggestNew: boolean;
}

export interface OcrProposal {
  _id: string;
  _rev?: string;
  type: 'ocr_proposal';
  id: string;
  user_id: string;
  ocrLogId: string;
  destination: {
    module: string;
    database: string;
    builder: string;
    action: string;
    documentCategory: string;
    financeType?: string | null;
    payrollType?: string | null;
  } | null;
  fields: Record<string, { value: unknown; confidence: number; source: string }>;
  entity: { type: string; id: string; name: string; confidence: number } | null;
  warnings: Array<{ code: string; field: string; message: string; severity: string }>;
  status: string;
  autoApproved: boolean;
  sourceFileName: string;
  ocrData: OcrResult | null;
  createdDocumentId: string | null;
  createdDocumentDb: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OcrLog {
  _id: string;
  type: 'ocr_processing_log';
  id: string;
  sourceFileName: string;
  detectedDocumentType: string;
  confidence: number;
  status: string;
  isDuplicate: boolean;
  processingTimeMs: number;
  createdAt: string;
}

export interface OcrStats {
  total: number;
  completed: number;
  pending: number;
  duplicates: number;
  failed: number;
  avgConfidence: number;
  byType: Record<string, number>;
  pendingProposals: number;
}

// ---- API calls ----

export async function scanDocument(
  imageBase64: string,
  mimeType: string,
  context?: Record<string, unknown>,
  ocrMode?: 'financial' | 'vehicle',
) {
  return request<{ ok: boolean; data: OcrResult; meta: OcrScanMeta }>('/api/ocr/scan', {
    method: 'POST',
    body: JSON.stringify({ imageBase64, mimeType, context, ocrMode }),
  });
}

export interface OcrRouteSideEffects {
  stockUpdated?: number;
  stockUnits?: number;
  financeMovementId?: string | null;
  financeSkipped?: boolean;
  matchedLines?: number;
  totalLines?: number;
  unmatchedLines?: number;
}

export interface OcrRouteResult {
  documentId: string;
  database: string;
  sideEffects?: OcrRouteSideEffects | null;
}

export async function processOcr(params: {
  ocrData: OcrResult;
  sourceFileName?: string;
  sourceMimeType?: string;
  sourceSize?: number;
  sourceHash?: string;
  sourceImageBase64?: string;
  processingTimeMs?: number;
  tokensUsed?: { prompt: number; completion: number };
  model?: string;
  forceDuplicate?: boolean;
}) {
  return request<{
    ok: boolean;
    status: string;
    log: OcrLog;
    proposal: OcrProposal | null;
    destination?: unknown;
    entityMatches?: OcrEntityMatch[];
    validation?: { warnings: unknown[]; errors: unknown[]; isValid: boolean };
    routeResult?: OcrRouteResult | null;
    duplicate?: { isDuplicate: boolean; duplicateType: string | null; original: unknown } | null;
  }>('/api/ocr/process', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function approveProposal(proposalId: string, fields?: Record<string, unknown>) {
  return request<{ ok: boolean; routeResult: OcrRouteResult; proposal: OcrProposal }>(
    `/api/ocr/proposals/${encodeURIComponent(proposalId)}/approve`,
    { method: 'POST', body: JSON.stringify({ fields }) },
  );
}

export async function rejectProposal(proposalId: string) {
  return request<{ ok: boolean; proposal: OcrProposal }>(
    `/api/ocr/proposals/${encodeURIComponent(proposalId)}/reject`,
    { method: 'POST' },
  );
}

export async function editProposal(proposalId: string, changes: { fields?: Record<string, unknown>; destination?: Record<string, unknown> }) {
  return request<{ ok: boolean; proposal: OcrProposal }>(
    `/api/ocr/proposals/${encodeURIComponent(proposalId)}`,
    { method: 'PATCH', body: JSON.stringify(changes) },
  );
}

export async function listProposals(status?: string) {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  return request<{ ok: boolean; proposals: OcrProposal[] }>(`/api/ocr/proposals${qs}`);
}

export async function listLogs() {
  return request<{ ok: boolean; logs: OcrLog[] }>('/api/ocr/logs');
}

export async function getOcrStats() {
  return request<{ ok: boolean; stats: OcrStats }>('/api/ocr/stats');
}

export async function checkDuplicate(sourceHash: string) {
  return request<{ ok: boolean; isDuplicate: boolean; duplicateType: string | null; original: unknown }>(
    '/api/ocr/check-duplicate',
    { method: 'POST', body: JSON.stringify({ sourceHash }) },
  );
}

// ---- Doc type helpers ----

export const DOC_TYPE_LABELS: Record<string, string> = {
  factura_proveedor: 'Factura proveedor',
  factura_cliente: 'Factura cliente',
  ticket_gasto: 'Ticket de gasto',
  recibo: 'Recibo',
  albaran: 'Albarán',
  nomina: 'Nómina',
  contrato_laboral: 'Contrato laboral',
  certificado_laboral: 'Certificado laboral',
  baja_it: 'Baja / IT',
  contrato_comercial: 'Contrato comercial',
  presupuesto: 'Presupuesto',
  documento_cliente: 'Documento cliente',
  documento_vertical: 'Documento sectorial',
  otro: 'Otro',
};

export const DOC_TYPE_ICONS: Record<string, string> = {
  factura_proveedor: '📥',
  factura_cliente: '📤',
  ticket_gasto: '🧾',
  recibo: '🧾',
  albaran: '📦',
  nomina: '💰',
  contrato_laboral: '📋',
  certificado_laboral: '📜',
  baja_it: '🏥',
  contrato_comercial: '🤝',
  presupuesto: '📊',
  documento_cliente: '👤',
  documento_vertical: '🏗️',
  otro: '📄',
};

export const DOC_TYPE_COLORS: Record<string, string> = {
  factura_proveedor: '#ef4444',
  factura_cliente: '#22c55e',
  ticket_gasto: '#f59e0b',
  recibo: '#f59e0b',
  albaran: '#6366f1',
  nomina: '#8b5cf6',
  contrato_laboral: '#0ea5e9',
  certificado_laboral: '#06b6d4',
  baja_it: '#ec4899',
  contrato_comercial: '#14b8a6',
  presupuesto: '#64748b',
  documento_cliente: '#3b82f6',
  documento_vertical: '#a855f7',
  otro: '#94a3b8',
};

export const MODULE_LABELS: Record<string, string> = {
  compras: 'Compras y Stock',
  finanzas: 'Finanzas',
  nominas: 'Nóminas',
  equipo: 'Equipo',
  documentacion: 'Documentación',
  verticales: 'Verticales',
};
