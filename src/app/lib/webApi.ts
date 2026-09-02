import { getAuthHeaders } from './authApi';
import { getApiBase } from './apiBase';

const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};


const API_BASE = getApiBase();

function getCouchHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
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
  /** Dominio propio del cliente (ej. pedidos.tunegocio.es). CNAME → shops.vertialapp.com */
  customDomain?: string;
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
  /** PDVs que el cliente puede elegir en la web de pedir. */
  salesPointIds?: string[];
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
  salesPointId?: string;
  salesPointName?: string;
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

export interface PublicWebStore {
  id: string;
  name: string;
  code: string;
  address: string;
}

// ─── Public API (no auth) ────────────────────────────────────────────────────

export async function getPublicStorefront(slug: string) {
  return publicRequest<{
    ok: boolean;
    config: WebConfig;
    catalog: PublicCatalogItem[];
    stores?: PublicWebStore[];
  }>(
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
  /** Conectado vía OAuth Uber (access_token guardado aparte del token webhook). */
  oauth?: boolean;
  connectedAt?: string;
  expiresAt?: string;
  env?: string;
  storeId?: string;
  storeName?: string;
  provisionedAt?: string;
}

export interface UberEatsStoreOption {
  storeId: string;
  name: string;
  address?: string;
  city?: string;
  integrationEnabled?: boolean;
}

export interface DeliveryIntegrations {
  uber: DeliveryIntegrationEntry;
  globo: DeliveryIntegrationEntry;
  justead: DeliveryIntegrationEntry;
  flipdish: DeliveryIntegrationEntry;
}

export interface UberEatsOAuthConfig {
  configured: boolean;
  env: string;
  redirectUri: string;
  scopes: string;
  clientIdPreview?: string;
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

export async function getUberEatsOAuthConfigRequest() {
  return authRequest<{ ok: boolean } & UberEatsOAuthConfig>('/api/uber-eats/oauth/config');
}

export async function startUberEatsOAuthRequest(businessId: string) {
  return authRequest<{ ok: boolean; authorizeUrl: string; redirectUri: string; env: string }>(
    `/api/uber-eats/oauth/start?businessId=${encodeURIComponent(businessId)}`,
  );
}

export async function completeUberEatsOAuthRequest(code: string, state: string) {
  return authRequest<{
    ok: boolean;
    integrations?: DeliveryIntegrations;
    connected?: boolean;
    expiresAt?: string;
    scope?: string;
    stores?: UberEatsStoreOption[];
    error?: string;
  }>('/api/uber-eats/oauth/callback', {
    method: 'POST',
    body: JSON.stringify({ code, state }),
  });
}

export async function listUberEatsStoresRequest(businessId: string) {
  return authRequest<{
    ok: boolean;
    stores: UberEatsStoreOption[];
    selectedStoreId?: string;
    selectedStoreName?: string;
    provisionedAt?: string;
  }>(`/api/uber-eats/stores?businessId=${encodeURIComponent(businessId)}`);
}

export async function selectUberEatsStoreRequest(businessId: string, storeId: string, storeName?: string) {
  return authRequest<{
    ok: boolean;
    integrations?: DeliveryIntegrations;
    storeId?: string;
    storeName?: string;
    provisioned?: boolean;
    error?: string;
  }>('/api/uber-eats/stores/select', {
    method: 'POST',
    body: JSON.stringify({ businessId, storeId, storeName: storeName || '' }),
  });
}
