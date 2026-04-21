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

function getCouchHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (env.VITE_COUCHDB_URL) headers['x-couch-url'] = env.VITE_COUCHDB_URL;
  if (env.VITE_COUCHDB_USER) headers['x-couch-user'] = env.VITE_COUCHDB_USER;
  if (env.VITE_COUCHDB_PASSWORD) headers['x-couch-password'] = env.VITE_COUCHDB_PASSWORD;
  return headers;
}

function extractError(payload: Record<string, unknown> | null | undefined): string {
  if (!payload) return 'Error en la API';
  const e = payload.error;
  if (typeof e === 'string') return e;
  if (e && typeof e === 'object') {
    const obj = e as Record<string, unknown>;
    if (typeof obj.message === 'string') return obj.message;
    if (typeof obj.reason === 'string') return obj.reason;
    try { return JSON.stringify(e); } catch { /* ignore */ }
  }
  return 'Error en la API';
}

async function publicRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...getCouchHeaders(),
      ...(init?.headers || {}),
    },
    ...init,
  });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: unknown };
  if (!response.ok) throw new Error(extractError(payload as Record<string, unknown>));
  return payload;
}

async function authRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
      ...getCouchHeaders(),
      ...(init?.headers || {}),
    },
    ...init,
  });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: unknown };
  if (!response.ok) throw new Error(extractError(payload as Record<string, unknown>));
  return payload;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface WebPromo {
  id: string;
  code: string;
  label: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  active: boolean;
}

export interface VolumeDiscountRule {
  id: string;
  minQuantity: number;
  maxQuantity: number | null;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  label: string;
  active: boolean;
}

export interface ShippingOption {
  id: string;
  carrier: string;
  rate: number;
  estimatedTime: string;
}

export interface ShippingZone {
  id: string;
  name: string;
  postalCodes: string[];
  options: ShippingOption[];
  active: boolean;
}

export interface ShippingRatesResponse {
  ok: boolean;
  zone: { id: string; name: string } | null;
  options: ShippingOption[];
  fallback: boolean;
  error: string | null;
}

export interface WebConfig {
  _id: string;
  _rev?: string;
  type: 'web_config';
  business_id: string;
  slug: string;
  enabled: boolean;
  storeName: string;
  storeDescription: string;
  storeLogo: string;
  bannerImage: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  welcomeMessage: string;
  orderConfirmMessage: string;
  closedMessage: string;
  deliveryEnabled: boolean;
  pickupEnabled: boolean;
  deliveryFee: number;
  minimumOrder: number;
  estimatedDeliveryTime: string;
  deliveryRadius: string;
  shippingMode: 'fixed' | 'zones';
  shippingZones: ShippingZone[];
  categories: string[];
  promos: WebPromo[];
  volumeDiscounts: VolumeDiscountRule[];
  schedule: Record<string, unknown>;
  isOpen: boolean;
  phone: string;
  address: string;
  currency: string;
  taxRate: number;
  createdAt: string;
  updatedAt: string;
}

export interface WebOrderItem {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
  notes?: string;
}

export type WebOrderStatus = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'delivering' | 'delivered' | 'cancelled';

export interface WebOrderStatusEvent {
  status: WebOrderStatus;
  date: string;
  notes?: string;
}

export interface WebOrder {
  _id: string;
  _rev?: string;
  type: 'web_order';
  id: string;
  orderNumber: string;
  business_id: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  customerAddress: string;
  customerPostalCode: string;
  orderType: 'delivery' | 'pickup';
  status: WebOrderStatus;
  items: WebOrderItem[];
  subtotal: number;
  deliveryFee: number;
  shippingCarrier: string;
  shippingZoneName: string;
  totalAmount: number;
  notes: string;
  promoCode: string;
  promoDiscount: number;
  volumeDiscount: number;
  volumeDiscountLabel: string;
  estimatedTime: string;
  statusHistory: WebOrderStatusEvent[];
  createdAt: string;
  updatedAt: string;
}

export interface PublicCatalogItem {
  _id: string;
  name: string;
  description: string;
  category: string;
  unitPrice: number;
  unit: string;
  allergens: string[];
  image: string;
  available: boolean;
  vertical: string;
  customFields: Record<string, unknown>;
}

// ─── Public API (no auth) ────────────────────────────────────────────────────

export async function getPublicStorefront(slug: string) {
  return publicRequest<{ ok: boolean; config: WebConfig; catalog: PublicCatalogItem[] }>(
    `/api/web/storefront/${encodeURIComponent(slug)}`,
  );
}

export async function getPublicShippingRates(slug: string, postalCode: string) {
  return publicRequest<ShippingRatesResponse>(
    `/api/web/storefront/${encodeURIComponent(slug)}/shipping-rates`,
    { method: 'POST', body: JSON.stringify({ postalCode }) },
  );
}

export async function createPublicWebOrder(slug: string, order: Partial<WebOrder>) {
  return publicRequest<{ ok: boolean; order: WebOrder; message: string }>(
    `/api/web/storefront/${encodeURIComponent(slug)}/orders`,
    { method: 'POST', body: JSON.stringify({ order }) },
  );
}

// ─── Protected API (auth required) ──────────────────────────────────────────

export async function getWebConfigRequest(businessId: string) {
  return authRequest<{ ok: boolean; config: WebConfig | null }>(
    `/api/web/config/${encodeURIComponent(businessId)}`,
  );
}

export async function saveWebConfigRequest(businessId: string, config: Partial<WebConfig>) {
  return authRequest<{ ok: boolean; config: WebConfig }>(
    `/api/web/config/${encodeURIComponent(businessId)}`,
    { method: 'PUT', body: JSON.stringify({ config }) },
  );
}

export async function listWebOrdersRequest(businessId: string) {
  return authRequest<{ ok: boolean; orders: WebOrder[] }>(
    `/api/web/orders/${encodeURIComponent(businessId)}`,
  );
}

export async function updateWebOrderRequest(businessId: string, orderId: string, order: Partial<WebOrder>) {
  return authRequest<{ ok: boolean; order: WebOrder }>(
    `/api/web/orders/${encodeURIComponent(businessId)}/${encodeURIComponent(orderId)}`,
    { method: 'PUT', body: JSON.stringify({ order }) },
  );
}

// ─── Delivery Integrations ──────────────────────────────────────────────────

export interface DeliveryIntegrationEntry {
  enabled: boolean;
  token: string;
}

export interface DeliveryIntegrations {
  uber: DeliveryIntegrationEntry;
  globo: DeliveryIntegrationEntry;
  justead: DeliveryIntegrationEntry;
}

export async function getDeliveryIntegrationsRequest(businessId: string) {
  return authRequest<{ ok: boolean; integrations: DeliveryIntegrations }>(
    `/api/web/integrations/${encodeURIComponent(businessId)}`,
  );
}

export async function saveDeliveryIntegrationsRequest(businessId: string, integrations: DeliveryIntegrations) {
  return authRequest<{ ok: boolean; integrations: DeliveryIntegrations }>(
    `/api/web/integrations/${encodeURIComponent(businessId)}`,
    { method: 'PUT', body: JSON.stringify({ integrations }) },
  );
}
