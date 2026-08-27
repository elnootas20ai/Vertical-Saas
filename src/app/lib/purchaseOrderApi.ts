import { extractApiErrorMessage, getAuthHeaders } from './authApi';
import { getApiBase } from './apiBase';
import { toUserFacingMessage } from './userFacingError';

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
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
        ...getCouchHeaders(),
        ...(init?.headers || {}),
      },
      signal:
        init?.signal ??
        (typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(50_000) : undefined),
    });
  } catch (err) {
    throw new Error(
      toUserFacingMessage(
        err,
        'Sin conexión con el servidor. Comprueba que el backend esté en marcha e inténtalo de nuevo.',
      ),
    );
  }
  const payload = (await response.json().catch(() => ({}))) as T & { error?: unknown; message?: string };
  if (!response.ok) {
    const msg = extractApiErrorMessage(payload as Record<string, unknown>);
    throw new Error(
      toUserFacingMessage(msg || `No se pudo completar el pedido (${response.status})`),
    );
  }
  return payload;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type PurchaseOrderStatus = 'draft' | 'pending' | 'sent' | 'partial' | 'received' | 'cancelled';

export interface PurchaseOrderItem {
  id: string;
  catalogItemId: string;
  sku: string;
  name: string;
  quantity: number;
  unitCost: number;
  total: number;
  received: number;
  notes: string;
  /** Proveedor de esta línea (pedido multi-proveedor). */
  supplierId?: string;
  supplierName?: string;
}

export type PurchaseOrderUrgency = 'normal' | 'high' | 'critical';

export interface PurchaseOrder {
  _id: string;
  _rev?: string;
  type: 'purchase_order';
  id: string;
  orderNumber: string;
  user_id: string;
  supplierId: string;
  supplierName: string;
  status: PurchaseOrderStatus;
  items: PurchaseOrderItem[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  notes: string;
  source: 'manual' | 'auto';
  expectedDate: string;
  sentAt: string;
  sentVia: string;
  receivedAt: string;
  workCenterId: string;
  workCenterName: string;
  urgency: PurchaseOrderUrgency;
  campaignIds: string[];
  approvedBy: string;
  approvedAt: string;
  purchaseInvoiceId: string;
  financeMovementId: string;
  businessId?: string;
  businessName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LowStockItem {
  _id: string;
  name: string;
  sku: string;
  stockQuantity: number;
  minStock: number;
  reorderQuantity: number;
  autoReorder: boolean;
  supplierId: string;
  supplierName: string;
  deficit: number;
  isCritical: boolean;
  workCenterId: string;
  workCenterName: string;
}

import { purchaseListQuery } from './purchaseBusinessScope';

// ─── Purchase Orders API ──────────────────────────────────────────────────────

export async function listPurchaseOrdersRequest(
  userId: string,
  opts?: { businessId?: string; accountBusinessCount?: number },
): Promise<PurchaseOrder[]> {
  const id = normalizeUserId(userId);
  const qs = purchaseListQuery(opts?.businessId, opts?.accountBusinessCount);
  const payload = await request<{ ok: boolean; orders: PurchaseOrder[] }>(
    `/api/purchase-orders/${encodeURIComponent(id)}${qs}`,
  );
  return payload.orders || [];
}

export async function createPurchaseOrderRequest(userId: string, data: Partial<PurchaseOrder>): Promise<PurchaseOrder> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; order: PurchaseOrder }>(
    `/api/purchase-orders/${encodeURIComponent(id)}`,
    { method: 'POST', body: JSON.stringify({ order: data }) },
  );
  if (!result.order) throw new Error('Respuesta inválida del servidor');
  return result.order;
}

export async function updatePurchaseOrderRequest(userId: string, order: PurchaseOrder): Promise<PurchaseOrder> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; order: PurchaseOrder }>(
    `/api/purchase-orders/${encodeURIComponent(id)}/${encodeURIComponent(order._id)}`,
    { method: 'PUT', body: JSON.stringify({ order }) },
  );
  if (!result.order) throw new Error('Respuesta inválida del servidor');
  return result.order;
}

