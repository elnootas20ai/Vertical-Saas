import { getApiBase } from './apiBase';

const API = getApiBase();

function headers() {
  const token = localStorage.getItem('token') || '';
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface UsualProduct {
  productName: string;
  productId: string | null;
  quantity: number;
  unit: string;
  frequency: string | null;
}

export interface ButcherClientPreferences {
  usualProducts: UsualProduct[];
  preferredDay: string | null;
  preferredTime: string | null;
  cuttingPreferences: string;
  packagingNotes: string;
}

export interface ButcherClient {
  _id: string;
  id: string;
  name: string;
  phone: string;
  email: string;
  observations: string;
  tags: string[];
  preferences: ButcherClientPreferences;
  linkedCrmClientId: string;
  totalOrders: number;
  totalSpent: number;
  lastVisit: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export type OrderType = 'simple' | 'reservation' | 'special';
export type OrderStatus =
  | 'pending'
  | 'preparing'
  | 'ready'
  | 'out_for_delivery'
  | 'delivered'
  | 'picked_up'
  | 'cancelled';
export type FulfillmentMode = 'pickup' | 'delivery';

export interface OrderItem {
  productId: string | null;
  productName: string;
  quantity: number;
  unit: string;
  pricePerUnit: number;
  subtotal: number;
  notes: string;
}

export interface ButcherOrder {
  _id: string;
  id: string;
  orderNumber: string;
  orderType: OrderType;
  clientId: string | null;
  clientName: string;
  clientPhone: string;
  items: OrderItem[];
  total: number;
  pickupDate: string;
  pickupTime: string;
  fulfillmentMode: FulfillmentMode;
  deliveryAddress: string;
  deliveryNotes: string;
  assignedWorkerId: string;
  assignedWorkerName: string;
  cashOnDelivery: boolean;
  status: OrderStatus;
  priority: string;
  notes: string;
  preparedBy: string;
  stockReserved: boolean;
  linkedSaleId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type PaymentMethod = 'cash' | 'card' | 'bizum' | 'mixed';
export type SaleStatus = 'completed' | 'pending' | 'voided';

export interface ButcherSale {
  _id: string;
  id: string;
  ticketNumber: string;
  clientId: string | null;
  clientName: string;
  clientPhone: string;
  date: string;
  items: OrderItem[];
  totalWeight: number;
  total: number;
  paymentMethod: PaymentMethod;
  paymentDetails: Record<string, number> | null;
  status: SaleStatus;
  fromOrderId: string | null;
  soldBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClientHistoryStats {
  totalSpent: number;
  avgTicket: number;
  totalOrders: number;
  totalSales: number;
}

export interface TopProduct {
  productName: string;
  totalSpent: number;
  count: number;
}

export interface TimelineEntry {
  type: 'order' | 'sale';
  date: string;
  ref: string;
  total: number;
  status: string;
  items: OrderItem[];
}

export interface SalesStats {
  today: { count: number; revenue: number };
  week: { count: number; revenue: number };
  month: { count: number; revenue: number };
  avgTicket: number;
  topProducts: { name: string; qty: number; revenue: number }[];
  byMethodToday?: { cash: number; card: number; bizum: number; mixed: number };
}

// ─── Product types ──────────────────────────────────────────────────────────

export type ButcherCategory = 'vacuno' | 'cerdo' | 'pollo' | 'cordero' | 'elaborados' | 'otros';

export interface ButcherProduct {
  _id: string;
  id: string;
  user_id: string;
  name: string;
  sku: string;
  category: ButcherCategory;
  stockKg: number;
  minStockKg: number;
  pricePerKg: number;
  costPricePerKg: number;
  conservacion: 'refrigerado' | 'congelado';
  origin: string;
  active: boolean;
  priceUpdatedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ButcherBatch {
  _id: string;
  id: string;
  user_id: string;
  productId: string;
  productName: string;
  batchNumber: string;
  supplier: string;
  receptionDate: string;
  expirationDate: string;
  receptionWeightKg: number;
  currentWeightKg: number;
  temperature: number;
  status: 'active' | 'consumed' | 'expired' | 'returned';
  zone: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface ButcherAlertSummary {
  updatedAt: string;
  totals: { critical: number; warning: number; total: number };
  stock: {
    outOfStock: { id: string; name: string; stockKg: number; minStockKg: number }[];
    critical: { id: string; name: string; stockKg: number; minStockKg: number }[];
    lowStock: { id: string; name: string; stockKg: number; minStockKg: number }[];
  };
  batches: {
    expired: { id: string; batchNumber: string; product: string; expirationDate: string; daysExpired: number }[];
    expiringSoon: { id: string; batchNumber: string; product: string; expirationDate: string; daysLeft: number }[];
  };
  waste: { todayKg: number; todayPct: number; weekAvgKg: number; isAnomaly: boolean; threshold: number };
  prices: { staleProducts: { id: string; name: string; lastUpdate: string; daysSinceUpdate: number }[] };
  scales: { connected: number; disconnected: { scaleId: string; name: string; lastPing: string; minutesAgo: number }[] };
  register: { pendingSessions: { sessionId: string; openedAt: string; hoursOpen: number; pendingTickets: number }[] };
  inventory: { lastCountDate: string | null; discrepancies: { productId: string; name: string; expectedKg: number; countedKg: number; differencePct: number }[] };
}

export interface ButcherInventoryCount {
  _id: string;
  id: string;
  user_id: string;
  date: string;
  items: { productId: string; productName: string; expectedKg: number; countedKg: number; differenceKg: number; differencePct: number }[];
  performedBy: string;
  notes: string;
  createdAt: string;
}

// ─── Product API ────────────────────────────────────────────────────────────

export async function listButcherProductsRequest(userId: string) {
  const r = await fetch(`${API}/api/butcher/products/${userId}`, { headers: headers() });
  return r.json();
}

export async function createButcherProductRequest(userId: string, product: Partial<ButcherProduct>) {
  const r = await fetch(`${API}/api/butcher/products/${userId}`, {
    method: 'POST', headers: headers(), body: JSON.stringify(product),
  });
  return r.json();
}

export async function updateButcherProductRequest(userId: string, productId: string, product: Partial<ButcherProduct>) {
  const r = await fetch(`${API}/api/butcher/products/${userId}/${productId}`, {
    method: 'PUT', headers: headers(), body: JSON.stringify(product),
  });
  return r.json();
}

export async function deleteButcherProductRequest(userId: string, productId: string) {
  const r = await fetch(`${API}/api/butcher/products/${userId}/${productId}`, {
    method: 'DELETE', headers: headers(),
  });
  return r.json();
}

// ─── Batch API ──────────────────────────────────────────────────────────────

export async function listButcherBatchesRequest(userId: string) {
  const r = await fetch(`${API}/api/butcher/batches/${userId}`, { headers: headers() });
  return r.json();
}

export async function createButcherBatchRequest(userId: string, batch: Partial<ButcherBatch>) {
  const r = await fetch(`${API}/api/butcher/batches/${userId}`, {
    method: 'POST', headers: headers(), body: JSON.stringify(batch),
  });
  return r.json();
}

export async function updateButcherBatchRequest(userId: string, batchId: string, batch: Partial<ButcherBatch>) {
  const r = await fetch(`${API}/api/butcher/batches/${userId}/${batchId}`, {
    method: 'PUT', headers: headers(), body: JSON.stringify(batch),
  });
  return r.json();
}

// ─── Alert summary API ─────────────────────────────────────────────────────

export async function getButcherAlertsSummaryRequest(userId: string) {
  const r = await fetch(`${API}/api/butcher/alerts/${userId}/summary`, { headers: headers() });
  return r.json();
}

// ─── Inventory counts API ───────────────────────────────────────────────────

export async function listButcherInventoryCountsRequest(userId: string) {
  const r = await fetch(`${API}/api/butcher/inventory/${userId}`, { headers: headers() });
  return r.json();
}

export async function createButcherInventoryCountRequest(userId: string, count: { items: { productId: string; productName: string; expectedKg: number; countedKg: number }[]; performedBy?: string; notes?: string }) {
  const r = await fetch(`${API}/api/butcher/inventory/${userId}`, {
    method: 'POST', headers: headers(), body: JSON.stringify(count),
  });
  return r.json();
}

export async function getButcherDiscrepanciesRequest(userId: string, threshold?: number) {
  const qs = threshold ? `?threshold=${threshold}` : '';
  const r = await fetch(`${API}/api/butcher/inventory/${userId}/discrepancies${qs}`, { headers: headers() });
  return r.json();
}

// ─── Client API ─────────────────────────────────────────────────────────────

export async function listButcherClientsRequest(userId: string) {
  const r = await fetch(`${API}/api/butcher-clients/${userId}`, { headers: headers() });
  return r.json();
}

export async function createButcherClientRequest(userId: string, client: Partial<ButcherClient>) {
  const r = await fetch(`${API}/api/butcher-clients/${userId}`, {
    method: 'POST', headers: headers(), body: JSON.stringify({ client }),
  });
  return r.json();
}

export async function updateButcherClientRequest(userId: string, clientId: string, client: Partial<ButcherClient>) {
  const r = await fetch(`${API}/api/butcher-clients/${userId}/${clientId}`, {
    method: 'PUT', headers: headers(), body: JSON.stringify({ client }),
  });
  return r.json();
}

export async function deleteButcherClientRequest(userId: string, clientId: string) {
  const r = await fetch(`${API}/api/butcher-clients/${userId}/${clientId}`, {
    method: 'DELETE', headers: headers(),
  });
  return r.json();
}

export async function searchButcherClientsRequest(userId: string, q: string) {
  const r = await fetch(`${API}/api/butcher-clients/${userId}/search?q=${encodeURIComponent(q)}`, { headers: headers() });
  return r.json();
}

export async function getButcherClientHistoryRequest(userId: string, clientId: string) {
  const r = await fetch(`${API}/api/butcher-clients/${userId}/${clientId}/history`, { headers: headers() });
  return r.json();
}

export async function analyzeButcherClientHabitsRequest(userId: string, clientId: string) {
  const r = await fetch(`${API}/api/butcher-clients/${userId}/${clientId}/analyze-habits`, {
    method: 'POST', headers: headers(),
  });
  return r.json();
}

export async function linkButcherClientToCrmRequest(userId: string, clientId: string, crmClientId: string) {
  const r = await fetch(`${API}/api/butcher-clients/${userId}/${clientId}/link-crm`, {
    method: 'POST', headers: headers(), body: JSON.stringify({ crmClientId }),
  });
  return r.json();
}

export async function unlinkButcherClientFromCrmRequest(userId: string, clientId: string) {
  const r = await fetch(`${API}/api/butcher-clients/${userId}/${clientId}/link-crm`, {
    method: 'DELETE', headers: headers(),
  });
  return r.json();
}

// ─── Order API ──────────────────────────────────────────────────────────────

export async function listButcherOrdersRequest(userId: string) {
  const r = await fetch(`${API}/api/butcher-orders/${userId}`, { headers: headers() });
  return r.json();
}

export async function createButcherOrderRequest(userId: string, order: Partial<ButcherOrder>) {
  const r = await fetch(`${API}/api/butcher-orders/${userId}`, {
    method: 'POST', headers: headers(), body: JSON.stringify({ order }),
  });
  return r.json();
}

export async function updateButcherOrderRequest(userId: string, orderId: string, order: Partial<ButcherOrder>) {
  const r = await fetch(`${API}/api/butcher-orders/${userId}/${orderId}`, {
    method: 'PUT', headers: headers(), body: JSON.stringify({ order }),
  });
  return r.json();
}

export async function updateButcherOrderStatusRequest(userId: string, orderId: string, status: OrderStatus, preparedBy?: string) {
  const r = await fetch(`${API}/api/butcher-orders/${userId}/${orderId}/status`, {
    method: 'PATCH', headers: headers(), body: JSON.stringify({ status, preparedBy }),
  });
  return r.json();
}

export async function deleteButcherOrderRequest(userId: string, orderId: string) {
  const r = await fetch(`${API}/api/butcher-orders/${userId}/${orderId}`, {
    method: 'DELETE', headers: headers(),
  });
  return r.json();
}

export async function getButcherOrdersTodayRequest(userId: string) {
  const r = await fetch(`${API}/api/butcher-orders/${userId}/today`, { headers: headers() });
  return r.json();
}

export async function convertOrderToSaleRequest(userId: string, orderId: string, paymentMethod: PaymentMethod, soldBy?: string) {
  const r = await fetch(`${API}/api/butcher-orders/${userId}/${orderId}/convert-sale`, {
    method: 'POST', headers: headers(), body: JSON.stringify({ paymentMethod, soldBy }),
  });
  return r.json();
}

// ─── Sale API ───────────────────────────────────────────────────────────────

export async function listButcherSalesRequest(userId: string) {
  const r = await fetch(`${API}/api/butcher-sales/${userId}`, { headers: headers() });
  return r.json();
}

export async function createButcherSaleRequest(userId: string, sale: Partial<ButcherSale>) {
  const r = await fetch(`${API}/api/butcher-sales/${userId}`, {
    method: 'POST', headers: headers(), body: JSON.stringify({ sale }),
  });
  return r.json();
}

export async function voidButcherSaleRequest(userId: string, saleId: string) {
  const r = await fetch(`${API}/api/butcher-sales/${userId}/${saleId}/void`, {
    method: 'PATCH', headers: headers(),
  });
  return r.json();
}

export async function getButcherSalesTodayRequest(userId: string) {
  const r = await fetch(`${API}/api/butcher-sales/${userId}/today`, { headers: headers() });
  return r.json();
}

export async function getButcherSalesStatsRequest(userId: string) {
  const r = await fetch(`${API}/api/butcher-sales/${userId}/stats`, { headers: headers() });
  return r.json();
}
