import { authFetch } from './authApi';
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
  const response = await authFetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...getCouchHeaders(),
      ...(init?.headers || {}),
    },
  });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload?.error || 'Error inesperado en delivery API');
  }
  return payload;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type DeliveryOrderStatus = 'nuevo' | 'cocina' | 'listo' | 'en_reparto' | 'entregado' | 'cancelled' | 'incident';

export type DeliveryType = 'domicilio' | 'recogida' | 'sala';
export type PaymentStatus = 'pending' | 'paid' | 'partial' | 'refunded';
export type DeliveryChannel = 'direct' | 'phone' | 'web' | 'app' | 'tpv' | 'glovo' | 'justeat' | 'ubereats';

export interface DeliveryOrderItem {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
  notes?: string;
  catalogItemId?: string;
  category?: string;
  /** Marca(s) deducidas desde el catálogo (para reporting interno). */
  brandIds?: string[];
  extras?: string[];
  allergens?: string[];
  ingredients?: { name: string; quantity: string }[];
  outOfStock?: boolean;
  outOfStockAt?: string;
}

export interface DeliveryStageEvent {
  status: DeliveryOrderStatus;
  date: string;
  user: string;
  notes?: string;
}

export interface DeliveryOrder {
  _id: string;
  _rev?: string;
  type: 'delivery_order';
  id: string;
  orderNumber: string;
  user_id: string;

  clientId: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  customerAddress: string;
  customerZone: string;

  channel: DeliveryChannel;
  deliveryType: DeliveryType;
  status: DeliveryOrderStatus;
  priority: string;

  salesPointId: string;
  salesPointName: string;

  items: DeliveryOrderItem[];
  totalAmount: number;
  notes: string;
  observations: string;

  paymentMethod: string;
  paymentStatus: PaymentStatus;
  paidAmount: number;
  paidAt: string;

  assignedDriver: string;
  driverId: string;
  estimatedDelivery: string;
  estimatedDeliveryMinutes: number | null;
  estimatedArrivalAt: string;
  departedAt: string;
  deliveredAt: string;
  kitchenStartedAt: string;
  kitchenCompletedAt: string;
  assemblyStartedAt: string;
  assemblyCompletedAt: string;
  zone: string;
  deliveryDistance: number | null;
  paymentCollected: boolean;
  paymentCollectedAt: string;
  paymentCollectedBy: string;

  cancelReason: string;
  cancelledAt: string;
  cancelledBy: string;
  reopenedAt: string;
  reopenedBy: string;

  externalOrderId: string;

  deliveryAddressId: string;

  incidentNotes: string;
  incidentType: string;
  stageHistory: DeliveryStageEvent[];
  createdAt: string;
  updatedAt: string;
}

export type CatalogItemType = 'product' | 'service' | 'combo';

export interface CatalogArticleRef {
  articleId: string;
  articleName: string;
  quantity: number;
  unit: string;
}

export interface CatalogComboRef {
  productId: string;
  productName: string;
  quantity: number;
}

export interface CatalogSalesChannel {
  channelId: string;
  channelName: string;
  customPrice: number | null;
}

export interface CatalogItem {
  _id: string;
  _rev?: string;
  type: 'catalog_item';
  id: string;
  sku: string;
  user_id: string;
  module: 'stock' | 'catalog';
  itemType: CatalogItemType;
  vertical: string;
  name: string;
  description: string;
  category: string;
  unitPrice: number;
  costPrice: number;
  taxRate: number;
  stockQuantity: number;
  minStock: number;
  reorderQuantity: number;
  autoReorder: boolean;
  unit: string;
  supplierId: string;
  supplierName: string;
  allergens: string[];
  image: string;
  images: string[];
  active: boolean;
  webVisible: boolean;
  available: boolean;
  notes: string;
  barcode: string;
  brandIds: string[];
  articles: CatalogArticleRef[];
  comboItems: CatalogComboRef[];
  salesChannels: CatalogSalesChannel[];
  stockCategory: StockCategory;
  stockSubcategory: string;
  isStockItem: boolean;
  customFields: Record<string, unknown>;
  salesPointId?: string;
  salesPointName?: string;
  createdAt: string;
  updatedAt: string;
}

export type StockCategory = 'ingredient' | 'beverage' | 'packaging' | 'cleaning' | 'consumable' | 'finished_product' | 'other';

