import { authFetch } from './authApi';
import { getApiBase } from './apiBase';

const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};

const API_BASE = getApiBase();

const STOCK_MOVEMENT_TIMEOUT_MS = 25_000;
const STOCK_MOVEMENT_LIST_LIMIT = 120;

function normalizeUserId(userId: string): string {
  const value = String(userId || '').trim();
  return value.startsWith('account:') ? value.slice('account:'.length) : value;
}

function getCouchHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  return headers;
}

function stockMovementRequestSignal(init?: RequestInit): AbortSignal | undefined {
  if (init?.signal) return init.signal;
  if (typeof AbortSignal?.timeout === 'function') {
    return AbortSignal.timeout(STOCK_MOVEMENT_TIMEOUT_MS);
  }
  return undefined;
}

function stockMovementRequestErrorMessage(
  payload: { error?: unknown; message?: unknown },
  fallback: string,
): string {
  const err = payload?.error;
  if (typeof err === 'string' && err.trim()) return err.trim();
  if (err && typeof err === 'object') {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === 'string' && msg.trim()) return msg.trim();
  }
  if (typeof payload?.message === 'string' && payload.message.trim()) return payload.message.trim();
  return fallback;
}

export function stockMovementUserMessage(err: unknown, fallback = 'No se pudo cargar el historial'): string {
  if (err instanceof Error) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      return 'La carga del historial tardó demasiado. Inténtalo de nuevo.';
    }
    const msg = err.message?.trim();
    if (msg && /timed out|timeout/i.test(msg)) {
      return 'La carga del historial tardó demasiado. Inténtalo de nuevo.';
    }
    if (msg) return msg;
  }
  return fallback;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await authFetch(`${API_BASE}${path}`, {
    ...init,
    signal: stockMovementRequestSignal(init),
    headers: {
      'Content-Type': 'application/json',
      ...getCouchHeaders(),
      ...(init?.headers || {}),
    },
  }, 0, false, { suppressLogout: true });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: unknown; message?: unknown };
  if (!response.ok) {
    throw new Error(stockMovementRequestErrorMessage(payload, 'Error inesperado en stock movement API'));
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
  filters?: {
    catalogItemId?: string;
    warehouseId?: string;
    movementType?: string;
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
  },
): Promise<StockMovement[]> {
  const id = normalizeUserId(userId);
  const params = new URLSearchParams();
  if (filters?.catalogItemId) params.set('catalogItemId', filters.catalogItemId);
  if (filters?.warehouseId) params.set('warehouseId', filters.warehouseId);
  if (filters?.movementType) params.set('movementType', filters.movementType);
  if (filters?.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters?.dateTo) params.set('dateTo', filters.dateTo);
  if (filters?.limit) params.set('limit', String(filters.limit));
  const qs = params.toString() ? `?${params.toString()}` : '';
  const payload = await request<{ ok: boolean; movements: StockMovement[] }>(
    `/api/stock-movements/${encodeURIComponent(id)}${qs}`,
  );
  return payload.movements || [];
}

export async function getMovementsByItemRequest(
  userId: string,
  catalogItemId: string,
  limit = STOCK_MOVEMENT_LIST_LIMIT,
): Promise<StockMovement[]> {
  const id = normalizeUserId(userId);
  const params = new URLSearchParams();
  if (limit > 0) params.set('limit', String(limit));
  const qs = params.toString() ? `?${params.toString()}` : '';
  const payload = await request<{ ok: boolean; movements: StockMovement[] }>(
    `/api/stock-movements/${encodeURIComponent(id)}/item/${encodeURIComponent(catalogItemId)}${qs}`,
  );
  return payload.movements || [];
}

export async function getMovementsByWarehouseRequest(
  userId: string,
  warehouseId: string,
  limit = STOCK_MOVEMENT_LIST_LIMIT,
): Promise<StockMovement[]> {
  const id = normalizeUserId(userId);
  const params = new URLSearchParams();
  if (limit > 0) params.set('limit', String(limit));
  const qs = params.toString() ? `?${params.toString()}` : '';
  const payload = await request<{ ok: boolean; movements: StockMovement[] }>(
    `/api/stock-movements/${encodeURIComponent(id)}/warehouse/${encodeURIComponent(warehouseId)}${qs}`,
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