export async function deletePurchaseOrderRequest(userId: string, orderId: string): Promise<void> {
  const id = normalizeUserId(userId);
  await request(
    `/api/purchase-orders/${encodeURIComponent(id)}/${encodeURIComponent(orderId)}`,
    { method: 'DELETE' },
  );
}

export async function triggerAutoOrdersRequest(userId: string): Promise<{ created: number; orders: PurchaseOrder[] }> {
  const id = normalizeUserId(userId);
  return request<{ ok: boolean; created: number; orders: PurchaseOrder[] }>(
    `/api/purchase-orders/${encodeURIComponent(id)}/auto-generate`,
    { method: 'POST' },
  );
}

export async function getLowStockReportRequest(userId: string): Promise<{ items: LowStockItem[]; total: number }> {
  const id = normalizeUserId(userId);
  return request<{ ok: boolean; items: LowStockItem[]; total: number }>(
    `/api/purchase-orders/${encodeURIComponent(id)}/low-stock`,
  );
}

export async function markOrderReceivedRequest(
  userId: string,
  orderId: string,
  receivedItems?: Array<{ catalogItemId: string; quantity: number; unitCost?: number }>,
): Promise<{ order: PurchaseOrder; stockUpdated?: number; stockUnits?: number; stockFailed?: number }> {
  const id = normalizeUserId(userId);
  const result = await request<{
    ok: boolean;
    order: PurchaseOrder;
    stockUpdated?: number;
    stockUnits?: number;
    stockFailed?: number;
  }>(
    `/api/purchase-orders/${encodeURIComponent(id)}/${encodeURIComponent(orderId)}/receive`,
    { method: 'POST', body: JSON.stringify({ receivedItems }) },
  );
  if (!result.order) throw new Error('Respuesta inválida del servidor');
  return result;
}

// ─── Receive with Invoice (OCR) ───────────────────────────────────────────────

export interface OcrMatchResult {
  matchedItems: Array<{
    orderItemId: string;
    catalogItemId: string;
    orderItemName: string;
    ocrLine: Record<string, unknown>;
    matchConfidence: number;
    quantityOrdered: number;
    quantityOcr: number;
    unitCostOcr: number;
  }>;
  unmatchedOcrLines: Array<Record<string, unknown>>;
  unmatchedOrderItems: PurchaseOrderItem[];
  invoice: Record<string, unknown> | null;
}

export async function receiveWithInvoiceRequest(
  userId: string,
  orderId: string,
  data: { ocrResult: Record<string, unknown>; receivedItems?: Array<{ catalogItemId: string; quantity: number }>; createInvoice?: boolean },
): Promise<{ order: PurchaseOrder } & OcrMatchResult> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; order: PurchaseOrder } & OcrMatchResult>(
    `/api/purchase-orders/${encodeURIComponent(id)}/${encodeURIComponent(orderId)}/receive-with-invoice`,
    { method: 'POST', body: JSON.stringify(data) },
  );
  if (!result.order) throw new Error('Respuesta inválida del servidor');
  return result;
}

// ─── Sales Forecast ───────────────────────────────────────────────────────────

export interface ForecastItem {
  _id: string;
  name: string;
  sku: string;
  stockQuantity: number;
  minStock: number;
  costPrice: number;
  supplierId: string;
  supplierName: string;
  weeklyAvg: number;
  weeksOfStock: number;
  suggestedOrder: number;
  needsReorder: boolean;
  reorderQuantity: number;
  autoReorder: boolean;
}

export async function getSalesForecastRequest(userId: string): Promise<{ forecast: ForecastItem[]; weeksAnalyzed: number }> {
  const id = normalizeUserId(userId);
  return request<{ ok: boolean; forecast: ForecastItem[]; weeksAnalyzed: number }>(
    `/api/purchase-orders/${encodeURIComponent(id)}/forecast`,
  );
}

// ─── Smart Purchase List ──────────────────────────────────────────────────────

