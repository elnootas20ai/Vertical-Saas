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
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string; message?: string };
  if (!response.ok) {
    throw new Error(payload?.error || payload?.message || 'Error en lista de compra');
  }
  return payload;
}

export type PurchaseListUrgency = 'critical' | 'high' | 'normal';

export interface StockPurchaseListItem {
  catalogItemId: string;
  name: string;
  sku: string;
  currentStock: number;
  minStock: number;
  difference: number | null;
  suggestedQuantity: number;
  unit: string;
  costPrice: number;
  estimatedTotal: number;
  supplierId: string;
  supplierName: string;
  urgency: PurchaseListUrgency;
  reasons: string[];
  source: 'stock_count';
  stockCountId: string;
}

export interface StockPurchaseListSupplierGroup {
  supplierId: string;
  supplierName: string;
  items: StockPurchaseListItem[];
  estimatedTotal: number;
}

export interface StockPurchaseList {
  countId: string;
  countName: string;
  generatedAt: string;
  items: StockPurchaseListItem[];
  itemCount: number;
  totalEstimated: number;
  supplierGroups: StockPurchaseListSupplierGroup[];
}

export async function getStockCountPurchaseListRequest(
  userId: string,
  countId: string,
): Promise<StockPurchaseList> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; purchaseList: StockPurchaseList }>(
    `/api/stock-counts/${encodeURIComponent(id)}/${encodeURIComponent(countId)}/purchase-list`,
  );
  if (!result.purchaseList) throw new Error('Respuesta inválida del servidor');
  return result.purchaseList;
}

export async function createPurchaseOrdersFromStockListRequest(
  userId: string,
  countId: string,
): Promise<{ ok: boolean; pending?: boolean; message?: string; created: number; orders: unknown[] }> {
  const id = normalizeUserId(userId);
  const response = await fetch(
    `${API_BASE}/api/stock-counts/${encodeURIComponent(id)}/${encodeURIComponent(countId)}/purchase-list/create-orders`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
    },
  );
  const payload = await response.json().catch(() => ({})) as {
    ok?: boolean;
    pending?: boolean;
    message?: string;
    created?: number;
    orders?: unknown[];
    error?: string;
  };
  if (response.status === 501 || payload.pending) {
    return {
      ok: false,
      pending: true,
      message: payload.message || 'Generación automática de pedidos — conexión pendiente.',
      created: 0,
      orders: [],
    };
  }
  if (!response.ok) {
    throw new Error(payload.error || payload.message || 'Error al crear pedidos');
  }
  return {
    ok: true,
    created: payload.created ?? 0,
    orders: payload.orders ?? [],
  };
}
