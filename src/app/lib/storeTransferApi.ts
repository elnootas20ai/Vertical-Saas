import { getAuthHeaders } from './authApi';
import { getApiBase } from './apiBase';

const API_BASE = getApiBase();

function normalizeUserId(userId: string): string {
  const value = String(userId || '').trim();
  return value.startsWith('account:') ? value.slice('account:'.length) : value;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
      ...(init?.headers || {}),
    },
    ...init,
  });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload?.error || 'Error inesperado en traspasos de tienda');
  }
  return payload;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type StoreTransferStatus = 'in_transit' | 'received' | 'cancelled';

export interface StoreTransferItem {
  catalogItemId: string;
  name: string;
  sku: string;
  unit: string;
  quantity: number;
}

export interface StoreTransfer {
  _id: string;
  id: string;
  type: 'store_transfer';
  user_id: string;
  businessId: string;
  status: StoreTransferStatus;
  fromPdvId: string;
  fromPdvName: string;
  fromWarehouseId: string;
  toPdvId: string;
  toPdvName: string;
  toWarehouseId: string;
  items: StoreTransferItem[];
  notes: string;
  sentAt: string;
  sentBy: string;
  receivedAt: string | null;
  receivedBy: string;
  cancelledAt: string | null;
  cancelledBy: string;
  transitSeconds: number;
  createdAt: string;
  updatedAt: string;
}

export interface StoreTransferDestination {
  pdvId: string;
  name: string;
  code: string;
  businessId: string;
}

// ─── API ──────────────────────────────────────────────────────────────────────

export async function listStoreTransfersRequest(
  userId: string,
  filters?: { pdvId?: string; status?: StoreTransferStatus },
): Promise<StoreTransfer[]> {
  const id = normalizeUserId(userId);
  const params = new URLSearchParams();
  if (filters?.pdvId) params.set('pdvId', filters.pdvId);
  if (filters?.status) params.set('status', filters.status);
  const qs = params.toString() ? `?${params.toString()}` : '';
  const payload = await request<{ ok: boolean; transfers: StoreTransfer[] }>(
    `/api/store-transfers/${encodeURIComponent(id)}${qs}`,
  );
  return payload.transfers || [];
}

export async function listStoreTransferDestinationsRequest(
  userId: string,
  fromPdvId: string,
): Promise<StoreTransferDestination[]> {
  const id = normalizeUserId(userId);
  const qs = fromPdvId ? `?fromPdvId=${encodeURIComponent(fromPdvId)}` : '';
  const payload = await request<{ ok: boolean; destinations: StoreTransferDestination[] }>(
    `/api/store-transfers/${encodeURIComponent(id)}/destinations${qs}`,
  );
  return payload.destinations || [];
}

export async function createStoreTransferRequest(
  userId: string,
  data: {
    fromPdvId: string;
    toPdvId: string;
    items: Array<Pick<StoreTransferItem, 'catalogItemId' | 'quantity'> & Partial<StoreTransferItem>>;
    notes?: string;
    performedBy?: string;
  },
): Promise<StoreTransfer> {
  const id = normalizeUserId(userId);
  const payload = await request<{ ok: boolean; transfer: StoreTransfer }>(
    `/api/store-transfers/${encodeURIComponent(id)}`,
    { method: 'POST', body: JSON.stringify(data) },
  );
  if (!payload.transfer) throw new Error('Respuesta inválida del servidor');
  return payload.transfer;
}

export async function receiveStoreTransferRequest(
  userId: string,
  transferId: string,
  performedBy?: string,
): Promise<StoreTransfer> {
  const id = normalizeUserId(userId);
  const payload = await request<{ ok: boolean; transfer: StoreTransfer }>(
    `/api/store-transfers/${encodeURIComponent(id)}/${encodeURIComponent(transferId)}/receive`,
    { method: 'POST', body: JSON.stringify({ performedBy: performedBy || '' }) },
  );
  if (!payload.transfer) throw new Error('Respuesta inválida del servidor');
  return payload.transfer;
}

export async function cancelStoreTransferRequest(
  userId: string,
  transferId: string,
  performedBy?: string,
): Promise<StoreTransfer> {
  const id = normalizeUserId(userId);
  const payload = await request<{ ok: boolean; transfer: StoreTransfer }>(
    `/api/store-transfers/${encodeURIComponent(id)}/${encodeURIComponent(transferId)}/cancel`,
    { method: 'POST', body: JSON.stringify({ performedBy: performedBy || '' }) },
  );
  if (!payload.transfer) throw new Error('Respuesta inválida del servidor');
  return payload.transfer;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** «3 min», «1 h 12 min» — tiempo en tránsito de un traspaso. */
export function formatTransitTime(seconds: number): string {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  if (s < 60) return 'menos de 1 min';
  const mins = Math.round(s / 60);
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  const rest = mins % 60;
  return rest > 0 ? `${hours} h ${rest} min` : `${hours} h`;
}
