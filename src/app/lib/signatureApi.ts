import { getAuthHeaders } from './authApi';

const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};

// ── Types ────────────────────────────────────────────────────────────────────

export type SignatureRequestStatus =
  | 'draft'
  | 'pending'
  | 'partially_signed'
  | 'completed'
  | 'rejected'
  | 'expired'
  | 'cancelled';

export type SignerRole = 'signer' | 'reviewer' | 'cc';
export type SignerStatus = 'pending' | 'viewed' | 'signed' | 'rejected' | 'expired';
export type EntityType = 'client' | 'supplier' | 'team_member' | 'external';

export interface Signer {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: SignerRole;
  status: SignerStatus;
  order: number;
  entityType: EntityType;
  entityId: string;
  signedAt?: string;
  rejectedAt?: string;
  viewedAt?: string;
  rejectionReason?: string;
  ipAddress?: string;
  userAgent?: string;
  signatureImageUrl?: string;
}

export interface SignatureEvent {
  id: string;
  timestamp: string;
  action: string;
  actorName: string;
  actorEmail?: string;
  signerId?: string;
  details?: string;
  metadata?: Record<string, unknown>;
}

export interface SignatureRequestRecord {
  id: string;
  _rev?: string;
  type: 'signature_request';
  user_id: string;
  documentId: string;
  documentName: string;
  status: SignatureRequestStatus;
  signers: Signer[];
  signingOrder: 'parallel' | 'sequential';
  message?: string;
  expiresAt: string;
  reminderEnabled: boolean;
  reminderIntervalDays: number;
  lastReminderAt?: string;
  sourceFileUrl: string;
  sourceFileName: string;
  sourceMimeType: string;
  sourceFileSize: number;
  signedFileUrl?: string;
  signedFileName?: string;
  signedMimeType?: string;
  signedFileSize?: number;
  linkedEntityType?: EntityType | '';
  linkedEntityId?: string;
  linkedEntityName?: string;
  provider: string;
  providerRequestId?: string;
  providerData?: Record<string, unknown>;
  events: SignatureEvent[];
  tags: string[];
  notes?: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  cancelledAt?: string;
}

export interface CreateSignatureRequestData {
  documentId: string;
  documentName?: string;
  signers: Array<{
    name: string;
    email: string;
    phone?: string;
    role: SignerRole;
    order?: number;
    entityType: EntityType;
    entityId?: string;
  }>;
  signingOrder?: 'parallel' | 'sequential';
  message?: string;
  expiresAt: string;
  reminderEnabled?: boolean;
  reminderIntervalDays?: number;
  sourceFileUrl?: string;
  sourceFileName?: string;
  sourceMimeType?: string;
  sourceFileSize?: number;
  linkedEntityType?: EntityType;
  linkedEntityId?: string;
  linkedEntityName?: string;
  tags?: string[];
  notes?: string;
}

export interface SignatureListFilters {
  status?: SignatureRequestStatus;
  documentId?: string;
  entityType?: EntityType;
  entityId?: string;
}

// ── HTTP helpers ─────────────────────────────────────────────────────────────

function getApiBase() {
  if (env.VITE_API_URL) return env.VITE_API_URL;
  const browserHost = typeof window !== 'undefined' && window.location.hostname ? window.location.hostname : 'localhost';
  const protocol = env.VITE_API_PROTOCOL || (typeof window !== 'undefined' && window.location.protocol ? window.location.protocol.replace(':', '') : 'http');
  const host = env.VITE_API_HOST || browserHost;
  const port = env.VITE_API_PORT || '3001';
  return `${protocol}://${host}:${port}`;
}

function getCouchHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (env.VITE_COUCHDB_URL) headers['x-couch-url'] = env.VITE_COUCHDB_URL;
  if (env.VITE_COUCHDB_USER) headers['x-couch-user'] = env.VITE_COUCHDB_USER;
  if (env.VITE_COUCHDB_PASSWORD) headers['x-couch-password'] = env.VITE_COUCHDB_PASSWORD;
  return headers;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getApiBase()}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
      ...getCouchHeaders(),
      ...(init?.headers || {}),
    },
    credentials: 'include',
    ...init,
  });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(payload?.error || 'Error inesperado en firma digital');
  return payload;
}

