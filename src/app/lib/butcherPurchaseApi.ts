const API = import.meta.env.VITE_API_URL || '';

function headers() {
  const token = localStorage.getItem('token') || '';
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

// ─── Types ──────────────────────────────────────────────────────────────────

export type PurchaseEntryStatus = 'draft' | 'confirmed' | 'validated';
export type PurchaseEntryUnit = 'kg' | 'unidades' | 'litros' | 'cajas';
export type AnimalType = 'vacuno' | 'cerdo' | 'pollo' | 'cordero' | 'elaborados' | 'otro';

export interface PurchaseEntry {
  _id: string;
  _rev?: string;
  id: string;
  user_id: string;
  business_id: string;
  supplierId: string;
  supplierName: string;
  supplierCif: string;
  productId: string;
  productName: string;
  productSku: string;
  quantityPurchased: number;
  quantityReceived: number;
  unit: PurchaseEntryUnit;
  isComplete: boolean;
  costPerUnit: number;
  totalCost: number;
  previousAvgCost: number;
  newAvgCost: number;
  entryDate: string;
  purchaseDate: string;
  batchId: string;
  batchCode: string;
  expirationDate: string;
  expirationRequired: boolean;
  warehouseId: string;
  warehouseName: string;
  warehouseType: string;
  zone: string;
  invoiceId: string;
  invoiceNumber: string;
  purchaseOrderId: string;
  purchaseOrderNumber: string;
  documentIds: string[];
  ocrData: unknown;
  animalType: AnimalType | '';
  origin: string;
  slaughterhouse: string;
  healthGuideNumber: string;
  slaughterDate: string;
  temperatureOnArrival: number | null;
  status: PurchaseEntryStatus;
  costAnomaly: boolean;
  costAnomalyPct: number;
  confirmedBy: string;
  validatedBy: string;
  confirmedAt: string;
  validatedAt: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface PurchaseEntryFilters {
  supplierId?: string;
  productId?: string;
  status?: PurchaseEntryStatus;
  dateFrom?: string;
  dateTo?: string;
  warehouseId?: string;
  hasInvoice?: 'true' | 'false';
}

export interface PurchaseStats {
  totalCost: number;
  totalKg: number;
  avgCostPerKg: number;
  entriesCount: number;
  pendingValidation: number;
  withoutInvoice: number;
  costAnomalies: number;
  incomplete: number;
  bySupplier: { name: string; total: number; kg: number; count: number }[];
  byProduct: { name: string; total: number; kg: number; count: number; lastCost: number }[];
}

// ─── API calls ──────────────────────────────────────────────────────────────

export async function listPurchaseEntriesRequest(userId: string, filters?: PurchaseEntryFilters) {
  const params = new URLSearchParams();
  if (filters) {
    Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });
  }
  const qs = params.toString() ? `?${params.toString()}` : '';
  const r = await fetch(`${API}/api/butcher-purchases/${userId}${qs}`, { headers: headers() });
  return r.json() as Promise<{ ok: boolean; entries: PurchaseEntry[] }>;
}

export async function createPurchaseEntryRequest(userId: string, entry: Partial<PurchaseEntry>) {
  const r = await fetch(`${API}/api/butcher-purchases/${userId}`, {
    method: 'POST', headers: headers(), body: JSON.stringify(entry),
  });
  return r.json() as Promise<{ ok: boolean; entry: PurchaseEntry }>;
}

export async function updatePurchaseEntryRequest(userId: string, entryId: string, entry: Partial<PurchaseEntry>) {
  const r = await fetch(`${API}/api/butcher-purchases/${userId}/${entryId}`, {
    method: 'PUT', headers: headers(), body: JSON.stringify(entry),
  });
  return r.json() as Promise<{ ok: boolean; entry: PurchaseEntry }>;
}

export async function deletePurchaseEntryRequest(userId: string, entryId: string) {
  const r = await fetch(`${API}/api/butcher-purchases/${userId}/${entryId}`, {
    method: 'DELETE', headers: headers(),
  });
  return r.json() as Promise<{ ok: boolean }>;
}

export async function confirmPurchaseEntryRequest(userId: string, entryId: string) {
  const r = await fetch(`${API}/api/butcher-purchases/${userId}/${entryId}/confirm`, {
    method: 'POST', headers: headers(),
  });
  return r.json() as Promise<{ ok: boolean; entry: PurchaseEntry }>;
}

export async function validatePurchaseEntryRequest(userId: string, entryId: string) {
  const r = await fetch(`${API}/api/butcher-purchases/${userId}/${entryId}/validate`, {
    method: 'POST', headers: headers(),
  });
  return r.json() as Promise<{ ok: boolean; entry: PurchaseEntry }>;
}