export interface Supplier {
  _id: string;
  _rev?: string;
  type: 'supplier';
  id: string;
  user_id: string;
  name: string;
  cif: string;
  email: string;
  phone: string;
  address: string;
  contactPerson: string;
  category: string;
  paymentTerms: string;
  notes: string;
  active: boolean;
  validated: boolean;
  validatedAt: string;
  validatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseInvoiceLine {
  id: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface OcrData {
  documentType: string | null;
  documentTypeLabel: string | null;
  emitter: string | null;
  receiver: string | null;
  date: string | null;
  documentNumber: string | null;
  subtotal: number | null;
  taxRate: number | null;
  taxAmount: number | null;
  total: number | null;
  currency: string | null;
  lines: { description: string; quantity: number | null; unitPrice: number | null; total: number | null }[];
  notes: string | null;
}

export type InvoiceValidationStatus = 'pending_validation' | 'validated' | 'paid' | 'pending_payment';

export interface PurchaseInvoice {
  _id: string;
  _rev?: string;
  type: 'purchase_invoice';
  id: string;
  invoiceNumber: string;
  user_id: string;
  supplierId: string;
  supplierName: string;
  date: string;
  dueDate: string;
  status: string;
  lines: PurchaseInvoiceLine[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  notes: string;
  paidAt: string;
  linkedPurchaseOrderId?: string;
  linkedPurchaseOrderNumber?: string;
  costCenterId?: string;
  costCenterName?: string;
  ocrData?: OcrData;
  ocrImageBase64?: string;
  entryMethod?: 'ocr' | 'manual';

  validationStatus: InvoiceValidationStatus;
  validatedAt?: string;
  validatedBy?: string;

  pdfUrl?: string;
  pdfFilename?: string;

  linkedDocumentId?: string;
  linkedExpenseId?: string;
  linkedTaxEntryId?: string;

  duplicateWarning?: boolean;
  duplicateOf?: string;
  duplicateReviewed?: boolean;

  createdAt: string;
  updatedAt: string;
}

// ─── Delivery Orders API ──────────────────────────────────────────────────────

export async function listDeliveryOrdersRequest(userId: string): Promise<DeliveryOrder[]> {
  const id = normalizeUserId(userId);
  const payload = await request<{ ok: boolean; orders: DeliveryOrder[] }>(
    `/api/delivery/orders/${encodeURIComponent(id)}`,
  );
  return payload.orders || [];
}

export async function createDeliveryOrderRequest(userId: string, data: Partial<DeliveryOrder>): Promise<DeliveryOrder> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; order: DeliveryOrder }>(
    `/api/delivery/orders/${encodeURIComponent(id)}`,
    { method: 'POST', body: JSON.stringify({ order: data }) },
  );
  if (!result.order) throw new Error('Respuesta inválida del servidor');
  return result.order;
}

export async function updateDeliveryOrderRequest(userId: string, order: DeliveryOrder): Promise<DeliveryOrder> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; order: DeliveryOrder }>(
    `/api/delivery/orders/${encodeURIComponent(id)}/${encodeURIComponent(order._id)}`,
    { method: 'PUT', body: JSON.stringify({ order }) },
  );
  if (!result.order) throw new Error('Respuesta inválida del servidor');
  return result.order;
}

export async function deleteDeliveryOrderRequest(userId: string, orderId: string): Promise<void> {
  const id = normalizeUserId(userId);
  await request(
    `/api/delivery/orders/${encodeURIComponent(id)}/${encodeURIComponent(orderId)}`,
    { method: 'DELETE' },
  );
}

export async function registerPaymentRequest(userId: string, orderId: string, paymentMethod: string, paidAmount: number): Promise<DeliveryOrder> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; order: DeliveryOrder }>(
    `/api/delivery/orders/${encodeURIComponent(id)}/${encodeURIComponent(orderId)}/payment`,
    { method: 'PUT', body: JSON.stringify({ paymentMethod, paidAmount }) },
  );
  if (!result.order) throw new Error('Respuesta inválida del servidor');
  return result.order;
}

export async function cancelDeliveryOrderRequest(userId: string, orderId: string): Promise<DeliveryOrder> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; order: DeliveryOrder }>(
    `/api/delivery/orders/${encodeURIComponent(id)}/${encodeURIComponent(orderId)}/cancel`,
    { method: 'PUT' },
  );
  if (!result.order) throw new Error('Respuesta inválida del servidor');
  return result.order;
}

export async function reopenDeliveryOrderRequest(userId: string, orderId: string): Promise<DeliveryOrder> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; order: DeliveryOrder }>(
    `/api/delivery/orders/${encodeURIComponent(id)}/${encodeURIComponent(orderId)}/reopen`,
    { method: 'PUT' },
  );
  if (!result.order) throw new Error('Respuesta inválida del servidor');
  return result.order;
}

// ─── Catalog Items API ────────────────────────────────────────────────────────

export async function listCatalogItemsRequest(userId: string, module?: 'stock' | 'catalog'): Promise<CatalogItem[]> {
  const id = normalizeUserId(userId);
  const qs = module ? `?module=${module}` : '';
  const payload = await request<{ ok: boolean; items: CatalogItem[] }>(
    `/api/delivery/catalog/${encodeURIComponent(id)}${qs}`,
  );
  return payload.items || [];
}

export async function createCatalogItemRequest(userId: string, data: Partial<CatalogItem>): Promise<CatalogItem> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; item: CatalogItem }>(
    `/api/delivery/catalog/${encodeURIComponent(id)}`,
    { method: 'POST', body: JSON.stringify({ item: data }) },
  );
  if (!result.item) throw new Error('Respuesta inválida del servidor');
  return result.item;
}

export interface BulkCreateResult {
  ok: boolean;
  created: number;
  errors: number;
  items: CatalogItem[];
  errorDetails?: { index: number; name: string; error: string }[];
}

export async function bulkCreateCatalogItemsRequest(userId: string, items: Partial<CatalogItem>[]): Promise<BulkCreateResult> {
  const id = normalizeUserId(userId);
  return request<BulkCreateResult>(
    `/api/delivery/catalog/${encodeURIComponent(id)}/bulk`,
    { method: 'POST', body: JSON.stringify({ items }) },
  );
}