// ── Signature status helpers ─────────────────────────────────────────────────

export const SIGNATURE_STATUS_CONFIG: Record<SignatureRequestStatus, { label: string; color: string; bg: string; icon: string }> = {
  draft:             { label: 'Borrador',       color: 'text-gray-600',    bg: 'bg-gray-100',    icon: 'FileEdit' },
  pending:           { label: 'Pendiente',      color: 'text-amber-700',   bg: 'bg-amber-100',   icon: 'Clock' },
  partially_signed:  { label: 'Firmando',       color: 'text-blue-700',    bg: 'bg-blue-100',    icon: 'PenLine' },
  completed:         { label: 'Completada',     color: 'text-emerald-700', bg: 'bg-emerald-100', icon: 'CheckCircle2' },
  rejected:          { label: 'Rechazada',      color: 'text-red-700',     bg: 'bg-red-100',     icon: 'XCircle' },
  expired:           { label: 'Caducada',       color: 'text-gray-500',    bg: 'bg-gray-100',    icon: 'AlertTriangle' },
  cancelled:         { label: 'Cancelada',      color: 'text-gray-400',    bg: 'bg-gray-50',     icon: 'Ban' },
};

export const SIGNER_STATUS_CONFIG: Record<SignerStatus, { label: string; color: string; icon: string }> = {
  pending:  { label: 'Pendiente',  color: 'text-amber-500',   icon: 'Clock' },
  viewed:   { label: 'Visto',      color: 'text-blue-500',    icon: 'Eye' },
  signed:   { label: 'Firmado',    color: 'text-emerald-500', icon: 'CheckCircle2' },
  rejected: { label: 'Rechazado',  color: 'text-red-500',     icon: 'XCircle' },
  expired:  { label: 'Caducado',   color: 'text-gray-500',    icon: 'AlertTriangle' },
};

export function getSignatureProgress(signers: Signer[]): { signed: number; total: number; percent: number } {
  const required = signers.filter((s) => s.role === 'signer');
  const signed = required.filter((s) => s.status === 'signed').length;
  return { signed, total: required.length, percent: required.length > 0 ? Math.round((signed / required.length) * 100) : 0 };
}

// ── API calls ────────────────────────────────────────────────────────────────

export async function listSignatureRequests(
  userId: string,
  filters?: SignatureListFilters,
): Promise<SignatureRequestRecord[]> {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.documentId) params.set('documentId', filters.documentId);
  if (filters?.entityType) params.set('entityType', filters.entityType);
  if (filters?.entityId) params.set('entityId', filters.entityId);

  const qs = params.toString();
  const payload = await request<{ ok: boolean; signatureRequests: SignatureRequestRecord[] }>(
    `/api/signatures/${encodeURIComponent(userId)}${qs ? `?${qs}` : ''}`,
  );
  return payload.signatureRequests || [];
}

export async function getSignatureRequest(
  userId: string,
  requestId: string,
): Promise<SignatureRequestRecord> {
  const payload = await request<{ ok: boolean; signatureRequest: SignatureRequestRecord }>(
    `/api/signatures/${encodeURIComponent(userId)}/${encodeURIComponent(requestId)}`,
  );
  return payload.signatureRequest;
}

export async function createSignatureRequest(
  userId: string,
  data: CreateSignatureRequestData,
): Promise<SignatureRequestRecord> {
  const payload = await request<{ ok: boolean; signatureRequest: SignatureRequestRecord }>(
    `/api/signatures/${encodeURIComponent(userId)}`,
    { method: 'POST', body: JSON.stringify({ signatureRequest: data }) },
  );
  return payload.signatureRequest;
}

export async function updateSignatureRequest(
  userId: string,
  requestId: string,
  data: Partial<CreateSignatureRequestData>,
): Promise<SignatureRequestRecord> {
  const payload = await request<{ ok: boolean; signatureRequest: SignatureRequestRecord }>(
    `/api/signatures/${encodeURIComponent(userId)}/${encodeURIComponent(requestId)}`,
    { method: 'PUT', body: JSON.stringify({ signatureRequest: data }) },
  );
  return payload.signatureRequest;
}

