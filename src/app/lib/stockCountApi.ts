import { getAuthHeaders } from './authApi';
import type { StockCategory } from './deliveryApi';

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

function normalizeUserId(userId: string): string {
  const value = String(userId || '').trim();
  return value.startsWith('account:') ? value.slice('account:'.length) : value;
}

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
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload?.error || 'Error inesperado en stock-counts API');
  }
  return payload;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type CountStatus = 'draft' | 'in_progress' | 'completed' | 'cancelled';
export type CountType = 'full' | 'partial' | 'spot_check';

export interface StockCountLine {
  catalogItemId: string;
  catalogItemName: string;
  sku: string;
  stockCategory: StockCategory;
  unit: string;
  costPrice: number;
  theoreticalStock: number;
  countedStock: number | null;
  difference: number | null;
  differencePercent: number | null;
  differenceValue: number | null;
  notes: string;
  countedBy: string;
  countedAt: string | null;
}

export interface StockCount {
  _id: string;
  _rev?: string;
  type: 'stock_count';
  id: string;
  user_id: string;
  name: string;
  warehouseId: string;
  warehouseName: string;
  status: CountStatus;
  countType: CountType;
  filterCategories: string[];
  lines: StockCountLine[];
  totalTheoreticalValue: number;
  totalCountedValue: number;
  totalDifferenceValue: number;
  adjustmentsGenerated: boolean;
  startedAt: string;
  completedAt: string;
  startedBy: string;
  completedBy: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Stock Counts API ─────────────────────────────────────────────────────────

export async function listStockCountsRequest(userId: string): Promise<StockCount[]> {
  const id = normalizeUserId(userId);
  const payload = await request<{ ok: boolean; counts: StockCount[] }>(
    `/api/stock-counts/${encodeURIComponent(id)}`,
  );
  return payload.counts || [];
}

export async function createStockCountRequest(
  userId: string,
  data: { name: string; warehouseId?: string; warehouseName?: string; countType?: CountType; filterCategories?: string[] },
): Promise<StockCount> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; stockCount: StockCount }>(
    `/api/stock-counts/${encodeURIComponent(id)}`,
    { method: 'POST', body: JSON.stringify({ stockCount: data }) },
  );
  if (!result.stockCount) throw new Error('Respuesta invalida del servidor');
  return result.stockCount;
}

export async function getStockCountRequest(userId: string, countId: string): Promise<StockCount> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; stockCount: StockCount }>(
    `/api/stock-counts/${encodeURIComponent(id)}/${encodeURIComponent(countId)}`,
  );
  if (!result.stockCount) throw new Error('Respuesta invalida del servidor');
  return result.stockCount;
}

export async function updateCountLineRequest(
  userId: string,
  countId: string,
  lineIdx: number,
  data: { countedStock: number; notes?: string; countedBy?: string },
): Promise<StockCount> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; stockCount: StockCount }>(
    `/api/stock-counts/${encodeURIComponent(id)}/${encodeURIComponent(countId)}/line/${lineIdx}`,
    { method: 'PUT', body: JSON.stringify(data) },
  );
  if (!result.stockCount) throw new Error('Respuesta invalida del servidor');
  return result.stockCount;
}

export async function completeStockCountRequest(userId: string, countId: string): Promise<StockCount> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; stockCount: StockCount }>(
    `/api/stock-counts/${encodeURIComponent(id)}/${encodeURIComponent(countId)}/complete`,
    { method: 'POST' },
  );
  if (!result.stockCount) throw new Error('Respuesta invalida del servidor');
  return result.stockCount;
}

export async function generateAdjustmentsRequest(
  userId: string,
  countId: string,
): Promise<{ adjustmentsCreated: number; stockCount: StockCount }> {
  const id = normalizeUserId(userId);
  return request<{ ok: boolean; adjustmentsCreated: number; stockCount: StockCount }>(
    `/api/stock-counts/${encodeURIComponent(id)}/${encodeURIComponent(countId)}/generate-adjustments`,
    { method: 'POST' },
  );
}