export interface SmartListItem {
  catalogItemId: string;
  name: string;
  sku: string;
  currentStock: number;
  minStock: number;
  weeklyAvg: number;
  weekendAvg: number;
  suggestedQuantity: number;
  recommendationReasons: string[];
  urgency: PurchaseOrderUrgency;
  supplierId: string;
  supplierName: string;
  costPrice: number;
  estimatedTotal: number;
  isCritical: boolean;
  activeCampaigns: string[];
  alreadyOrdered: boolean;
  workCenterId: string;
  workCenterName: string;
}

export async function getSmartPurchaseListRequest(userId: string): Promise<{ items: SmartListItem[]; isPreWeekend: boolean; total: number }> {
  const id = normalizeUserId(userId);
  return request<{ ok: boolean; items: SmartListItem[]; isPreWeekend: boolean; total: number }>(
    `/api/purchase-orders/${encodeURIComponent(id)}/smart-list`,
  );
}

export async function approvePurchaseOrderRequest(userId: string, orderId: string): Promise<PurchaseOrder> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; order: PurchaseOrder }>(
    `/api/purchase-orders/${encodeURIComponent(id)}/${encodeURIComponent(orderId)}/approve`,
    { method: 'POST' },
  );
  if (!result.order) throw new Error('Respuesta inválida del servidor');
  return result.order;
}

// ─── Send Purchase Order ──────────────────────────────────────────────────────

export async function sendPurchaseOrderRequest(
  userId: string,
  orderId: string,
  method: 'email' | 'whatsapp' | 'portal',
  email?: string,
): Promise<{ order: PurchaseOrder; waUrl?: string }> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; order: PurchaseOrder; waUrl?: string }>(
    `/api/purchase-orders/${encodeURIComponent(id)}/${encodeURIComponent(orderId)}/send`,
    { method: 'POST', body: JSON.stringify({ method, email }) },
  );
  if (!result.order) throw new Error('Respuesta inválida del servidor');
  return result;
}

// ─── Purchase Suggestions ─────────────────────────────────────────────────────

export interface SuggestionItem {
  _id: string;
  name: string;
  sku: string;
  category: string;
  stockQuantity: number;
  minStock: number;
  maxStock: number;
  costPrice: number;
  supplierId: string;
  supplierName: string;
  consumed30d: number;
  weeklyAvg: number;
  weeksOfStock: number;
  suggestedQty: number;
  needsReorder: boolean;
  reorderQuantity: number;
  autoReorder: boolean;
  estimatedCost: number;
}

export interface SupplierSuggestionGroup {
  supplierId: string;
  supplierName: string;
  items: SuggestionItem[];
  totalCost: number;
}

export async function getSuggestionsRequest(userId: string): Promise<{
  suggestions: SuggestionItem[];
  bySupplier: SupplierSuggestionGroup[];
  totalItems: number;
  totalEstimatedCost: number;
}> {
  const id = normalizeUserId(userId);
  return request<any>(
    `/api/purchase-orders/${encodeURIComponent(id)}/suggestions`,
  );
}

// ─── Bulk Create ──────────────────────────────────────────────────────────────

export async function createBulkPurchaseOrdersRequest(
  userId: string,
  orders: Array<Partial<PurchaseOrder>>,
): Promise<{ orders: PurchaseOrder[]; created: number }> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; orders: PurchaseOrder[]; created: number }>(
    `/api/purchase-orders/${encodeURIComponent(id)}/bulk`,
    { method: 'POST', body: JSON.stringify({ orders }) },
  );
  return result;
}

export interface PurchaseKpis {
  pendingOrders: number;
  pendingValue: number;
  monthlySpend: number;
  lowStockCount: number;
  criticalProducts: number;
  overdueDeliveries: number;
  upcomingDeliveries: Array<{ id: string; orderNumber: string; supplierName: string; expectedDate: string; total: number }>;
  totalOrders: number;
  receivedThisMonth: number;
}

export async function getPurchaseKpisRequest(userId: string): Promise<PurchaseKpis> {
  const id = normalizeUserId(userId);
  const payload = await request<{ ok: boolean; kpis: PurchaseKpis }>(
    `/api/purchase-orders/${encodeURIComponent(id)}/kpis`,
  );
  return payload.kpis;
}