export async function sendSignatureRequest(
  userId: string,
  requestId: string,
): Promise<{ signatureRequest: SignatureRequestRecord; signerLinks: Record<string, string> }> {
  const payload = await request<{
    ok: boolean;
    signatureRequest: SignatureRequestRecord;
    signerLinks: Record<string, string>;
  }>(
    `/api/signatures/${encodeURIComponent(userId)}/${encodeURIComponent(requestId)}/send`,
    { method: 'POST' },
  );
  return { signatureRequest: payload.signatureRequest, signerLinks: payload.signerLinks };
}

export async function cancelSignatureRequest(
  userId: string,
  requestId: string,
  reason?: string,
): Promise<SignatureRequestRecord> {
  const payload = await request<{ ok: boolean; signatureRequest: SignatureRequestRecord }>(
    `/api/signatures/${encodeURIComponent(userId)}/${encodeURIComponent(requestId)}`,
    { method: 'DELETE', body: JSON.stringify({ reason }) },
  );
  return payload.signatureRequest;
}

export async function sendSignatureReminder(
  userId: string,
  requestId: string,
): Promise<{ signatureRequest: SignatureRequestRecord; reminded: Array<{ id: string; name: string; email: string }> }> {
  const payload = await request<{
    ok: boolean;
    signatureRequest: SignatureRequestRecord;
    reminded: Array<{ id: string; name: string; email: string }>;
  }>(
    `/api/signatures/${encodeURIComponent(userId)}/${encodeURIComponent(requestId)}/remind`,
    { method: 'POST' },
  );
  return { signatureRequest: payload.signatureRequest, reminded: payload.reminded };
}

export async function resendToSigner(
  userId: string,
  requestId: string,
  signerId: string,
): Promise<{ signatureRequest: SignatureRequestRecord; signerLink: string }> {
  const payload = await request<{
    ok: boolean;
    signatureRequest: SignatureRequestRecord;
    signerLink: string;
  }>(
    `/api/signatures/${encodeURIComponent(userId)}/${encodeURIComponent(requestId)}/signers/${encodeURIComponent(signerId)}/resend`,
    { method: 'POST' },
  );
  return { signatureRequest: payload.signatureRequest, signerLink: payload.signerLink };
}

// ── Public signing API (no auth required, token-based) ───────────────────────

export interface PublicSignatureView {
  request: {
    id: string;
    documentName: string;
    message: string;
    expiresAt: string;
    status: string;
    createdByName: string;
    sourceFileUrl: string;
    sourceFileName: string;
    sourceMimeType: string;
  };
  signer: {
    id: string;
    name: string;
    email: string;
    role: string;
    status: string;
  };
  document: {
    name: string;
    content: string;
    fileUrl: string;
    mimeType: string;
  } | null;
}

export async function viewSignaturePublic(token: string): Promise<PublicSignatureView> {
  const response = await fetch(`${getApiBase()}/api/sign/view/${encodeURIComponent(token)}`, {
    headers: { 'Content-Type': 'application/json' },
  });
  const payload = (await response.json().catch(() => ({}))) as PublicSignatureView & { ok: boolean; error?: string };
  if (!response.ok) throw new Error(payload?.error || 'Error al cargar firma');
  return payload;
}

export async function acceptSignaturePublic(
  token: string,
  signatureImageData?: string,
): Promise<{ status: string; signer: { id: string; name: string; status: string; signedAt: string } }> {
  const response = await fetch(`${getApiBase()}/api/sign/accept/${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ signatureImageData }),
  });
  const payload = (await response.json().catch(() => ({}))) as { ok: boolean; status: string; signer: { id: string; name: string; status: string; signedAt: string }; error?: string };
  if (!response.ok) throw new Error(payload?.error || 'Error al firmar');
  return { status: payload.status, signer: payload.signer };
}

export async function rejectSignaturePublic(
  token: string,
  reason: string,
): Promise<{ status: string; signer: { id: string; name: string; status: string; reason: string } }> {
  const response = await fetch(`${getApiBase()}/api/sign/reject/${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
  const payload = (await response.json().catch(() => ({}))) as { ok: boolean; status: string; signer: { id: string; name: string; status: string; reason: string }; error?: string };
  if (!response.ok) throw new Error(payload?.error || 'Error al rechazar');
  return { status: payload.status, signer: payload.signer };
}
