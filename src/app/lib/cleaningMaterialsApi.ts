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
    throw new Error(payload?.error || 'Error inesperado en cleaning materials API');
  }
  return payload;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type MaterialType =
  | 'detergent' | 'disinfectant' | 'degreaser' | 'glass_cleaner'
  | 'floor_cleaner' | 'utensil' | 'consumable' | 'protective' | 'other';

export type DeliveryStatus = 'draft' | 'delivered' | 'partial_return' | 'returned' | 'cancelled';
export type ReturnStatus = 'pending' | 'inspected' | 'accepted' | 'partial' | 'rejected';
export type ReturnCondition = 'good' | 'damaged' | 'unusable' | 'expired';
export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type InventoryCountStatus = 'in_progress' | 'completed' | 'approved';

export interface CleaningMaterial {
  _id: string;
  _rev?: string;
  type: 'catalog_item';
  subtype: 'cleaning_material';
  id: string;
  user_id: string;
  sku: string;
  name: string;
  description: string;
  category: string;
  materialType: MaterialType;
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
  image: string;
  active: boolean;
  dilutionRatio: string;
  safetySheetUrl: string;
  usageInstructions: string;
  expirationMonths: number;
  fragrance: string;
  concentration: string;
  applicationSurface: string[];
  deliveryUnit: string;
  deliveryUnitQuantity: number;
  maxPerDelivery: number;
  requiresReturn: boolean;
  averageConsumptionPerService: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface DeliveryLine {
  id: string;
  catalogItemId: string;
  materialName: string;
  sku: string;
  quantity: number;
  unit: string;
  deliveryUnit: string;
  deliveryUnitQty: number;
  requiresReturn: boolean;
  returnedQuantity: number;
  returnStatus: 'pending' | 'returned' | 'partial' | 'not_applicable';
  unitCost: number;
  notes: string;
}

export interface MaterialDelivery {
  _id: string;
  _rev?: string;
  type: 'material_delivery';
  id: string;
  user_id: string;
  deliveryNumber: string;
  date: string;
  time: string;
  workerId: string;
  workerName: string;
  warehouseId: string;
  warehouseName: string;
  vehicleId: string;
  serviceId: string;
  serviceNumber: string;
  clientId: string;
  clientName: string;
  lines: DeliveryLine[];
  status: DeliveryStatus;
  deliveredBy: string;
  deliveredByName: string;
  receivedConfirmation: boolean;
  receivedAt: string;
  workerSignature: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReturnLine {
  id: string;
  catalogItemId: string;
  materialName: string;
  quantityReturned: number;
  quantityOriginal: number;
  condition: ReturnCondition;
  reusable: boolean;
  notes: string;
}

export interface MaterialReturn {
  _id: string;
  _rev?: string;
  type: 'material_return';
  id: string;
  user_id: string;
  returnNumber: string;
  date: string;
  time: string;
  workerId: string;
  workerName: string;
  deliveryId: string;
  deliveryNumber: string;
  warehouseId: string;
  warehouseName: string;
  lines: ReturnLine[];
  status: ReturnStatus;
  inspectedBy: string;
  inspectedByName: string;
  inspectedAt: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface MaterialRequest {
  _id: string;
  _rev?: string;
  type: 'material_request';
  id: string;
  user_id: string;
  requestNumber: string;
  workerId: string;
  workerName: string;
  catalogItemId: string;
  materialName: string;
  quantity: number;
  unit: string;
  reason: string;
  status: RequestStatus;
  reviewedBy: string;
  reviewedByName: string;
  reviewedAt: string;
  deliveryId: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryCountLine {
  id: string;
  catalogItemId: string;
  materialName: string;
  sku: string;
  expectedQuantity: number;
  actualQuantity: number;
  discrepancy: number;
  discrepancyPercentage: number;
  unitCost: number;
  discrepancyValue: number;
  notes: string;
}

export interface MaterialInventoryCount {
  _id: string;
  _rev?: string;
  type: 'material_inventory_count';
  id: string;
  user_id: string;
  countNumber: string;
  date: string;
  countedBy: string;
  countedByName: string;
  warehouseId: string;
  warehouseName: string;
  workerId: string;
  lines: InventoryCountLine[];
  status: InventoryCountStatus;
  approvedBy: string;
  approvedAt: string;
  summary: {
    totalItems: number;
    matchingItems: number;
    discrepancyItems: number;
    totalDiscrepancyValue: number;
  };
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface MaterialsSummary {
  totalMaterials: number;
  stockValue: number;
  lowStockCount: number;
  outOfStockCount: number;
}

// ─── Materials API ───────────────────────────────────────────────────────────

const BASE = '/api/cleaning-materials';

export async function listCleaningMaterialsRequest(userId: string, materialType?: MaterialType): Promise<CleaningMaterial[]> {
  const id = normalizeUserId(userId);
  const qs = materialType ? `?materialType=${materialType}` : '';
  const payload = await request<{ ok: boolean; materials: CleaningMaterial[] }>(
    `${BASE}/materials/${encodeURIComponent(id)}${qs}`,
  );
  return payload.materials || [];
}

export async function createCleaningMaterialRequest(userId: string, material: Partial<CleaningMaterial>): Promise<CleaningMaterial> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; material: CleaningMaterial }>(
    `${BASE}/materials/${encodeURIComponent(id)}`,
    { method: 'POST', body: JSON.stringify({ material }) },
  );
  return result.material;
}

export async function updateCleaningMaterialRequest(userId: string, materialId: string, material: Partial<CleaningMaterial>): Promise<CleaningMaterial> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; material: CleaningMaterial }>(
    `${BASE}/materials/${encodeURIComponent(id)}/${encodeURIComponent(materialId)}`,
    { method: 'PUT', body: JSON.stringify({ material }) },
  );
  return result.material;
}

export async function deleteCleaningMaterialRequest(userId: string, materialId: string): Promise<void> {
  const id = normalizeUserId(userId);
  await request(`${BASE}/materials/${encodeURIComponent(id)}/${encodeURIComponent(materialId)}`, { method: 'DELETE' });
}

export async function getCleaningMaterialsSummaryRequest(userId: string): Promise<MaterialsSummary> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; summary: MaterialsSummary }>(
    `${BASE}/materials/${encodeURIComponent(id)}/summary`,
  );
  return result.summary;
}