export async function updateCatalogItemRequest(userId: string, item: CatalogItem): Promise<CatalogItem> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; item: CatalogItem }>(
    `/api/delivery/catalog/${encodeURIComponent(id)}/${encodeURIComponent(item._id)}`,
    { method: 'PUT', body: JSON.stringify({ item }) },
  );
  if (!result.item) throw new Error('Respuesta inválida del servidor');
  return result.item;
}

export async function deleteCatalogItemRequest(userId: string, itemId: string): Promise<void> {
  const id = normalizeUserId(userId);
  await request(
    `/api/delivery/catalog/${encodeURIComponent(id)}/${encodeURIComponent(itemId)}`,
    { method: 'DELETE' },
  );
}

// ─── Suppliers API ────────────────────────────────────────────────────────────

export async function listSuppliersRequest(userId: string): Promise<Supplier[]> {
  const id = normalizeUserId(userId);
  const payload = await request<{ ok: boolean; suppliers: Supplier[] }>(
    `/api/delivery/suppliers/${encodeURIComponent(id)}`,
  );
  return payload.suppliers || [];
}

export async function createSupplierRequest(userId: string, data: Partial<Supplier>): Promise<Supplier> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; supplier: Supplier }>(
    `/api/delivery/suppliers/${encodeURIComponent(id)}`,
    { method: 'POST', body: JSON.stringify({ supplier: data }) },
  );
  if (!result.supplier) throw new Error('Respuesta inválida del servidor');
  return result.supplier;
}

export async function updateSupplierRequest(userId: string, supplier: Supplier): Promise<Supplier> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; supplier: Supplier }>(
    `/api/delivery/suppliers/${encodeURIComponent(id)}/${encodeURIComponent(supplier._id)}`,
    { method: 'PUT', body: JSON.stringify({ supplier }) },
  );
  if (!result.supplier) throw new Error('Respuesta inválida del servidor');
  return result.supplier;
}

export async function deleteSupplierRequest(userId: string, supplierId: string): Promise<void> {
  const id = normalizeUserId(userId);
  await request(
    `/api/delivery/suppliers/${encodeURIComponent(id)}/${encodeURIComponent(supplierId)}`,
    { method: 'DELETE' },
  );
}

// ─── Purchase Invoices API ────────────────────────────────────────────────────

export async function listPurchaseInvoicesRequest(userId: string): Promise<PurchaseInvoice[]> {
  const id = normalizeUserId(userId);
  const payload = await request<{ ok: boolean; invoices: PurchaseInvoice[] }>(
    `/api/delivery/invoices/${encodeURIComponent(id)}`,
  );
  return payload.invoices || [];
}

export async function createPurchaseInvoiceRequest(userId: string, data: Partial<PurchaseInvoice>): Promise<PurchaseInvoice> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; invoice: PurchaseInvoice }>(
    `/api/delivery/invoices/${encodeURIComponent(id)}`,
    { method: 'POST', body: JSON.stringify({ invoice: data }) },
  );
  if (!result.invoice) throw new Error('Respuesta inválida del servidor');
  return result.invoice;
}

export async function updatePurchaseInvoiceRequest(userId: string, invoice: PurchaseInvoice): Promise<PurchaseInvoice> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; invoice: PurchaseInvoice }>(
    `/api/delivery/invoices/${encodeURIComponent(id)}/${encodeURIComponent(invoice._id)}`,
    { method: 'PUT', body: JSON.stringify({ invoice }) },
  );
  if (!result.invoice) throw new Error('Respuesta inválida del servidor');
  return result.invoice;
}

export async function deletePurchaseInvoiceRequest(userId: string, invoiceId: string): Promise<void> {
  const id = normalizeUserId(userId);
  await request(
    `/api/delivery/invoices/${encodeURIComponent(id)}/${encodeURIComponent(invoiceId)}`,
    { method: 'DELETE' },
  );
}

export async function validateInvoiceRequest(userId: string, invoiceId: string): Promise<PurchaseInvoice> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; invoice: PurchaseInvoice }>(
    `/api/delivery/invoices/${encodeURIComponent(id)}/${encodeURIComponent(invoiceId)}/validate`,
    { method: 'PUT' },
  );
  if (!result.invoice) throw new Error('Respuesta inválida del servidor');
  return result.invoice;
}

export async function rejectInvoiceRequest(userId: string, invoiceId: string): Promise<PurchaseInvoice> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; invoice: PurchaseInvoice }>(
    `/api/delivery/invoices/${encodeURIComponent(id)}/${encodeURIComponent(invoiceId)}/reject`,
    { method: 'PUT' },
  );
  if (!result.invoice) throw new Error('Respuesta inválida del servidor');
  return result.invoice;
}

