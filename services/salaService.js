import { v4 as uuidv4 } from 'uuid';
import {
  ensureDatabase,
  getDocument,
  putDocument,
  getAllDocuments,
  bulkPutDocuments,
  softDeleteDocument,
} from './couchdb.js';

// ─── DB NAME ─────────────────────────────────────────────────────────────────

function normalizeDbName(value) {
  return String(value || '').toLowerCase().trim().replace(/[^a-z0-9_$()+\-/]/g, '-');
}

function getDbPrefix() {
  return normalizeDbName(process.env.VITE_COUCHDB_DB || process.env.COUCHDB_DB || 'vertial');
}

export function getSalaDbName() {
  return normalizeDbName(process.env.VITE_SALA_DB || `${getDbPrefix()}-sala`);
}

// ─── DINING TABLE ────────────────────────────────────────────────────────────

const VALID_TABLE_STATUSES = ['available', 'occupied', 'pending_order', 'served', 'pending_payment', 'unavailable', 'reserved', 'hidden'];

function normalizeTableStatus(value) {
  const v = String(value || 'available').toLowerCase();
  if (VALID_TABLE_STATUSES.includes(v)) return v;
  if (v === 'free') return 'available';
  if (v === 'billing') return 'pending_payment';
  return 'available';
}

export function buildDiningTableDocument(userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || `dining_table:${uuidv4()}`;

  return {
    _id: id,
    _rev: existing?._rev || undefined,
    type: 'dining_table',
    user_id: userId,
    businessId: String(data.businessId || existing?.businessId || ''),

    number: Number(data.number ?? existing?.number ?? 0),
    name: String(data.name ?? existing?.name ?? ''),
    zone: String(data.zone ?? existing?.zone ?? ''),
    zoneResponsible: String(data.zoneResponsible ?? existing?.zoneResponsible ?? ''),
    capacity: Number(data.capacity ?? existing?.capacity ?? 4),
    currentGuests: Number(data.currentGuests ?? existing?.currentGuests ?? 0),

    gridW: Number(data.gridW ?? existing?.gridW ?? 4),
    gridH: Number(data.gridH ?? existing?.gridH ?? 4),
    x: Number(data.x ?? existing?.x ?? 0),
    y: Number(data.y ?? existing?.y ?? 0),

    status: normalizeTableStatus(data.status ?? existing?.status),
    occupiedAt: String(data.occupiedAt ?? existing?.occupiedAt ?? ''),
    occupiedBy: String(data.occupiedBy ?? existing?.occupiedBy ?? ''),

    sortOrder: Number(data.sortOrder ?? existing?.sortOrder ?? 0),
    active: data.active !== undefined ? Boolean(data.active) : (existing?.active !== undefined ? existing.active : true),
    tags: Array.isArray(data.tags) ? data.tags : (existing?.tags || []),

    roomId: String(data.roomId ?? existing?.roomId ?? ''),
    shape: String(data.shape ?? existing?.shape ?? 'square'),
    rotation: Number(data.rotation ?? existing?.rotation ?? 0),
    locked: Boolean(data.locked ?? existing?.locked ?? false),
    notes: String(data.notes ?? existing?.notes ?? ''),
    qrCode: String(data.qrCode ?? existing?.qrCode ?? ''),
    visible: data.visible !== undefined ? Boolean(data.visible) : (existing?.visible !== undefined ? existing.visible : true),
    sizePreset: String(data.sizePreset ?? existing?.sizePreset ?? ''),

    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

export function sanitizeDiningTable(doc) {
  if (!doc) return null;
  return {
    _id: doc._id,
    _rev: doc._rev,
    type: 'dining_table',
    id: doc._id,
    userId: doc.user_id,
    businessId: doc.businessId || '',
    number: doc.number || 0,
    name: doc.name || '',
    zone: doc.zone || '',
    zoneResponsible: doc.zoneResponsible || '',
    capacity: doc.capacity || 4,
    currentGuests: doc.currentGuests || 0,
    gridW: doc.gridW || 4,
    gridH: doc.gridH || 4,
    x: doc.x || 0,
    y: doc.y || 0,
    status: normalizeTableStatus(doc.status),
    occupiedAt: doc.occupiedAt || '',
    occupiedBy: doc.occupiedBy || '',
    sortOrder: doc.sortOrder || 0,
    active: doc.active !== false,
    tags: doc.tags || [],
    roomId: doc.roomId || '',
    shape: doc.shape || 'square',
    rotation: doc.rotation || 0,
    locked: Boolean(doc.locked),
    notes: doc.notes || '',
    qrCode: doc.qrCode || '',
    visible: doc.visible !== false,
    sizePreset: doc.sizePreset || '',
    createdAt: doc.createdAt || '',
    updatedAt: doc.updatedAt || '',
  };
}

export async function listDiningTablesByUser(req, userId) {
  const db = getSalaDbName();
  await ensureDatabase(req, db);
  const docs = await getAllDocuments(req, db);
  return docs
    .filter((doc) => doc?.type === 'dining_table' && !doc?.deletedAt && (!userId || doc?.user_id === userId))
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || (a.number || 0) - (b.number || 0));
}

// ─── DINING WALL ─────────────────────────────────────────────────────────────

export function buildDiningWallDocument(userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || `dining_wall:${uuidv4()}`;

  return {
    _id: id,
    _rev: existing?._rev || undefined,
    type: 'dining_wall',
    user_id: userId,
    businessId: String(data.businessId || existing?.businessId || ''),
    x1: Number(data.x1 ?? existing?.x1 ?? 0),
    y1: Number(data.y1 ?? existing?.y1 ?? 0),
    x2: Number(data.x2 ?? existing?.x2 ?? 0),
    y2: Number(data.y2 ?? existing?.y2 ?? 0),
    thickness: Number(data.thickness ?? existing?.thickness ?? 6),
    label: String(data.label ?? existing?.label ?? ''),
    roomId: String(data.roomId ?? existing?.roomId ?? ''),
    color: String(data.color ?? existing?.color ?? '#374151'),
    rotation: Number(data.rotation ?? existing?.rotation ?? 0),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

export function sanitizeDiningWall(doc) {
  if (!doc) return null;
  return {
    _id: doc._id,
    _rev: doc._rev,
    type: 'dining_wall',
    id: doc._id,
    userId: doc.user_id,
    businessId: doc.businessId || '',
    x1: doc.x1 || 0,
    y1: doc.y1 || 0,
    x2: doc.x2 || 0,
    y2: doc.y2 || 0,
    thickness: doc.thickness || 6,
    label: doc.label || '',
    roomId: doc.roomId || '',
    color: doc.color || '#374151',
    rotation: doc.rotation || 0,
    createdAt: doc.createdAt || '',
    updatedAt: doc.updatedAt || '',
  };
}

export async function listDiningWallsByUser(req, userId) {
  const db = getSalaDbName();
  await ensureDatabase(req, db);
  const docs = await getAllDocuments(req, db);
  return docs
    .filter((doc) => doc?.type === 'dining_wall' && !doc?.deletedAt && (!userId || doc?.user_id === userId))
    .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
}

// ─── FLOOR CONFIG ────────────────────────────────────────────────────────────

const DEFAULT_FLOOR_CONFIG = {
  floorWidth: 2000,
  floorHeight: 1200,
  gridSize: 20,
  zones: [],
  sections: [
    { id: 'bar-1', name: 'Barra 1', icon: 'coffee', active: true },
    { id: 'bar-2', name: 'Barra 2', icon: 'coffee', active: true },
  ],
};

export function buildFloorConfigDocument(userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const businessId = String(data.businessId || existing?.businessId || '');
  const id = existing?._id || `dining_floor_config:${businessId || uuidv4()}`;

  return {
    _id: id,
    _rev: existing?._rev || undefined,
    type: 'dining_floor_config',
    user_id: userId,
    businessId,
    floorWidth: Number(data.floorWidth ?? existing?.floorWidth ?? DEFAULT_FLOOR_CONFIG.floorWidth),
    floorHeight: Number(data.floorHeight ?? existing?.floorHeight ?? DEFAULT_FLOOR_CONFIG.floorHeight),
    gridSize: Number(data.gridSize ?? existing?.gridSize ?? DEFAULT_FLOOR_CONFIG.gridSize),
    zones: Array.isArray(data.zones) ? data.zones : (existing?.zones || DEFAULT_FLOOR_CONFIG.zones),
    sections: Array.isArray(data.sections) ? data.sections : (existing?.sections || DEFAULT_FLOOR_CONFIG.sections),
    rooms: Array.isArray(data.rooms) ? data.rooms : (existing?.rooms || []),
    layoutDecor: Array.isArray(data.layoutDecor) ? data.layoutDecor : (existing?.layoutDecor || []),
    salaSetupVersion: Number(data.salaSetupVersion ?? existing?.salaSetupVersion ?? 0),
    tpvCount: Number(data.tpvCount ?? existing?.tpvCount ?? 0),
    viewStyle: data.viewStyle ?? existing?.viewStyle ?? 'modern',
    canvasScope: data.canvasScope ?? existing?.canvasScope ?? 'zone',
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

export function sanitizeFloorConfig(doc) {
  if (!doc) return null;
  return {
    _id: doc._id,
    _rev: doc._rev,
    type: 'dining_floor_config',
    id: doc._id,
    userId: doc.user_id,
    businessId: doc.businessId || '',
    floorWidth: doc.floorWidth || 2000,
    floorHeight: doc.floorHeight || 1200,
    gridSize: doc.gridSize || 20,
    zones: (doc.zones || []).filter((zone) => zone && zone.id && zone.name),
    sections: doc.sections || [],
    rooms: Array.isArray(doc.rooms) ? doc.rooms : [],
    layoutDecor: Array.isArray(doc.layoutDecor) ? doc.layoutDecor : [],
    salaSetupVersion: Number(doc.salaSetupVersion || 0),
    tpvCount: Number(doc.tpvCount || 0),
    viewStyle: doc.viewStyle || 'modern',
    canvasScope: doc.canvasScope === 'full' ? 'full' : 'zone',
    createdAt: doc.createdAt || '',
    updatedAt: doc.updatedAt || '',
  };
}

export async function getFloorConfigByUser(req, userId) {
  const db = getSalaDbName();
  await ensureDatabase(req, db);
  const docs = await getAllDocuments(req, db);
  return docs.find((doc) => doc?.type === 'dining_floor_config' && !doc?.deletedAt && doc?.user_id === userId) || null;
}

// ─── DINING ORDER ────────────────────────────────────────────────────────────

const VALID_ORDER_STATUSES = ['open', 'served', 'pending_payment', 'paid', 'closed', 'cancelled'];
const VALID_COMANDA_STATUSES = ['draft', 'sent_to_kitchen', 'in_preparation', 'ready', 'served', 'cancelled'];
const VALID_ITEM_STATUSES = ['pending', 'in_preparation', 'ready', 'served', 'cancelled'];

function normalizeOrderStatus(value) {
  const v = String(value || 'open').toLowerCase();
  return VALID_ORDER_STATUSES.includes(v) ? v : 'open';
}

function normalizeComandaStatus(value) {
  const v = String(value || 'draft').toLowerCase();
  return VALID_COMANDA_STATUSES.includes(v) ? v : 'draft';
}

function normalizeItemStatus(value) {
  const v = String(value || 'pending').toLowerCase();
  return VALID_ITEM_STATUSES.includes(v) ? v : 'pending';
}

function sanitizeComandaItem(item) {
  return {
    id: item.id || uuidv4(),
    productId: String(item.productId || ''),
    name: String(item.name || ''),
    price: Number(item.price || 0),
    quantity: Math.max(1, Number(item.quantity || 1)),
    category: String(item.category || ''),
    notes: String(item.notes || ''),
    modifiers: Array.isArray(item.modifiers) ? item.modifiers : [],
    status: normalizeItemStatus(item.status),
    cancelledReason: String(item.cancelledReason || ''),
    cancelledBy: String(item.cancelledBy || ''),
  };
}

function sanitizeComanda(comanda) {
  return {
    id: comanda.id || uuidv4(),
    orderNumber: Number(comanda.orderNumber || 1),
    items: Array.isArray(comanda.items) ? comanda.items.map(sanitizeComandaItem) : [],
    status: normalizeComandaStatus(comanda.status),
    sentToKitchenAt: String(comanda.sentToKitchenAt || ''),
    readyAt: String(comanda.readyAt || ''),
    servedAt: String(comanda.servedAt || ''),
    createdBy: String(comanda.createdBy || ''),
    createdByName: String(comanda.createdByName || ''),
    createdAt: comanda.createdAt || new Date().toISOString(),
    notes: String(comanda.notes || ''),
  };
}

function sanitizePayment(payment) {
  return {
    id: payment.id || uuidv4(),
    method: String(payment.method || 'efectivo'),
    amount: Number(payment.amount || 0),
    amountReceived: Number(payment.amountReceived || 0),
    changeGiven: Number(payment.changeGiven || 0),
    tip: Number(payment.tip || 0),
    paidBy: String(payment.paidBy || ''),
    paidByName: String(payment.paidByName || ''),
    paidAt: payment.paidAt || new Date().toISOString(),
    splitLabel: String(payment.splitLabel || ''),
  };
}

function computeOrderTotals(comandas, discount, discountPercent) {
  const subtotal = comandas
    .filter((c) => c.status !== 'cancelled')
    .reduce((sum, c) => sum + c.items
      .filter((i) => i.status !== 'cancelled')
      .reduce((s, i) => s + i.price * i.quantity, 0), 0);

  let discountAmount = Number(discount || 0);
  if (Number(discountPercent || 0) > 0) {
    discountAmount = Math.round(subtotal * Number(discountPercent) / 100 * 100) / 100;
  }

  const afterDiscount = Math.max(0, subtotal - discountAmount);
  const tax = Math.round(afterDiscount * 0.10 * 100) / 100;
  const total = Math.round((afterDiscount + tax) * 100) / 100;

  return { subtotal: Math.round(subtotal * 100) / 100, discount: discountAmount, tax, total };
}

export function buildDiningOrderDocument(userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || `dining_order:${uuidv4()}`;

  const comandas = Array.isArray(data.comandas)
    ? data.comandas.map(sanitizeComanda)
    : (existing?.comandas || []);

  const payments = Array.isArray(data.payments)
    ? data.payments.map(sanitizePayment)
    : (existing?.payments || []);

  const discountPercent = Number(data.discountPercent ?? existing?.discountPercent ?? 0);
  const discountFixed = Number(data.discount ?? existing?.discount ?? 0);
  const totals = computeOrderTotals(comandas, discountFixed, discountPercent);

  return {
    _id: id,
    _rev: existing?._rev || undefined,
    type: 'dining_order',
    user_id: userId,
    businessId: String(data.businessId || existing?.businessId || ''),

    tableId: String(data.tableId ?? existing?.tableId ?? ''),
    tableNumber: Number(data.tableNumber ?? existing?.tableNumber ?? 0),
    tableName: String(data.tableName ?? existing?.tableName ?? ''),
    zone: String(data.zone ?? existing?.zone ?? ''),
    section: String(data.section ?? existing?.section ?? ''),

    guests: Number(data.guests ?? existing?.guests ?? 1),
    comandas,

    subtotal: totals.subtotal,
    discount: totals.discount,
    discountPercent,
    discountReason: String(data.discountReason ?? existing?.discountReason ?? ''),
    tax: totals.tax,
    total: totals.total,

    status: normalizeOrderStatus(data.status ?? existing?.status),
    createdBy: String(data.createdBy ?? existing?.createdBy ?? ''),
    createdByName: String(data.createdByName ?? existing?.createdByName ?? ''),
    servedAt: String(data.servedAt ?? existing?.servedAt ?? ''),
    paidAt: String(data.paidAt ?? existing?.paidAt ?? ''),
    closedAt: String(data.closedAt ?? existing?.closedAt ?? ''),

    payments,
    splitMode: String(data.splitMode ?? existing?.splitMode ?? 'none'),
    splitCount: Number(data.splitCount ?? existing?.splitCount ?? 0),

    clientId: String(data.clientId ?? existing?.clientId ?? ''),
    clientName: String(data.clientName ?? existing?.clientName ?? ''),
    invoiceGenerated: Boolean(data.invoiceGenerated ?? existing?.invoiceGenerated ?? false),
    financialMovementId: String(data.financialMovementId ?? existing?.financialMovementId ?? ''),

    notes: String(data.notes ?? existing?.notes ?? ''),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

export function sanitizeDiningOrder(doc) {
  if (!doc) return null;
  return {
    _id: doc._id,
    _rev: doc._rev,
    type: 'dining_order',
    id: doc._id,
    userId: doc.user_id,
    businessId: doc.businessId || '',
    tableId: doc.tableId || '',
    tableNumber: doc.tableNumber || 0,
    tableName: doc.tableName || '',
    zone: doc.zone || '',
    section: doc.section || '',
    guests: doc.guests || 1,
    comandas: (doc.comandas || []).map(sanitizeComanda),
    subtotal: doc.subtotal || 0,
    discount: doc.discount || 0,
    discountPercent: doc.discountPercent || 0,
    discountReason: doc.discountReason || '',
    tax: doc.tax || 0,
    total: doc.total || 0,
    status: normalizeOrderStatus(doc.status),
    createdBy: doc.createdBy || '',
    createdByName: doc.createdByName || '',
    servedAt: doc.servedAt || '',
    paidAt: doc.paidAt || '',
    closedAt: doc.closedAt || '',
    payments: (doc.payments || []).map(sanitizePayment),
    splitMode: doc.splitMode || 'none',
    splitCount: doc.splitCount || 0,
    clientId: doc.clientId || '',
    clientName: doc.clientName || '',
    invoiceGenerated: doc.invoiceGenerated || false,
    financialMovementId: doc.financialMovementId || '',
    notes: doc.notes || '',
    createdAt: doc.createdAt || '',
    updatedAt: doc.updatedAt || '',
  };
}

export async function listDiningOrdersByUser(req, userId, filters = {}) {
  const db = getSalaDbName();
  await ensureDatabase(req, db);
  const docs = await getAllDocuments(req, db);
  let orders = docs
    .filter((doc) => doc?.type === 'dining_order' && !doc?.deletedAt && (!userId || doc?.user_id === userId));

  if (filters.status) {
    const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
    orders = orders.filter((o) => statuses.includes(o.status));
  }
  if (filters.tableId) {
    orders = orders.filter((o) => o.tableId === filters.tableId);
  }
  if (filters.dateFrom) {
    orders = orders.filter((o) => o.createdAt >= filters.dateFrom);
  }
  if (filters.dateTo) {
    orders = orders.filter((o) => o.createdAt <= filters.dateTo);
  }

  return orders.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

export async function getDiningOrderById(req, userId, orderId) {
  const db = getSalaDbName();
  await ensureDatabase(req, db);
  const doc = await getDocument(req, db, orderId);
  if (!doc || doc.type !== 'dining_order' || doc.user_id !== userId || doc.deletedAt) return null;
  return doc;
}

// ─── COMANDA HELPERS ─────────────────────────────────────────────────────────

export function addComandaToOrder(order, comandaData) {
  const nextNumber = (order.comandas || []).length + 1;
  const comanda = sanitizeComanda({ ...comandaData, orderNumber: nextNumber, status: 'draft' });
  const comandas = [...(order.comandas || []), comanda];
  const totals = computeOrderTotals(comandas, order.discount, order.discountPercent);
  return { comandas, ...totals, comanda };
}

export function updateComandaInOrder(order, comandaId, updates) {
  const comandas = (order.comandas || []).map((c) => {
    if (c.id !== comandaId) return c;
    return sanitizeComanda({ ...c, ...updates });
  });
  const totals = computeOrderTotals(comandas, order.discount, order.discountPercent);
  return { comandas, ...totals };
}

export function shouldAutoTransitionTable(order) {
  const activeComandas = (order.comandas || []).filter((c) => c.status !== 'cancelled');
  if (activeComandas.length === 0) return null;

  const allReady = activeComandas.every((c) => c.status === 'ready');
  if (allReady) return 'served';

  const allServed = activeComandas.every((c) => c.status === 'served');
  if (allServed) return 'pending_payment';

  return null;
}