export async function getPurchaseEntryStatsRequest(userId: string, dateFrom?: string, dateTo?: string) {
  const params = new URLSearchParams();
  if (dateFrom) params.set('dateFrom', dateFrom);
  if (dateTo) params.set('dateTo', dateTo);
  const qs = params.toString() ? `?${params.toString()}` : '';
  const r = await fetch(`${API}/api/butcher-purchases/${userId}/stats${qs}`, { headers: headers() });
  return r.json() as Promise<{ ok: boolean; stats: PurchaseStats }>;
}

export async function previewBatchCodeRequest(userId: string, entryDate?: string, animalType?: string) {
  const params = new URLSearchParams();
  if (entryDate) params.set('entryDate', entryDate);
  if (animalType) params.set('animalType', animalType);
  const qs = params.toString() ? `?${params.toString()}` : '';
  const r = await fetch(`${API}/api/butcher-purchases/${userId}/batch-code${qs}`, { headers: headers() });
  return r.json() as Promise<{ ok: boolean; batchCode: string }>;
}

// ─── OCR integration ────────────────────────────────────────────────────────

export async function createFromOcrRequest(userId: string, ocrData: Record<string, unknown>) {
  const r = await fetch(`${API}/api/butcher-purchases/${userId}/from-ocr`, {
    method: 'POST', headers: headers(), body: JSON.stringify({ ocrData }),
  });
  return r.json() as Promise<{ ok: boolean; entries: PurchaseEntry[]; matched: { supplierId: string; supplierName: string } }>;
}

// ─── Invoice linking ────────────────────────────────────────────────────────

export async function linkInvoiceRequest(userId: string, entryId: string, invoiceId: string, invoiceNumber: string) {
  const r = await fetch(`${API}/api/butcher-purchases/${userId}/${entryId}/link-invoice`, {
    method: 'POST', headers: headers(), body: JSON.stringify({ invoiceId, invoiceNumber }),
  });
  return r.json() as Promise<{ ok: boolean; entry: PurchaseEntry }>;
}

// ─── Document attachment ────────────────────────────────────────────────────

export async function attachDocumentRequest(userId: string, entryId: string, data: { documentId?: string; title?: string; fileUrl?: string; mimeType?: string }) {
  const r = await fetch(`${API}/api/butcher-purchases/${userId}/${entryId}/attach-document`, {
    method: 'POST', headers: headers(), body: JSON.stringify(data),
  });
  return r.json() as Promise<{ ok: boolean; entry: PurchaseEntry; documentId: string }>;
}

// ─── Finance movement ───────────────────────────────────────────────────────

export async function createFinanceFromEntryRequest(userId: string, entryId: string) {
  const r = await fetch(`${API}/api/butcher-purchases/${userId}/${entryId}/finance`, {
    method: 'POST', headers: headers(),
  });
  return r.json() as Promise<{ ok: boolean; financeId: string }>;
}

// ─── Autocomplete helpers ───────────────────────────────────────────────────

export interface SupplierOption {
  _id: string;
  name: string;
  cif: string;
  phone: string;
  email: string;
  active: boolean;
}

export interface ProductOption {
  _id: string;
  name: string;
  sku: string;
  pricePerKg: number;
  costPerKg: number;
  stockKg: number;
  unit: string;
  category: string;
  active: boolean;
}

export async function searchSuppliersRequest(userId: string, q?: string) {
  const qs = q ? `?q=${encodeURIComponent(q)}` : '';
  const r = await fetch(`${API}/api/butcher-purchases/${userId}/suppliers${qs}`, { headers: headers() });
  return r.json() as Promise<{ ok: boolean; suppliers: SupplierOption[] }>;
}

export async function searchProductsRequest(userId: string, q?: string) {
  const qs = q ? `?q=${encodeURIComponent(q)}` : '';
  const r = await fetch(`${API}/api/butcher-purchases/${userId}/products${qs}`, { headers: headers() });
  return r.json() as Promise<{ ok: boolean; products: ProductOption[] }>;
}

export async function searchInvoicesRequest(userId: string, q?: string) {
  const qs = q ? `?q=${encodeURIComponent(q)}` : '';
  const r = await fetch(`${API}/api/butcher-purchases/${userId}/invoices${qs}`, { headers: headers() });
  return r.json() as Promise<{ ok: boolean; invoices: { _id: string; invoiceNumber: string; supplierName: string; total: number; date: string }[] }>;
}
