import { getApiBase } from './apiBase';
const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};


const API_BASE = getApiBase();

function getHeaders(): Record<string, string> {
  const token =
    typeof localStorage !== 'undefined' ? localStorage.getItem('vertial_access_token') : null;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...getHeaders(), ...(init?.headers as Record<string, string> || {}) },
  });
  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data as T;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type ConsentPurpose =
  | 'marketing'
  | 'analytics'
  | 'functional'
  | 'communications'
  | 'data_transfer'
  | 'profiling'
  | 'other';

export type ConsentChannel = 'web' | 'phone' | 'email' | 'in_person' | 'app' | 'other';

export type LegalBasis = 'consent' | 'legitimate_interest' | 'contract' | 'legal_obligation';

export interface GdprConsent {
  id: string;
  _rev?: string;
  user_id: string;
  clientId: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  clientDni: string;
  purpose: ConsentPurpose;
  purposeDescription: string;
  channel: ConsentChannel;
  granted: boolean;
  grantedAt: string | null;
  revokedAt: string | null;
  expiresAt: string | null;
  ipAddress: string;
  notes: string;
  legalBasis: LegalBasis;
  createdAt: string;
  updatedAt: string;
}

export type GdprRightType =
  | 'access'
  | 'rectification'
  | 'erasure'
  | 'portability'
  | 'objection'
  | 'restriction';

export type GdprRequestStatus = 'pending' | 'in_progress' | 'completed' | 'rejected';

export interface GdprRequest {
  id: string;
  _rev?: string;
  user_id: string;
  clientId: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  clientDni: string;
  rightType: GdprRightType;
  status: GdprRequestStatus;
  description: string;
  response: string;
  assignedTo: string;
  legalDeadline: string | null;
  completedAt: string | null;
  rejectedAt: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface ErasureCertificate {
  id: string;
  executedAt: string;
  executedBy: string;
  clientId: string;
  clientName: string;
  legalBasis: string;
  affectedDatabases: Array<{ db: string; type: string; anonymized?: number; error?: string }>;
}

// ─── Consents API ─────────────────────────────────────────────────────────────

export async function listConsents(userId: string): Promise<GdprConsent[]> {
  const data = await req<{ ok: boolean; consents: GdprConsent[] }>(
    `/api/gdpr/consents/${userId}`,
  );
  return data.consents;
}

export async function createConsent(
  userId: string,
  consent: Partial<GdprConsent>,
): Promise<GdprConsent> {
  const data = await req<{ ok: boolean; consent: GdprConsent }>(
    `/api/gdpr/consents/${userId}`,
    { method: 'POST', body: JSON.stringify({ consent }) },
  );
  return data.consent;
}

export async function updateConsent(
  userId: string,
  consentId: string,
  consent: Partial<GdprConsent>,
): Promise<GdprConsent> {
  const data = await req<{ ok: boolean; consent: GdprConsent }>(
    `/api/gdpr/consents/${userId}/${consentId}`,
    { method: 'PUT', body: JSON.stringify({ consent }) },
  );
  return data.consent;
}

export async function revokeConsent(
  userId: string,
  consentId: string,
  consent: GdprConsent,
): Promise<GdprConsent> {
  return updateConsent(userId, consentId, { ...consent, granted: false });
}

// ─── Rights Requests API ──────────────────────────────────────────────────────

export async function listRequests(userId: string): Promise<GdprRequest[]> {
  const data = await req<{ ok: boolean; requests: GdprRequest[] }>(
    `/api/gdpr/requests/${userId}`,
  );
  return data.requests;
}

export async function createRequest(
  userId: string,
  request: Partial<GdprRequest>,
): Promise<GdprRequest> {
  const data = await req<{ ok: boolean; request: GdprRequest }>(
    `/api/gdpr/requests/${userId}`,
    { method: 'POST', body: JSON.stringify({ request }) },
  );
  return data.request;
}

export async function updateRequest(
  userId: string,
  requestId: string,
  request: Partial<GdprRequest>,
): Promise<GdprRequest> {
  const data = await req<{ ok: boolean; request: GdprRequest }>(
    `/api/gdpr/requests/${userId}/${requestId}`,
    { method: 'PUT', body: JSON.stringify({ request }) },
  );
  return data.request;
}

// ─── LEG-02: Derecho al olvido ────────────────────────────────────────────────

export async function executeErasure(
  userId: string,
  payload: {
    clientId: string;
    clientName: string;
    reason: string;
    confirmText: string;
  },
): Promise<{ erasure: unknown; certificate: ErasureCertificate }> {
  const data = await req<{ ok: boolean; erasure: unknown; certificate: ErasureCertificate }>(
    `/api/gdpr/erasure/${userId}`,
    { method: 'POST', body: JSON.stringify(payload) },
  );
  return { erasure: data.erasure, certificate: data.certificate };
}