// ─── Deliveries API ──────────────────────────────────────────────────────────

export async function listDeliveriesRequest(userId: string, filters?: { workerId?: string; serviceId?: string }): Promise<MaterialDelivery[]> {
  const id = normalizeUserId(userId);
  const params = new URLSearchParams();
  if (filters?.workerId) params.set('workerId', filters.workerId);
  if (filters?.serviceId) params.set('serviceId', filters.serviceId);
  const qs = params.toString() ? `?${params.toString()}` : '';
  const payload = await request<{ ok: boolean; deliveries: MaterialDelivery[] }>(
    `${BASE}/deliveries/${encodeURIComponent(id)}${qs}`,
  );
  return payload.deliveries || [];
}

export async function getDeliveryRequest(userId: string, deliveryId: string): Promise<MaterialDelivery> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; delivery: MaterialDelivery }>(
    `${BASE}/deliveries/${encodeURIComponent(id)}/${encodeURIComponent(deliveryId)}`,
  );
  return result.delivery;
}

export async function createDeliveryRequest(userId: string, delivery: Partial<MaterialDelivery>): Promise<MaterialDelivery> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; delivery: MaterialDelivery }>(
    `${BASE}/deliveries/${encodeURIComponent(id)}`,
    { method: 'POST', body: JSON.stringify({ delivery }) },
  );
  return result.delivery;
}

export async function updateDeliveryRequest(userId: string, deliveryId: string, delivery: Partial<MaterialDelivery>): Promise<MaterialDelivery> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; delivery: MaterialDelivery }>(
    `${BASE}/deliveries/${encodeURIComponent(id)}/${encodeURIComponent(deliveryId)}`,
    { method: 'PUT', body: JSON.stringify({ delivery }) },
  );
  return result.delivery;
}

export async function confirmDeliveryRequest(userId: string, deliveryId: string): Promise<MaterialDelivery> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; delivery: MaterialDelivery }>(
    `${BASE}/deliveries/${encodeURIComponent(id)}/${encodeURIComponent(deliveryId)}/confirm`,
    { method: 'POST' },
  );
  return result.delivery;
}

export async function deleteDeliveryRequest(userId: string, deliveryId: string): Promise<void> {
  const id = normalizeUserId(userId);
  await request(`${BASE}/deliveries/${encodeURIComponent(id)}/${encodeURIComponent(deliveryId)}`, { method: 'DELETE' });
}

// ─── Returns API ─────────────────────────────────────────────────────────────

export async function listReturnsRequest(userId: string): Promise<MaterialReturn[]> {
  const id = normalizeUserId(userId);
  const payload = await request<{ ok: boolean; returns: MaterialReturn[] }>(
    `${BASE}/returns/${encodeURIComponent(id)}`,
  );
  return payload.returns || [];
}

export async function createReturnRequest(userId: string, materialReturn: Partial<MaterialReturn>): Promise<MaterialReturn> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; materialReturn: MaterialReturn }>(
    `${BASE}/returns/${encodeURIComponent(id)}`,
    { method: 'POST', body: JSON.stringify({ materialReturn }) },
  );
  return result.materialReturn;
}

export async function updateReturnRequest(userId: string, returnId: string, materialReturn: Partial<MaterialReturn>): Promise<MaterialReturn> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; materialReturn: MaterialReturn }>(
    `${BASE}/returns/${encodeURIComponent(id)}/${encodeURIComponent(returnId)}`,
    { method: 'PUT', body: JSON.stringify({ materialReturn }) },
  );
  return result.materialReturn;
}