export async function uploadInvoicePdfRequest(userId: string, invoiceId: string, file: File): Promise<PurchaseInvoice> {
  const id = normalizeUserId(userId);
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(
    `${getApiBase()}/api/delivery/invoices/${encodeURIComponent(id)}/${encodeURIComponent(invoiceId)}/pdf`,
    { method: 'POST', headers: getAuthHeaders(), body: formData },
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error al subir PDF');
  return data.invoice;
}

export function getInvoicePdfUrl(userId: string, invoiceId: string): string {
  const id = normalizeUserId(userId);
  return `${getApiBase()}/api/delivery/invoices/${encodeURIComponent(id)}/${encodeURIComponent(invoiceId)}/pdf`;
}

// ─── Driver Cash Sessions ─────────────────────────────────────────────────────

export interface CashTransaction {
  id: string;
  type: 'cobro' | 'gasto' | 'ajuste';
  paymentMethod: 'efectivo' | 'tarjeta' | 'bizum' | 'online';
  amount: number;
  orderNumber?: string;
  orderId?: string;
  description: string;
  date: string;
  auto?: boolean;
  editedAt?: string;
  editedBy?: string;
  originalAmount?: number;
  receiptUrl?: string;
  receiptName?: string;
}

export interface ReopenRecord {
  reopenedAt: string;
  reopenedBy: string;
  reason: string;
  previousClosedAt: string;
  previousDifference: number;
}

export interface DriverCashSession {
  _id: string;
  _rev?: string;
  type: 'driver_cash_session';
  id: string;
  user_id: string;
  driverName: string;
  driverUserId?: string;
  status: 'open' | 'pending_review' | 'closed';
  initialFloat: number;
  openedAt: string;
  closedAt: string;
  transactions: CashTransaction[];
  expectedCash: number;
  actualCash: number;
  difference: number;
  closingNotes: string;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNotes?: string;
  reopenHistory?: ReopenRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface DriverCashConfig {
  defaultFloat: number;
  blockDuplicateSession: boolean;
  autoRegisterDeliveryPayments: boolean;
  integrateWithFinance: boolean;
  requireManagerApproval: boolean;
  mismatchIncidentThreshold: number;
  requireJustificationAbove: number;
  driverSessionMaxOpenHours: number;
  driverMismatchAlertEnabled: boolean;
  unregisteredCashAlertEnabled: boolean;
}

export const DEFAULT_DRIVER_CASH_CONFIG: DriverCashConfig = {
  defaultFloat: 50,
  blockDuplicateSession: true,
  autoRegisterDeliveryPayments: true,
  integrateWithFinance: true,
  requireManagerApproval: false,
  mismatchIncidentThreshold: 5,
  requireJustificationAbove: 10,
  driverSessionMaxOpenHours: 10,
  driverMismatchAlertEnabled: true,
  unregisteredCashAlertEnabled: true,
};

export async function listDriverCashSessionsRequest(userId: string): Promise<DriverCashSession[]> {
  const id = normalizeUserId(userId);
  const payload = await request<{ ok: boolean; sessions: DriverCashSession[] }>(
    `/api/delivery/driver-sessions/${encodeURIComponent(id)}`,
  );
  return payload.sessions || [];
}

export async function createDriverCashSessionRequest(userId: string, data: Partial<DriverCashSession>): Promise<DriverCashSession> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; session: DriverCashSession }>(
    `/api/delivery/driver-sessions/${encodeURIComponent(id)}`,
    { method: 'POST', body: JSON.stringify({ session: data }) },
  );
  if (!result.session) throw new Error('Respuesta inválida del servidor');
  return result.session;
}

export async function updateDriverCashSessionRequest(userId: string, session: DriverCashSession): Promise<DriverCashSession> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; session: DriverCashSession }>(
    `/api/delivery/driver-sessions/${encodeURIComponent(id)}/${encodeURIComponent(session._id)}`,
    { method: 'PUT', body: JSON.stringify({ session }) },
  );
  if (!result.session) throw new Error('Respuesta inválida del servidor');
  return result.session;
}

export async function deleteDriverCashSessionRequest(userId: string, sessionId: string): Promise<void> {
  const id = normalizeUserId(userId);
  await request(
    `/api/delivery/driver-sessions/${encodeURIComponent(id)}/${encodeURIComponent(sessionId)}`,
    { method: 'DELETE' },
  );
}

/** Configuración caja repartidor (endpoint backend opcional). */
export async function getDriverCashConfigRequest(userId: string): Promise<DriverCashConfig> {
  const id = normalizeUserId(userId);
  try {
    const payload = await request<{ ok: boolean; config: DriverCashConfig }>(
      `/api/delivery/driver-cash-config/${encodeURIComponent(id)}`,
    );
    return payload.config || DEFAULT_DRIVER_CASH_CONFIG;
  } catch {
    return DEFAULT_DRIVER_CASH_CONFIG;
  }
}

export async function saveDriverCashConfigRequest(
  userId: string,
  config: Partial<DriverCashConfig>,
): Promise<DriverCashConfig> {
  const id = normalizeUserId(userId);
  try {
    const result = await request<{ ok: boolean; config: DriverCashConfig }>(
      `/api/delivery/driver-cash-config/${encodeURIComponent(id)}`,
      { method: 'PUT', body: JSON.stringify({ config }) },
    );
    return result.config || { ...DEFAULT_DRIVER_CASH_CONFIG, ...config };
  } catch {
    return { ...DEFAULT_DRIVER_CASH_CONFIG, ...config };
  }
}

// ─── Points of Sale ──────────────────────────────────────────────────────────

export interface TerminalConfig {
  id: string;
  code: string;
  name: string;
  datafonName: string;
  printerName: string;
  scaleDeviceId: string;
  scaleName: string;
  active: boolean;
  assignedWorkerId?: string;
  assignedWorkerName?: string;
  allowReturnsByWorker?: boolean;
  allowCashOutByWorker?: boolean;
  maxCashOutAmount?: number;
}

