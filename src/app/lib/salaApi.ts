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
    throw new Error(payload?.error || 'Error inesperado en sala API');
  }
  return payload;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type DiningTableStatus =
  | 'available'
  | 'occupied'
  | 'pending_order'
  | 'served'
  | 'pending_payment'
  | 'unavailable'
  | 'reserved'
  | 'hidden';

export interface DiningTable {
  _id: string;
  _rev?: string;
  id: string;
  type: 'dining_table';
  userId: string;
  businessId: string;
  number: number;
  name: string;
  zone: string;
  zoneResponsible: string;
  capacity: number;
  currentGuests: number;
  gridW: number;
  gridH: number;
  x: number;
  y: number;
  status: DiningTableStatus;
  occupiedAt: string;
  occupiedBy: string;
  sortOrder: number;
  active: boolean;
  tags: string[];
  roomId?: string;
  shape?: 'square' | 'round' | 'rect' | 'high';
  rotation?: number;
  locked?: boolean;
  notes?: string;
  qrCode?: string;
  visible?: boolean;
  sizePreset?: 'small' | 'medium' | 'large' | 'bar';
  createdAt: string;
  updatedAt: string;
}

export interface DiningWall {
  _id: string;
  _rev?: string;
  id: string;
  type: 'dining_wall';
  userId: string;
  businessId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  thickness: number;
  label: string;
  roomId?: string;
  color?: string;
  rotation?: number;
  createdAt: string;
  updatedAt: string;
}

export interface DiningZone {
  id: string;
  name: string;
  color: string;
  responsible?: string;
  zoneType?: 'sala' | 'terraza' | 'barra' | 'salon' | 'patio';
  bounds?: { x: number; y: number; w: number; h: number };
  barRect?: { x: number; y: number; w: number; h: number };
}

export type LayoutDecorItem = {
  id: string;
  type: 'plant' | 'planter' | 'divider' | 'column' | 'decor';
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
};

export interface DiningSection {
  id: string;
  name: string;
  icon: string;
  active: boolean;
}

export interface SalaRoomConfig {
  id: string;
  name: string;
  color: string;
  roomType: 'salon' | 'terraza' | 'patio' | 'barra' | 'vip' | 'privado';
  sortOrder: number;
  pdvId?: string;
  workCenterId?: string;
  terminalId?: string;
  terminalLabel?: string;
  terminalCode?: string;
}

export interface DiningFloorConfig {
  _id: string;
  _rev?: string;
  id: string;
  type: 'dining_floor_config';
  userId: string;
  businessId: string;
  floorWidth: number;
  floorHeight: number;
  gridSize: number;
  zones: DiningZone[];
  sections: DiningSection[];
  rooms?: SalaRoomConfig[];
  layoutDecor?: LayoutDecorItem[];
  salaSetupVersion?: number;
  /** true tras el asistente rápido de salas + mesas */
  salaQuickSetupComplete?: boolean;
  createdAt: string;
  updatedAt: string;
}

export type DiningOrderStatus = 'open' | 'served' | 'pending_payment' | 'paid' | 'closed' | 'cancelled';
export type ComandaStatus = 'draft' | 'sent_to_kitchen' | 'in_preparation' | 'ready' | 'served' | 'cancelled';
export type ComandaItemStatus = 'pending' | 'in_preparation' | 'ready' | 'served' | 'cancelled';

export interface DiningOrderItem {
  id: string;
  productId: string;
  name: string;
  price: number;
  quantity: number;
  category: string;
  notes: string;
  modifiers: string[];
  status: ComandaItemStatus;
  cancelledReason: string;
  cancelledBy: string;
}

export interface DiningComanda {
  id: string;
  orderNumber: number;
  items: DiningOrderItem[];
  status: ComandaStatus;
  sentToKitchenAt: string;
  readyAt: string;
  servedAt: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  notes: string;
}

export interface DiningPayment {
  id: string;
  method: string;
  amount: number;
  amountReceived: number;
  changeGiven: number;
  tip: number;
  paidBy: string;
  paidByName: string;
  paidAt: string;
  splitLabel: string;
}

