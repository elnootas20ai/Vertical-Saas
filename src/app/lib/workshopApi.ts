import { v4 as uuidv4 } from 'uuid';
import { getAuthHeaders } from './authApi';
import { getApiBase } from './apiBase';
import { notifyWorkshopDataChanged, type WorkshopScope } from './workshopEvents';

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

function withBusinessQuery(path: string, businessId?: string): string {
  const scope = String(businessId || '').trim();
  if (!scope) return path;
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}businessId=${encodeURIComponent(scope)}`;
}

export type { WorkshopScope } from './workshopEvents';

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
    throw new Error(payload?.error || 'Error inesperado en workshop API');
  }
  return payload;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type WorkOrderStatus = 'pending' | 'in_progress' | 'completed' | 'invoiced' | 'cancelled';
export type WorkOrderPriority = 'low' | 'normal' | 'high' | 'urgent';
export type WorkOrderServiceType =
  | 'revision'
  | 'reparacion'
  | 'mantenimiento'
  | 'puesta_punto'
  | 'garantia'
  | 'otro';

export interface LaborItem {
  id: string;
  description: string;
  hours: number;
  ratePerHour: number;
  total: number;
  mechanicName: string;
}

export interface MaterialItem {
  id: string;
  partId?: string;
  partName: string;
  reference?: string;
  quantity: number;
  unitCost: number;
  total: number;
}

export interface TimeEntry {
  id: string;
  mechanicName: string;
  startTime: string;
  endTime?: string;
  duration?: number;
  notes?: string;
}

export interface WorkOrderStageEvent {
  status: WorkOrderStatus;
  date: string;
  user: string;
  notes?: string;
}

export interface WorkOrder {
  _id: string;
  _rev?: string;
  type: 'work_order';
  id: string;
  woNumber: string;
  user_id: string;
  business_id?: string;
  vehicleId?: string;
  vehicleBrand: string;
  vehicleModel: string;
  vehiclePlate: string;
  vehicleVin?: string;
  vehicleMileage?: number;
  clientId?: string;
  clientName: string;
  clientPhone?: string;
  clientEmail?: string;
  status: WorkOrderStatus;
  priority: WorkOrderPriority;
  serviceType: WorkOrderServiceType;
  description: string;
  responsible: string;
  laborItems: LaborItem[];
  materialItems: MaterialItem[];
  timeEntries: TimeEntry[];
  totalLaborCost: number;
  totalMaterialsCost: number;
  totalCost: number;
  mechanicSignature?: string;
  clientSignature?: string;
  photos: string[];
  notes?: string;
  invoiceId?: string;
  estimatedCompletion?: string;
  completedAt?: string;
  invoicedAt?: string;
  stageHistory: WorkOrderStageEvent[];
  createdAt: string;
  updatedAt: string;
}

export type CreateWorkOrderPayload = Omit<WorkOrder, '_id' | '_rev' | 'type' | 'id' | 'woNumber' | 'user_id' | 'totalLaborCost' | 'totalMaterialsCost' | 'totalCost' | 'createdAt' | 'updatedAt'>;

export function normalizeWorkOrder(value: unknown): WorkOrder | null {
  if (!value || typeof value !== 'object') return null;
  const d = value as Record<string, unknown>;
  if (d.type !== 'work_order' || !d._id) return null;
  return {
    _id: String(d._id || ''),
    _rev: d._rev ? String(d._rev) : undefined,
    type: 'work_order',
    id: String(d._id || d.id || ''),
    woNumber: String(d.woNumber || ''),
    user_id: String(d.user_id || ''),
    vehicleId: d.vehicleId ? String(d.vehicleId) : undefined,
    vehicleBrand: String(d.vehicleBrand || ''),
    vehicleModel: String(d.vehicleModel || ''),
    vehiclePlate: String(d.vehiclePlate || ''),
    vehicleVin: d.vehicleVin ? String(d.vehicleVin) : undefined,
    vehicleMileage: d.vehicleMileage ? Number(d.vehicleMileage) : undefined,
    clientId: d.clientId ? String(d.clientId) : undefined,
    clientName: String(d.clientName || ''),
    clientPhone: d.clientPhone ? String(d.clientPhone) : undefined,
    clientEmail: d.clientEmail ? String(d.clientEmail) : undefined,
    status: (d.status as WorkOrderStatus) || 'pending',
    priority: (d.priority as WorkOrderPriority) || 'normal',
    serviceType: (d.serviceType as WorkOrderServiceType) || 'revision',
    description: String(d.description || ''),
    responsible: String(d.responsible || 'Sin asignar'),
    laborItems: Array.isArray(d.laborItems) ? (d.laborItems as LaborItem[]) : [],
    materialItems: Array.isArray(d.materialItems) ? (d.materialItems as MaterialItem[]) : [],
    timeEntries: Array.isArray(d.timeEntries) ? (d.timeEntries as TimeEntry[]) : [],
    totalLaborCost: Number(d.totalLaborCost || 0),
    totalMaterialsCost: Number(d.totalMaterialsCost || 0),
    totalCost: Number(d.totalCost || 0),
    mechanicSignature: d.mechanicSignature ? String(d.mechanicSignature) : undefined,
    clientSignature: d.clientSignature ? String(d.clientSignature) : undefined,
    photos: Array.isArray(d.photos) ? (d.photos as string[]) : [],
    notes: d.notes ? String(d.notes) : undefined,
    invoiceId: d.invoiceId ? String(d.invoiceId) : undefined,
    estimatedCompletion: d.estimatedCompletion ? String(d.estimatedCompletion) : undefined,
    completedAt: d.completedAt ? String(d.completedAt) : undefined,
    invoicedAt: d.invoicedAt ? String(d.invoicedAt) : undefined,
    stageHistory: Array.isArray(d.stageHistory) ? (d.stageHistory as WorkOrderStageEvent[]) : [],
    createdAt: String(d.createdAt || new Date().toISOString()),
    updatedAt: String(d.updatedAt || d.createdAt || new Date().toISOString()),
  };
}

// ─── API Functions ────────────────────────────────────────────────────────────

export async function listWorkOrdersRequest(userId: string, scope?: WorkshopScope): Promise<WorkOrder[]> {
  const normalizedUserId = normalizeUserId(userId);
  const payload = await request<{ ok: boolean; workOrders: unknown[] }>(
    withBusinessQuery(`/api/workshop/orders/${encodeURIComponent(normalizedUserId)}`, scope?.businessId),
  );
  return (payload.workOrders || [])
    .map(normalizeWorkOrder)
    .filter((w): w is WorkOrder => Boolean(w));
}

export async function createWorkOrderRequest(
  userId: string,
  data: CreateWorkOrderPayload,
  scope?: WorkshopScope,
): Promise<WorkOrder> {
  const normalizedUserId = normalizeUserId(userId);
  const businessId = String(scope?.businessId || data.business_id || '').trim();
  const result = await request<{ ok: boolean; workOrder: unknown }>(
    `/api/workshop/orders/${encodeURIComponent(normalizedUserId)}`,
    {
      method: 'POST',
      body: JSON.stringify({
        workOrder: businessId ? { ...data, business_id: businessId } : data,
      }),
    },
  );
  const normalized = normalizeWorkOrder(result.workOrder);
  if (!normalized) throw new Error('Respuesta inválida del servidor');
  notifyWorkshopDataChanged();
  return normalized;
}

export async function updateWorkOrderRequest(
  userId: string,
  workOrder: WorkOrder,
  scope?: WorkshopScope,
): Promise<WorkOrder> {
  const normalizedUserId = normalizeUserId(userId);
  const businessId = String(scope?.businessId || workOrder.business_id || '').trim();
  const payload = businessId ? { ...workOrder, business_id: businessId } : workOrder;
  const result = await request<{ ok: boolean; workOrder: unknown }>(
    `/api/workshop/orders/${encodeURIComponent(normalizedUserId)}/${encodeURIComponent(workOrder._id)}`,
    { method: 'PUT', body: JSON.stringify({ workOrder: payload }) },
  );
  const normalized = normalizeWorkOrder(result.workOrder);
  if (!normalized) throw new Error('Respuesta inválida del servidor');
  notifyWorkshopDataChanged();
  return normalized;
}

export async function deleteWorkOrderRequest(userId: string, workOrderId: string): Promise<void> {
  const normalizedUserId = normalizeUserId(userId);
  await request(
    `/api/workshop/orders/${encodeURIComponent(normalizedUserId)}/${encodeURIComponent(workOrderId)}`,
    { method: 'DELETE' },
  );
  notifyWorkshopDataChanged();
}

// ─── Helper: create empty labor/material/time items ──────────────────────────

export function createLaborItem(overrides: Partial<LaborItem> = {}): LaborItem {
  return {
    id: uuidv4(),
    description: '',
    hours: 1,
    ratePerHour: 0,
    total: 0,
    mechanicName: '',
    ...overrides,
  };
}

export function createMaterialItem(overrides: Partial<MaterialItem> = {}): MaterialItem {
  return {
    id: uuidv4(),
    partName: '',
    quantity: 1,
    unitCost: 0,
    total: 0,
    ...overrides,
  };
}

export function createTimeEntry(overrides: Partial<TimeEntry> = {}): TimeEntry {
  return {
    id: uuidv4(),
    mechanicName: '',
    startTime: new Date().toISOString(),
    ...overrides,
  };
}