export async function acceptReturnRequest(userId: string, returnId: string): Promise<MaterialReturn> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; materialReturn: MaterialReturn }>(
    `${BASE}/returns/${encodeURIComponent(id)}/${encodeURIComponent(returnId)}/accept`,
    { method: 'POST' },
  );
  return result.materialReturn;
}

// ─── Requests API ────────────────────────────────────────────────────────────

export async function listMaterialRequestsRequest(userId: string, filters?: { workerId?: string; status?: RequestStatus }): Promise<MaterialRequest[]> {
  const id = normalizeUserId(userId);
  const params = new URLSearchParams();
  if (filters?.workerId) params.set('workerId', filters.workerId);
  if (filters?.status) params.set('status', filters.status);
  const qs = params.toString() ? `?${params.toString()}` : '';
  const payload = await request<{ ok: boolean; requests: MaterialRequest[] }>(
    `${BASE}/requests/${encodeURIComponent(id)}${qs}`,
  );
  return payload.requests || [];
}

export async function createMaterialRequestRequest(userId: string, materialRequest: Partial<MaterialRequest>): Promise<MaterialRequest> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; materialRequest: MaterialRequest }>(
    `${BASE}/requests/${encodeURIComponent(id)}`,
    { method: 'POST', body: JSON.stringify({ materialRequest }) },
  );
  return result.materialRequest;
}

export async function approveMaterialRequestRequest(userId: string, requestId: string): Promise<MaterialRequest> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; materialRequest: MaterialRequest }>(
    `${BASE}/requests/${encodeURIComponent(id)}/${encodeURIComponent(requestId)}/approve`,
    { method: 'POST' },
  );
  return result.materialRequest;
}

export async function rejectMaterialRequestRequest(userId: string, requestId: string, reason?: string): Promise<MaterialRequest> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; materialRequest: MaterialRequest }>(
    `${BASE}/requests/${encodeURIComponent(id)}/${encodeURIComponent(requestId)}/reject`,
    { method: 'POST', body: JSON.stringify({ reason }) },
  );
  return result.materialRequest;
}

// ─── Inventory API ───────────────────────────────────────────────────────────

export async function listInventoryCountsRequest(userId: string): Promise<MaterialInventoryCount[]> {
  const id = normalizeUserId(userId);
  const payload = await request<{ ok: boolean; inventoryCounts: MaterialInventoryCount[] }>(
    `${BASE}/inventory/${encodeURIComponent(id)}`,
  );
  return payload.inventoryCounts || [];
}

export async function createInventoryCountRequest(userId: string, inventoryCount?: Partial<MaterialInventoryCount>): Promise<MaterialInventoryCount> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; inventoryCount: MaterialInventoryCount }>(
    `${BASE}/inventory/${encodeURIComponent(id)}`,
    { method: 'POST', body: JSON.stringify({ inventoryCount }) },
  );
  return result.inventoryCount;
}

export async function updateInventoryCountRequest(userId: string, countId: string, inventoryCount: Partial<MaterialInventoryCount>): Promise<MaterialInventoryCount> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; inventoryCount: MaterialInventoryCount }>(
    `${BASE}/inventory/${encodeURIComponent(id)}/${encodeURIComponent(countId)}`,
    { method: 'PUT', body: JSON.stringify({ inventoryCount }) },
  );
  return result.inventoryCount;
}

export async function approveInventoryCountRequest(userId: string, countId: string): Promise<MaterialInventoryCount> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean; inventoryCount: MaterialInventoryCount }>(
    `${BASE}/inventory/${encodeURIComponent(id)}/${encodeURIComponent(countId)}/approve`,
    { method: 'POST' },
  );
  return result.inventoryCount;
}

// ─── Service Consumption API (MAT-04) ────────────────────────────────────────

export interface ServiceMaterialUsed {
  id?: string;
  catalogItemId: string;
  materialName: string;
  quantity: number;
  unit: string;
  unitCost: number;
  totalCost: number;
  addedBy: 'worker' | 'manager';
  deliveryId?: string;
}

export interface ServiceConsumption {
  materialsUsed: ServiceMaterialUsed[];
  materialCost: number;
  laborCost: number;
  totalCost: number;
}

export async function getServiceConsumptionRequest(userId: string, serviceId: string): Promise<ServiceConsumption> {
  const id = normalizeUserId(userId);
  const result = await request<{ ok: boolean } & ServiceConsumption>(
    `${BASE}/consumption/${encodeURIComponent(id)}/${encodeURIComponent(serviceId)}`,
  );
  return { materialsUsed: result.materialsUsed, materialCost: result.materialCost, laborCost: result.laborCost, totalCost: result.totalCost };
}

export async function registerServiceConsumptionRequest(userId: string, serviceId: string, materialsUsed: ServiceMaterialUsed[]): Promise<void> {
  const id = normalizeUserId(userId);
  await request(
    `${BASE}/consumption/${encodeURIComponent(id)}/${encodeURIComponent(serviceId)}`,
    { method: 'POST', body: JSON.stringify({ materialsUsed }) },
  );
}
