import { v4 as uuidv4 } from 'uuid';
import {
  ensureDatabase,
  getDocument,
  putDocument,
  getAllDocuments,
  bulkPutDocuments,
  softDeleteDocument,
  findDocuments,
  ensureIndex,
} from './couchdb.js';

const salaTypeUserIndexReady = new Set();

async function ensureSalaTypeUserIndex(req, dbName) {
  if (salaTypeUserIndexReady.has(dbName)) return;
  const safeDb = String(dbName || '').replace(/[^a-z0-9]/g, '-');
  await ensureIndex(req, dbName, ['type', 'user_id'], `idx-${safeDb}-type-user_id`).catch(() => null);
  salaTypeUserIndexReady.add(dbName);
}

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

/** Mango por type+user_id (evita _all_docs con miles de pedidos/comandas). */
async function findSalaDocsByType(req, db, type, userId) {
  await ensureSalaTypeUserIndex(req, db);
  const uid = String(userId || '').trim();
  const docType = String(type || '').trim();
  try {
    const selector = uid ? { type: docType, user_id: uid } : { type: docType };
    return await findDocuments(req, db, selector, { pageSize: 500, maxDocs: 10_000 });
  } catch {
    const all = await getAllDocuments(req, db);
    return all.filter(
      (doc) => doc?.type === docType && (!uid || doc?.user_id === uid),
    );
  }
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
    capacity: Number(doc.capacity) > 0 ? Number(doc.capacity) : 4,
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

export async function listDiningTablesByUser(req, userId, options = {}) {
  const uid = String(userId || '').trim();
  const db = getSalaDbName();
  await ensureDatabase(req, db);
  const docs = await findSalaDocsByType(req, db, 'dining_table', uid);
  let tables = docs
    .filter((doc) => doc?.type === 'dining_table' && !doc?.deletedAt && (!uid || doc?.user_id === uid));
  const bid = normalizeSalaBusinessId(options.businessId);
  const accountBusinessCount = Number(options.accountBusinessCount) || 1;
  if (bid) {
    tables = tables.filter((t) => {
      const tb = normalizeSalaBusinessId(t.businessId);
      if (!tb) return accountBusinessCount <= 1;
      return tb === bid;
    });
  }
  return tables.sort(
    (a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || (a.number || 0) - (b.number || 0),
  );
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
  const uid = String(userId || '').trim();
  const db = getSalaDbName();
  await ensureDatabase(req, db);
  const docs = await findSalaDocsByType(req, db, 'dining_wall', uid);
  return docs
    .filter((doc) => doc?.type === 'dining_wall' && !doc?.deletedAt && (!uid || doc?.user_id === uid))
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
    salaQuickSetupComplete: Boolean(
      data.salaQuickSetupComplete ?? existing?.salaQuickSetupComplete ?? false,
    ),
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
    salaQuickSetupComplete: Boolean(doc.salaQuickSetupComplete),
    createdAt: doc.createdAt || '',
    updatedAt: doc.updatedAt || '',
  };
}

function normalizeSalaBusinessId(value) {
  return String(value || '').replace(/^business:/, '').trim();
}

export async function getFloorConfigByUser(req, userId, businessId = '') {
  const uid = String(userId || '').trim();
  const db = getSalaDbName();
  await ensureDatabase(req, db);
  const docs = await findSalaDocsByType(req, db, 'dining_floor_config', uid);
  const configs = docs.filter(
    (doc) => doc?.type === 'dining_floor_config' && !doc?.deletedAt && (!uid || doc?.user_id === uid),
  );
  const bid = normalizeSalaBusinessId(businessId);
  if (bid) {
    return (
      configs.find((doc) => normalizeSalaBusinessId(doc.businessId) === bid)
      || null
    );
  }
  return configs[0] || null;
}

// ─── DINING ORDER ────────────────────────────────────────────────────────────

const VALID_ORDER_STATUSES = ['open', 'served', 'pending_payment', 'paid', 'closed', 'cancelled'];
const VALID_COMANDA_STATUSES = ['draft', 'sent_to_kitchen', 'in_preparation', 'ready', 'served', 'cancelled'];
const VALID_ITEM_STATUSES = ['pending', 'in_preparation', 'ready', 'served', 'cancelled'];

/** Solo un paso adelante en cocina (evita doble toque Empezar → Listo). */
const KITCHEN_STATUS_NEXT = {
  sent_to_kitchen: 'in_preparation',
  in_preparation: 'ready',
  ready: 'served',
};

export function isValidKitchenComandaTransition(fromStatus, toStatus) {
  const from = String(fromStatus || '').trim();
  const to = String(toStatus || '').trim();
  if (!from || !to) return false;
  if (from === to) return true;
  return KITCHEN_STATUS_NEXT[from] === to;
}

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
  const brandIds = Array.isArray(item?.brandIds)
    ? item.brandIds.map((b) => String(b || '').trim()).filter(Boolean)
    : [];
  const modifiers = Array.isArray(item.modifiers)
    ? item.modifiers.map((m) => String(m || '').trim()).filter(Boolean)
    : [];
  const extrasRaw = Array.isArray(item.extras)
    ? item.extras.map((e) => String(e || '').trim()).filter(Boolean)
    : [];
  const extras = extrasRaw.length > 0 ? extrasRaw : modifiers;
  const ingredients = Array.isArray(item.ingredients)
    ? item.ingredients
        .map((ing) => ({
          name: String(ing?.name || '').trim(),
          quantity: String(ing?.quantity || 'normal').trim() || 'normal',
        }))
        .filter((ing) => ing.name)
    : [];
  return {
    id: item.id || uuidv4(),
    productId: String(item.productId || ''),
    name: String(item.name || ''),
    price: Number(item.price || 0),
    quantity: Math.max(1, Number(item.quantity || 1)),
    category: String(item.category || ''),
    notes: String(item.notes || ''),
    modifiers: modifiers.length > 0 ? modifiers : extras,
    extras,
    ingredients,
    status: normalizeItemStatus(item.status),
    cancelledReason: String(item.cancelledReason || ''),
    cancelledBy: String(item.cancelledBy || ''),
    brandIds,
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

function sanitizeSplitAmounts(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((n) => Math.round(Number(n || 0) * 100) / 100)
    .filter((n) => Number.isFinite(n) && n >= 0);
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
    loyaltyRedeem: data.loyaltyRedeem !== undefined
      ? (data.loyaltyRedeem || null)
      : (existing?.loyaltyRedeem || null),
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
    splitAmounts: sanitizeSplitAmounts(data.splitAmounts ?? existing?.splitAmounts),

    clientId: String(data.clientId ?? existing?.clientId ?? ''),
    clientName: String(data.clientName ?? existing?.clientName ?? ''),
    invoiceGenerated: Boolean(data.invoiceGenerated ?? existing?.invoiceGenerated ?? false),
    financialMovementId: String(data.financialMovementId ?? existing?.financialMovementId ?? ''),
    verifactuRecordId: String(data.verifactuRecordId ?? existing?.verifactuRecordId ?? ''),
    verifactuFullNumber: String(data.verifactuFullNumber ?? existing?.verifactuFullNumber ?? ''),
    verifactuQrUrl: String(data.verifactuQrUrl ?? existing?.verifactuQrUrl ?? ''),
    verifactuHuella: String(data.verifactuHuella ?? existing?.verifactuHuella ?? ''),

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
    loyaltyRedeem: doc.loyaltyRedeem || null,
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
    splitAmounts: sanitizeSplitAmounts(doc.splitAmounts),
    clientId: doc.clientId || '',
    clientName: doc.clientName || '',
    invoiceGenerated: doc.invoiceGenerated || false,
    financialMovementId: doc.financialMovementId || '',
    verifactuRecordId: doc.verifactuRecordId || '',
    verifactuFullNumber: doc.verifactuFullNumber || '',
    verifactuQrUrl: doc.verifactuQrUrl || '',
    verifactuHuella: doc.verifactuHuella || '',
    notes: doc.notes || '',
    createdAt: doc.createdAt || '',
    updatedAt: doc.updatedAt || '',
  };
}

export async function listDiningOrdersByUser(req, userId, filters = {}) {
  const uid = String(userId || '').trim();
  const db = getSalaDbName();
  await ensureDatabase(req, db);
  await ensureSalaTypeUserIndex(req, db);

  let docs;
  try {
    docs = uid
      ? await findDocuments(
          req,
          db,
          { type: 'dining_order', user_id: uid },
          { pageSize: 500, maxDocs: 100_000 },
        )
      : await findDocuments(
          req,
          db,
          { type: 'dining_order' },
          { pageSize: 500, maxDocs: 100_000 },
        );
  } catch {
    const all = await getAllDocuments(req, db);
    docs = all.filter(
      (doc) => doc?.type === 'dining_order' && (!uid || doc?.user_id === uid),
    );
  }

  let orders = docs.filter(
    (doc) =>
      doc?.type === 'dining_order' && !doc?.deletedAt && (!uid || doc?.user_id === uid),
  );

  if (filters.status) {
    const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
    orders = orders.filter((o) => statuses.includes(o.status));
  }
  if (filters.tableId) {
    orders = orders.filter((o) => o.tableId === filters.tableId);
  }
  if (filters.clientId) {
    const cid = String(filters.clientId || '').trim();
    if (cid) {
      orders = orders.filter((o) => String(o.clientId || '').trim() === cid);
    }
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

// ─── TABLE TICKET TIMING (estadísticas por mesa) ─────────────────────────────

function calendarDayFromIso(iso) {
  const s = String(iso || '').trim();
  if (s.length >= 10) return s.slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

function minutesBetweenIso(fromIso, toIso) {
  const a = new Date(fromIso).getTime();
  const b = new Date(toIso).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.round((b - a) / 60000));
}

export function buildDiningTableTicketStatDocument(userId, data = {}) {
  const now = new Date().toISOString();
  const ticketAt = String(data.ticketAt || now);
  const seatedAt = String(data.seatedAt || ticketAt);
  const durationMinutes = data.durationMinutes != null
    ? Number(data.durationMinutes)
    : minutesBetweenIso(seatedAt, ticketAt);

  return {
    _id: `dining_table_ticket_stat:${uuidv4()}`,
    type: 'dining_table_ticket_stat',
    user_id: userId,
    businessId: String(data.businessId || ''),
    tableId: String(data.tableId || ''),
    tableNumber: Number(data.tableNumber || 0),
    tableName: String(data.tableName || ''),
    roomId: String(data.roomId || ''),
    pdvId: String(data.pdvId || data.salesPointId || ''),
    salesPointName: String(data.salesPointName || ''),
    seatedAt,
    ticketAt,
    durationMinutes: durationMinutes ?? 0,
    deliveryOrderId: String(data.deliveryOrderId || ''),
    ticketNumber: String(data.ticketNumber || ''),
    orderNumber: String(data.orderNumber || ''),
    amount: Number(data.amount || 0),
    itemCount: Number(data.itemCount || 0),
    guestCount: Number(data.guestCount || 0),
    takenBy: String(data.takenBy || ''),
    takenByName: String(data.takenByName || ''),
    calendarDay: String(data.calendarDay || calendarDayFromIso(ticketAt)),
    createdAt: now,
  };
}

export function sanitizeDiningTableTicketStat(doc) {
  if (!doc) return null;
  return {
    _id: doc._id,
    id: doc._id,
    type: 'dining_table_ticket_stat',
    userId: doc.user_id,
    businessId: doc.businessId || '',
    tableId: doc.tableId || '',
    tableNumber: doc.tableNumber || 0,
    tableName: doc.tableName || '',
    roomId: doc.roomId || '',
    pdvId: doc.pdvId || '',
    salesPointName: doc.salesPointName || '',
    seatedAt: doc.seatedAt || '',
    ticketAt: doc.ticketAt || '',
    durationMinutes: doc.durationMinutes ?? 0,
    deliveryOrderId: doc.deliveryOrderId || '',
    ticketNumber: doc.ticketNumber || '',
    orderNumber: doc.orderNumber || '',
    amount: doc.amount || 0,
    itemCount: doc.itemCount || 0,
    guestCount: doc.guestCount || 0,
    takenBy: doc.takenBy || '',
    takenByName: doc.takenByName || '',
    calendarDay: doc.calendarDay || '',
    createdAt: doc.createdAt || '',
  };
}

export async function listDiningTableTicketStatsByUser(req, userId, filters = {}) {
  const uid = String(userId || '').trim();
  const db = getSalaDbName();
  await ensureDatabase(req, db);
  const docs = await findSalaDocsByType(req, db, 'dining_table_ticket_stat', uid);
  let rows = docs.filter(
    (doc) =>
      doc?.type === 'dining_table_ticket_stat' && !doc?.deletedAt && (!uid || doc?.user_id === uid),
  );

  if (filters.businessId) {
    const bid = String(filters.businessId).trim();
    rows = rows.filter((r) => !r.businessId || r.businessId === bid);
  }
  if (filters.tableId) {
    rows = rows.filter((r) => r.tableId === filters.tableId);
  }
  if (filters.dateFrom) {
    rows = rows.filter((r) => String(r.calendarDay || r.ticketAt || '') >= String(filters.dateFrom).slice(0, 10));
  }
  if (filters.dateTo) {
    rows = rows.filter((r) => String(r.calendarDay || r.ticketAt || '') <= String(filters.dateTo).slice(0, 10));
  }
  if (filters.pdvId) {
    rows = rows.filter((r) => r.pdvId === filters.pdvId);
  }

  return rows
    .sort((a, b) => String(b.ticketAt || '').localeCompare(String(a.ticketAt || '')))
    .map(sanitizeDiningTableTicketStat);
}

export async function recordDiningTableTicketStat(req, userId, orderDoc) {
  const channel = String(orderDoc?.channel || '').toLowerCase();
  if (channel !== 'tpv') return null;

  const tableId = String(orderDoc?.tableId || '').trim();
  const tableNumber = Number(orderDoc?.tableNumber || 0);
  if (!tableId && !tableNumber) return null;
  if (tableNumber === 0 && !tableId) return null;

  const db = getSalaDbName();
  await ensureDatabase(req, db);

  let table = null;
  if (tableId) {
    table = await getDocument(req, db, tableId);
    if (table?.type !== 'dining_table' || table.user_id !== userId) table = null;
  }
  if (!table && tableNumber > 0) {
    const tables = await listDiningTablesByUser(req, userId);
    table = tables.find((t) => Number(t.number) === tableNumber) || null;
  }

  const ticketAt = String(orderDoc.paidAt || orderDoc.createdAt || new Date().toISOString());
  const seatedAt = String(table?.occupiedAt || ticketAt);
  const itemCount = Array.isArray(orderDoc.items)
    ? orderDoc.items.reduce((s, i) => s + Number(i.quantity || 0), 0)
    : 0;

  const doc = buildDiningTableTicketStatDocument(userId, {
    businessId: orderDoc.businessId || table?.businessId || '',
    tableId: table?._id || tableId,
    tableNumber: table?.number ?? tableNumber,
    tableName: table?.name || (tableNumber ? `Mesa ${tableNumber}` : ''),
    roomId: table?.roomId || '',
    pdvId: orderDoc.salesPointId || '',
    salesPointName: orderDoc.salesPointName || '',
    seatedAt,
    ticketAt,
    deliveryOrderId: orderDoc._id || orderDoc.id || '',
    ticketNumber: orderDoc.ticketNumber || '',
    orderNumber: orderDoc.orderNumber || '',
    amount: Number(orderDoc.totalAmount || 0),
    itemCount,
    guestCount: Number(table?.currentGuests || 0),
    takenBy: orderDoc.takenBy || '',
    takenByName: orderDoc.takenByName || '',
  });

  const saved = await putDocument(req, db, doc._id, doc);
  return sanitizeDiningTableTicketStat({ ...doc, _rev: saved.rev });
}
