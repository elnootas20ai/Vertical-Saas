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
    throw new Error(payload?.error || 'Error inesperado en waste API');
  }
  return payload;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type WasteType =
  | 'expiry'
  | 'breakage'
  | 'spoilage'
  | 'theft'
  | 'overproduction'
  | 'preparation_error'
  | 'spillage'
  | 'return_unusable'
  | 'other';

export type WasteSeverity = 'low' | 'medium' | 'high' | 'critical';
export type ReviewStatus = 'pending' | 'reviewed' | 'disputed';

export interface WasteRecord {
  _id: string;
  _rev?: string;
  type: 'waste_record';
  id: string;
  user_id: string;
  catalogItemId: string;
  catalogItemName: string;
  warehouseId: string;
  warehouseName: string;
  quantity: number;
  unit: string;
  wasteType: WasteType;
  severity: WasteSeverity;
  estimatedCost: number;
  notes: string;
  evidence: string[];
  reportedBy: string;
  reportedByName: string;
  reviewedBy: string;
  reviewStatus: ReviewStatus;
  reviewNotes: string;
  batchNumber: string;
  expiryDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface WasteSummaryItem {
  catalogItemId: string;
  name: string;
  totalCost: number;
  totalQuantity: number;
  count: number;
}

export interface WasteSummary {
  totalRecords: number;
  totalCost: number;
  totalQuantity: number;
  byType: Record<string, number>;
  topItems: WasteSummaryItem[];
  byWarehouse: { warehouseId: string; name: string; totalCost: number; count: number }[];
}

export interface WasteRate {
  catalogItemId: string;
  totalWaste: number;
  totalCost: number;
  recordCount: number;
}

export interface WasteFilters {
  wasteType?: WasteType;
  catalogItemId?: string;
  warehouseId?: string;
  reviewStatus?: ReviewStatus;
  severity?: WasteSeverity;
  dateFrom?: string;
  dateTo?: string;
}

// ─── Waste API ────────────────────────────────────────────────────────────────

export async function listWasteRequest(userId: string, filters?: WasteFilters): Promise<WasteRecord[]> {
  const id = normalizeUserId(userId);
  const params = new URLSearchParams();
  if (filters) {
    for (const [key, val] of Object.entries(filters)) {
      if (val) params.set(key, val);
    }
  }
  const qs = params.toString() ? `?${params}` : '';
  const payload = await request<{ ok: boolean; records: WasteRecord[] }>(
    `/api/waste/${encodeURIComponent(id)}${qs}`,
  );
  return payload.records || [];
}

export async function recordWasteRequest(userId: string, data: Partial<WasteRecord>): Promise<WasteRecord> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; record: WasteRecord }>(
    `/api/waste/${encodeURIComponent(id)}`,
    { method: 'POST', body: JSON.stringify({ waste: data }) },
  );
  if (!result.record) throw new Error('Respuesta invalida del servidor');
  return result.record;
}

export async function reviewWasteRequest(
  userId: string,
  wasteId: string,
  data: { reviewStatus: ReviewStatus; reviewNotes?: string; reviewedBy?: string },
): Promise<WasteRecord> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; record: WasteRecord }>(
    `/api/waste/${encodeURIComponent(id)}/${encodeURIComponent(wasteId)}/review`,
    { method: 'PUT', body: JSON.stringify(data) },
  );
  if (!result.record) throw new Error('Respuesta invalida del servidor');
  return result.record;
}

export async function getWasteSummaryRequest(
  userId: string,
  dateRange?: { dateFrom?: string; dateTo?: string },
): Promise<WasteSummary> {
  const id = normalizeUserId(userId);
  const params = new URLSearchParams();
  if (dateRange?.dateFrom) params.set('dateFrom', dateRange.dateFrom);
  if (dateRange?.dateTo) params.set('dateTo', dateRange.dateTo);
  const qs = params.toString() ? `?${params}` : '';
  const payload = await request<{ ok: boolean; summary: WasteSummary }>(
    `/api/waste/${encodeURIComponent(id)}/summary${qs}`,
  );
  return payload.summary;
}

export async function getWasteRateRequest(
  userId: string,
  catalogItemId: string,
  dateRange?: { dateFrom?: string; dateTo?: string },
): Promise<WasteRate> {
  const id = normalizeUserId(userId);
  const params = new URLSearchParams();
  if (dateRange?.dateFrom) params.set('dateFrom', dateRange.dateFrom);
  if (dateRange?.dateTo) params.set('dateTo', dateRange.dateTo);
  const qs = params.toString() ? `?${params}` : '';
  const payload = await request<{ ok: boolean; rate: WasteRate }>(
    `/api/waste/${encodeURIComponent(id)}/rate/${encodeURIComponent(catalogItemId)}${qs}`,
  );
  return payload.rate;
}
