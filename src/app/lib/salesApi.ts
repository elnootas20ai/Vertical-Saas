import {
  normalizeSaleRecord,
  type SaleRecord,
  type CreateSalePayload,
} from './salesTypes';
import { authFetch, getAuthHeaders } from './authApi';

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

function getStoredSessionUserId(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem('vertial_session_user');
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as { user_id?: string };
    return parsed?.user_id || null;
  } catch {
    return null;
  }
}

function resolveUserId(userId?: string): string {
  const resolved = (userId || '').trim() || getStoredSessionUserId() || '';
  if (!resolved) {
    throw new Error('No se pudo resolver el usuario de la sesión');
  }
  return resolved;
}

function getCouchHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (env.VITE_COUCHDB_URL) headers['x-couch-url'] = env.VITE_COUCHDB_URL;
  if (env.VITE_COUCHDB_USER) headers['x-couch-user'] = env.VITE_COUCHDB_USER;
  if (env.VITE_COUCHDB_PASSWORD) headers['x-couch-password'] = env.VITE_COUCHDB_PASSWORD;
  return headers;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await authFetch(`${API_BASE}${path}`, {
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

  if (response.status === 401) {
    throw new Error('Sesión expirada. Por favor, inicia sesión de nuevo.');
  }

  if (!response.ok) {
    throw new Error(payload?.error || 'Error inesperado en ventas');
  }

  return payload;
}

export async function listSalesRecords(userId?: string): Promise<SaleRecord[]> {
  const resolvedUserId = resolveUserId(userId);
  const payload = await request<{ ok: boolean; sales: unknown[] }>(
    `/api/sales/${encodeURIComponent(resolvedUserId)}`,
  );
  return (payload.sales || [])
    .map(normalizeSaleRecord)
    .filter((s): s is SaleRecord => Boolean(s))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function getSaleRecord(userIdOrId: string, id?: string): Promise<SaleRecord | null> {
  const resolvedId = id || userIdOrId;
  const resolvedUserId = id ? userIdOrId : undefined;
  const sales = await listSalesRecords(resolvedUserId);
  if (!resolvedId) {
    return null;
  }
  return sales.find((s) => s.id === resolvedId || s._id === resolvedId) || null;
}

export async function createSaleInCouch(
  userIdOrPayload: string | CreateSalePayload,
  payload?: CreateSalePayload,
): Promise<SaleRecord> {
  const resolvedUserId = resolveUserId(
    typeof userIdOrPayload === 'string' ? userIdOrPayload : undefined,
  );
  const resolvedPayload =
    typeof userIdOrPayload === 'string' ? payload : userIdOrPayload;
  if (!resolvedPayload) {
    throw new Error('Faltan datos de la venta');
  }

  const result = await request<{ ok: boolean; sale: unknown }>(
    `/api/sales/${encodeURIComponent(resolvedUserId)}`,
    {
      method: 'POST',
      body: JSON.stringify({ sale: resolvedPayload }),
    },
  );

  const normalized = normalizeSaleRecord(result.sale);
  if (!normalized) throw new Error('La respuesta del servidor no contiene una venta válida');
  return normalized;
}

export async function updateSaleInCouch(
  userIdOrDocument: string | SaleRecord,
  document?: SaleRecord,
): Promise<SaleRecord> {
  const resolvedUserId = resolveUserId(
    typeof userIdOrDocument === 'string' ? userIdOrDocument : undefined,
  );
  const resolvedDocument =
    typeof userIdOrDocument === 'string' ? document : userIdOrDocument;
  if (!resolvedDocument?._id) {
    throw new Error('Faltan datos de la venta para actualizar');
  }

  const result = await request<{ ok: boolean; sale: unknown }>(
    `/api/sales/${encodeURIComponent(resolvedUserId)}/${encodeURIComponent(resolvedDocument._id)}`,
    {
      method: 'PUT',
      body: JSON.stringify({ sale: resolvedDocument }),
    },
  );

  const normalized = normalizeSaleRecord(result.sale);
  if (!normalized) throw new Error('La respuesta del servidor no contiene una venta válida');
  return normalized;
}

type SaleIdentifier = { id?: string; _id?: string };

export async function deleteSaleFromCouch(userId: string, saleId: string): Promise<void> {
  await deleteSaleInCouch(userId, saleId);
}

export async function deleteSaleInCouch(
  userIdOrSale: string | SaleIdentifier,
  saleId?: string,
): Promise<void> {
  const resolvedUserId = resolveUserId(typeof userIdOrSale === 'string' ? userIdOrSale : undefined);
  const resolvedSaleId =
    typeof userIdOrSale === 'string'
      ? saleId || ''
      : userIdOrSale._id || userIdOrSale.id || '';
  if (!resolvedSaleId) {
    throw new Error('Falta el identificador de la venta');
  }

  await request(`/api/sales/${encodeURIComponent(resolvedUserId)}/${encodeURIComponent(resolvedSaleId)}`, {
    method: 'DELETE',
  });
}