export interface PointOfSale {
  _id: string;
  _rev?: string;
  type: 'point_of_sale';
  id: string;
  user_id: string;
  name: string;
  code: string;
  address: string;
  terminals: TerminalConfig[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export async function listPointsOfSaleRequest(userId: string): Promise<PointOfSale[]> {
  const id = normalizeUserId(userId);
  const payload = await request<{ ok: boolean; pointsOfSale: PointOfSale[] }>(
    `/api/delivery/points-of-sale/${encodeURIComponent(id)}`,
  );
  return payload.pointsOfSale || [];
}

export async function createPointOfSaleRequest(userId: string, data: Partial<PointOfSale>): Promise<PointOfSale> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; pointOfSale: PointOfSale }>(
    `/api/delivery/points-of-sale/${encodeURIComponent(id)}`,
    { method: 'POST', body: JSON.stringify({ pointOfSale: data }) },
  );
  if (!result.pointOfSale) throw new Error('Respuesta inválida del servidor');
  return result.pointOfSale;
}

export async function updatePointOfSaleRequest(userId: string, pdv: PointOfSale): Promise<PointOfSale> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; pointOfSale: PointOfSale }>(
    `/api/delivery/points-of-sale/${encodeURIComponent(id)}/${encodeURIComponent(pdv._id)}`,
    { method: 'PUT', body: JSON.stringify({ pointOfSale: pdv }) },
  );
  if (!result.pointOfSale) throw new Error('Respuesta inválida del servidor');
  return result.pointOfSale;
}

export async function deletePointOfSaleRequest(userId: string, pdvId: string): Promise<void> {
  const id = normalizeUserId(userId);
  await request(
    `/api/delivery/points-of-sale/${encodeURIComponent(id)}/${encodeURIComponent(pdvId)}`,
    { method: 'DELETE' },
  );
}

// ─── Scale Devices ───────────────────────────────────────────────────────────

export type ScaleConnectionType = 'usb_serial' | 'bluetooth' | 'network';
export type ScaleReadProtocol = 'sics_mt' | 'cas' | 'epelsa' | 'dibal' | 'generic_ascii' | 'continuous' | 'custom';
export type ScaleReadMode = 'on_demand' | 'continuous';
export type WeighUnit = 'kg' | 'g' | 'lb';

export interface ScaleSerialConfig {
  baudRate: number;
  dataBits: 7 | 8;
  stopBits: 1 | 2;
  parity: 'none' | 'even' | 'odd';
  flowControl: 'none' | 'hardware';
  vendorId: string;
  productId: string;
}

export interface ScaleBluetoothConfig {
  deviceName: string;
  serviceUuid: string;
  characteristicUuid: string;
}

export interface ScaleNetworkConfig {
  host: string;
  port: number;
  protocol: 'tcp' | 'websocket' | 'http';
  path: string;
}

export interface ScaleParserConfig {
  regex: string;
  weightGroup: number;
  unitGroup: number;
  decimalSeparator: '.' | ',';
  encoding: 'ascii' | 'utf-8';
  stableIndicator: string;
}

export interface ScaleWeighingConfig {
  unit: WeighUnit;
  maxWeight: number;
  minWeight: number;
  precision: number;
  tareSupported: boolean;
  tareCommand: string;
  zeroCommand: string;
}

export interface ScaleDevice {
  _id: string;
  _rev?: string;
  type: 'scale_device';
  id: string;
  user_id: string;
  name: string;
  brand: string;
  model: string;
  serialNumber: string;
  connectionType: ScaleConnectionType;
  serial: ScaleSerialConfig;
  bluetooth: ScaleBluetoothConfig;
  network: ScaleNetworkConfig;
  readProtocol: ScaleReadProtocol;
  readMode: ScaleReadMode;
  readCommand: string;
  readIntervalMs: number;
  parser: ScaleParserConfig;
  weighing: ScaleWeighingConfig;
  active: boolean;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface WeightTraceData {
  weight: number;
  unit: WeighUnit;
  weightSource: 'scale' | 'manual';
  scaleDeviceId?: string;
  scaleDeviceName?: string;
  readingTimestamp?: string;
  stable: boolean;
  rawReading?: string;
  pricePerUnit: number;
  calculatedTotal: number;
}

export async function listScaleDevicesRequest(userId: string): Promise<ScaleDevice[]> {
  const id = normalizeUserId(userId);
  const payload = await request<{ ok: boolean; scaleDevices: ScaleDevice[] }>(
    `/api/delivery/scale-devices/${encodeURIComponent(id)}`,
  );
  return payload.scaleDevices || [];
}

export async function getScaleDeviceRequest(userId: string, deviceId: string): Promise<ScaleDevice> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; scaleDevice: ScaleDevice }>(
    `/api/delivery/scale-devices/${encodeURIComponent(id)}/${encodeURIComponent(deviceId)}`,
  );
  if (!result.scaleDevice) throw new Error('Respuesta inválida del servidor');
  return result.scaleDevice;
}

export async function createScaleDeviceRequest(userId: string, data: Partial<ScaleDevice>): Promise<ScaleDevice> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; scaleDevice: ScaleDevice }>(
    `/api/delivery/scale-devices/${encodeURIComponent(id)}`,
    { method: 'POST', body: JSON.stringify({ scaleDevice: data }) },
  );
  if (!result.scaleDevice) throw new Error('Respuesta inválida del servidor');
  return result.scaleDevice;
}

