import { getAuthHeaders } from './authApi';
import { getApiBase } from './apiBase';
import { notifyWorkshopDataChanged, type WorkshopScope } from './workshopEvents';

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

function withBusinessQuery(path: string, businessId?: string): string {
  const scope = String(businessId || '').trim();
  if (!scope) return path;
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}businessId=${encodeURIComponent(scope)}`;
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
    throw new Error(payload?.error || 'Error inesperado en parts API');
  }
  return payload;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type PartCategory =
  | 'motor'
  | 'frenos'
  | 'suspension'
  | 'electricidad'
  | 'carroceria'
  | 'filtros'
  | 'aceites'
  | 'neumaticos'
  | 'otro';

export type StockMovementType = 'entrada' | 'salida' | 'ajuste';

export interface StockMovement {
  id: string;
  type: StockMovementType;
  quantity: number;
  previousStock: number;
  newStock: number;
  workOrderId?: string;
  workOrderNumber?: string;
  notes?: string;
  date: string;
  user: string;
}

export interface Part {
  _id: string;
  _rev?: string;
  type: 'part';
  id: string;
  partNumber: string;
  user_id: string;
  business_id?: string;
  name: string;
  reference: string;
  category: PartCategory;
  brand?: string;
  unitCost: number;
  salePrice: number;
  stockQuantity: number;
  minStock: number;
  location?: string;
  notes?: string;
  movements?: StockMovement[];
  createdAt: string;
  updatedAt: string;
}

export type CreatePartPayload = Omit<Part, '_id' | '_rev' | 'type' | 'id' | 'partNumber' | 'user_id' | 'createdAt' | 'updatedAt'>;

export function normalizePart(value: unknown): Part | null {
  if (!value || typeof value !== 'object') return null;
  const d = value as Record<string, unknown>;
  if (d.type !== 'part' || !d._id) return null;
  return {
    _id: String(d._id || ''),
    _rev: d._rev ? String(d._rev) : undefined,
    type: 'part',
    id: String(d._id || d.id || ''),
    partNumber: String(d.partNumber || ''),
    user_id: String(d.user_id || ''),
    name: String(d.name || ''),
    reference: String(d.reference || ''),
    category: (d.category as PartCategory) || 'otro',
    brand: d.brand ? String(d.brand) : undefined,
    unitCost: Number(d.unitCost || 0),
    salePrice: Number(d.salePrice || 0),
    stockQuantity: Number(d.stockQuantity || 0),
    minStock: Number(d.minStock || 0),
    location: d.location ? String(d.location) : undefined,
    notes: d.notes ? String(d.notes) : undefined,
    movements: Array.isArray(d.movements) ? (d.movements as StockMovement[]) : [],
    createdAt: String(d.createdAt || new Date().toISOString()),
    updatedAt: String(d.updatedAt || d.createdAt || new Date().toISOString()),
  };
}

// ─── API Functions ────────────────────────────────────────────────────────────

export async function listPartsRequest(userId: string, scope?: WorkshopScope): Promise<Part[]> {
  const normalizedUserId = normalizeUserId(userId);
  const payload = await request<{ ok: boolean; parts: unknown[] }>(
    withBusinessQuery(`/api/workshop/parts/${encodeURIComponent(normalizedUserId)}`, scope?.businessId),
  );
  return (payload.parts || [])
    .map(normalizePart)
    .filter((p): p is Part => Boolean(p));
}

export async function createPartRequest(
  userId: string,
  data: CreatePartPayload,
  scope?: WorkshopScope,
): Promise<Part> {
  const normalizedUserId = normalizeUserId(userId);
  const businessId = String(scope?.businessId || (data as { business_id?: string }).business_id || '').trim();
  const result = await request<{ ok: boolean; part: unknown }>(
    `/api/workshop/parts/${encodeURIComponent(normalizedUserId)}`,
    {
      method: 'POST',
      body: JSON.stringify({
        part: businessId ? { ...data, business_id: businessId } : data,
      }),
    },
  );
  const normalized = normalizePart(result.part);
  if (!normalized) throw new Error('Respuesta inválida del servidor');
  notifyWorkshopDataChanged();
  return normalized;
}

export async function updatePartRequest(userId: string, part: Part, scope?: WorkshopScope): Promise<Part> {
  const normalizedUserId = normalizeUserId(userId);
  const businessId = String(scope?.businessId || part.business_id || '').trim();
  const payload = businessId ? { ...part, business_id: businessId } : part;
  const result = await request<{ ok: boolean; part: unknown }>(
    `/api/workshop/parts/${encodeURIComponent(normalizedUserId)}/${encodeURIComponent(part._id)}`,
    { method: 'PUT', body: JSON.stringify({ part: payload }) },
  );
  const normalized = normalizePart(result.part);
  if (!normalized) throw new Error('Respuesta inválida del servidor');
  notifyWorkshopDataChanged();
  return normalized;
}

export async function deletePartRequest(userId: string, partId: string): Promise<void> {
  const normalizedUserId = normalizeUserId(userId);
  await request(
    `/api/workshop/parts/${encodeURIComponent(normalizedUserId)}/${encodeURIComponent(partId)}`,
    { method: 'DELETE' },
  );
  notifyWorkshopDataChanged();
}

export function isLowStock(part: Part): boolean {
  return part.minStock > 0 && part.stockQuantity <= part.minStock;
}

export function isCriticalStock(part: Part): boolean {
  return part.minStock > 0 && part.stockQuantity === 0;
}
