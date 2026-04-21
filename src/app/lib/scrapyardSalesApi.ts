import { authFetch, getAuthHeaders } from './authApi';
import {
  normalizeScrapyardSale,
  type ScrapyardSale,
  type ScrapyardSaleMetrics,
  type ScrapyardSalePayment,
  type CreateScrapyardSalePayload,
  type OrderStatus,
} from './scrapyardSalesTypes';

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

const API_BASE = getApiBase();

function getStoredUserId(): string {
  try {
    const raw = window.localStorage.getItem('udar_session_user');
    if (!raw) return '';
    return (JSON.parse(raw) as { user_id?: string })?.user_id || '';
  } catch { return ''; }
}

function resolveUserId(userId?: string): string {
  const resolved = (userId || '').trim() || getStoredUserId();
  if (!resolved) throw new Error('No se pudo resolver el usuario de la sesión');
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
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (response.status === 401) throw new Error('Sesión expirada. Inicia sesión de nuevo.');
  if (!response.ok) throw new Error(payload?.error || 'Error inesperado');
  return payload;
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

export async function listScrapyardSales(userId?: string): Promise<ScrapyardSale[]> {
  const uid = resolveUserId(userId);
  const res = await request<{ ok: boolean; sales: unknown[] }>(
    `/api/scrapyard-sales/${encodeURIComponent(uid)}`,
  );
  return (res.sales || []).map(normalizeScrapyardSale).filter((s): s is ScrapyardSale => !!s);
}

export async function getScrapyardSale(saleId: string, userId?: string): Promise<ScrapyardSale | null> {
  const uid = resolveUserId(userId);
  const res = await request<{ ok: boolean; sale: unknown }>(
    `/api/scrapyard-sales/${encodeURIComponent(uid)}/${encodeURIComponent(saleId)}`,
  );
  return normalizeScrapyardSale(res.sale);
}

export async function createScrapyardSale(payload: CreateScrapyardSalePayload, userId?: string): Promise<ScrapyardSale> {
  const uid = resolveUserId(userId);
  const res = await request<{ ok: boolean; sale: unknown }>(
    `/api/scrapyard-sales/${encodeURIComponent(uid)}`,
    { method: 'POST', body: JSON.stringify({ sale: payload }) },
  );
  const sale = normalizeScrapyardSale(res.sale);
  if (!sale) throw new Error('Respuesta inválida del servidor');
  return sale;
}

export async function updateScrapyardSale(sale: Partial<ScrapyardSale> & { _id: string }, userId?: string): Promise<ScrapyardSale> {
  const uid = resolveUserId(userId);
  const res = await request<{ ok: boolean; sale: unknown }>(
    `/api/scrapyard-sales/${encodeURIComponent(uid)}/${encodeURIComponent(sale._id)}`,
    { method: 'PUT', body: JSON.stringify({ sale }) },
  );
  const updated = normalizeScrapyardSale(res.sale);
  if (!updated) throw new Error('Respuesta inválida del servidor');
  return updated;
}

export async function deleteScrapyardSale(saleId: string, userId?: string): Promise<void> {
  const uid = resolveUserId(userId);
  await request(`/api/scrapyard-sales/${encodeURIComponent(uid)}/${encodeURIComponent(saleId)}`, { method: 'DELETE' });
}

// ─── Actions ─────────────────────────────────────────────────────────────────

export async function registerPayment(saleId: string, payment: Omit<ScrapyardSalePayment, 'id'>, userId?: string): Promise<ScrapyardSale> {
  const uid = resolveUserId(userId);
  const res = await request<{ ok: boolean; sale: unknown }>(
    `/api/scrapyard-sales/${encodeURIComponent(uid)}/${encodeURIComponent(saleId)}/payment`,
    { method: 'POST', body: JSON.stringify({ payment }) },
  );
  const sale = normalizeScrapyardSale(res.sale);
  if (!sale) throw new Error('Respuesta inválida del servidor');
  return sale;
}

export async function changeOrderStatus(saleId: string, newStatus: OrderStatus, extra?: { numSeguimiento?: string; transportista?: string; cancelMotivo?: string }, userId?: string): Promise<ScrapyardSale> {
  const uid = resolveUserId(userId);
  const res = await request<{ ok: boolean; sale: unknown }>(
    `/api/scrapyard-sales/${encodeURIComponent(uid)}/${encodeURIComponent(saleId)}/status`,
    { method: 'POST', body: JSON.stringify({ status: newStatus, ...extra }) },
  );
  const sale = normalizeScrapyardSale(res.sale);
  if (!sale) throw new Error('Respuesta inválida del servidor');
  return sale;
}

export async function getScrapyardSalesMetrics(userId?: string): Promise<ScrapyardSaleMetrics> {
  const uid = resolveUserId(userId);
  return request<ScrapyardSaleMetrics>(`/api/scrapyard-sales/${encodeURIComponent(uid)}/metrics`);
}