export async function updateScaleDeviceRequest(userId: string, deviceId: string, data: Partial<ScaleDevice>): Promise<ScaleDevice> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; scaleDevice: ScaleDevice }>(
    `/api/delivery/scale-devices/${encodeURIComponent(id)}/${encodeURIComponent(deviceId)}`,
    { method: 'PUT', body: JSON.stringify({ scaleDevice: data }) },
  );
  if (!result.scaleDevice) throw new Error('Respuesta inválida del servidor');
  return result.scaleDevice;
}

export async function deleteScaleDeviceRequest(userId: string, deviceId: string): Promise<void> {
  const id = normalizeUserId(userId);
  await request(
    `/api/delivery/scale-devices/${encodeURIComponent(id)}/${encodeURIComponent(deviceId)}`,
    { method: 'DELETE' },
  );
}

export async function assignScaleToTerminalRequest(
  userId: string, pdvId: string, terminalId: string, scaleDeviceId: string,
): Promise<PointOfSale> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; pointOfSale: PointOfSale }>(
    `/api/delivery/points-of-sale/${encodeURIComponent(id)}/${encodeURIComponent(pdvId)}/terminals/${encodeURIComponent(terminalId)}/scale`,
    { method: 'PUT', body: JSON.stringify({ scaleDeviceId }) },
  );
  if (!result.pointOfSale) throw new Error('Respuesta inválida del servidor');
  return result.pointOfSale;
}

export async function getTerminalScaleRequest(
  userId: string, pdvId: string, terminalId: string,
): Promise<ScaleDevice | null> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; scaleDevice: ScaleDevice | null }>(
    `/api/delivery/points-of-sale/${encodeURIComponent(id)}/${encodeURIComponent(pdvId)}/terminals/${encodeURIComponent(terminalId)}/scale`,
  );
  return result.scaleDevice || null;
}

export async function reportScaleStatusRequest(
  userId: string, deviceId: string, status: string, message?: string, terminalId?: string, pdvId?: string,
): Promise<void> {
  const id = normalizeUserId(userId);
  await request(
    `/api/delivery/scale-devices/${encodeURIComponent(id)}/${encodeURIComponent(deviceId)}/status`,
    { method: 'POST', body: JSON.stringify({ status, message, terminalId, pdvId }) },
  );
}

// ─── TPV Register Sessions ────────────────────────────────────────────────────

export interface CashDenominationCount {
  bills_500?: number; bills_200?: number; bills_100?: number; bills_50?: number;
  bills_20?: number; bills_10?: number; bills_5?: number;
  coins_2?: number; coins_1?: number; coins_050?: number; coins_020?: number;
  coins_010?: number; coins_005?: number; coins_002?: number; coins_001?: number;
}

export type TpvTransactionType = 'sale' | 'return' | 'cash_in' | 'cash_out' | 'expense' | 'tip' | 'correction';
export type TpvPaymentMethod = 'efectivo' | 'tarjeta' | 'bizum' | 'online' | 'otro';

export interface TpvRegisterTransaction {
  id: string;
  type: TpvTransactionType;
  paymentMethod: TpvPaymentMethod;
  amount: number;
  description: string;
  orderId?: string;
  orderNumber?: string;
  channel?: string;
  date: string;
  registeredBy?: string;
  linkedDeliveryOrderId?: string;
  refundReason?: string;
  correctionRef?: string;
}

export interface TpvCashCount {
  id: string;
  date: string;
  countedBy: string;
  denominations: CashDenominationCount;
  expectedCash: number;
  actualCash: number;
  difference: number;
  notes?: string;
}

export type IncidentType = 'cash_discrepancy' | 'card_issue' | 'refund' | 'void_transaction' | 'unauthorized_access' | 'system_error' | 'other';
export type IncidentSeverity = 'low' | 'medium' | 'high';

export interface TpvIncident {
  id: string;
  date: string;
  type: IncidentType;
  severity: IncidentSeverity;
  description: string;
  reportedBy: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolution?: string;
  amount?: number;
  transactionId?: string;
}

export interface TpvRegisterSummary {
  totalSales: number;
  salesByMethod: { efectivo: number; tarjeta: number; bizum: number; online: number; otro: number };
  salesByChannel: Record<string, number>;
  totalReturns: number;
  returnCount: number;
  totalCashIn: number;
  totalCashOut: number;
  totalTips: number;
  totalTransactions: number;
  averageTicket: number;
  incidentCount: number;
}

export interface TpvRegisterSession {
  _id: string;
  _rev?: string;
  type: 'tpv_register_session';
  id: string;
  user_id: string;

  pointOfSaleId: string;
  pointOfSaleName: string;

  terminalId: string;
  terminalName: string;
  workerId: string;
  workerName: string;
  datafonId: string;
  datafonName: string;
  printerId: string;
  printerName: string;

  status: 'open' | 'closed';
  openedAt: string;
  openedBy: string;
  openingCashCount: CashDenominationCount;
  initialCashAmount: number;

  transactions: TpvRegisterTransaction[];
  cashCounts: TpvCashCount[];

  closedAt: string;
  closedBy: string;
  closingCashCount: CashDenominationCount;
  finalCashAmount: number;
  expectedCash: number;
  difference: number;
  closingNotes: string;

  closingValidatedBy?: string;
  closingValidatedAt?: string;
  closingValidationStatus?: 'pending' | 'validated' | 'rejected';
  closingValidationNotes?: string;