export interface DiningOrder {
  _id: string;
  _rev?: string;
  id: string;
  type: 'dining_order';
  userId: string;
  businessId: string;
  tableId: string;
  tableNumber: number;
  tableName: string;
  zone: string;
  section: string;
  guests: number;
  comandas: DiningComanda[];
  subtotal: number;
  discount: number;
  discountPercent: number;
  discountReason: string;
  tax: number;
  total: number;
  status: DiningOrderStatus;
  createdBy: string;
  createdByName: string;
  servedAt: string;
  paidAt: string;
  closedAt: string;
  payments: DiningPayment[];
  splitMode: string;
  splitCount: number;
  clientId: string;
  clientName: string;
  invoiceGenerated: boolean;
  financialMovementId: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Tables ──────────────────────────────────────────────────────────────────

export async function listDiningTablesRequest(userId: string) {
  const uid = normalizeUserId(userId);
  const data = await request<{ tables: DiningTable[] }>(`/api/sala/tables/${uid}`);
  return data.tables;
}

export async function createDiningTableRequest(userId: string, table: Partial<DiningTable>) {
  const uid = normalizeUserId(userId);
  const data = await request<{ table: DiningTable }>(`/api/sala/tables/${uid}`, {
    method: 'POST',
    body: JSON.stringify({ table }),
  });
  return data.table;
}

export async function updateDiningTableRequest(userId: string, tableId: string, table: Partial<DiningTable>) {
  const uid = normalizeUserId(userId);
  const data = await request<{ table: DiningTable }>(`/api/sala/tables/${uid}/${tableId}`, {
    method: 'PUT',
    body: JSON.stringify({ table }),
  });
  return data.table;
}

export async function bulkUpdateDiningTablesRequest(userId: string, tables: Partial<DiningTable>[]) {
  const uid = normalizeUserId(userId);
  const data = await request<{ updated: number }>(`/api/sala/tables/${uid}/bulk`, {
    method: 'PUT',
    body: JSON.stringify({ tables }),
  });
  return data.updated;
}

export async function bulkCreateDiningTablesRequest(userId: string, tables: Partial<DiningTable>[]) {
  const uid = normalizeUserId(userId);
  const data = await request<{ created: number; tables: DiningTable[] }>(`/api/sala/tables/${uid}/bulk-create`, {
    method: 'POST',
    body: JSON.stringify({ tables }),
  });
  return data.tables;
}

export async function deleteDiningTableRequest(userId: string, tableId: string) {
  const uid = normalizeUserId(userId);
  await request(`/api/sala/tables/${uid}/${tableId}`, { method: 'DELETE' });
}

export async function changeTableStatusRequest(
  userId: string,
  tableId: string,
  status: DiningTableStatus,
  extras?: { currentGuests?: number; occupiedBy?: string },
) {
  const uid = normalizeUserId(userId);
  const data = await request<{ table: DiningTable }>(`/api/sala/tables/${uid}/${tableId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status, ...extras }),
  });
  return data.table;
}

// ─── Walls ───────────────────────────────────────────────────────────────────

export async function listDiningWallsRequest(userId: string) {
  const uid = normalizeUserId(userId);
  const data = await request<{ walls: DiningWall[] }>(`/api/sala/walls/${uid}`);
  return data.walls;
}

export async function createDiningWallRequest(userId: string, wall: Partial<DiningWall>) {
  const uid = normalizeUserId(userId);
  const data = await request<{ wall: DiningWall }>(`/api/sala/walls/${uid}`, {
    method: 'POST',
    body: JSON.stringify({ wall }),
  });
  return data.wall;
}

export async function deleteDiningWallRequest(userId: string, wallId: string) {
  const uid = normalizeUserId(userId);
  await request(`/api/sala/walls/${uid}/${wallId}`, { method: 'DELETE' });
}

// ─── Floor Config ────────────────────────────────────────────────────────────

export async function getFloorConfigRequest(userId: string) {
  const uid = normalizeUserId(userId);
  const data = await request<{ config: DiningFloorConfig | null }>(`/api/sala/floor-config/${uid}`);
  return data.config;
}

export async function saveFloorConfigRequest(userId: string, config: Partial<DiningFloorConfig>) {
  const uid = normalizeUserId(userId);
  const data = await request<{ config: DiningFloorConfig }>(`/api/sala/floor-config/${uid}`, {
    method: 'PUT',
    body: JSON.stringify({ config }),
  });
  return data.config;
}

// ─── Orders ──────────────────────────────────────────────────────────────────

export interface DiningOrderFilters {
  status?: string;
  tableId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export async function listDiningOrdersRequest(userId: string, filters?: DiningOrderFilters) {
  const uid = normalizeUserId(userId);
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.tableId) params.set('tableId', filters.tableId);
  if (filters?.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters?.dateTo) params.set('dateTo', filters.dateTo);
  const qs = params.toString();
  const data = await request<{ orders: DiningOrder[] }>(`/api/sala/orders/${uid}${qs ? `?${qs}` : ''}`);
  return data.orders;
}

export async function getDiningOrderRequest(userId: string, orderId: string) {
  const uid = normalizeUserId(userId);
  const data = await request<{ order: DiningOrder }>(`/api/sala/orders/${uid}/${orderId}`);
  return data.order;
}

export async function createDiningOrderRequest(userId: string, order: Partial<DiningOrder>) {
  const uid = normalizeUserId(userId);
  const data = await request<{ order: DiningOrder }>(`/api/sala/orders/${uid}`, {
    method: 'POST',
    body: JSON.stringify({ order }),
  });
  return data.order;
}

export async function updateDiningOrderRequest(userId: string, orderId: string, order: Partial<DiningOrder>) {
  const uid = normalizeUserId(userId);
  const data = await request<{ order: DiningOrder }>(`/api/sala/orders/${uid}/${orderId}`, {
    method: 'PUT',
    body: JSON.stringify({ order }),
  });
  return data.order;
}

// ─── Comandas ────────────────────────────────────────────────────────────────

export async function addComandaRequest(userId: string, orderId: string, comanda: Partial<DiningComanda>) {
  const uid = normalizeUserId(userId);
  const data = await request<{ order: DiningOrder; comanda: DiningComanda }>(
    `/api/sala/orders/${uid}/${orderId}/comanda`,
    { method: 'POST', body: JSON.stringify({ comanda }) },
  );
  return data;
}

export async function updateComandaRequest(
  userId: string,
  orderId: string,
  comandaId: string,
  comanda: Partial<DiningComanda>,
) {
  const uid = normalizeUserId(userId);
  const data = await request<{ order: DiningOrder }>(
    `/api/sala/orders/${uid}/${orderId}/comanda/${comandaId}`,
    { method: 'PUT', body: JSON.stringify({ comanda }) },
  );
  return data.order;
}

export async function sendComandaToKitchenRequest(userId: string, orderId: string, comandaId: string) {
  const uid = normalizeUserId(userId);
  const data = await request<{ order: DiningOrder }>(
    `/api/sala/orders/${uid}/${orderId}/comanda/${comandaId}/send`,
    { method: 'POST' },
  );
  return data.order;
}

export async function cancelComandaRequest(userId: string, orderId: string, comandaId: string, reason: string) {
  const uid = normalizeUserId(userId);
  const data = await request<{ order: DiningOrder }>(
    `/api/sala/orders/${uid}/${orderId}/comanda/${comandaId}/cancel`,
    { method: 'POST', body: JSON.stringify({ reason }) },
  );
  return data.order;
}

export async function updateComandaStatusRequest(
  userId: string,
  orderId: string,
  comandaId: string,
  status: ComandaStatus,
) {
  const uid = normalizeUserId(userId);
  const data = await request<{ order: DiningOrder }>(
    `/api/sala/orders/${uid}/${orderId}/comanda/${comandaId}/status`,
    { method: 'PATCH', body: JSON.stringify({ status }) },
  );
  return data.order;
}

// ─── Payments ────────────────────────────────────────────────────────────────

export async function payDiningOrderRequest(userId: string, orderId: string, payment: Partial<DiningPayment>) {
  const uid = normalizeUserId(userId);
  const data = await request<{ order: DiningOrder; fullyPaid: boolean }>(
    `/api/sala/orders/${uid}/${orderId}/pay`,
    { method: 'POST', body: JSON.stringify({ payment }) },
  );
  return data;
}

export async function closeDiningOrderRequest(userId: string, orderId: string, force?: boolean, reason?: string) {
  const uid = normalizeUserId(userId);
  const data = await request<{ order: DiningOrder }>(
    `/api/sala/orders/${uid}/${orderId}/close`,
    { method: 'POST', body: JSON.stringify({ force, reason }) },
  );
  return data.order;
}

export async function cancelDiningOrderRequest(userId: string, orderId: string, reason: string) {
  const uid = normalizeUserId(userId);
  const data = await request<{ order: DiningOrder }>(
    `/api/sala/orders/${uid}/${orderId}/cancel`,
    { method: 'POST', body: JSON.stringify({ reason }) },
  );
  return data.order;
}

// ─── Split & Merge ───────────────────────────────────────────────────────────

export async function splitDiningOrderRequest(
  userId: string,
  orderId: string,
  mode: 'equal' | 'by_item' | 'custom',
  config: { parts?: number | number[]; assignments?: Record<string, number> },
) {
  const uid = normalizeUserId(userId);
  const data = await request<{ order: DiningOrder; splitAmounts?: number[] }>(
    `/api/sala/orders/${uid}/${orderId}/split`,
    { method: 'POST', body: JSON.stringify({ mode, ...config }) },
  );
  return data;
}

export async function mergeDiningOrdersRequest(
  userId: string,
  sourceOrderIds: string[],
  targetOrderId: string,
) {
  const uid = normalizeUserId(userId);
  const data = await request<{ order: DiningOrder; freedTables: number }>(
    `/api/sala/orders/merge/${uid}`,
    { method: 'POST', body: JSON.stringify({ sourceOrderIds, targetOrderId }) },
  );
  return data;
}

// ─── Pickup (Recogida local) ─────────────────────────────────────────────────

export interface PickupOrder {
  _id: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  status: string;
  channel: string;
  items: { name: string; quantity: number }[];
  totalAmount: number;
  scheduledAt: string;
  createdAt: string;
  notes: string;
}

export async function listPickupOrdersRequest(userId: string) {
  const uid = normalizeUserId(userId);
  const data = await request<{ pickups: PickupOrder[] }>(`/api/sala/pickups/${uid}`);
  return data.pickups;
}

// ─── CRM Link ────────────────────────────────────────────────────────────────

export async function linkClientToOrderRequest(
  userId: string,
  orderId: string,
  clientId: string,
  clientName: string,
) {
  const uid = normalizeUserId(userId);
  const data = await request<{ order: DiningOrder }>(
    `/api/sala/orders/${uid}/${orderId}/client`,
    { method: 'PUT', body: JSON.stringify({ clientId, clientName }) },
  );
  return data.order;
}
