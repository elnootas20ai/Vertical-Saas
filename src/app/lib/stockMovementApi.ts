import { getAuthHeaders } from './authApi';

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
    throw new Error(payload?.error || 'Error inesperado en stock movement API');
  }
  return payload;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type MovementType =
  | 'purchase_reception'
  | 'sale'
  | 'internal_consumption'
  | 'adjustment_in'
  | 'adjustment_out'
  | 'transfer'
  | 'return_supplier'
  | 'return_customer'
  | 'initial';

export type ConsumptionReason = 'internal_use' | 'sample' | 'breakage' | 'expiry' | 'event' | 'other';

export interface StockMovement {
  _id: string;
  type: 'stock_movement';
  id: string;
  user_id: string;
  catalogItemId: string;
  catalogItemName: string;
  sku: string;
  warehouseId: string;
  warehouseToId: string;
  movementType: MovementType;
  quantity: number;
  previousStock: number;
  newStock: number;
  unitCost: number;
  totalCost: number;
  referenceId: string;
  referenceType: string;
  notes: string;
  performedBy: string;
  createdAt: string;
}

export interface MovementsSummary {
  totalMovements: number;
  totalIn: number;
  totalOut: number;
  totalInValue: number;
  totalOutValue: number;
  netChange: number;
  netValue: number;
}

// ─── Stock Movements API ──────────────────────────────────────────────────────

export async function listStockMovementsRequest(
  userId: string,
  filters?: { catalogItemId?: string; warehouseId?: string; movementType?: string; dateFrom?: string; dateTo?: string },
): Promise<StockMovement[]> {
  const id = normalizeUserId(userId);
  const params = new URLSearchParams();
  if (filters?.catalogItemId) params.set('catalogItemId', filters.catalogItemId);
  if (filters?.warehouseId) params.set('warehouseId', filters.warehouseId);
  if (filters?.movementType) params.set('movementType', filters.movementType);
  if (filters?.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters?.dateTo) params.set('dateTo', filters.dateTo);
  const qs = params.toString() ? `?${params.toString()}` : '';
  const payload = await request<{ ok: boolean; movements: StockMovement[] }>(
    `/api/stock-movements/${encodeURIComponent(id)}${qs}`,
  );
  return payload.movements || [];
}

export async function getMovementsByItemRequest(userId: string, catalogItemId: string): Promise<StockMovement[]> {
  const id = normalizeUserId(userId);
  const payload = await request<{ ok: boolean; movements: StockMovement[] }>(
    `/api/stock-movements/${encodeURIComponent(id)}/item/${encodeURIComponent(catalogItemId)}`,
  );
  return payload.movements || [];
}

export async function getMovementsByWarehouseRequest(userId: string, warehouseId: string): Promise<StockMovement[]> {
  const id = normalizeUserId(userId);
  const payload = await request<{ ok: boolean; movements: StockMovement[] }>(
    `/api/stock-movements/${encodeURIComponent(id)}/warehouse/${encodeURIComponent(warehouseId)}`,
  );
  return payload.movements || [];
}

export async function getMovementsSummaryRequest(
  userId: string,
  filters?: { dateFrom?: string; dateTo?: string },
): Promise<MovementsSummary> {
  const id = normalizeUserId(userId);
  const params = new URLSearchParams();
  if (filters?.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters?.dateTo) params.set('dateTo', filters.dateTo);
  const qs = params.toString() ? `?${params.toString()}` : '';
  const payload = await request<{ ok: boolean; summary: MovementsSummary }>(
    `/api/stock-movements/${encodeURIComponent(id)}/summary${qs}`,
  );
  return payload.summary;
}

export async function createAdjustmentRequest(
  userId: string,
  data: { catalogItemId: string; quantity: number; type: 'in' | 'out'; warehouseId?: string; notes: string },
): Promise<StockMovement> {
  const id = normalizeUserId(userId);
  const payload = await request<{ ok: boolean; movement: StockMovement }>(
    `/api/stock-movements/${encodeURIComponent(id)}/adjustment`,
    { method: 'POST', body: JSON.stringify(data) },
  );
  return payload.movement;
}

export async function createTransferRequest(
  userId: string,
  data: { catalogItemId: string; quantity: number; warehouseFromId: string; warehouseToId: string; notes?: string },
): Promise<StockMovement> {
  const id = normalizeUserId(userId);
  const payload = await request<{ ok: boolean; movement: StockMovement }>(
    `/api/stock-movements/${encodeURIComponent(id)}/transfer`,
    { method: 'POST', body: JSON.stringify(data) },
  );
  return payload.movement;
}

export async function createInternalConsumptionRequest(
  userId: string,
  data: { catalogItemId: string; quantity: number; warehouseId?: string; reason: ConsumptionReason; notes?: string },
): Promise<StockMovement> {
  const id = normalizeUserId(userId);
  const payload = await request<{ ok: boolean; movement: StockMovement }>(
    `/api/stock-movements/${encodeURIComponent(id)}/internal-consumption`,
    { method: 'POST', body: JSON.stringify(data) },
  );
  return payload.movement;
}