  incidents: TpvIncident[];

  salesByChannel?: Record<string, number>;

  linkedOrderIds?: string[];

  summary: TpvRegisterSummary;

  createdAt: string;
  updatedAt: string;
}

export async function listTpvRegisterSessionsRequest(userId: string): Promise<TpvRegisterSession[]> {
  const id = normalizeUserId(userId);
  const payload = await request<{ ok: boolean; sessions: TpvRegisterSession[] }>(
    `/api/delivery/tpv-sessions/${encodeURIComponent(id)}`,
  );
  return payload.sessions || [];
}

export async function createTpvRegisterSessionRequest(userId: string, data: Partial<TpvRegisterSession>): Promise<TpvRegisterSession> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; session: TpvRegisterSession }>(
    `/api/delivery/tpv-sessions/${encodeURIComponent(id)}`,
    { method: 'POST', body: JSON.stringify({ session: data }) },
  );
  if (!result.session) throw new Error('Respuesta inválida del servidor');
  return result.session;
}

export async function updateTpvRegisterSessionRequest(userId: string, session: TpvRegisterSession): Promise<TpvRegisterSession> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; session: TpvRegisterSession }>(
    `/api/delivery/tpv-sessions/${encodeURIComponent(id)}/${encodeURIComponent(session._id)}`,
    { method: 'PUT', body: JSON.stringify({ session }) },
  );
  if (!result.session) throw new Error('Respuesta inválida del servidor');
  return result.session;
}

// ─── Delivery Config ──────────────────────────────────────────────────────────

export interface DeliveryTimeSlot {
  id: string;
  label: string;
  start: string;
  end: string;
}

export interface DeliveryConfig {
  _id: string;
  _rev?: string;
  type: 'delivery_config';
  user_id: string;
  hasDineIn: boolean;
  hasTakeaway: boolean;
  hasOwnDelivery: boolean;
  hasPlatformDelivery: boolean;
  platforms: string[];
  hasPhysicalTables: boolean;
  tableCount: number;
  hasKitchen: boolean;
  hasAssemblyStation: boolean;
  hasCashRegister: boolean;
  defaultPrepTime: number;
  maxKitchenCapacity: number;
  delayThresholdMinutes: number;
  kitchenSaturationThreshold: number;
  cashCloseReminder: boolean;
  cashCloseReminderTime: string;
  activeChannels: string[];
  activeTimeSlots: DeliveryTimeSlot[];

  cashRegisterAlerts?: {
    registerNotOpenedEnabled?: boolean;
    registerNotOpenedCheckHour?: number;
    registerNotClosedEnabled?: boolean;
    registerNotClosedCheckHour?: number;
    discrepancyEnabled?: boolean;
    discrepancyThreshold?: number;
    highReturnEnabled?: boolean;
    highReturnThreshold?: number;
    unpaidDeliveryEnabled?: boolean;
    autoCreateFinanceOnClose?: boolean;
  };
}

export async function getDeliveryConfigRequest(userId: string): Promise<DeliveryConfig> {
  const id = normalizeUserId(userId);
  const payload = await request<{ ok: boolean; config: DeliveryConfig }>(
    `/api/delivery/config/${encodeURIComponent(id)}`,
  );
  return payload.config;
}

export async function updateDeliveryConfigRequest(userId: string, config: Partial<DeliveryConfig>): Promise<DeliveryConfig> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; config: DeliveryConfig }>(
    `/api/delivery/config/${encodeURIComponent(id)}`,
    { method: 'PUT', body: JSON.stringify({ config }) },
  );
  return result.config;
}

// ─── Ops Center ───────────────────────────────────────────────────────────────

export interface OpsAlert {
  id: string;
  type: 'delayed_order' | 'kitchen_saturated' | 'cash_pending_close' | 'critical_stock' | 'open_incident';
  severity: 'warning' | 'critical';
  title: string;
  message: string;
  orderId?: string;
  sessionId?: string;
  itemId?: string;
  route: string;
  createdAt: string;
}

export interface OpsCenterKpis {
  totalOrders: number;
  byStatus: Record<DeliveryOrderStatus, number>;
  revenue: number;
  averageTicket: number;
  avgPrepTimeMinutes: number;
  avgDeliveryTimeMinutes: number;
  deliveredOnTime: number;
  deliveredLate: number;
  onTimePercentage: number;
}

export interface OpsCenterData {
  date: string;
  filters: { salesPointId: string | null; channel: string | null; timeSlot: string | null };
  config: DeliveryConfig;
  kpis: OpsCenterKpis;
  activeOrders: DeliveryOrder[];
  alerts: OpsAlert[];
  cashStatus: {
    openTpvSessions: TpvRegisterSession[];
    openDriverSessions: DriverCashSession[];
    totalCashInRegisters: number;
    pendingClose: number;
  };
  kitchenStatus: {
    ordersInKitchen: number;
    capacity: number;
    saturationPercent: number;
    oldestOrderMinutes: number;
    avgWaitMinutes: number;
  };
  deliveryStatus: {
    ordersInDelivery: number;
    driversActive: number;
    avgDeliveryMinutes: number;
    delayedCount: number;
  };
  revenueByChannel: Record<string, number>;
  revenueByHour: { hour: string; revenue: number; orders: number }[];
  pointsOfSale: PointOfSale[];
}

