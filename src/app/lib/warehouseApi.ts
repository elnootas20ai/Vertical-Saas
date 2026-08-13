import { getAuthHeaders } from './authApi';
import { getApiBase } from './apiBase';

const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};


const API_BASE = getApiBase();

function normalizeUserId(userId: string): string {
  const value = String(userId || '').trim();
  return value.startsWith('account:') ? value.slice('account:'.length) : value;
}

function getCouchHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
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
    throw new Error(payload?.error || 'Error inesperado en warehouse API');
  }
  return payload;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type WarehouseType = 'general' | 'store' | 'workshop' | 'cold' | 'external';

export interface Warehouse {
  _id: string;
  _rev?: string;
  type: 'warehouse';
  id: string;
  user_id: string;
  name: string;
  code: string;
  address: string;
  isDefault: boolean;
  active: boolean;
  notes: string;
  contactPerson: string;
  phone: string;
  email: string;
  warehouseType: WarehouseType;
  /** PDV / tienda ligada (stock por tienda). */
  salesPointId?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Warehouse API ────────────────────────────────────────────────────────────

export async function listWarehousesRequest(userId: string): Promise<Warehouse[]> {
  const id = normalizeUserId(userId);
  const payload = await request<{ ok: boolean; warehouses: Warehouse[] }>(
    `/api/warehouses/${encodeURIComponent(id)}`,
  );
  return payload.warehouses || [];
}

export async function createWarehouseRequest(userId: string, data: Partial<Warehouse>): Promise<Warehouse> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; warehouse: Warehouse }>(
    `/api/warehouses/${encodeURIComponent(id)}`,
    { method: 'POST', body: JSON.stringify({ warehouse: data }) },
  );
  if (!result.warehouse) throw new Error('Respuesta inválida del servidor');
  return result.warehouse;
}

export async function updateWarehouseRequest(userId: string, warehouse: Warehouse): Promise<Warehouse> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; warehouse: Warehouse }>(
    `/api/warehouses/${encodeURIComponent(id)}/${encodeURIComponent(warehouse._id)}`,
    { method: 'PUT', body: JSON.stringify({ warehouse }) },
  );
  if (!result.warehouse) throw new Error('Respuesta inválida del servidor');
  return result.warehouse;
}

export async function deleteWarehouseRequest(userId: string, warehouseId: string): Promise<void> {
  const id = normalizeUserId(userId);
  await request(
    `/api/warehouses/${encodeURIComponent(id)}/${encodeURIComponent(warehouseId)}`,
    { method: 'DELETE' },
  );
}
