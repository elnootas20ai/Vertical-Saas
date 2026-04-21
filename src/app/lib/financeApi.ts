import {
  normalizeFinanceMovementRecord,
  type CreateFinanceMovementPayload,
  type FinanceMovementRecord,
} from './financeTypes';
import { getAuthHeaders } from './authApi';

const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};

function getApiBase() {
  if (env.VITE_API_URL) {
    return env.VITE_API_URL;
  }

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

const API_BASE = getApiBase();

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

  const payload = (await response.json().catch(() => ({}))) as T & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(payload?.error || 'Error inesperado en finanzas');
  }

  return payload;
}

export async function listFinanceMovements(userId: string): Promise<FinanceMovementRecord[]> {
  const payload = await request<{ ok: boolean; movements: unknown[] }>(
    `/api/finance/${encodeURIComponent(userId)}`,
  );

  return (payload.movements || [])
    .map(normalizeFinanceMovementRecord)
    .filter((m): m is FinanceMovementRecord => Boolean(m))
    .sort((a, b) => {
      const d = String(b.date).localeCompare(String(a.date));
      return d !== 0 ? d : String(b.createdAt).localeCompare(String(a.createdAt));
    });
}

export async function createFinanceMovementInCouch(
  userId: string,
  payload: CreateFinanceMovementPayload,
): Promise<FinanceMovementRecord> {
  const result = await request<{ ok: boolean; movement: unknown }>(
    `/api/finance/${encodeURIComponent(userId)}`,
    {
      method: 'POST',
      body: JSON.stringify({ movement: { ...payload, user_id: userId } }),
    },
  );

  const normalized = normalizeFinanceMovementRecord(result.movement);
  if (!normalized) throw new Error('La respuesta del servidor no contiene un movimiento válido');
  return normalized;
}

export async function updateFinanceMovementInCouch(
  userId: string,
  document: FinanceMovementRecord,
): Promise<FinanceMovementRecord> {
  const result = await request<{ ok: boolean; movement: unknown }>(
    `/api/finance/${encodeURIComponent(userId)}/${encodeURIComponent(document._id)}`,
    {
      method: 'PUT',
      body: JSON.stringify({ movement: document }),
    },
  );

  const normalized = normalizeFinanceMovementRecord(result.movement);
  if (!normalized) throw new Error('La respuesta del servidor no contiene un movimiento válido');
  return normalized;
}

export async function deleteFinanceMovementFromCouch(
  userId: string,
  movementId: string,
): Promise<void> {
  await request(
    `/api/finance/${encodeURIComponent(userId)}/${encodeURIComponent(movementId)}`,
    { method: 'DELETE' },
  );
}

export async function markMovementPaid(
  userId: string,
  movementId: string,
): Promise<FinanceMovementRecord> {
  const result = await request<{ ok: boolean; movement: unknown }>(
    `/api/finance/${encodeURIComponent(userId)}/${encodeURIComponent(movementId)}/mark-paid`,
    { method: 'PUT' },
  );
  const normalized = normalizeFinanceMovementRecord(result.movement);
  if (!normalized) throw new Error('Respuesta inválida del servidor');
  return normalized;
}

export async function createMovementFromInvoice(
  userId: string,
  invoiceId: string,
  invoiceType: 'client_invoice' | 'purchase_invoice',
): Promise<FinanceMovementRecord> {
  const result = await request<{ ok: boolean; movement: unknown }>(
    `/api/finance/${encodeURIComponent(userId)}/from-invoice`,
    {
      method: 'POST',
      body: JSON.stringify({ invoiceId, invoiceType }),
    },
  );
  const normalized = normalizeFinanceMovementRecord(result.movement);
  if (!normalized) throw new Error('Respuesta inválida del servidor');
  return normalized;
}

export async function createMovementFromSale(
  userId: string,
  saleId: string,
): Promise<FinanceMovementRecord> {
  const result = await request<{ ok: boolean; movement: unknown }>(
    `/api/finance/${encodeURIComponent(userId)}/from-sale`,
    {
      method: 'POST',
      body: JSON.stringify({ saleId }),
    },
  );
  const normalized = normalizeFinanceMovementRecord(result.movement);
  if (!normalized) throw new Error('Respuesta inválida del servidor');
  return normalized;
}

export async function fetchCategorySuggestion(
  userId: string,
  params: { concept?: string; companyName?: string; type?: string },
): Promise<string | null> {
  const qs = new URLSearchParams();
  if (params.concept) qs.set('concept', params.concept);
  if (params.companyName) qs.set('companyName', params.companyName);
  if (params.type) qs.set('type', params.type);
  const result = await request<{ ok: boolean; category: string | null }>(
    `/api/finance/${encodeURIComponent(userId)}/suggest-category?${qs}`,
  );
  return result.category;
}

export interface ReconciliationSuggestion {
  movementId: string;
  bankTransactionId: string;
  confidence: number;
  matchReason: string;
  movementConcept: string;
  txDescription: string;
  amount: number;
}

export async function fetchReconciliationSuggestions(
  userId: string,
): Promise<ReconciliationSuggestion[]> {
  const result = await request<{ ok: boolean; suggestions: ReconciliationSuggestion[] }>(
    `/api/finance/${encodeURIComponent(userId)}/reconciliation-suggestions`,
  );
  return result.suggestions || [];
}