export interface OpsCenterFilters {
  salesPointId?: string;
  channel?: string;
  timeSlot?: string;
  date?: string;
}

export async function getOpsCenterRequest(userId: string, filters?: OpsCenterFilters): Promise<OpsCenterData> {
  const id = normalizeUserId(userId);
  const params = new URLSearchParams();
  if (filters?.salesPointId) params.set('salesPointId', filters.salesPointId);
  if (filters?.channel) params.set('channel', filters.channel);
  if (filters?.timeSlot) params.set('timeSlot', filters.timeSlot);
  if (filters?.date) params.set('date', filters.date);
  const qs = params.toString() ? `?${params.toString()}` : '';
  const payload = await request<{ ok: boolean } & OpsCenterData>(
    `/api/delivery/ops-center/${encodeURIComponent(id)}${qs}`,
  );
  return payload;
}

// ─── DRIVERS (Repartidores) ──────────────────────────────────────────────────

export interface Driver {
  _id: string;
  _rev?: string;
  type: 'driver';
  id: string;
  user_id: string;
  teamMemberId: string;
  name: string;
  phone: string;
  email: string;
  avatar: string;
  status: 'active' | 'offline' | 'on_break' | 'unavailable';
  zones: string[];
  maxConcurrentOrders: number;
  vehicleType: string;
  currentLocation: { lat: number; lng: number; updatedAt: string } | null;
  stats: {
    totalDelivered: number;
    averageDeliveryMinutes: number;
    rating: number | null;
  };
  isManager: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DriverStats {
  driverId: string;
  driverName: string;
  assignedCount: number;
  inRouteCount: number;
  deliveredTodayCount: number;
  pendingCashAmount: number;
  lastDeliveredAt: string | null;
  status: Driver['status'];
}

export async function listDriversRequest(userId: string): Promise<Driver[]> {
  const id = normalizeUserId(userId);
  const payload = await request<{ ok: boolean; drivers: Driver[] }>(
    `/api/delivery/drivers/${encodeURIComponent(id)}`,
  );
  return payload.drivers || [];
}

export async function createDriverRequest(userId: string, data: Partial<Driver>): Promise<Driver> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; driver: Driver }>(
    `/api/delivery/drivers/${encodeURIComponent(id)}`,
    { method: 'POST', body: JSON.stringify({ driver: data }) },
  );
  if (!result.driver) throw new Error('Respuesta inválida del servidor');
  return result.driver;
}

export async function updateDriverRequest(userId: string, driver: Driver): Promise<Driver> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; driver: Driver }>(
    `/api/delivery/drivers/${encodeURIComponent(id)}/${encodeURIComponent(driver._id)}`,
    { method: 'PUT', body: JSON.stringify({ driver }) },
  );
  if (!result.driver) throw new Error('Respuesta inválida del servidor');
  return result.driver;
}

export async function deleteDriverRequest(userId: string, driverId: string): Promise<void> {
  const id = normalizeUserId(userId);
  await request(
    `/api/delivery/drivers/${encodeURIComponent(id)}/${encodeURIComponent(driverId)}`,
    { method: 'DELETE' },
  );
}

export async function getDriversStatsRequest(userId: string): Promise<DriverStats[]> {
  const id = normalizeUserId(userId);
  const payload = await request<{ ok: boolean; stats: DriverStats[] }>(
    `/api/delivery/drivers/${encodeURIComponent(id)}/stats`,
  );
  return payload.stats || [];
}

export async function autoAssignDriverRequest(userId: string, orderId: string): Promise<{ ok: boolean; order?: DeliveryOrder; driver?: Driver; reason?: string }> {
  const id = normalizeUserId(userId);
  return request<{ ok: boolean; order?: DeliveryOrder; driver?: Driver; reason?: string }>(
    `/api/delivery/drivers/${encodeURIComponent(id)}/auto-assign/${encodeURIComponent(orderId)}`,
    { method: 'POST' },
  );
}

// ─── REPARTO CONFIG ──────────────────────────────────────────────────────────

export interface DeliveryZone {
  id: string;
  name: string;
  postalCodes: string[];
  baseDeliveryMinutes: number;
  surcharge: number;
}

export interface RepartoConfig {
  _id: string;
  _rev?: string;
  type: 'reparto_config';
  user_id: string;
  autoAssign: boolean;
  autoAssignMode: 'load' | 'proximity' | 'hybrid';
  autoAssignOnAssemblyComplete: boolean;
  maxOrdersPerDriver: number;
  alertDelayMinutes: number;
  alertDeliveryDelayMinutes: number;
  zones: DeliveryZone[];
  estimatedMinutesPerKm: number;
  basePreparationMinutes: number;
  ownDeliveryEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export async function getRepartoConfigRequest(userId: string): Promise<RepartoConfig> {
  const id = normalizeUserId(userId);
  const payload = await request<{ ok: boolean; config: RepartoConfig }>(
    `/api/delivery/reparto-config/${encodeURIComponent(id)}`,
  );
  return payload.config;
}

export async function saveRepartoConfigRequest(userId: string, config: Partial<RepartoConfig>): Promise<RepartoConfig> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; config: RepartoConfig }>(
    `/api/delivery/reparto-config/${encodeURIComponent(id)}`,
    { method: 'PUT', body: JSON.stringify({ config }) },
  );
  return result.config;
}
